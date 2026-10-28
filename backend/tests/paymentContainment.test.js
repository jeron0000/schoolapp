import { issueAuthToken } from '../utils/authTokens.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import userModel from '../models/userModel.js';
import categoryModel from '../models/categoryModel.js';
import authUser from '../middleware/auth.js';
import router from '../routes/orderRoute.js';
import { placeOrder, placeOrderStripe, placeOrderPaypal, verifyStripe, verifyPaypal } from '../controllers/orderController.js';

process.env.JWT_SECRET = 'sr1-synthetic-test-signing-key';
process.env.PAMO_PAYMENT_MODE = 'disabled';

const userId = '0123456789abcdef01234567';
const productId = '1123456789abcdef01234567';
const orderId = '2123456789abcdef01234567';
const checkoutAddress = { firstName: 'Synthetic', lastName: 'Student', email: 'student@example.test', phone: '09171234567', street: '123 Campus Road', city: 'Carmona', state: 'Cavite', zipcode: '4116', country: 'Philippines' };
const blockedMessage = 'Test payment could not be confirmed. Check My Orders before retrying. Contact PAMO if assistance is needed.';
const onlineRoutes = [
    ['/Stripe', placeOrderStripe], ['/Paypal', placeOrderPaypal],
    ['/verifyStripe', verifyStripe], ['/verifyPaypal', verifyPaypal]
];
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

const forbidSideEffects = t => {
    const calls = [];
    for (const [target, methods] of [
        [orderModel, ['init', 'find', 'findOne', 'findById', 'create', 'findOneAndUpdate', 'findByIdAndUpdate', 'updateOne', 'deleteOne']],
        [productModel, ['findById', 'updateOne', 'findOneAndUpdate']],
        [userModel, ['findById', 'findByIdAndUpdate']],
        [mongoose.connection, ['transaction']]
    ]) {
        for (const method of methods) calls.push(t.mock.method(target, method, () => assert.fail('Unexpected database operation')));
    }
    const sessions = new Stripe('sk_test_sr1_fixture_only').checkout.sessions;
    calls.push(t.mock.method(Object.getPrototypeOf(sessions), 'create', () => assert.fail('Unexpected Stripe operation')));
    calls.push(t.mock.method(paypal.core.PayPalHttpClient.prototype, 'execute', () => assert.fail('Unexpected PayPal operation')));
    return () => calls.forEach(call => assert.equal(call.mock.callCount(), 0));
};

const server = async t => {
    const app = express();
    app.use(express.json());
    app.use('/api/order', router);
    const instance = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    t.after(() => new Promise(resolve => instance.close(resolve)));
    const base = 'http://127.0.0.1:' + instance.address().port;
    return async (route, body, token = issueAuthToken(userId, 'customer')) => {
        const result = await fetch(base + '/api/order' + route, {
            method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { token } : {}) }, body: JSON.stringify(body)
        });
        return { code: result.status, body: await result.json() };
    };
};

test('exceptional cancellation remains Admin-only and rejects student/Cashier tokens before side effects', async t => {
    const assertUntouched = forbidSideEffects(t);
    const send = await server(t);
    const body = { orderId, decision: 'exception', expectedStatus: 'Approved', reason: 'Merchant error' };
    for (const role of ['customer', 'cashier']) {
        const result = await send('/cancellation/review', body, issueAuthToken(userId, role));
        assert.equal(result.code, 403);
    }
    assert.equal((await send('/cancellation/review', body, null)).code, 401);
    assertUntouched();
});

test('all provider routes retain authentication and callable gated handlers', () => {
    for (const [path, handler] of onlineRoutes) {
        assert.equal(typeof handler, 'function');
        assert.deepEqual(router.stack.find(layer => layer.route?.path === path).route.stack.map(layer => layer.handle), [authUser, handler]);
    }
});

test('online creation and confirmation reject flags, retries, malformed IDs and missing bodies without side effects', async t => {
    const untouched = forbidSideEffects(t);
    for (const [, handler] of onlineRoutes) {
        for (const body of [undefined, {}, { success: 'true', userId, orderId }, { success: 'false', userId, orderId }, { success: true, orderId: { $ne: null } }]) {
            const res = response();
            await handler({ body }, res);
            assert.equal(res.code, 503);
            assert.deepEqual(res.body, { success: false, message: blockedMessage });
        }
    }
    untouched();
});

test('direct authenticated API requests, repeated callbacks and case variants cannot bypass containment', async t => {
    const untouched = forbidSideEffects(t);
    const send = await server(t);
    for (const path of ['/stripe', '/Stripe', '/paypal', '/Paypal', '/verifyStripe', '/verifyPaypal']) {
        for (const success of ['true', 'false', true]) {
            const result = await send(path, { userId: productId, orderId, success, payment: true, paidAt: 1, items: [{ _id: productId, size: 'M', quantity: 1 }] });
            assert.deepEqual(result, { code: 503, body: { success: false, message: blockedMessage } });
        }
    }
    untouched();
});

