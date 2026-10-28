import mongoose from 'mongoose'
import productModel from '../models/productModel.js'
import orderModel from '../models/orderModel.js'
import {
    getInventorySizes,
    isValidSizeLabel,
    normalizeSizeLabel,
    sortSizes
} from '../../shared/inventory.js'
import { cancellationRefund } from './orderRefund.js'
import { resolveEffectiveProductPrice } from './productPricing.js'
import { resolveDueScheduledStockUpdate } from './scheduledStock.js'
import { ORDER_FEE_PHP, phpItemsTotal, phpMinorUnits, sumPhp, validPhpAmount } from '../../shared/money.js'
import { restrictSizeGuideToSizes } from '../../shared/productMeasurements.js'
import { canAdminCancelPaidOnline, getCancellationMode, isPaidOnlineOrder, ONLINE_CANCELLATION_POLICY } from '../../shared/orderCancellation.js'
import { isDemoOrder } from '../../shared/demoPayment.js'

const fail = (message, status, code) => {
    const error = new Error(message)
    if (status) {
        error.status = status
    }
    if (code) {
        error.code = code
    }
    throw error
}

const validSize = size => isValidSizeLabel(size)

const validObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const orderItemKey = item => JSON.stringify([item._id.toLowerCase(), item.size])

const staleProductPrice = () => {
    fail(
        'Product prices changed. Review the updated totals before placing your order.',
        409,
        'STALE_PRODUCT_PRICE'
    )
}

const getQuotedPrices = (pricingQuote, requested) => {
    if (pricingQuote === undefined) {
        return null
    }
    if (!Array.isArray(pricingQuote) || pricingQuote.length !== requested.length) {
        staleProductPrice()
    }

    const quotedPrices = new Map()
    for (const item of pricingQuote) {
        const hasValidProduct = item && typeof item._id === 'string'
            && mongoose.isObjectIdOrHexString(item._id)
        if (!hasValidProduct || !validSize(item.size) || !validPhpAmount(item.price)) {
            staleProductPrice()
        }

        const key = orderItemKey(item)
        if (quotedPrices.has(key)) {
            staleProductPrice()
        }
        quotedPrices.set(key, item.price)
    }

    if (requested.some(item => !quotedPrices.has(orderItemKey(item)))) {
        staleProductPrice()
    }
    return quotedPrices
}

export const validateInitialInventory = (sizes, inventory) => {
    const normalizedSizes = Array.isArray(sizes) ? sizes.map(normalizeSizeLabel) : []
    const hasValidUniqueSizes = Array.isArray(sizes)
        && sizes.length > 0
        && sizes.every((size, index) => validSize(size) && size === normalizedSizes[index])
        && new Set(normalizedSizes).size === normalizedSizes.length
    if (!hasValidUniqueSizes) {
        fail('Select valid, unique product sizes.')
    }

    if (!validObject(inventory) || Object.keys(inventory).length !== sizes.length) {
        fail('Enter initial stock for every selected size.')
    }

    for (const size of sizes) {
        const stock = inventory[size]
        if (!Object.hasOwn(inventory, size) || !Number.isSafeInteger(stock) || stock < 0) {
            fail(`Stock for ${size} must be a non-negative whole number.`)
        }
    }
    return inventory
}

export const aggregateOrderItems = items => {
    if (!Array.isArray(items) || !items.length) {
        fail('Your order must contain at least one item.')
    }

    const aggregated = new Map()
    for (const item of items) {
        const hasValidProduct = item && typeof item._id === 'string' && mongoose.isObjectIdOrHexString(item._id)
        const hasValidQuantity = Number.isSafeInteger(item?.quantity) && item.quantity > 0
        if (!hasValidProduct || !validSize(item.size) || !hasValidQuantity) {
            fail('Order items must have a valid product, size and positive whole quantity.')
        }

        const id = item._id.toLowerCase()
        const key = orderItemKey({ _id: id, size: item.size })
        const quantity = (aggregated.get(key)?.quantity || 0) + item.quantity
        if (!Number.isSafeInteger(quantity)) {
            fail('Order quantity is too large.')
        }
        aggregated.set(key, { _id: id, size: item.size, quantity })
    }

    return [...aggregated.values()].sort((left, right) => {
        return `${left._id}/${left.size}`.localeCompare(`${right._id}/${right.size}`)
    })
}

