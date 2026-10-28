import orderModel from '../models/orderModel.js'
import { cashierDashboardRange, getCashierDashboardOverview } from '../utils/cashierDashboard.js'
import { ensureReceiptIndex } from '../utils/receiptIndex.js'
import { validPhpAmount } from '../../shared/money.js'
import { refundPresentation } from '../../shared/refund.js'
import { canRecordOnlineReceipt, isTestPaymentReceipt } from '../../shared/paymentReceipt.js'

const objectIdPattern = /^[a-f\d]{24}$/i
const receiptControlCharacters = /[\x00-\x1f\x7f]/

const validOrderId = orderId => typeof orderId === 'string' && objectIdPattern.test(orderId)

const validReceiptNumber = receiptNumber => {
    if (typeof receiptNumber !== 'string') return false
    const trimmedReceiptNumber = receiptNumber.trim()
    if (!trimmedReceiptNumber || trimmedReceiptNumber.length > 100) return false
    return !receiptControlCharacters.test(receiptNumber)
}

const hasValidStoredPayment = order => {
    return validPhpAmount(order.amount)
        && order.amount > 0
        && order.paymentCurrency === 'PHP'
}

const presentCashierOrder = order => ({
    ...order.toObject(),
    receiptIsTest: isTestPaymentReceipt(order),
    refundSummary: refundPresentation(order)
})

export const cashierDashboardOverview = async (req, res) => {
    let range
    try {
        if (Object.keys(req.query).some(key => key !== 'range')) {
            return res.status(400).json({ success: false, message: 'Only the range query parameter is supported.' })
        }
        range = cashierDashboardRange(req.query.range)
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message })
    }

    try {
        const overview = await getCashierDashboardOverview(range)
        return res.json({ success: true, ...overview })
    } catch {
        return res.status(500).json({ success: false, message: 'Unable to load cashier dashboard analytics. Please try again.' })
    }
}

export const cashierOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({
            'demoPayment.mode': { $ne: 'demo' },
            $or: [
                { status: 'Sent to Cashier', payment: false },
                { payment: true }
            ]
        })
        return res.json({ success: true, orders: orders.map(presentCashierOrder) })
    } catch {
        return res.status(500).json({ success: false, message: 'Unable to load cashier orders.' })
    }
}

export const confirmCashierPayment = async (req, res) => {
    const { orderId, paymentMethod, receiptNumber } = req.body
    if (!validOrderId(orderId)) {
        return res.status(400).json({ success: false, message: 'Invalid order.' })
    }
    if (paymentMethod !== 'COD') {
        return res.status(400).json({ success: false, message: 'Only cash payments can be confirmed at the cashier.' })
    }
    if (!validReceiptNumber(receiptNumber)) {
        return res.status(400).json({ success: false, message: 'Enter a valid Official Receipt Number (up to 100 characters).' })
    }

    const normalizedReceiptNumber = receiptNumber.trim()

    try {
        const current = await orderModel.findById(orderId)
        if (!current) return res.status(404).json({ success: false, message: 'Order not found.' })
        if (current.cancellationRequest?.status === 'pending') {
            return res.status(409).json({ success: false, message: 'Cancellation is pending PAMO review. Payment confirmation is on hold.' })
        }
        if (current.status !== 'Sent to Cashier' || current.payment !== false) {
            return res.status(409).json({ success: false, message: 'Only unpaid orders sent to Cashier can be paid. Refresh to see the latest status.' })
        }
        if (current.paymentMethod !== 'COD') {
            return res.status(409).json({ success: false, message: 'This order uses an online payment provider and cannot be confirmed as cash.' })
        }
        if (!hasValidStoredPayment(current)) {
            return res.status(409).json({ success: false, message: 'The stored total must be a positive, exact PHP amount. Historical currency or precision needs review.' })
        }

        const assertReceiptIndexReady = await ensureReceiptIndex(orderModel)
        assertReceiptIndexReady()

        const order = await orderModel.findOneAndUpdate(
            { _id: orderId, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', amount: current.amount, paymentCurrency: 'PHP',
                'cancellationRequest.status': { $ne: 'pending' } },
            {
                $set: {
                    payment: true,
                    status: 'Packing',
                    paymentMethod: 'COD',
                    receiptNumber: normalizedReceiptNumber,
                    paidAt: Date.now(),
                    confirmedBy: req.staff.identity
                }
            },
            { returnDocument: 'after', runValidators: true }
        )
        if (!order) {
            return res.status(409).json({ success: false, message: 'The order changed or payment was already confirmed. Refresh and check its receipt.' })
        }

        return res.json({ success: true, message: 'Payment confirmed. Order returned for preparation.', order })
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'This Official Receipt Number is already recorded.' })
        }
        return res.status(500).json({ success: false, message: 'Unable to confirm payment. Refresh and check the order before trying again.' })
    }
}

export const recordOnlineReceipt = async (req, res) => {
    const { orderId, receiptNumber } = req.body || {}
    if (!validOrderId(orderId) || !validReceiptNumber(receiptNumber)) {
        return res.status(400).json({ success: false, message: 'Enter a valid order and Official Receipt Number (up to 100 characters).' })
    }
    try {
        const current = await orderModel.findById(orderId)
        if (!current) return res.status(404).json({ success: false, message: 'Order not found.' })
        if (!canRecordOnlineReceipt(current) || !hasValidStoredPayment(current)) {
            return res.status(409).json({ success: false, message: 'Only verified online-paid orders without a receipt can be updated.' })
        }
        const assertReady = await ensureReceiptIndex(orderModel)
        assertReady()
        const providerPath = current.paymentMethod === 'Stripe' ? 'stripePayment' : 'paypalPayment'
        const identityPath = current.paymentMethod === 'Stripe' ? 'chargeId' : 'captureId'
        const order = await orderModel.findOneAndUpdate({
            _id: orderId, payment: true, paymentMethod: current.paymentMethod,
            amount: current.amount, paymentCurrency: current.paymentCurrency, paidAt: current.paidAt,
            [providerPath + '.verifiedAt']: current.paidAt,
            [providerPath + '.' + identityPath]: current[providerPath][identityPath],
            $or: [{ receiptNumber: { $exists: false } }, { receiptNumber: null }, { receiptNumber: '' }]
        }, { $set: { receiptNumber: receiptNumber.trim() } }, { returnDocument: 'after', runValidators: true })
        if (!order) return res.status(409).json({ success: false, message: 'The order changed or a receipt was already recorded. Refresh before retrying.' })
        const message = isTestPaymentReceipt(order)
            ? 'Test receipt reference recorded. This is not a genuine school-issued receipt.'
            : 'Official Receipt Number recorded. Payment was not reconfirmed.'
        return res.json({ success: true, message, order: presentCashierOrder(order) })
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ success: false, message: 'This Official Receipt Number is already recorded.' })
        return res.status(500).json({ success: false, message: 'Unable to record the receipt. Refresh and check the order before retrying.' })
    }
}
