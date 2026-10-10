import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from 'stripe'
import paypal from '@paypal/checkout-server-sdk';
import { getAllowedOrderStatuses } from '../utils/orderStatus.js';
import { createReservedOrder, cancelReservedOrder } from '../utils/inventory.js';


// Global variables
const currency = 'php'
const paypalCurrency = 'USD'
const deliveryCharge = 10

// gateway initialize
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)


// Placing Orders Using COD method
const placeOrder = async (req, res) => {

    try {

        const { userId, items, amount, address, requestId } = req.body;

        const orderData = {
            userId,
            requestId,
            items,
            address,
            amount,
            paymentMethod: "COD",
            paymentCurrency: currency.toUpperCase(),
            payment: false,
            date: Date.now()
        }

        const newOrder = await createReservedOrder(orderData)

        await userModel.findByIdAndUpdate(userId, { cartData: {} })

        res.json({ success: true, message: "Order Placed Successfully", orderId: newOrder._id })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
 
}

// Placing Orders Using Stripe method
const placeOrderStripe = async (req, res) => {
    try {

        const { userId, items, amount, address, requestId } = req.body;
        const { origin } = req.headers;

        const orderData = {
            userId,
            requestId,
            items,
            address,
            amount,
            paymentMethod: "Stripe",
            paymentCurrency: currency.toUpperCase(),
            payment: false,
            date: Date.now()
        }

        const newOrder = await createReservedOrder(orderData)

        const line_items = newOrder.items.map((item) => ({
            price_data: {
                currency:currency,
                product_data: {
                    name:item.name
                },
                unit_amount: item.price * 100
            },
            quantity: item.quantity
        }))
        
        line_items.push({
            price_data: {
                currency:currency,
                product_data: {
                    name:'Delivery charges'
                },
                unit_amount: deliveryCharge * 100
            },
            quantity: 1
        })

        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/verify?success=true&orderId=${newOrder._id}&method=stripe`,
            cancel_url: `${origin}/verify?success=false&orderId=${newOrder._id}&method=stripe`,
            line_items,
            mode: 'payment',
        }, { idempotencyKey: String(newOrder._id) })

        res.json({success:true,session_url:session.url});

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }

}

// Verify Stripe
const verifyStripe = async(req,res) => {
    const {orderId, success, userId} = req.body
    if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId) || typeof orderId !== 'string' || !/^[a-f\d]{24}$/i.test(orderId)) return res.status(400).json({ success: false, message: 'Invalid order.' })
    
    try {
        if (success === "true") {
            // First local confirmation time, not provider settlement time; retries preserve history.
            const order = await orderModel.findOneAndUpdate({ _id: orderId, userId, paymentMethod: 'Stripe', status: { $ne: 'Cancelled' }, inventoryStatus: { $ne: 'released' } }, [
                { $set: { payment: true, paidAt: { $cond: [
                    { $eq: ['$payment', true] }, '$paidAt', { $ifNull: ['$paidAt', Date.now()] }
                ] } } }
            ], { updatePipeline: true })
            if (!order) return res.json({ success: false, message: 'This order is unavailable or cancelled.' })
            await userModel.findByIdAndUpdate(userId, {cartData: {}})
            res.json({success:true});
        } else {
            await cancelReservedOrder(orderId, { userId, paymentMethod: 'Stripe', unpaidOnly: true })
            res.json({success:false})
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// paypal payment
const placeOrderPaypal = async (req, res) => {

    try {

        const { userId, items, amount, address, requestId } = req.body;
        const { origin } = req.headers;

        const orderData = {
            userId,
            requestId,
            items,
            address,
            amount,
            paymentMethod: "PayPal",
            paymentCurrency: paypalCurrency,
            payment: false,
            date: Date.now()
        }

        const newOrder = await createReservedOrder(orderData)

        const total = newOrder.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        ) + deliveryCharge;

        const environment = new paypal.core.SandboxEnvironment(
            process.env.PAYPAL_CLIENT_ID,
            process.env.PAYPAL_SECRET
        );

        const client = new paypal.core.PayPalHttpClient(environment);

        // ✅ Create PayPal order
        const request = new paypal.orders.OrdersCreateRequest();
        request.headers['PayPal-Request-Id'] = String(newOrder._id);

        request.requestBody({
            intent: "CAPTURE",
            purchase_units: [
                {
                    amount: {
                        currency_code: paypalCurrency,
                        value: total.toFixed(2),
                    },
                },
            ],
            application_context: {
                return_url: `${origin}/verify?success=true&orderId=${newOrder._id}&method=paypal`,
                cancel_url: `${origin}/verify?success=false&orderId=${newOrder._id}&method=paypal`,
            },
        });

        const response = await client.execute(request);

        // ✅ Get approval link
        const approvalUrl = response.result.links.find(
            (link) => link.rel === "approve"
        ).href;

        res.json({ success: true, url: approvalUrl });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Verify PayPal
const verifyPaypal = async (req, res) => {
    const { orderId, success, userId } = req.body;
    if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId) || typeof orderId !== 'string' || !/^[a-f\d]{24}$/i.test(orderId)) return res.status(400).json({ success: false, message: 'Invalid order.' });

    try {
        if (success === "true") {
            // First local confirmation time, not provider settlement time; retries preserve history.
            const order = await orderModel.findOneAndUpdate({ _id: orderId, userId, paymentMethod: 'PayPal', status: { $ne: 'Cancelled' }, inventoryStatus: { $ne: 'released' } }, [
                { $set: { payment: true, paidAt: { $cond: [
                    { $eq: ['$payment', true] }, '$paidAt', { $ifNull: ['$paidAt', Date.now()] }
                ] } } }
            ], { updatePipeline: true });
            if (!order) return res.json({ success: false, message: 'This order is unavailable or cancelled.' });
            await userModel.findByIdAndUpdate(userId, { cartData: {} });
            res.json({ success: true });
        } else {
            await cancelReservedOrder(orderId, { userId, paymentMethod: 'PayPal', unpaidOnly: true });
            res.json({ success: false });
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};


// All Orders Data For Admin Panel
const allOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({})
        res.json({ success: true, orders: orders.map(order => ({ ...order.toObject(), allowedStatuses: getAllowedOrderStatuses(order) })) })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Users Order Data For Frontend
const userOrders = async (req, res) => {
    try {
        const { userId } = req.body
        if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) {
            return res.status(401).json({ success: false, message: 'Sign in to view your orders.' })
        }
        const orders = await orderModel.find({ userId }).select('_id items amount status paymentMethod payment date sentToCashierAt receiptNumber paidAt cancellationSource')
        res.json({ success: true, orders })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const cancelCustomerOrder = async (req, res) => {
    // authUser replaces body.userId with the verified token identity.
    const { orderId, userId } = req.body
    if (typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) return res.status(401).json({ success: false, message: 'Sign in to cancel your order.' })
    if (typeof orderId !== 'string' || !/^[a-f\d]{24}$/i.test(orderId)) return res.status(400).json({ success: false, message: 'Invalid order.' })
    try {
        const order = await cancelReservedOrder(orderId, { userId, source: 'customer' })
        res.json({ success: true, message: 'Order cancelled.', order: { _id: order._id, status: order.status, cancellationSource: order.cancellationSource } })
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
            return res.json({ success: true, message: 'Order already cancelled', order: { ...currentOrder.toObject(), allowedStatuses: [] } })
        }
        if (!getAllowedOrderStatuses(currentOrder).includes(status)) {
            return res.status(409).json({ success: false, message: 'This action is not available for the current order and payment status. Refresh orders and try again.' })
        }
        const order = status === 'Cancelled' && currentOrder.inventoryStatus === 'reserved'
            ? await cancelReservedOrder(orderId, { expectedStatus: currentOrder.status, expectedPayment: currentOrder.payment, source: 'admin' })
            : await orderModel.findOneAndUpdate(
            { _id: orderId, status: currentOrder.status, payment: currentOrder.payment },
            { $set: { status, ...(status === 'Cancelled' ? { cancellationSource: 'admin' } : {}), ...(status === 'Sent to Cashier' ? { sentToCashierAt: Date.now() } : {}) } },
            { new: true }
        )
        if (!order) {
            return res.status(409).json({ success: false, message: 'The order changed. Refresh orders and try again.' })
        }
        res.json({ success: true, message: 'Status Updated', order: { ...order.toObject(), allowedStatuses: getAllowedOrderStatuses(order) } })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
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
