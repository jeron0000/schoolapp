import mongoose from 'mongoose'
import announcementModel, {
    ANNOUNCEMENT_PRODUCT_LIMIT
} from '../models/announcementModel.js'
import productModel from '../models/productModel.js'
import { phpFromMinorUnits, phpMinorUnits, validPhpAmount } from '../../shared/money.js'
import { isBuiltInMerchandiseCategory } from '../../shared/productTaxonomy.js'

export class ProductPricingError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.name = 'ProductPricingError'
        this.status = status
    }
}

const validProductId = id => typeof id === 'string' && mongoose.isObjectIdOrHexString(id)
const validPriceChangeId = id => typeof id === 'string' && mongoose.isObjectIdOrHexString(id)
const bulkScheduleFields = new Set(['changes', 'effectiveAt', 'announceToStudents'])
const bulkChangeFields = new Set(['productId', 'price'])

const asDate = value => {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
    if (!Number.isFinite(date.getTime())) {
        throw new ProductPricingError('Enter a valid effective date and time.')
    }
    return date
}

const canonicalPhpAmount = value => {
    try {
        return phpFromMinorUnits(phpMinorUnits(value))
    } catch {
        throw new ProductPricingError('Enter a valid PHP price with at most two decimal places.')
    }
}

const plainProduct = product => {
    if (typeof product?.toObject === 'function') {
        return product.toObject({ flattenMaps: true })
    }
    return { ...product }
}

const presentProductClassifications = product => {
    if (!Array.isArray(product.academicPrograms)) {
        const legacyProgram = product.subCategory
        product.academicPrograms = legacyProgram
            && !isBuiltInMerchandiseCategory(legacyProgram)
            ? [legacyProgram]
            : []
    }
    if (!Array.isArray(product.genders)) {
        product.genders = product.category ? [product.category] : []
    }
    if (!Array.isArray(product.merchandiseCategoryCodes)) {
        let legacyMerchandise = product.productCategoryCode
        if (!legacyMerchandise && isBuiltInMerchandiseCategory(product.subCategory)) {
            legacyMerchandise = product.subCategory
        }
        product.merchandiseCategoryCodes = legacyMerchandise ? [legacyMerchandise] : []
    }
}

const changeTime = change => {
    const time = new Date(change.effectiveAt).getTime()
    if (!Number.isFinite(time) || !validPhpAmount(change.amount)) {
        throw new ProductPricingError('Stored product pricing needs review.', 500)
    }
    return time
}

const compareChanges = (left, right) => {
    const effectiveDifference = changeTime(left) - changeTime(right)
    if (effectiveDifference !== 0) {
        return effectiveDifference
    }

    const leftCreatedAt = new Date(left.createdAt || 0).getTime()
    const rightCreatedAt = new Date(right.createdAt || 0).getTime()
    return leftCreatedAt - rightCreatedAt
}

const activeChanges = product => {
    if (!Array.isArray(product?.priceChanges)) {
        return []
    }
    return product.priceChanges
        .filter(change => !change.cancelledAt)
        .sort(compareChanges)
}

export const resolveEffectiveProductPrice = (product, now = Date.now()) => {
    if (!validPhpAmount(product?.price)) {
        throw new ProductPricingError('Stored product pricing needs review.', 500)
    }

    const nowTime = asDate(now).getTime()
    let effectivePrice = product.price
    for (const change of activeChanges(product)) {
        if (changeTime(change) > nowTime) {
            break
        }
        effectivePrice = change.amount
    }
    return effectivePrice
}

export const getNextProductPriceChangeAt = (products, now = Date.now()) => {
    const nowTime = asDate(now).getTime()
    let nextChangeTime = null

    for (const product of products || []) {
        for (const change of activeChanges(product)) {
            const effectiveTime = changeTime(change)
            if (effectiveTime <= nowTime) {
                continue
            }
            if (nextChangeTime === null || effectiveTime < nextChangeTime) {
                nextChangeTime = effectiveTime
            }
        }
    }

    return nextChangeTime === null ? null : new Date(nextChangeTime).toISOString()
}

