import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import orderModel from '../models/orderModel.js';
import userModel from '../models/userModel.js';
import cashierAuth from '../middleware/cashierAuth.js';
import adminAuth from '../middleware/adminAuth.js';
import { cashierOrders, confirmCashierPayment } from '../controllers/cashierController.js';
import { adminLogin, registerUser } from '../controllers/userController.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_cashier';
process.env.JWT_SECRET = 'cashier-test-secret';
process.env.ADMIN_EMAIL = 'admin-test';
process.env.ADMIN_PASSWORD = 'test-password';
const { default: router } = await import('../routes/orderRoute.js');
const id = '0123456789abcdef01234567';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const unpaid = overrides => ({ _id: id, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', amount: 235, ...overrides });
const request = overrides => ({ body: { orderId: id, paymentMethod: 'COD', receiptNumber: ' OR-101 ', ...overrides }, staff: { identity: 'cashier@school.test' } });

test('cashier list includes only sent unpaid orders or canonical paid transactions', async t => {
    t.mock.method(orderModel, 'find', async query => {
        assert.deepEqual(query, { $or: [{ status: 'Sent to Cashier', payment: false }, { payment: true }] });
        return [unpaid()];
    });
    const res = response();
    await cashierOrders({}, res);
    assert.equal(res.body.orders[0]._id, id);
});

test('confirmation stores receipt, timestamp, identity and returns to preparation using the stored amount', async t => {
    t.mock.method(orderModel, 'findById', async () => unpaid());
    t.mock.method(orderModel.collection, 'createIndex', async (keys, options) => {
        assert.deepEqual(keys, { receiptNumber: 1 });
        assert.equal(options.unique, true);
        assert.deepEqual(options.partialFilterExpression, { receiptNumber: { $type: 'string' } });
    });
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: id, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', amount: 235 });
        assert.deepEqual(options, { new: true, runValidators: true });
        assert.deepEqual(Object.keys(update.$set).sort(), ['confirmedBy', 'paidAt', 'payment', 'paymentMethod', 'receiptNumber', 'status']);
        assert.equal(update.$set.payment, true);
        assert.equal(update.$set.status, 'Packing');
        assert.equal(update.$set.receiptNumber, 'OR-101');
        assert.equal(update.$set.confirmedBy, 'cashier@school.test');
        assert.ok(Math.abs(Date.now() - update.$set.paidAt) < 1000);
        return { ...unpaid(), ...update.$set };
    });
    const res = response();
    await confirmCashierPayment(request({ amount: 1, payment: false, status: 'Claimed', confirmedBy: 'forged' }), res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.order.amount, 235);
    assert.equal(res.body.order.status, 'Packing');
});

test('unapproved, cancelled, completed, paid, provider and invalid-total orders never write', async t => {
    for (const overrides of [
        { status: 'Order Placed' }, { status: 'Approved' }, { status: 'Cancelled' }, { status: 'Claimed' },
        { payment: true }, { paymentMethod: 'Stripe' }, { paymentMethod: 'PayPal' },
        { amount: 0 }, { amount: -10 }, { amount: NaN }
    ]) {
        await t.test(JSON.stringify(overrides), async t => {
            t.mock.method(orderModel, 'findById', async () => unpaid(overrides));
            t.mock.method(orderModel, 'findOneAndUpdate', async () => assert.fail('Unexpected write'));
            const res = response();
            await confirmCashierPayment(request(), res);
            assert.equal(res.code, 409);
            assert.equal(res.body.success, false);
        });
    }
});

test('bad order IDs, methods and receipts are rejected before querying the DB', async t => {
    t.mock.method(orderModel, 'findById', async () => assert.fail('Unexpected query'));
    for (const fields of [{ orderId: 'bad' }, { paymentMethod: 'PayPal' }, { receiptNumber: '  ' }, { receiptNumber: null }, { receiptNumber: 'a'.repeat(101) }, { receiptNumber: 'a\nb' }]) {
        const res = response();
        await confirmCashierPayment(request(fields), res);
        assert.equal(res.code, 400);
    }
});

test('missing order returns 404', async t => {
    t.mock.method(orderModel, 'findById', async () => null);
    const res = response();
    await confirmCashierPayment(request(), res);
    assert.equal(res.code, 404);
});