// Transactions are required: never fall back to partial multi-product reservations.
export const createReservedOrder = async data => {
    const requested = aggregateOrderItems(data.items)
    if (typeof data.requestId !== 'string' || !/^[A-Za-z0-9-]{16,100}$/.test(data.requestId)) {
        fail('Refresh checkout and try again.')
    }
    if (typeof data.userId !== 'string' || !mongoose.isObjectIdOrHexString(data.userId)) {
        fail('Sign in to place your order.')
    }

    await orderModel.init()
    const sameRequest = order => {
        if (order.paymentMethod !== data.paymentMethod) {
            fail('This checkout was already used. Start a new checkout.')
        }

        const storedItems = JSON.stringify(aggregateOrderItems(order.items))
        const requestedItems = JSON.stringify(requested)
        if (storedItems !== requestedItems) {
            fail('This checkout was already used. Start a new checkout.')
        }
        if (order.status === 'Cancelled' || order.inventoryStatus === 'released') {
            fail('This order was cancelled. Start a new checkout.')
        }
        return order
    }

    const key = { userId: data.userId, requestId: data.requestId }
    const existing = await orderModel.findOne(key)
    if (existing) {
        return sameRequest(existing)
    }

    try {
        return await mongoose.connection.transaction(async session => {
            const retry = await orderModel.findOne(key).session(session)
            if (retry) {
                return sameRequest(retry)
            }

            const pricingTime = Date.now()
            const quotedPrices = getQuotedPrices(data.pricingQuote, requested)
            const items = []
            for (const item of requested) {
                await resolveDueScheduledStockUpdate(
                    item._id,
                    new Date(pricingTime),
                    { session }
                )
                const product = await productModel.findById(item._id).session(session).lean()
                if (!product) {
                    fail('A product in your cart is no longer available.')
                }
                let effectivePrice
                try {
                    effectivePrice = resolveEffectiveProductPrice(product, pricingTime)
                } catch {
                    fail(`The price for ${product.name} needs monetary precision review. Contact the administrator.`)
                }
                const quotedPrice = quotedPrices?.get(orderItemKey(item))
                if (quotedPrices && phpMinorUnits(quotedPrice) !== phpMinorUnits(effectivePrice)) {
                    staleProductPrice()
                }
                if (!product.sizes.includes(item.size)) {
                    fail(`Size ${item.size} is not available for ${product.name}.`)
                }

                const path = `inventory.${item.size}`
                const updated = await productModel.updateOne(
                    { _id: item._id, sizes: item.size, [path]: { $gte: item.quantity } },
                    { $inc: { [path]: -item.quantity } },
                    { session }
                )
                if (updated.modifiedCount !== 1) {
                    const remaining = product.inventory?.[item.size] || 0
                    fail(`Insufficient stock for ${product.name} — Size ${item.size}. Only ${remaining} remaining.`)
                }
                items.push({
                    _id: item._id,
                    name: product.name,
                    image: product.image,
                    ...(product.colorLabel ? { colorLabel: product.colorLabel } : {}),
                    ...(product.optionLabel ? { optionLabel: product.optionLabel } : {}),
                    price: effectivePrice,
                    category: product.category,
                    subCategory: product.subCategory,
                    size: item.size,
                    quantity: item.quantity
                })
            }

            const { pricingQuote, ...persistedData } = data
            const orderData = {
                ...persistedData,
                items,
                amount: sumPhp(phpItemsTotal(items), ORDER_FEE_PHP),
                inventoryStatus: 'reserved'
            }
            const [order] = await orderModel.create([orderData], { session })
            return order
        })
    } catch (error) {
        // Concurrent retries with one request ID share the same committed order.
        if (error.code === 11000) {
            const order = await orderModel.findOne(key)
            if (order) {
                return sameRequest(order)
            }
        }
        throw error
    }
}

