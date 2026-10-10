import express from 'express';
import { placeOrder, placeOrderStripe, placeOrderPaypal, allOrders, userOrders, cancelCustomerOrder, updateStatus, verifyStripe, verifyPaypal } from '../controllers/orderController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';
import cashierAuth from '../middleware/cashierAuth.js';
import { cashierOrders, confirmCashierPayment, cashierDashboardOverview } from '../controllers/cashierController.js';

const orderRouter = express.Router()

// admin features 
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)
orderRouter.post('/cashier/access', cashierAuth, (req, res) => res.json({ success: true, role: req.staff.role }))
orderRouter.post('/cashier/list', cashierAuth, cashierOrders)
orderRouter.post('/cashier/confirm', cashierAuth, confirmCashierPayment)
orderRouter.get('/cashier/dashboard/overview', cashierAuth, cashierDashboardOverview)

// Payment Features
orderRouter.post('/place',authUser,placeOrder)
orderRouter.post('/Stripe',authUser,placeOrderStripe)
orderRouter.post('/Paypal',authUser,placeOrderPaypal)

// user features
orderRouter.post('/userorders',authUser,userOrders)
orderRouter.post('/cancel',authUser,cancelCustomerOrder)

// Verify payment
orderRouter.post('/verifyStripe',authUser, verifyStripe)
orderRouter.post('/verifyPaypal', authUser, verifyPaypal)

export default orderRouter;


