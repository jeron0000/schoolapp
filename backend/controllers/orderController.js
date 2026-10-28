import orderModel from '../models/orderModel.js'
import userModel from '../models/userModel.js'
import { clearCheckoutCart, prepareCheckoutCart } from '../utils/checkoutCart.js'
import { cancelReservedOrder, createReservedOrder, rejectOrderCancellation, requestOrderCancellation } from '../utils/inventory.js'
import { getAllowedOrderStatuses } from '../utils/orderStatus.js'
import { academicPrograms, isBuiltInMerchandiseCategory } from '../../shared/productTaxonomy.js'
import { refundPresentation } from '../../shared/refund.js'
import { isTestPaymentReceipt } from '../../shared/paymentReceipt.js'
import { getCancellationMode } from '../../shared/orderCancellation.js'
import { resolveActiveClassification } from '../utils/classificationValidation.js'
import { randomUUID } from 'node:crypto'
import { getCartSnapshot } from '../utils/cart.js'
import { demoPaymentsEnabled, requireDemoPayments } from '../config/paymentDemo.js'
import { DEMO_PAYMENT_METHODS, isDemoOrder } from '../../shared/demoPayment.js'
import { testPaymentOptions, testPaymentClient, paymentReturnOrigin, openTestPayment, confirmTestPayment } from '../utils/testPayments.js'

const objectIdPattern = /^[a-f\d]{24}$/i
const paymentCurrency = 'PHP'

const validObjectId = value => typeof value === 'string' && objectIdPattern.test(value)

const checkoutError = (message, status, code) => {
    const error = new Error(message)
    error.status = status
    error.code = code
    return error
}

const getCheckoutStudent = async userId => {
    if (!validObjectId(userId)) {
        throw checkoutError('Sign in to place your order.', 401, 'INVALID_CUSTOMER')
    }

    const user = await userModel.findById(userId)
        .select('name email academicProgram role')
        .lean()
    if (!user || user.role === 'cashier') {
        throw checkoutError('Sign in with a student account to place your order.', 401, 'INVALID_CUSTOMER')
    }

    const name = typeof user.name === 'string' ? user.name.trim() : ''
    const email = typeof user.email === 'string' ? user.email.trim() : ''
    if (!name || !email) {
        throw checkoutError('Complete your account information before checkout.', 409, 'PROFILE_INCOMPLETE')
    }
    const program = await resolveActiveClassification({
        value: user.academicProgram,
        scope: 'program',
        legacyCodes: academicPrograms,
        includeArchived: true
    })
    if (!program || isBuiltInMerchandiseCategory(program)) {
        throw checkoutError('Add your academic program in My Account before checkout.', 409, 'PROFILE_INCOMPLETE')
    }

    return { name, email, academicProgram: program }
}

const presentOrder = (order, allowedStatuses = getAllowedOrderStatuses(order)) => ({
    ...(typeof order.toObject === 'function' ? order.toObject() : order),
    refundSummary: refundPresentation(order),
    allowedStatuses
})

const toPublicOrder = order => {
    const { confirmedBy, stripePayment, paypalPayment, paymentRecovery, ...publicOrder } = order
    return { ...publicOrder, receiptIsTest: isTestPaymentReceipt(order), refundSummary: refundPresentation(order), cancellationMode: getCancellationMode(order) }
}

const getCancellationMessage = refundSummary => {
    if (refundSummary?.status === 'Refund Required') {
        return 'Order cancelled. Refund requires PAMO review; no refund has been issued.'
    }
    return 'Order cancelled.'
}