export const cancelReservedOrder = async (
    orderId,
    { userId, paymentMethod, unpaidOnly = false, expectedStatus, expectedPayment, source, cancellationRequestId, exceptionReason, demoOutcome } = {}
) => {
    return mongoose.connection.transaction(async session => {
        const customerHasInvalidUser = source === 'customer'
            && (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId))
        if (customerHasInvalidUser) {
            fail('Sign in to cancel your order.', 401)
        }

        const filter = { _id: orderId }
        if (userId) {
            filter.userId = userId
        }
        if (paymentMethod) {
            filter.paymentMethod = paymentMethod
        }

        const order = await orderModel.findOne(filter).session(session).lean()
        if (!order) {
            fail('Order not found.', 404)
        }
        if (source === 'customer' && isPaidOnlineOrder(order)) {
            fail(`${ONLINE_CANCELLATION_POLICY.message} Contact PAMO Support.`, 403, 'ONLINE_CANCELLATION_RESTRICTED')
        }
        if (order.status === 'Cancelled') {
            if (cancellationRequestId && (
                String(order.cancellationRequest?._id) !== cancellationRequestId
                || order.cancellationRequest.status !== 'approved'
            )) fail('This cancellation request changed. Refresh orders.', 409)
            return order
        }
        if (demoOutcome && (!isDemoOrder(order) || order.demoPayment.status !== 'pending'
            || order.payment !== false || !['failed', 'cancelled'].includes(demoOutcome))) {
            fail('This demo payment has already changed. Refresh the order.', 409)
        }

        let reviewingRequest = false
        if (cancellationRequestId) {
            if (source !== 'admin'
                || String(order.cancellationRequest?._id) !== cancellationRequestId
                || order.cancellationRequest.status !== 'pending') {
                fail('This cancellation request has already been reviewed or changed.', 409)
            }
            const reviewableOrder = { ...order, cancellationRequest: undefined }
            reviewingRequest = getCancellationMode(reviewableOrder, { allowPaidOnline: true }) !== null
            if (!reviewingRequest) fail('This order is no longer safely cancellable.', 409)
        }

        const exceptionalCancellation = exceptionReason !== undefined
        let reason
        if (exceptionalCancellation) {
            if (source !== 'admin' || cancellationRequestId || !canAdminCancelPaidOnline(order)) {
                fail('An exceptional cancellation is not available for this order. Refresh orders.', 409)
            }
            reason = cancellationReason(exceptionReason)
        }
        const statusAllowsCancellation = exceptionalCancellation || reviewingRequest || getCancellationMode(order) === 'immediate'
        const violatesUnpaidRequirement = unpaidOnly && order.payment
        const expectedStateChanged = expectedStatus !== undefined
            && (order.status !== expectedStatus || order.payment !== expectedPayment)
        if (!statusAllowsCancellation || violatesUnpaidRequirement || expectedStateChanged) {
            fail('This order can no longer be cancelled. Refresh its status.', 409)
        }

        const refund = cancellationRefund(order)
        const cancelledValues = { status: 'Cancelled', cancelledAt: Date.now() }
        if (isDemoOrder(order) && order.demoPayment.status === 'pending') {
            cancelledValues['demoPayment.status'] = demoOutcome || 'cancelled'
        }
        if (reviewingRequest) {
            cancelledValues.cancellationRequest = {
                ...order.cancellationRequest,
                status: 'approved',
                reviewedAt: Date.now()
            }
        }
        if (exceptionalCancellation) {
            const now = Date.now()
            cancelledValues.cancellationRequest = {
                _id: new mongoose.Types.ObjectId().toHexString(), status: 'approved',
                reason, requestedAt: now, reviewedAt: now
            }
        }
        if (refund) {
            cancelledValues.refund = refund
        }
        if (source) {
            cancelledValues.cancellationSource = source
        }
        if (order.inventoryStatus === 'reserved') {
            cancelledValues.inventoryStatus = 'released'
        }

        const transitionFilter = {
            ...filter,
            status: order.status,
            payment: order.payment,
            paymentMethod: order.paymentMethod,
            inventoryStatus: order.inventoryStatus ?? { $exists: false }
        }
        if (reviewingRequest) {
            transitionFilter['cancellationRequest._id'] = order.cancellationRequest._id
            transitionFilter['cancellationRequest.status'] = 'pending'
        } else {
            transitionFilter['cancellationRequest.status'] = { $ne: 'pending' }
        }
        // Lock the eligible order transition and inventory release in one transaction.
        const cancelled = await orderModel.findOneAndUpdate(
            transitionFilter,
            { $set: cancelledValues },
            { session, returnDocument: 'after', runValidators: true }
        )
        if (!cancelled) {
            fail('This order changed. Refresh your orders and try again.', 409)
        }

        if (order.inventoryStatus === 'reserved') {
            for (const item of aggregateOrderItems(order.items)) {
                await resolveDueScheduledStockUpdate(item._id, new Date(), { session })
                const inventoryPath = `inventory.${item.size}`
                const restored = await productModel.updateOne(
                    {
                        _id: item._id,
                        sizes: item.size,
                        [inventoryPath]: { $lte: Number.MAX_SAFE_INTEGER - item.quantity }
                    },
                    { $inc: { [inventoryPath]: item.quantity } },
                    { session }
                )
                if (restored.matchedCount !== 1) {
                    fail('Unable to restore a product. Contact the administrator.')
                }
            }
        }
        return cancelled
    })
}