export const presentPublicProduct = (product, now = Date.now()) => {
    if (!product) {
        return product
    }

    const presented = plainProduct(product)
    presented.price = resolveEffectiveProductPrice(presented, now)
    presentProductClassifications(presented)
    delete presented.priceChanges
    delete presented.scheduledStockUpdate
    return presented
}

export const presentProductPricing = (product, now = Date.now()) => {
    const presented = plainProduct(product)
    const nowTime = asDate(now).getTime()
    const changes = Array.isArray(presented.priceChanges)
        ? [...presented.priceChanges].sort(compareChanges)
        : []
    const history = []
    let pendingChange = null

    for (const change of changes) {
        const item = plainProduct(change)
        const effectiveTime = changeTime(item)
        let status = 'effective'
        if (item.cancelledAt) {
            status = 'cancelled'
        } else if (effectiveTime > nowTime) {
            status = 'pending'
            pendingChange = item
        }
        history.push({ ...item, status })
    }

    return {
        productId: String(presented._id),
        basePrice: presented.price,
        currentPrice: resolveEffectiveProductPrice(presented, now),
        pendingChange,
        history
    }
}

const ensureProductId = id => {
    if (!validProductId(id)) {
        throw new ProductPricingError('Invalid product.')
    }
}

const missingOrConflictingProduct = async id => {
    const exists = await productModel.exists({ _id: id })
    if (!exists) {
        throw new ProductPricingError('Product not found.', 404)
    }
    throw new ProductPricingError('This product already has a pending price change.', 409)
}

export const addProductPriceChange = async ({ id, amount, effectiveAt, now = Date.now() }) => {
    ensureProductId(id)
    const createdAt = asDate(now)
    const scheduled = effectiveAt !== undefined && effectiveAt !== null && effectiveAt !== ''
    const effectiveDate = scheduled ? asDate(effectiveAt) : createdAt
    if (scheduled && effectiveDate.getTime() <= createdAt.getTime()) {
        throw new ProductPricingError('Scheduled price changes must use a future date and time.')
    }

    const change = {
        amount: canonicalPhpAmount(amount),
        effectiveAt: effectiveDate,
        createdAt,
        cancelledAt: null
    }
    const filter = { _id: id }
    if (scheduled) {
        filter.priceChanges = {
            $not: {
                $elemMatch: {
                    effectiveAt: { $gt: createdAt },
                    cancelledAt: null
                }
            }
        }
    }

    const product = await productModel.findOneAndUpdate(
        filter,
        { $push: { priceChanges: change } },
        { returnDocument: 'after', runValidators: true }
    )
    if (product) {
        return product
    }
    if (scheduled) {
        return missingOrConflictingProduct(id)
    }
    throw new ProductPricingError('Product not found.', 404)
}

export const cancelPendingProductPriceChange = async ({ id, now = Date.now() }) => {
    ensureProductId(id)
    const cancelledAt = asDate(now)
    const product = await productModel.findOneAndUpdate(
        {
            _id: id,
            priceChanges: {
                $elemMatch: {
                    effectiveAt: { $gt: cancelledAt },
                    cancelledAt: null
                }
            }
        },
        { $set: { 'priceChanges.$.cancelledAt': cancelledAt } },
        { returnDocument: 'after', runValidators: true }
    )
    if (product) {
        return product
    }

    const exists = await productModel.exists({ _id: id })
    if (!exists) {
        throw new ProductPricingError('Product not found.', 404)
    }
    throw new ProductPricingError('This product has no pending price change.', 409)
}

const replacementConflict = () => {
    return new ProductPricingError(
        'The pending price change changed. Refresh pricing and try again.',
        409
    )
}

const isTransactionConflict = error => {
    return error?.code === 112
        || error?.errorLabels?.includes('TransientTransactionError')
}

