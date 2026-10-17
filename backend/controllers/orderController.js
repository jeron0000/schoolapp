import orderModel from "../models/orderModel.js";
import { prepareCheckoutCart, clearCheckoutCart } from '../utils/checkoutCart.js';
import { getAllowedOrderStatuses } from '../utils/orderStatus.js';
import { createReservedOrder, cancelReservedOrder } from '../utils/inventory.js';
import { validateOrderAddress } from '../utils/orderAddress.js';
import { refundPresentation } from '../../shared/refund.js';


// Global variables
const currency = 'php'



// Placing Orders Using COD method
const placeOrder = async (req, res) => {

    try {

        const { userId, items, amount, address, requestId, checkoutCart } = req.body;
        const validatedAddress = validateOrderAddress(address);

        const orderData = {
            userId,
            requestId,
            checkoutCart: prepareCheckoutCart(checkoutCart, items),
            items,
            address: validatedAddress,
            amount,
            paymentMethod: "COD",
            paymentCurrency: currency.toUpperCase(),
            payment: false,
            date: Date.now()
        }

        const newOrder = await createReservedOrder(orderData)

        let cartCleanupPending = false;
        try {
            await clearCheckoutCart(newOrder, userId);
        } catch {
            // The order/reservation already committed. Do not report it as failed
            // or erase data to recover; replaying its original request can retry cleanup.
            cartCleanupPending = true;
        }

        res.json({ success: true, message: "Order Placed Successfully", orderId: newOrder._id, cartCleanupPending })

    } catch (error) {
        if (error?.code === 'INVALID_ORDER_ADDRESS') {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        res.json({ success: false, message: 'Unable to place your order. Review your items and try again.' })
    }

}

// SR-1: fail closed until provider-authoritative verification is implemented.
// Reject before any order, inventory, cart, or provider operation; never cancel
// an existing attempt merely because its browser reports success or failure.
const onlinePaymentUnavailable = (_req, res) => res.status(503).json({
    success: false,
    message: 'Online payments are temporarily unavailable. Please use Pay as you claim. If you already paid online, contact PAMO for review.'
});

const placeOrderStripe = onlinePaymentUnavailable;
const placeOrderPaypal = onlinePaymentUnavailable;
const verifyStripe = onlinePaymentUnavailable;
const verifyPaypal = onlinePaymentUnavailable;

// All Orders Data For Admin Panel
const allOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({})
        res.json({ success: true, orders: orders.map(order => ({ ...order.toObject(), refundSummary: refundPresentation(order), allowedStatuses: getAllowedOrderStatuses(order) })) })
    } catch {
        res.json({ success: false, message: 'Unable to load orders. Please try again.' })
    }
}

// Users Order Data For Frontend
const userOrders = async (req, res) => {
    try {
        const { userId } = req.body
        if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) {
            return res.status(401).json({ success: false, message: 'Sign in to view your orders.' })
        }
        const orders = await orderModel.find({ userId }).select('_id items amount status paymentMethod payment date sentToCashierAt receiptNumber paidAt cancellationSource refund paymentCurrency confirmedBy stripePayment paypalPayment paymentRecovery').lean()
        // Use internal evidence for classification without disclosing staff or provider metadata.
        res.json({ success: true, orders: orders.map(order => {
            const { confirmedBy, stripePayment, paypalPayment, paymentRecovery, ...publicOrder } = order
            return { ...publicOrder, refundSummary: refundPresentation(order) }
        }) })
    } catch {
        res.json({ success: false, message: 'Unable to load your orders. Please try again.' })
    }
}

const cancelCustomerOrder = async (req, res) => {
    // authUser replaces body.userId with the verified token identity.
    const { orderId, userId } = req.body
    if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) return res.status(401).json({ success: false, message: 'Sign in to cancel your order.' })
    if (typeof orderId !== 'string' || !/^[a-f\d]{24}$/i.test(orderId)) return res.status(400).json({ success: false, message: 'Invalid order.' })
    try {
        const order = await cancelReservedOrder(orderId, { userId, source: 'customer' })
        const refundSummary = refundPresentation(order)
        res.json({ success: true, message: refundSummary?.status === 'Refund Required' ? 'Order cancelled. Refund requires PAMO review; no refund has been issued.' : 'Order cancelled.', order: { _id: order._id, status: order.status, cancellationSource: order.cancellationSource, refund: order.refund, refundSummary } })
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to cancel this order. Refresh your orders and try again.' })
    }
}

// Update Order Status From Admin Panel
const updateStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body
        if (typeof orderId !== 'string' || !/^[a-f\d]{24}$/i.test(orderId) || typeof status !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid order or status.' })
        }
        const currentOrder = await orderModel.findById(orderId)
        if (!currentOrder) {
            return res.status(404).json({ success: false, message: 'Order not found.' })
        }
        if (status === 'Cancelled' && currentOrder.status === 'Cancelled') {
            return res.json({ success: true, message: 'Order already cancelled', order: { ...currentOrder.toObject(), refundSummary: refundPresentation(currentOrder), allowedStatuses: [] } })
        }
        if (!getAllowedOrderStatuses(currentOrder).includes(status)) {
            return res.status(409).json({ success: false, message: 'This action is not available for the current order and payment status. Refresh orders and try again.' })
        }
        const order = status === 'Cancelled'
            ? await cancelReservedOrder(orderId, { expectedStatus: currentOrder.status, expectedPayment: currentOrder.payment, source: 'admin' })
            : await orderModel.findOneAndUpdate(
            { _id: orderId, status: currentOrder.status, payment: currentOrder.payment },
            { $set: { status, ...(status === 'Cancelled' ? { cancellationSource: 'admin' } : {}), ...(status === 'Sent to Cashier' ? { sentToCashierAt: Date.now() } : {}) } },
            { new: true }
        )
        if (!order) {
            return res.status(409).json({ success: false, message: 'The order changed. Refresh orders and try again.' })
        }
        res.json({ success: true, message: 'Status Updated', order: { ...order.toObject(), refundSummary: refundPresentation(order), allowedStatuses: getAllowedOrderStatuses(order) } })
    } catch (error) {
        if (error.status === 409) return res.status(409).json({ success: false, message: error.message })
        res.json({ success: false, message: 'Unable to update this order. Refresh and try again.' })
    }
}

export {
    verifyPaypal,
    verifyStripe,
    placeOrder,
    placeOrderStripe,
    placeOrderPaypal,
    allOrders,
    userOrders,
    cancelCustomerOrder,
    updateStatus
}