const cancellationReason = value => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) {
        fail('Enter a reason between 1 and 1,000 characters.', 400)
    }
    return value.trim()
}

export const requestOrderCancellation = async (orderId, userId, reason) => {
    const message = cancellationReason(reason)
    const order = await orderModel.findOne({ _id: orderId, userId }).lean()
    if (!order) fail('Order not found.', 404)
    if (isPaidOnlineOrder(order)) {
        fail(`${ONLINE_CANCELLATION_POLICY.message} Contact PAMO Support.`, 403, 'ONLINE_CANCELLATION_RESTRICTED')
    }
    if (getCancellationMode(order) !== 'request') {
        fail('Cancellation cannot be requested for this order, or a request is already pending.', 409)
    }
    const filter = { _id: orderId, userId, status: order.status, payment: order.payment, paymentMethod: order.paymentMethod,
        inventoryStatus: order.inventoryStatus ?? { $exists: false } }
    if (order.cancellationRequest) {
        filter['cancellationRequest._id'] = order.cancellationRequest._id
        filter['cancellationRequest.status'] = 'rejected'
    } else {
        filter.cancellationRequest = { $exists: false }
    }
    const updated = await orderModel.findOneAndUpdate(filter, {
        $set: { cancellationRequest: {
            _id: new mongoose.Types.ObjectId().toHexString(), status: 'pending', reason: message, requestedAt: Date.now()
        } }
    }, { returnDocument: 'after', runValidators: true })
    if (!updated) fail('This order changed. Refresh orders before requesting cancellation.', 409)
    return updated
}

export const rejectOrderCancellation = async (orderId, requestId, reason) => {
    const rejectionReason = cancellationReason(reason)
    const order = await orderModel.findById(orderId).lean()
    if (!order) fail('Order not found.', 404)
    if (String(order.cancellationRequest?._id) !== requestId
        || order.cancellationRequest.status !== 'pending'
        || !getCancellationMode({ ...order, cancellationRequest: undefined }, { allowPaidOnline: true })) {
        fail('This request has changed or the order is no longer safely cancellable.', 409)
    }
    const updated = await orderModel.findOneAndUpdate({
        _id: orderId, status: order.status, payment: order.payment,
        inventoryStatus: order.inventoryStatus ?? { $exists: false },
        'cancellationRequest._id': order.cancellationRequest._id,
        'cancellationRequest.status': 'pending'
    }, { $set: { cancellationRequest: {
        ...order.cancellationRequest, status: 'rejected', rejectionReason, reviewedAt: Date.now()
    } } }, { returnDocument: 'after', runValidators: true })
    if (!updated) fail('This cancellation request was already reviewed or changed.', 409)
    return updated
}

export const adjustInventory = async (id, adjustments) => {
    if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
        fail('Invalid product.')
    }
    if (!validObject(adjustments) || !Object.keys(adjustments).length) {
        fail('Enter a stock adjustment.')
    }

    await resolveDueScheduledStockUpdate(id, new Date())
    const product = await productModel.findById(id).lean()
    if (!product) {
        fail('Product not found.')
    }

    const conditions = []
    const increments = {}
    for (const [size, delta] of Object.entries(adjustments)) {
        const isProductSize = validSize(size) && getInventorySizes(product).includes(size)
        if (!isProductSize || !Number.isSafeInteger(delta)) {
            fail('Adjustments must be whole numbers for this product’s sizes.')
        }
        if (!delta) {
            continue
        }

        const path = `inventory.${size}`
        const adjustedStock = { $add: [{ $ifNull: [`$${path}`, 0] }, delta] }
        conditions.push({
            $expr: {
                $and: [
                    { $gte: [adjustedStock, 0] },
                    { $lte: [adjustedStock, Number.MAX_SAFE_INTEGER] }
                ]
            }
        })
        increments[path] = delta
    }
    if (!Object.keys(increments).length) {
        fail('Enter at least one non-zero adjustment.')
    }

    const update = { $inc: increments }
    if (!product.sizes?.length) {
        update.$set = { sizes: ['One Size'] }
    }

    const updated = await productModel.findOneAndUpdate(
        { _id: id, $and: conditions },
        update,
        { returnDocument: 'after' }
    )
    if (!updated) {
        fail('Stock changed or the adjustment would make stock negative. Refresh and try again.')
    }
    return updated
}