const bulkPricingConflict = () => {
    return new ProductPricingError(
        'Bulk pricing changed concurrently. Refresh products and try again.',
        409
    )
}

export const parseBulkProductPriceSchedule = (body, now = Date.now()) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ProductPricingError('Enter valid bulk pricing details.')
    }
    const fields = Object.keys(body)
    if (fields.some(field => !bulkScheduleFields.has(field))) {
        throw new ProductPricingError('Enter only supported bulk pricing details.')
    }
    if (!Array.isArray(body.changes) || body.changes.length === 0) {
        throw new ProductPricingError('Choose at least one product price change.')
    }
    if (
        Object.hasOwn(body, 'announceToStudents')
        && typeof body.announceToStudents !== 'boolean'
    ) {
        throw new ProductPricingError('Choose whether to announce the price changes.')
    }

    const createdAt = asDate(now)
    const effectiveAt = asDate(body.effectiveAt)
    if (effectiveAt.getTime() <= createdAt.getTime()) {
        throw new ProductPricingError('Bulk price changes must use a future date and time.')
    }

    const productIds = new Set()
    const changes = body.changes.map(change => {
        if (!change || typeof change !== 'object' || Array.isArray(change)) {
            throw new ProductPricingError('Enter valid product price changes.')
        }
        const changeFields = Object.keys(change)
        if (
            changeFields.length !== bulkChangeFields.size
            || changeFields.some(field => !bulkChangeFields.has(field))
        ) {
            throw new ProductPricingError('Each price change requires a product ID and PHP price.')
        }
        ensureProductId(change.productId)
        const productId = change.productId.toLowerCase()
        if (productIds.has(productId)) {
            throw new ProductPricingError('Choose each product only once.')
        }
        productIds.add(productId)
        return {
            productId,
            amount: canonicalPhpAmount(change.price)
        }
    })

    const announceToStudents = body.announceToStudents === true
    if (announceToStudents && changes.length > ANNOUNCEMENT_PRODUCT_LIMIT) {
        throw new ProductPricingError(
            `Announce no more than ${ANNOUNCEMENT_PRODUCT_LIMIT} product price changes at once.`
        )
    }
    return { changes, effectiveAt, createdAt, announceToStudents }
}

const findBulkProducts = async (productIds, session) => {
    return productModel.find({ _id: { $in: productIds } }).session(session).lean()
}

const ensureBulkProductsCanBeScheduled = (products, requestedChanges, createdAt) => {
    const productsById = new Map(
        products.map(product => [String(product._id), product])
    )
    if (productsById.size !== requestedChanges.length) {
        throw new ProductPricingError('One or more products were not found.', 404)
    }

    for (const requested of requestedChanges) {
        const product = productsById.get(requested.productId)
        if (!product) {
            throw new ProductPricingError('One or more products were not found.', 404)
        }
        resolveEffectiveProductPrice(product, createdAt)
        const hasPendingChange = activeChanges(product).some(change => {
            return changeTime(change) > createdAt.getTime()
        })
        if (hasPendingChange) {
            throw new ProductPricingError(
                'One or more products already have a pending price change.',
                409
            )
        }
    }
    return productsById
}

const bulkAnnouncement = ({ scheduledChanges, effectiveAt, createdAt }) => {
    return {
        type: 'price-change',
        message: `Scheduled price changes take effect on ${effectiveAt.toISOString()}.`,
        link: '/collection',
        linkedProductIds: scheduledChanges.map(change => change.productId),
        priceChangeLinks: scheduledChanges.map(change => ({
            productId: change.productId,
            priceChangeId: change.priceChangeId
        })),
        enabled: true,
        publishAt: createdAt,
        expiresAt: effectiveAt
    }
}