const placeOrder = async (req, res) => {
    try {
        const { userId, items, amount, requestId, checkoutCart, pricingQuote } = req.body
        const student = await getCheckoutStudent(userId)

        const orderData = {
            userId,
            requestId,
            pricingQuote,
            checkoutCart: prepareCheckoutCart(checkoutCart, items),
            items,
            student,
            fulfillmentMethod: 'campus_pickup',
            amount,
            paymentMethod: 'COD',
            paymentCurrency,
            payment: false,
            date: Date.now()
        }

        const newOrder = await createReservedOrder(orderData)

        let cartCleanupPending = false
        try {
            await clearCheckoutCart(newOrder, userId)
        } catch {
            // The order/reservation already committed. Do not report it as failed
            // or erase data to recover; replaying its original request can retry cleanup.
            cartCleanupPending = true
        }

        return res.json({
            success: true,
            message: 'Order Placed Successfully',
            orderId: newOrder._id,
            cartCleanupPending
        })
    } catch (error) {
        if (error?.code === 'STALE_PRODUCT_PRICE') {
            return res.status(error.status).json({
                success: false,
                code: error.code,
                message: error.message
            })
        }
        if (['INVALID_CUSTOMER', 'PROFILE_INCOMPLETE'].includes(error?.code)) {
            return res.status(error.status).json({
                success: false,
                code: error.code,
                message: error.message
            })
        }
        return res.json({ success: false, message: 'Unable to place your order. Review your items and try again.' })
    }
}

const paymentOptions = (_req, res) => res.json({ success: true, mode: 'test', methods: testPaymentOptions() })

const paymentFailure = (res, error) => res.status(error.status || 503).json({
    success: false,
    ...(error.code ? { code: error.code } : {}),
    message: error.code === 'STALE_PRODUCT_PRICE' ? error.message
        : 'Test payment could not be confirmed. Check My Orders before retrying. Contact PAMO if assistance is needed.'
})

const placeProviderOrder = method => async (req, res) => {
    try {
        // Validate configuration and return origin before reserving anything.
        const client = testPaymentClient(method)
        const origin = paymentReturnOrigin(req.headers?.origin)
        const { userId, items, requestId, checkoutCart, pricingQuote } = req.body || {}
        const student = await getCheckoutStudent(userId)
        const snapshot = prepareCheckoutCart(checkoutCart, items)
        if (!snapshot) throw checkoutError('Refresh your cart before checkout.', 409)
        const existing = await orderModel.findOne({ userId, requestId })
        if (!existing) {
            const current = await getCartSnapshot(userId)
            const covered = prepareCheckoutCart(current, items)
            for (const [id, sizes] of Object.entries(snapshot.cartVersions)) {
                for (const [size, version] of Object.entries(sizes)) {
                    if (covered.cartVersions[id]?.[size] !== version) {
                        throw checkoutError('Your cart changed. Review it before checkout.', 409)
                    }
                }
            }
        }
        const order = await createReservedOrder({
            userId, items, requestId, pricingQuote, checkoutCart: snapshot, student,
            fulfillmentMethod: 'campus_pickup', paymentCurrency, payment: false,
            paymentMethod: method === 'stripe' ? 'Stripe' : 'Paypal', date: Date.now()
        })
        const url = await openTestPayment(order, method, origin, client)
        return res.json({ success: true, session_url: url, orderId: order._id })
    } catch (error) {
        // Unknown provider outcomes retain the reservation for review/retry, never browser-driven restoration.
        return paymentFailure(res, error)
    }
}

const verifyProviderPayment = method => async (req, res) => {
    try {
        const client = testPaymentClient(method)
        const { userId, orderId, cancelled } = req.body || {}
        if (!validObjectId(userId) || !validObjectId(orderId)) throw checkoutError('Invalid order.', 400)
        const order = await orderModel.findOne({ _id: orderId, userId,
            paymentMethod: method === 'stripe' ? 'Stripe' : 'Paypal' })
        if (!order) throw checkoutError('Order not found.', 404)
        if (order.inventoryStatus !== 'reserved' || order.status === 'Cancelled'
            || order.cancellationRequest?.status === 'pending') throw checkoutError('Order needs review.', 409)
        await confirmTestPayment(order, method, { cancelled: cancelled === true }, client)
        const paidOrder = await orderModel.findOne({ _id: orderId, userId })
        let cartCleanupPending = false
        try {
            await clearCheckoutCart(paidOrder, userId)
        } catch {
            cartCleanupPending = true
        }
        return res.json({ success: true, orderId, requestId: paidOrder.requestId, cartCleanupPending })
    } catch (error) {
        return paymentFailure(res, error)
    }
}

