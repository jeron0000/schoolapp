import orderModel from '../models/orderModel.js';
import { cashierDashboardRange, getCashierDashboardOverview } from '../utils/cashierDashboard.js';

export const cashierDashboardOverview = async (req, res) => {
    let range;
    try {
        if (Object.keys(req.query).some(key => key !== 'range')) {
            return res.status(400).json({ success: false, message: 'Only the range query parameter is supported.' });
        }
        range = cashierDashboardRange(req.query.range);
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
    try {
        res.json({ success: true, ...await getCashierDashboardOverview(range) });
    } catch {
        res.status(500).json({ success: false, message: 'Unable to load cashier dashboard analytics. Please try again.' });
    }
};

export const cashierOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({ $or: [
            { status: 'Sent to Cashier', payment: false },
            { payment: true }
        ] });
        res.json({ success: true, orders });
    } catch {
        res.status(500).json({ success: false, message: 'Unable to load cashier orders.' });
    }
};

export const confirmCashierPayment = async (req, res) => {
    const { orderId, paymentMethod, receiptNumber } = req.body;
    if (typeof orderId !== 'string' || !/^[a-f\d]{24}$/i.test(orderId)) {
        return res.status(400).json({ success: false, message: 'Invalid order.' });
    }
    if (paymentMethod !== 'COD') {
        return res.status(400).json({ success: false, message: 'Only cash payments can be confirmed at the cashier.' });
    }
    if (typeof receiptNumber !== 'string' || !receiptNumber.trim() || receiptNumber.trim().length > 100 || /[\x00-\x1f\x7f]/.test(receiptNumber)) {
        return res.status(400).json({ success: false, message: 'Enter a valid Official Receipt Number (up to 100 characters).' });
    }
    try {
        const current = await orderModel.findById(orderId);
        if (!current) return res.status(404).json({ success: false, message: 'Order not found.' });
        if (current.status !== 'Sent to Cashier' || current.payment !== false) {
            return res.status(409).json({ success: false, message: 'Only unpaid orders sent to Cashier can be paid. Refresh to see the latest status.' });
        }
        if (current.paymentMethod !== 'COD') {
            return res.status(409).json({ success: false, message: 'This order uses an online payment provider and cannot be confirmed as cash.' });
        }
        if (!Number.isFinite(current.amount) || current.amount <= 0) {
            return res.status(409).json({ success: false, message: 'The stored order total must be greater than zero.' });
        }
        // Ensure uniqueness even where automatic schema indexing is disabled.
        // Older orders without receipt metadata are excluded from this index.
        await orderModel.collection.createIndex({ receiptNumber: 1 }, {
            name: 'cashier_receipt_unique', unique: true,
            partialFilterExpression: { receiptNumber: { $type: 'string' } }
        });
        const order = await orderModel.findOneAndUpdate(
            { _id: orderId, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', amount: current.amount },
            { $set: {
                payment: true, status: 'Packing', paymentMethod: 'COD',
                receiptNumber: receiptNumber.trim(), paidAt: Date.now(), confirmedBy: req.staff.identity
            } },
            { new: true, runValidators: true }
        );
        if (!order) return res.status(409).json({ success: false, message: 'The order changed or payment was already confirmed. Refresh and check its receipt.' });
        res.json({ success: true, message: 'Payment confirmed. Order returned for preparation.', order });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ success: false, message: 'This Official Receipt Number is already recorded.' });
        res.status(500).json({ success: false, message: 'Unable to confirm payment. Refresh and check the order before trying again.' });
    }
};