test('atomic state check permits only one of two concurrent confirmations', async t => {
    t.mock.method(orderModel, 'findById', async () => unpaid());
    t.mock.method(orderModel.collection, 'createIndex', async () => {});
    let paid = false;
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update) => {
        assert.equal(filter.payment, false);
        if (paid) return null;
        paid = true;
        return { ...unpaid(), ...update.$set };
    });
    const first = response(), second = response();
    await Promise.all([confirmCashierPayment(request(), first), confirmCashierPayment(request(), second)]);
    assert.deepEqual([first.code, second.code].sort(), [200, 409]);
});

test('duplicate receipts and unavailable unique index fail closed', async t => {
    t.mock.method(orderModel, 'findById', async () => unpaid());
    t.mock.method(orderModel.collection, 'createIndex', async () => {});
    t.mock.method(orderModel, 'findOneAndUpdate', async () => { throw { code: 11000 }; });
    const duplicate = response();
    await confirmCashierPayment(request(), duplicate);
    assert.equal(duplicate.code, 409);
    assert.match(duplicate.body.message, /Receipt Number is already recorded/);
    t.mock.method(orderModel.collection, 'createIndex', async () => { throw new Error('Unavailable'); });
    t.mock.method(orderModel, 'findOneAndUpdate', async () => assert.fail('Must not pay without uniqueness protection'));
    const unavailable = response();
    await confirmCashierPayment(request(), unavailable);
    assert.equal(unavailable.code, 500);
});

test('cashier routes require backend permissions, with admin status route unchanged', () => {
    for (const path of ['/cashier/access', '/cashier/list', '/cashier/confirm']) {
        assert.equal(router.stack.find(layer => layer.route?.path === path).route.stack[0].handle, cashierAuth);
    }
    assert.equal(router.stack.find(layer => layer.route?.path === '/status').route.stack[0].handle, adminAuth);
});

test('cashier authorization checks actual role, accepts admin, and rejects missing or revoked access', async t => {
    const token = jwt.sign({ id }, process.env.JWT_SECRET);
    t.mock.method(userModel, 'findOne', async query => {
        assert.deepEqual(query, { _id: id, role: 'cashier' });
        return { email: 'cashier@school.test' };
    });
    const req = { headers: { token } };
    let calls = 0;
    await cashierAuth(req, response(), () => calls++);
    assert.deepEqual(req.staff, { role: 'cashier', identity: 'cashier@school.test' });
    await adminAuth(req, response(), () => assert.fail('Cashiers must not have admin permissions'));
    const admin = { headers: { token: jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, process.env.JWT_SECRET) } };
    await cashierAuth(admin, response(), () => calls++);
    assert.equal(admin.staff.role, 'admin');
    assert.equal(calls, 2);
    t.mock.method(userModel, 'findOne', async () => null);
    for (const value of [token, undefined, 'invalid', jwt.sign({ id, role: 'cashier' }, process.env.JWT_SECRET)]) {
        const res = response();
        await cashierAuth({ headers: { token: value } }, res, () => assert.fail('Unexpected access'));
        assert.equal(res.body.success, false);
    }
});

test('existing admin login remains valid and cashier login verifies its stored password and role', async t => {
    const admin = response();
    await adminLogin({ body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } }, admin);
    assert.equal(jwt.verify(admin.body.token, process.env.JWT_SECRET), process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD);
    const hash = await bcrypt.hash('cashier-password', 4);
    t.mock.method(userModel, 'findOne', async query => {
        assert.equal(query.role, 'cashier');
        return { _id: id, password: hash };
    });
    const cashier = response();
    await adminLogin({ body: { email: 'cashier@school.test', password: 'cashier-password' } }, cashier);
    assert.equal(jwt.verify(cashier.body.token, process.env.JWT_SECRET).id, id);
    const wrong = response();
    await adminLogin({ body: { email: 'cashier@school.test', password: 'wrong' } }, wrong);
    assert.equal(wrong.body.success, false);
});

test('public registration cannot assign itself cashier privileges', async t => {
    t.mock.method(userModel, 'findOne', async () => null);
    t.mock.method(userModel.prototype, 'save', async function () {
        assert.equal(this.role, 'customer');
        return { _id: id };
    });
    const res = response();
    await registerUser({ body: { name: 'Test', email: 'student@school.test', password: 'test-password', role: 'cashier' } }, res);
    assert.equal(res.body.success, true);
});