const placeOrderStripe = placeProviderOrder('stripe')
const placeOrderPaypal = placeProviderOrder('paypal')
const verifyStripe = verifyProviderPayment('stripe')
const verifyPaypal = verifyProviderPayment('paypal')

const demoPaymentOptions = (_req, res) => res.json({ success: true, enabled: demoPaymentsEnabled() })

const demoFailure = (res, error) => res.status(error.status || 400).json({
    success: false,
    code: error.code,
    message: error.status ? error.message : 'Unable to complete this demo payment. Review your order and try again.'
})

const placeDemoOrder = async (req, res) => {
    try {
        requireDemoPayments()
        const { userId, items, requestId, checkoutCart, pricingQuote, demoProvider } = req.body
        if (typeof demoProvider !== 'string' || !Object.hasOwn(DEMO_PAYMENT_METHODS, demoProvider)) {
            throw checkoutError('Choose Stripe (DEMO) or PayPal (DEMO).', 400)
        }
        const student = await getCheckoutStudent(userId)
        const submittedCart = prepareCheckoutCart(checkoutCart, items)
        if (!submittedCart) throw checkoutError('Refresh your cart before demo checkout.', 409)
        const currentCart = prepareCheckoutCart(await getCartSnapshot(userId), items)
        for (const [id, sizes] of Object.entries(submittedCart.cartData)) {
            for (const [size, quantity] of Object.entries(sizes)) {
                if (currentCart.cartData[id]?.[size] !== quantity
                    || currentCart.cartVersions[id]?.[size] !== submittedCart.cartVersions[id][size]) {
                    throw checkoutError('Your cart changed. Review it before demo checkout.', 409)
                }
            }
        }
        const order = await createReservedOrder({
            userId, items, requestId, pricingQuote, student,
            checkoutCart: currentCart,
            fulfillmentMethod: 'campus_pickup',
            paymentMethod: DEMO_PAYMENT_METHODS[demoProvider],
            paymentCurrency, payment: false, date: Date.now(),
            demoPayment: { mode: 'demo', provider: demoProvider, status: 'pending' }
        })
        return res.json({ success: true, orderId: order._id })
    } catch (error) {
        return demoFailure(res, error)
    }
}

const ownedDemoOrder = async (orderId, userId) => {
    requireDemoPayments()
    if (!validObjectId(orderId) || !validObjectId(userId)) throw checkoutError('Invalid demo order.', 400)
    const order = await orderModel.findOne({ _id: orderId, userId })
    if (!order || !isDemoOrder(order)) throw checkoutError('Demo order not found.', 404)
    return order
}

const cleanDemoCart = async (order, userId) => {
    if (order.demoPayment.status !== 'succeeded') return false
    try {
        await clearCheckoutCart(order, userId)
        return false
    } catch {
        return true
    }
}

const getDemoPayment = async (req, res) => {
    try {
        const order = await ownedDemoOrder(req.params.orderId, req.body.userId)
        // Resuming a saved successful demo retries only its revision-safe cart cleanup.
        const cartCleanupPending = await cleanDemoCart(order, req.body.userId)
        return res.json({ success: true, order: toPublicOrder(order.toObject()), cartCleanupPending })
    } catch (error) {
        return demoFailure(res, error)
    }
}