export const scheduleBulkProductPriceChanges = async ({ body, now = Date.now() }) => {
    const input = parseBulkProductPriceSchedule(body, now)
    try {
        return await mongoose.connection.transaction(async session => {
            const productIds = input.changes.map(change => change.productId)
            const products = await findBulkProducts(productIds, session)
            const productsById = ensureBulkProductsCanBeScheduled(
                products,
                input.changes,
                input.createdAt
            )
            const scheduledChanges = input.changes.map(change => ({
                ...change,
                productId: new mongoose.Types.ObjectId(change.productId),
                priceChangeId: new mongoose.Types.ObjectId(),
                previousPrice: resolveEffectiveProductPrice(
                    productsById.get(change.productId),
                    input.createdAt
                )
            }))
            const operations = scheduledChanges.map(change => ({
                updateOne: {
                    filter: {
                        _id: change.productId,
                        priceChanges: {
                            $not: {
                                $elemMatch: {
                                    effectiveAt: { $gt: input.createdAt },
                                    cancelledAt: null
                                }
                            }
                        }
                    },
                    update: {
                        $push: {
                            priceChanges: {
                                _id: change.priceChangeId,
                                amount: change.amount,
                                effectiveAt: input.effectiveAt,
                                createdAt: input.createdAt,
                                cancelledAt: null
                            }
                        }
                    }
                }
            }))
            const result = await productModel.bulkWrite(
                operations,
                { session, ordered: true }
            )
            if (result.matchedCount !== scheduledChanges.length) {
                throw bulkPricingConflict()
            }

            let announcement = null
            if (input.announceToStudents) {
                [announcement] = await announcementModel.create(
                    [bulkAnnouncement({
                        scheduledChanges,
                        effectiveAt: input.effectiveAt,
                        createdAt: input.createdAt
                    })],
                    { session }
                )
            }

            return {
                effectiveAt: input.effectiveAt.toISOString(),
                announceToStudents: input.announceToStudents,
                announcementId: announcement ? String(announcement._id) : null,
                changes: scheduledChanges.map(change => ({
                    productId: String(change.productId),
                    priceChangeId: String(change.priceChangeId),
                    previousPrice: change.previousPrice,
                    newPrice: change.amount
                }))
            }
        })
    } catch (error) {
        if (error instanceof ProductPricingError) {
            throw error
        }
        if (isTransactionConflict(error)) {
            throw bulkPricingConflict()
        }
        throw error
    }
}

export const publicAnnouncementPriceComparisons = (announcement, products) => {
    const links = Array.isArray(announcement?.priceChangeLinks)
        ? announcement.priceChangeLinks
        : []
    if (!links.length) return []
    const productsById = new Map(
        (products || []).map(product => [String(product._id), product])
    )

    return links.map(link => {
        const productId = String(link.productId)
        const product = productsById.get(productId)
        if (!product) return null
        const priceChangeId = String(link.priceChangeId)
        const change = (product.priceChanges || []).find(item => {
            return String(item._id) === priceChangeId
        })
        if (!change || change.cancelledAt) return null
        const effectiveTime = changeTime(change)
        const image = Array.isArray(product.image) && typeof product.image[0] === 'string'
            ? product.image[0]
            : null
        return {
            productId,
            name: product.name,
            image,
            previousPrice: resolveEffectiveProductPrice(product, effectiveTime - 1),
            newPrice: change.amount,
            effectiveAt: new Date(effectiveTime).toISOString()
        }
    }).filter(Boolean)
}

const managedAnnouncementStatus = (announcement, nowTime) => {
    if (!announcement) return 'not-announced'
    if (!announcement.enabled) return 'disabled'
    const publishTime = announcement.publishAt
        ? new Date(announcement.publishAt).getTime()
        : null
    const expirationTime = announcement.expiresAt
        ? new Date(announcement.expiresAt).getTime()
        : null
    if (Number.isFinite(publishTime) && publishTime > nowTime) return 'scheduled'
    if (Number.isFinite(expirationTime) && expirationTime <= nowTime) return 'expired'
    return 'active'
}