test('missing and invalid tokens retain existing authentication rejection before online handlers', async t => {
    const untouched = forbidSideEffects(t);
    const send = await server(t);
    const log = t.mock.method(console, 'log', () => {});
    for (const [path] of onlineRoutes) {
        for (const token of [null, 'invalid-synthetic-token']) {
            const result = await send(path, { orderId, success: 'true' }, token);
            assert.equal(result.body.success, false);
            assert.notEqual(result.code, 503);
            assert.notEqual(result.body.message, blockedMessage);
        }
    }
    assert.equal(log.mock.callCount(), 0);
    untouched();
});

test('rejected callbacks preserve pending, paid, cancelled and released online records, carts and stock', async t => {
    const untouched = forbidSideEffects(t);
    const state = {
        orders: ['Stripe', 'PayPal'].flatMap(paymentMethod => [
            { _id: orderId, userId, paymentMethod, payment: false, status: 'Order Placed', inventoryStatus: 'reserved' },
            { _id: productId, userId, paymentMethod, payment: true, paidAt: 123456, status: 'Approved', inventoryStatus: 'reserved' },
            { _id: userId, userId, paymentMethod, payment: false, status: 'Cancelled', inventoryStatus: 'released' }
        ]), cart: { [productId]: { M: 2 } }, inventory: { M: 3 }
    };
    const before = structuredClone(state);
    for (const order of state.orders) {
        const handler = order.paymentMethod === 'Stripe' ? verifyStripe : verifyPaypal;
        for (const success of ['true', 'false', 'true']) {
            const res = response();
            await handler({ body: { userId, orderId: order._id, success } }, res);
            assert.equal(res.code, 503);
        }
    }
    assert.deepEqual(state, before);
    untouched();
});

test('COD still uses canonical prices, reserves once on retries and ignores injected online payment fields', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    let stock = 5;
    let saved;
    let creations = 0;
    let cartClears = 0;
    t.mock.method(orderModel, 'init', async () => {});
    t.mock.method(orderModel, 'findOne', () => ({
        session: async () => saved || null,
        then: (resolve, reject) => Promise.resolve(saved || null).then(resolve, reject)
    }));
    t.mock.method(mongoose.connection, 'transaction', async work => work({}));
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }));
    t.mock.method(productModel, 'findById', () => ({ session() { return this; }, lean: async () => ({
        name: 'Synthetic uniform', price: 225, image: [], category: 'Men', subCategory: 'BSIT', sizes: ['M'], inventory: { M: stock }
    }) }));
    t.mock.method(productModel, 'updateOne', async (filter, update) => {
        assert.equal(filter._id, productId);
        assert.equal(filter['inventory.M'].$gte, 2);
        stock += update.$inc['inventory.M'];
        return { modifiedCount: 1 };
    });
    t.mock.method(orderModel, 'create', async ([data]) => {
        creations++;
        saved = { ...data, _id: orderId, status: 'Order Placed' };
        return [saved];
    });
    t.mock.method(userModel, 'findById', owner => ({
        select() { return this; },
        lean: async () => owner === userId
            ? { _id: userId, name: 'Synthetic Student', email: 'student@example.test', academicProgram: 'BSIT', role: 'customer' }
            : null
    }));
    t.mock.method(userModel, 'findByIdAndUpdate', async (owner, update) => {
        assert.equal(owner, userId);
        assert.deepEqual(update, { cartData: {} });
        cartClears++;
    });
    const body = { userId, requestId: 'sr1-cod-retry-fixture', items: [{ _id: productId, size: 'M', quantity: 2, price: 1 }],
        amount: 1, address: checkoutAddress, paymentMethod: 'Stripe', payment: true, paidAt: 1 };
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = response();
        await placeOrder({ body }, res);
        assert.equal(res.body.success, true);
        assert.equal(res.body.orderId, orderId);
    }
    assert.equal(creations, 1);
    assert.equal(stock, 3);
    // Legacy requests have no revision evidence: SR-4F preserves their cart.
    assert.equal(cartClears, 0);
    assert.equal(saved.paymentMethod, 'COD');
    assert.equal(saved.paymentCurrency, 'PHP');
    assert.equal(saved.payment, false);
    assert.equal(saved.paidAt, undefined);
    assert.equal(saved.amount, 460);
    assert.equal(saved.inventoryStatus, 'reserved');
});

test('customer history still exposes stored online records using authenticated ownership without writes', async t => {
    const records = ['Stripe', 'PayPal'].map((paymentMethod, index) => ({ _id: orderId, userId, paymentMethod, payment: Boolean(index), paidAt: index ? 123456 : undefined }));
    t.mock.method(orderModel, 'find', filter => {
        assert.deepEqual(filter, { userId });
        return { select: () => ({ lean: async () => records }) };
    });
    const mutate = t.mock.method(orderModel, 'findOneAndUpdate', () => assert.fail('History must be read-only'));
    const send = await server(t);
    const result = await send('/userorders', { userId: productId });
    assert.equal(result.body.success, true);
    assert.deepEqual(result.body.orders, JSON.parse(JSON.stringify(records.map(record => ({ ...record, refundSummary: null, cancellationMode: null })))));
    assert.equal(mutate.mock.callCount(), 0);
});
