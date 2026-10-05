import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { getAllowedOrderStatuses } from '../utils/orderStatus.js';
import orderModel from '../models/orderModel.js';
import adminAuth from '../middleware/adminAuth.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_order_status_tests';
process.env.JWT_SECRET = 'order-status-test-secret';
process.env.ADMIN_EMAIL = 'admin-test';
process.env.ADMIN_PASSWORD = 'test-password';
const { updateStatus, allOrders } = await import('../controllers/orderController.js');
const { default: orderRouter } = await import('../routes/orderRoute.js');
const orderId = '0123456789abcdef01234567';
const document = data => ({ ...data, toObject: () => ({ ...data }) });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('workflow preserves payment ownership and supports existing order stages', () => {
    assert.deepEqual(getAllowedOrderStatuses({ status: 'Order Placed', payment: false }), ['Approved', 'Cancelled']);
    for (const status of ['Approved', 'Packing']) {
        assert.deepEqual(getAllowedOrderStatuses({ status, payment: false }), ['Sent to Cashier']);
        assert.deepEqual(getAllowedOrderStatuses({ status, payment: true }), ['Ready To Claim']);
    }
    for (const status of ['Sent to Cashier', 'Shipped']) {
        assert.deepEqual(getAllowedOrderStatuses({ status, payment: false }), []);
        assert.deepEqual(getAllowedOrderStatuses({ status, payment: true }), ['Ready To Claim']);
    }
    assert.deepEqual(getAllowedOrderStatuses({ status: 'Ready To Claim', payment: false }), []);
    assert.deepEqual(getAllowedOrderStatuses({ status: 'Ready To Claim', payment: true }), ['Claimed']);
    for (const status of ['Claimed', 'Cancelled', 'unknown']) {
        assert.deepEqual(getAllowedOrderStatuses({ status, payment: true }), []);
    }
});

test('valid transitions persist status and the cashier handoff timestamp', async t => {
    const cases = [
        ['Order Placed', false, 'Approved'], ['Order Placed', false, 'Cancelled'],
        ['Approved', false, 'Sent to Cashier'], ['Approved', true, 'Ready To Claim'],
        ['Packing', false, 'Sent to Cashier'], ['Shipped', true, 'Ready To Claim'],
        ['Sent to Cashier', true, 'Ready To Claim'], ['Ready To Claim', true, 'Claimed']
    ];
    for (const [status, payment, next] of cases) {
        await t.test(`${status} → ${next} (paid=${payment})`, async t => {
            let stored = { _id: orderId, status, payment, amount: 235 };
            t.mock.method(orderModel, 'findById', async () => document(stored));
            t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update, options) => {
                assert.deepEqual(filter, { _id: orderId, status, payment });
                if (next === 'Sent to Cashier') {
                    assert.equal(typeof update.$set.sentToCashierAt, 'number');
                    assert.deepEqual(Object.keys(update.$set).sort(), ['sentToCashierAt', 'status']);
                    assert.equal(update.$set.status, next);
                } else {
                    assert.deepEqual(update, { $set: { status: next } });
                }
                assert.deepEqual(options, { new: true });
                stored = { ...stored, ...update.$set };
                return document(stored);
            });
            t.mock.method(orderModel, 'find', async () => [document(stored)]);
            const res = response();
            await updateStatus({ body: { orderId, status: next, payment: !payment } }, res);
            assert.equal(res.body.success, true);
            assert.equal(res.body.order.status, next);
            assert.equal(res.body.order.payment, payment);
            if (next === 'Sent to Cashier') assert.equal(res.body.order.sentToCashierAt, stored.sentToCashierAt);
            const listed = response();
            await allOrders({}, listed);
            assert.equal(listed.body.orders[0].status, next);
            assert.deepEqual(listed.body.orders[0].allowedStatuses, getAllowedOrderStatuses(stored));
        });
    }
});

test('invalid jumps, terminal orders, and unpaid release never write', async t => {
    for (const [status, payment, next] of [
        ['Order Placed', true, 'Claimed'], ['Cancelled', true, 'Approved'],
        ['Claimed', true, 'Approved'], ['Sent to Cashier', false, 'Ready To Claim'],
        ['Ready To Claim', false, 'Claimed'], ['Approved', false, 'Paid']
    ]) {
        await t.test(`${status} rejects ${next}`, async t => {
            t.mock.method(orderModel, 'findById', async () => document({ status, payment }));
            const write = t.mock.method(orderModel, 'findOneAndUpdate', async () => assert.fail('Unexpected write'));
            const res = response();
            await updateStatus({ body: { orderId, status: next, payment: true } }, res);
            assert.equal(res.code, 409);
            assert.equal(res.body.success, false);
            assert.equal(write.mock.callCount(), 0);
        });
    }
});

test('stale concurrent changes cannot overwrite a newer order state', async t => {
    t.mock.method(orderModel, 'findById', async () => document({ status: 'Order Placed', payment: false }));
    t.mock.method(orderModel, 'findOneAndUpdate', async () => null);
    const res = response();
    await updateStatus({ body: { orderId, status: 'Approved' } }, res);
    assert.equal(res.code, 409);
    assert.equal(res.body.success, false);
});

test('invalid IDs and missing orders return clear errors', async t => {
    const invalid = response();
    await updateStatus({ body: { orderId: 'bad', status: 'Approved' } }, invalid);
    assert.equal(invalid.code, 400);
    t.mock.method(orderModel, 'findById', async () => null);
    const missing = response();
    await updateStatus({ body: { orderId, status: 'Approved' } }, missing);
    assert.equal(missing.code, 404);
});

test('admin list and mutations retain the existing server authorization', async () => {
    for (const path of ['/list', '/status']) {
        const route = orderRouter.stack.find(layer => layer.route?.path === path).route;
        assert.equal(route.stack[0].handle, adminAuth);
    }
    for (const token of [undefined, jwt.sign({ userId: 'student' }, process.env.JWT_SECRET)]) {
        const res = response();
        let allowed = false;
        await adminAuth({ headers: { token } }, res, () => { allowed = true; });
        assert.equal(allowed, false);
        assert.equal(res.body.success, false);
    }
    let allowed = false;
    const token = jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, process.env.JWT_SECRET);
    await adminAuth({ headers: { token } }, response(), () => { allowed = true; });
    assert.equal(allowed, true);
});
