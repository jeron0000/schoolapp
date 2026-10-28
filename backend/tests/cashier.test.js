import { ADMIN_SUBJECT } from '../../shared/authPolicy.js';
import { issueAuthToken } from '../utils/authTokens.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import orderModel from '../models/orderModel.js';
import userModel from '../models/userModel.js';
import categoryModel from '../models/categoryModel.js';
import cashierAuth from '../middleware/cashierAuth.js';
import adminAuth from '../middleware/adminAuth.js';
import { cashierOrders, confirmCashierPayment, recordOnlineReceipt } from '../controllers/cashierController.js';
import { adminLogin, registerUser } from '../controllers/userController.js';
import { mockReceiptConnection } from './helpers/receiptConnection.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_cashier';
process.env.JWT_SECRET = 'cashier-test-secret';
process.env.ADMIN_EMAIL = 'admin-test';
process.env.ADMIN_PASSWORD = 'test-password';
const { default: router } = await import('../routes/orderRoute.js');
const id = '0123456789abcdef01234567';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const unpaid = overrides => ({ _id: id, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', paymentCurrency: 'PHP', amount: 235, ...overrides });
const request = overrides => ({ body: { orderId: id, paymentMethod: 'COD', receiptNumber: ' OR-101 ', ...overrides }, staff: { identity: 'cashier@school.test' } });

const onlinePaid = overrides => ({ ...unpaid(), status: 'Approved', payment: true, paymentMethod: 'Stripe', paidAt: 123,
    stripePayment: { sessionId: 'cs_test_fixture', paymentIntentId: 'pi_fixture', chargeId: 'ch_fixture',
        accountId: 'acct_fixture', livemode: false, verifiedAt: 123 }, ...overrides });

test('online receipt recording is Cashier-only and updates only the original receipt field', async t => {
    const route = router.stack.find(layer => layer.route?.path === '/cashier/receipt').route;
    assert.equal(route.stack[0].handle, cashierAuth);
    assert.equal(route.stack[1].handle, recordOnlineReceipt);
    mockReceiptConnection(t, orderModel);
    const original = onlinePaid();
    t.mock.method(orderModel, 'findById', async () => original);
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update) => {
        assert.equal(filter.payment, true);
        assert.equal(filter['stripePayment.chargeId'], original.stripePayment.chargeId);
        assert.deepEqual(filter.$or, [{ receiptNumber: { $exists: false } }, { receiptNumber: null }, { receiptNumber: '' }]);
        assert.deepEqual(update, { $set: { receiptNumber: 'OR-101' } });
        const saved = { ...original, ...update.$set };
        return { ...saved, toObject: () => saved };
    });
    const res = response();
    await recordOnlineReceipt(request({ payment: false, amount: 1, status: 'Cancelled' }), res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.order.receiptIsTest, true);
    assert.match(res.body.message, /not a genuine school-issued receipt/);
    assert.equal(res.body.order.paidAt, original.paidAt);
    assert.equal(res.body.order.status, original.status);
    assert.deepEqual(res.body.order.stripePayment, original.stripePayment);
});

test('online receipt recording rejects missing verification, unpaid/COD/demo records and existing receipts', async t => {
    t.mock.method(orderModel, 'findOneAndUpdate', async () => assert.fail('Unexpected receipt write'));
    for (const change of [{ payment: false }, { receiptNumber: 'OR-EXISTING' }, { stripePayment: undefined },
        { paymentMethod: 'COD' }, { demoPayment: { mode: 'demo' } }, { paidAt: 321 }, { amount: 0 }]) {
        t.mock.method(orderModel, 'findById', async () => onlinePaid(change));
        const res = response();
        await recordOnlineReceipt(request(), res);
        assert.equal(res.code, 409);
    }
});

test('online receipt recording rejects concurrent writes and duplicate receipt numbers', async t => {
    mockReceiptConnection(t, orderModel);
    t.mock.method(orderModel, 'findById', async () => onlinePaid());
    let saved;
    t.mock.method(orderModel, 'findOneAndUpdate', async (_filter, update) => {
        if (saved) return null;
        saved = { ...onlinePaid(), ...update.$set };
        return { ...saved, toObject: () => saved };
    });
    const results = [response(), response()];
    await Promise.all(results.map(res => recordOnlineReceipt(request(), res)));
    assert.deepEqual(results.map(res => res.code).sort(), [200, 409]);
    t.mock.method(orderModel, 'findOneAndUpdate', async () => { throw { code: 11000 }; });
    const duplicate = response();
    await recordOnlineReceipt(request(), duplicate);
    assert.equal(duplicate.code, 409);
    assert.match(duplicate.body.message, /already recorded/);
});