const resolveDemoPayment = async (req, res) => {
    try {
        const { userId, outcome } = req.body
        if (!['succeeded', 'failed', 'cancelled'].includes(outcome)) {
            throw checkoutError('Choose a valid demo payment result.', 400)
        }
        let order = await ownedDemoOrder(req.params.orderId, userId)
        if (order.demoPayment.status === 'pending') {
            if (outcome === 'succeeded') {
                const updated = await orderModel.findOneAndUpdate({
                    _id: order._id, userId, paymentMethod: order.paymentMethod,
                    status: 'Order Placed', payment: false, inventoryStatus: 'reserved',
                    'demoPayment.mode': 'demo', 'demoPayment.status': 'pending',
                    'cancellationRequest.status': { $ne: 'pending' }
                }, { $set: {
                    payment: true, status: 'Approved', paidAt: Date.now(),
                    'demoPayment.status': 'succeeded',
                    'demoPayment.transactionId': `DEMO-${order.demoPayment.provider.toUpperCase()}-${randomUUID()}`
                } }, { returnDocument: 'after', runValidators: true })
                order = updated || await ownedDemoOrder(req.params.orderId, userId)
            } else {
                order = await cancelReservedOrder(String(order._id), {
                    userId, source: 'customer', unpaidOnly: true,
                    expectedStatus: 'Order Placed', expectedPayment: false,
                    paymentMethod: order.paymentMethod, demoOutcome: outcome
                })
            }
        }
        if (order.demoPayment.status !== outcome) {
            throw checkoutError('This demo payment has already changed. Refresh its saved result.', 409)
        }
        const cartCleanupPending = await cleanDemoCart(order, userId)
        return res.json({ success: true, order: toPublicOrder(order.toObject()), cartCleanupPending })
    } catch (error) {
        return demoFailure(res, error)
    }
}

const allOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({})
        return res.json({ success: true, orders: orders.map(order => presentOrder(order)) })
    } catch {
        return res.json({ success: false, message: 'Unable to load orders. Please try again.' })
    }
}

const userOrders = async (req, res) => {
    try {
        const { userId } = req.body
        if (!validObjectId(userId)) {
            return res.status(401).json({ success: false, message: 'Sign in to view your orders.' })
        }

        const orders = await orderModel.find({ userId }).select('_id items amount status paymentMethod payment demoPayment date sentToCashierAt receiptNumber paidAt cancellationSource cancelledAt cancellationRequest refund paymentCurrency confirmedBy stripePayment paypalPayment paymentRecovery inventoryStatus').lean()
        // Use internal evidence for classification without disclosing staff or provider metadata.
        return res.json({ success: true, orders: orders.map(toPublicOrder) })
    } catch {
        return res.json({ success: false, message: 'Unable to load your orders. Please try again.' })
    }
}

const cancelCustomerOrder = async (req, res) => {
    // authUser replaces body.userId with the verified token identity.
    const { orderId, userId } = req.body
    if (!validObjectId(userId)) {
        return res.status(401).json({ success: false, message: 'Sign in to cancel your order.' })
    }
    if (!validObjectId(orderId)) {
        return res.status(400).json({ success: false, message: 'Invalid order.' })
    }

    try {
        const order = await cancelReservedOrder(orderId, { userId, source: 'customer' })
        const refundSummary = refundPresentation(order)
        return res.json({
            success: true,
            message: getCancellationMessage(refundSummary),
            order: {
                _id: order._id,
                status: order.status,
                cancellationSource: order.cancellationSource,
                cancelledAt: order.cancelledAt,
                cancellationRequest: order.cancellationRequest,
                cancellationMode: null,
                refund: order.refund,
                refundSummary
            }
        })
    } catch (error) {
        const status = error.status || 500
        const message = error.status
            ? error.message
            : 'Unable to cancel this order. Refresh your orders and try again.'
        return res.status(status).json({ success: false, message })
    }
}