export const getScheduledProductPriceChanges = async (now = Date.now()) => {
    const scheduledAt = asDate(now)
    const products = await productModel.find({
        priceChanges: {
            $elemMatch: {
                effectiveAt: { $gt: scheduledAt },
                cancelledAt: null
            }
        }
    }).lean()
    const scheduledProducts = products.map(product => ({
        product,
        pricing: presentProductPricing(product, scheduledAt)
    })).filter(item => item.pricing.pendingChange)
    const pendingIds = scheduledProducts.map(item => item.pricing.pendingChange._id)
    let announcements = []
    if (pendingIds.length > 0) {
        announcements = await announcementModel.find({
            'priceChangeLinks.priceChangeId': { $in: pendingIds }
        }).lean()
    }
    const announcementByPriceChange = new Map()
    for (const announcement of announcements) {
        for (const link of announcement.priceChangeLinks || []) {
            announcementByPriceChange.set(String(link.priceChangeId), announcement)
        }
    }

    return scheduledProducts.map(({ product, pricing }) => {
        const pending = pricing.pendingChange
        const announcement = announcementByPriceChange.get(String(pending._id))
        const image = Array.isArray(product.image) && typeof product.image[0] === 'string'
            ? product.image[0]
            : null
        return {
            productId: String(product._id),
            name: product.name,
            image,
            currentPrice: pricing.currentPrice,
            scheduledPrice: pending.amount,
            effectiveAt: new Date(pending.effectiveAt).toISOString(),
            pendingChangeId: String(pending._id),
            announcementId: announcement ? String(announcement._id) : null,
            announcementStatus: managedAnnouncementStatus(
                announcement,
                scheduledAt.getTime()
            )
        }
    }).sort((left, right) => {
        const dateDifference = Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt)
        if (dateDifference !== 0) return dateDifference
        return left.name.localeCompare(right.name)
    })
}

export const replacePendingProductPriceChange = async ({
    id,
    pendingChangeId,
    amount,
    effectiveAt,
    now = Date.now()
}) => {
    ensureProductId(id)
    if (!validPriceChangeId(pendingChangeId)) {
        throw new ProductPricingError('Refresh pricing and select the pending change again.', 409)
    }

    const changedAt = asDate(now)
    const effectiveDate = asDate(effectiveAt)
    if (effectiveDate.getTime() <= changedAt.getTime()) {
        throw new ProductPricingError('Scheduled price changes must use a future date and time.')
    }
    const replacement = {
        amount: canonicalPhpAmount(amount),
        effectiveAt: effectiveDate,
        createdAt: changedAt,
        cancelledAt: null
    }

    try {
        return await mongoose.connection.transaction(async session => {
            const cancelled = await productModel.findOneAndUpdate(
                {
                    _id: id,
                    priceChanges: {
                        $elemMatch: {
                            _id: pendingChangeId,
                            effectiveAt: { $gt: changedAt },
                            cancelledAt: null
                        }
                    }
                },
                { $set: { 'priceChanges.$.cancelledAt': changedAt } },
                { session, returnDocument: 'after', runValidators: true }
            )
            if (!cancelled) {
                const exists = await productModel.exists({ _id: id }).session(session)
                if (!exists) {
                    throw new ProductPricingError('Product not found.', 404)
                }
                throw replacementConflict()
            }

            const product = await productModel.findOneAndUpdate(
                {
                    _id: id,
                    priceChanges: {
                        $not: {
                            $elemMatch: {
                                effectiveAt: { $gt: changedAt },
                                cancelledAt: null
                            }
                        }
                    }
                },
                { $push: { priceChanges: replacement } },
                { session, returnDocument: 'after', runValidators: true }
            )
            if (!product) {
                throw replacementConflict()
            }
            return product
        })
    } catch (error) {
        if (error instanceof ProductPricingError) {
            throw error
        }
        if (isTransactionConflict(error)) {
            throw replacementConflict()
        }
        throw error
    }
}