const inventoryValue = (product, size) => {
    if (product.inventory instanceof Map) return product.inventory.get(size)
    return product.inventory?.[size]
}

export const replaceProductSizes = async (id, requestedSizes) => {
    if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
        fail('Invalid product.', 400, 'INVALID_PRODUCT_ID')
    }
    if (!Array.isArray(requestedSizes) || requestedSizes.length === 0) {
        fail('Select at least one available size.', 400, 'INVALID_PRODUCT_SIZES')
    }
    const normalizedRequests = requestedSizes.map(normalizeSizeLabel)
    if (new Set(normalizedRequests).size !== normalizedRequests.length) {
        fail('Select each available size only once.', 400, 'DUPLICATE_PRODUCT_SIZE')
    }

    return mongoose.connection.transaction(async session => {
        await resolveDueScheduledStockUpdate(id, new Date(), { session })
        const product = await productModel.findById(id).session(session).lean()
        if (!product) {
            fail('Product not found.', 404, 'PRODUCT_NOT_FOUND')
        }

        const currentSizes = getInventorySizes(product)
        const currentSizeByNormalizedLabel = new Map(
            currentSizes.map(size => [normalizeSizeLabel(size), size])
        )
        const sizes = normalizedRequests.map(size => {
            return currentSizeByNormalizedLabel.get(size) || size
        })
        const addedSizesAreValid = sizes.every(size => {
            return currentSizes.includes(size) || isValidSizeLabel(size)
        })
        if (!addedSizesAreValid) {
            fail('Use a valid size label.', 400, 'INVALID_PRODUCT_SIZES')
        }

        const sortedSizes = sortSizes(sizes)
        const additions = sortedSizes.filter(size => !currentSizes.includes(size))
        const removals = currentSizes.filter(size => !sortedSizes.includes(size))
        if (additions.length === 0 && removals.length === 0) return product

        for (const size of additions) {
            const existingQuantity = inventoryValue(product, size)
            if (existingQuantity !== undefined && existingQuantity !== 0) {
                fail(
                    `${size} has existing inventory that must be reviewed before it can be added.`,
                    409,
                    'SIZE_HAS_EXISTING_INVENTORY'
                )
            }
        }

        for (const size of removals) {
            const quantity = inventoryValue(product, size) ?? 0
            if (quantity !== 0) {
                fail(
                    `${size} cannot be removed while it has remaining stock. Set its stock to 0 first.`,
                    409,
                    'SIZE_HAS_STOCK'
                )
            }
        }

        if (removals.length > 0) {
            const reservedOrder = await orderModel.exists({
                items: { $elemMatch: { _id: id, size: { $in: removals } } },
                inventoryStatus: 'reserved',
                status: { $nin: ['Claimed', 'Completed', 'Cancelled'] }
            }).session(session)
            if (reservedOrder) {
                fail(
                    'A selected size is reserved by an active order and cannot be removed.',
                    409,
                    'SIZE_HAS_ACTIVE_RESERVATION'
                )
            }
        }

        const update = { $set: { sizes: sortedSizes } }
        for (const size of additions) {
            update.$set[`inventory.${size}`] = 0
        }
        if (removals.length > 0) {
            update.$unset = Object.fromEntries(removals.map(size => [`inventory.${size}`, '']))
            if (product.sizeGuide) {
                update.$set.sizeGuide = restrictSizeGuideToSizes(product.sizeGuide, sortedSizes)
            }
        }

        const filter = { _id: id, sizes: product.sizes || [] }
        for (const size of removals) {
            filter[`inventory.${size}`] = { $in: [0, null] }
        }
        const updated = await productModel.findOneAndUpdate(
            filter,
            update,
            { session, returnDocument: 'after', runValidators: true }
        )
        if (!updated) {
            fail(
                'Product sizes or inventory changed. Refresh and try again.',
                409,
                'PRODUCT_SIZES_CHANGED'
            )
        }
        return updated
    })
}