const requestCustomerCancellation = async (req, res) => {
    const { orderId, userId, reason } = req.body
    if (!validObjectId(userId)) return res.status(401).json({ success: false, message: 'Sign in to request cancellation.' })
    if (!validObjectId(orderId)) return res.status(400).json({ success: false, message: 'Invalid order.' })
    try {
        const order = await requestOrderCancellation(orderId, userId, reason)
        return res.json({ success: true, message: 'Cancellation requested. PAMO will review your request.', order: toPublicOrder(order.toObject()) })
    } catch (error) {
        return res.status(error.status || 500).json({ success: false,
            message: error.status ? error.message : 'Unable to request cancellation. Refresh orders and try again.' })
    }
}

const reviewCancellation = async (req, res) => {
    const { orderId, requestId, decision, reason, expectedStatus } = req.body
    const exceptionalCancellation = decision === 'exception'
    const invalidRequest = exceptionalCancellation
        ? requestId !== undefined || typeof expectedStatus !== 'string'
        : !validObjectId(requestId)
    if (!validObjectId(orderId) || invalidRequest || !['approve', 'reject', 'exception'].includes(decision)) {
        return res.status(400).json({ success: false, message: 'Choose a valid cancellation request and decision.' })
    }
    try {
        let order
        if (exceptionalCancellation) {
            order = await cancelReservedOrder(orderId, { source: 'admin', exceptionReason: reason ?? '', expectedStatus, expectedPayment: true })
        } else if (decision === 'approve') {
            order = await cancelReservedOrder(orderId, { source: 'admin', cancellationRequestId: requestId })
        } else {
            order = await rejectOrderCancellation(orderId, requestId, reason)
        }
        return res.json({ success: true,
            message: decision !== 'reject' ? getCancellationMessage(refundPresentation(order)) : 'Cancellation request rejected.',
            order: presentOrder(order) })
    } catch (error) {
        return res.status(error.status || 500).json({ success: false,
            message: error.status ? error.message : 'Unable to review cancellation. Refresh orders and try again.' })
    }
}

const updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body
        if (!validObjectId(orderId) || typeof status !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid order or status.' })
        }

        const currentOrder = await orderModel.findById(orderId)
        if (!currentOrder) {
            return res.status(404).json({ success: false, message: 'Order not found.' })
        }
        if (status === 'Cancelled' && currentOrder.status === 'Cancelled') {
            return res.json({
                success: true,
                message: 'Order already cancelled',
                order: presentOrder(currentOrder, [])
            })
        }
        if (!getAllowedOrderStatuses(currentOrder).includes(status)) {
            return res.status(409).json({ success: false, message: 'This action is not available for the current order and payment status. Refresh orders and try again.' })
        }

        let order
        if (status === 'Cancelled') {
            order = await cancelReservedOrder(orderId, {
                expectedStatus: currentOrder.status,
                expectedPayment: currentOrder.payment,
                source: 'admin'
            })
        } else {
            const updates = { status }
            if (status === 'Sent to Cashier') updates.sentToCashierAt = Date.now()

            order = await orderModel.findOneAndUpdate(
                { _id: orderId, status: currentOrder.status, payment: currentOrder.payment,
                    'cancellationRequest.status': { $ne: 'pending' } },
                { $set: updates },
                { returnDocument: 'after' }
            )
        }

        if (!order) {
            return res.status(409).json({ success: false, message: 'The order changed. Refresh orders and try again.' })
        }

        return res.json({ success: true, message: 'Status Updated', order: presentOrder(order) })
    } catch (error) {
        if (error.status === 409) return res.status(409).json({ success: false, message: error.message })
        return res.json({ success: false, message: 'Unable to update this order. Refresh and try again.' })
    }
}

export {
    verifyPaypal,
    demoPaymentOptions,
    paymentOptions,
    placeDemoOrder,
    getDemoPayment,
    resolveDemoPayment,
    verifyStripe,
    placeOrder,
    placeOrderStripe,
    placeOrderPaypal,
    allOrders,
    userOrders,
    cancelCustomerOrder,
    requestCustomerCancellation,
    reviewCancellation,
    updateStatus
}