test('verified PayPal receipts retain live/sandbox provenance and payment evidence', async t => {
    mockReceiptConnection(t, orderModel);
    for (const environment of ['sandbox', 'live']) {
        const original = onlinePaid({ paymentMethod: 'Paypal', stripePayment: undefined,
            paypalPayment: { orderId: 'PAYPALORDER', captureId: 'CAPTURE', merchantId: 'MERCHANT', environment, verifiedAt: 123 } });
        t.mock.method(orderModel, 'findById', async () => original);
        t.mock.method(orderModel, 'findOneAndUpdate', async (_filter, update) => {
            const saved = { ...original, ...update.$set };
            return { ...saved, toObject: () => saved };
        });
        const res = response();
        await recordOnlineReceipt(request(), res);
        assert.equal(res.body.success, true);
        assert.equal(res.body.order.receiptIsTest, environment === 'sandbox');
        assert.deepEqual(res.body.order.paypalPayment, original.paypalPayment);
    }
});

test('cashier list includes only sent unpaid orders or canonical paid transactions', async t => {
    t.mock.method(orderModel, 'find', async query => {
        assert.deepEqual(query, { 'demoPayment.mode': { $ne: 'demo' }, $or: [{ status: 'Sent to Cashier', payment: false }, { payment: true }] });
        return [{ ...unpaid(), toObject: () => unpaid() }];
    });
    const res = response();
    await cashierOrders({}, res);
    assert.equal(res.body.orders[0]._id, id);
});

test('confirmation stores receipt, timestamp, identity and returns to preparation using the stored amount', async t => {
    mockReceiptConnection(t, orderModel);
    t.mock.method(orderModel, 'findById', async () => unpaid());
    t.mock.method(orderModel.collection, 'createIndex', async (keys, options) => {
        assert.deepEqual(keys, { receiptNumber: 1 });
        assert.equal(options.unique, true);
        assert.deepEqual(options.partialFilterExpression, { receiptNumber: { $type: 'string' } });
    });
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: id, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', amount: 235, paymentCurrency: 'PHP', 'cancellationRequest.status': { $ne: 'pending' } });
        assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
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
        { cancellationRequest: { status: 'pending' } },
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
    mockReceiptConnection(t, orderModel);
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
    const { connection } = mockReceiptConnection(t, orderModel);
    t.mock.method(orderModel, 'findById', async () => unpaid());
    t.mock.method(orderModel.collection, 'createIndex', async () => {});
    t.mock.method(orderModel, 'findOneAndUpdate', async () => { throw { code: 11000 }; });
    const duplicate = response();
    await confirmCashierPayment(request(), duplicate);
    assert.equal(duplicate.code, 409);
    assert.match(duplicate.body.message, /Receipt Number is already recorded/);
    connection.emit('disconnected');
    connection.emit('connected');
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
    const token = issueAuthToken(id, 'cashier');
    t.mock.method(userModel, 'findOne', async query => {
        assert.deepEqual(query, { _id: id, role: 'cashier' });
        return { email: 'cashier@school.test' };
    });
    const req = { headers: { token } };
    let calls = 0;
    await cashierAuth(req, response(), () => calls++);
    assert.deepEqual(req.staff, { role: 'cashier', identity: 'cashier@school.test' });
    await adminAuth(req, response(), () => assert.fail('Cashiers must not have admin permissions'));
    const admin = { headers: { token: issueAuthToken(ADMIN_SUBJECT, 'admin') } };
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
    assert.equal(jwt.verify(admin.body.token, process.env.JWT_SECRET).sub, ADMIN_SUBJECT);
    const hash = await bcrypt.hash('cashier-password', 4);
    t.mock.method(userModel, 'findOne', async query => {
        assert.equal(query.role, 'cashier');
        return { _id: id, password: hash };
    });
    const cashier = response();
    await adminLogin({ body: { email: 'cashier@school.test', password: 'cashier-password' } }, cashier);
    assert.equal(jwt.verify(cashier.body.token, process.env.JWT_SECRET).sub, id);
    const wrong = response();
    await adminLogin({ body: { email: 'cashier@school.test', password: 'wrong' } }, wrong);
    assert.equal(wrong.body.success, false);
});

test('public registration cannot assign itself cashier privileges', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    t.mock.method(userModel, 'findOne', async () => null);
    t.mock.method(userModel.prototype, 'save', async function () {
        assert.equal(this.role, 'customer');
        return { _id: id };
    });
    const res = response();
    await registerUser({ body: { name: 'Test', email: 'student@school.test', password: 'test-password', academicProgram: 'BSIT', role: 'cashier' } }, res);
    assert.equal(res.body.success, true);
});
