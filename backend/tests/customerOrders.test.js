import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import orderModel from '../models/orderModel.js';
import authUser from '../middleware/auth.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_customer_orders';
process.env.JWT_SECRET = 'customer-orders-test-secret';
const { userOrders } = await import('../controllers/orderController.js');
const { default: router } = await import('../routes/orderRoute.js');
const userId = '0123456789abcdef01234567';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('customer orders use the authenticated owner and expose only customer order/payment fields', async t => {
    const record = { _id: '1123456789abcdef01234567', items: [], amount: 235, status: 'Packing', payment: true, paymentMethod: 'COD', receiptNumber: 'OR-101', paidAt: Date.now() };
    t.mock.method(orderModel, 'find', query => {
        assert.deepEqual(query, { userId });
        return { select(fields) {
            assert.equal(fields, '_id items amount status paymentMethod payment date sentToCashierAt receiptNumber paidAt');
            assert.ok(!fields.split(' ').includes('confirmedBy'));
            return Promise.resolve([record]);
        } };
    });
    const req = { headers: { token: jwt.sign({ id: userId }, process.env.JWT_SECRET) }, body: { userId: 'another-student' } };
    let allowed = false;
    await authUser(req, response(), () => { allowed = true; });
    assert.equal(allowed, true);
    assert.equal(req.body.userId, userId);
    const res = response();
    await userOrders(req, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.orders[0].receiptNumber, 'OR-101');
    assert.equal(res.body.orders[0].paidAt, record.paidAt);
    assert.equal(res.body.orders[0].confirmedBy, undefined);
});

test('invalid or absent customer identity cannot issue an unscoped order query', async t => {
    t.mock.method(orderModel, 'find', () => assert.fail('Unexpected database query'));
    for (const identity of [undefined, null, 'invalid', { $ne: null }]) {
        const res = response();
        await userOrders({ body: { userId: identity } }, res);
        assert.equal(res.code, 401);
        assert.equal(res.body.success, false);
    }
});

test('customer endpoint retains token authorization and rejects missing sessions', async () => {
    assert.equal(router.stack.find(layer => layer.route?.path === '/userorders').route.stack[0].handle, authUser);
    const res = response();
    await authUser({ headers: {}, body: {} }, res, () => assert.fail('Unexpected access'));
    assert.equal(res.body.success, false);
});
