import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import { cancelReservedOrder } from '../utils/inventory.js';
import { cancellationRefund } from '../utils/orderRefund.js';
import { refundPresentation, REFUND_STATUSES } from '../../shared/refund.js';
import { cancelCustomerOrder, updateStatus, userOrders } from '../controllers/orderController.js';
import { confirmCashierPayment } from '../controllers/cashierController.js';

const id = '0123456789abcdef01234567';
const owner = '1123456789abcdef01234567';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const fixture = overrides => ({
    _id: id, userId: owner, paymentMethod: 'COD', payment: false, status: 'Order Placed',
    amount: 235, inventoryStatus: 'reserved', items: [{ _id: id, size: 'M', quantity: 1 }], ...overrides
});

// Atomic predicate fixture only; real MongoDB transactional proof remains opt-in.
function harness(t, overrides = {}) {
    let order = fixture(overrides);
    let stock = 4;
    const writes = [];
    let beforeWrite;
    let transactionTail = Promise.resolve();
    t.mock.method(mongoose.connection, 'transaction', callback => {
        const result = transactionTail.then(async () => {
            const previous = structuredClone(order), previousStock = stock;
            try { return await callback({ synthetic: true }); }
            catch (error) { order = previous; stock = previousStock; throw error; }
        });
        transactionTail = result.catch(() => {});
        return result;
    });
    const matches = filter => Object.entries(filter).every(([key, value]) =>
        value && typeof value === 'object' && Object.hasOwn(value, '$exists')
            ? (order[key] !== undefined) === value.$exists
            : order[key] === value);
    const document = () => ({ ...structuredClone(order), toObject: () => structuredClone(order) });
    t.mock.method(orderModel, 'findById', async () => document());
    t.mock.method(orderModel, 'findOne', filter => ({
        session() { return this; }, lean: async () => matches(filter) ? structuredClone(order) : null
    }));
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update, options) => {
        beforeWrite?.();
        beforeWrite = undefined;
        if (!matches(filter)) return null;
        writes.push(structuredClone(update.$set));
        Object.assign(order, structuredClone(update.$set));
        assert.equal(options.runValidators, true);
        return document();
    });
    t.mock.method(productModel, 'updateOne', async (_filter, update, options) => {
        assert.deepEqual(options.session, { synthetic: true });
        stock += update.$inc['inventory.M'];
        return { matchedCount: 1 };
    });
    return { order: () => structuredClone(order), stock: () => stock, writes,
        race: callback => { beforeWrite = () => callback(order); } };
}

test('five classifications are defined but no unsupported refund operations are manufactured', async () => {
    assert.deepEqual(Object.values(REFUND_STATUSES), ['Not Required', 'Refund Required', 'Refund Pending', 'Refunded', 'Refund Failed']);
    const normal = { userId: owner, items: [], amount: 235, address: {}, paymentMethod: 'COD', date: 1 };
    const historical = new orderModel(normal);
    assert.equal(historical.refund, undefined);
    assert.equal(refundPresentation(new orderModel({ ...normal, status: 'Cancelled' })).status, 'Refund Required');
    for (const status of ['Refund Pending', 'Refunded', 'Refund Failed', 'Not Required']) {
        const record = new orderModel({ ...normal, refund: { status, requiredAt: 1 } });
        await assert.rejects(record.validate(), undefined, `${status} requires an authorized evidence workflow`);
    }
    await new orderModel({ ...normal, refund: { status: 'Refund Required', requiredAt: 1 } }).validate();
});

test('unpaid cancellation preserves its response and releases stock once without a refund obligation', async t => {
    const h = harness(t);
    await cancelReservedOrder(id, { userId: owner, source: 'customer' });
    await cancelReservedOrder(id, { userId: owner, source: 'customer' });
    assert.equal(h.stock(), 5);
    assert.equal(h.writes.length, 1);
    assert.equal(h.order().refund, undefined);
    assert.equal(h.order().payment, false);
    assert.equal(refundPresentation(h.order()).status, 'Not Required');
});

test('paid cancellation persists one obligation and preserves all payment evidence on retries', async t => {
    const paid = { payment: true, paymentMethod: 'Stripe', paidAt: 1, paymentCurrency: 'PHP',
        stripePayment: { sessionId: 'cs_test_synthetic', chargeId: 'ch_synthetic', verifiedAt: 1 } };
    const h = harness(t, paid);
    await cancelReservedOrder(id, { userId: owner, source: 'customer' });
    const first = h.order().refund;
    await cancelReservedOrder(id, { userId: owner, source: 'customer' });
    assert.equal(first.status, 'Refund Required');
    assert(Number.isSafeInteger(first.requiredAt));
    assert.deepEqual(h.order().refund, first);
    for (const [key, value] of Object.entries(paid)) assert.deepEqual(h.order()[key], value);
    assert.equal(h.stock(), 5);
    assert.equal(h.writes.length, 1);
});

test('concurrent cancellation predicates permit only one release and one obligation', async t => {
    const h = harness(t, { payment: true });
    const results = await Promise.allSettled(Array.from({ length: 2 }, () => cancelReservedOrder(id, { userId: owner, source: 'customer' })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(h.writes.length, 1);
    assert.equal(h.stock(), 5);
    assert.equal(h.writes[0].refund.status, 'Refund Required');
});

test('unknown payment types, contradictory metadata and unpaid online attempts require review before stock changes', async t => {
    for (const overrides of [{ payment: undefined }, { payment: null }, { payment: 'true' },
        { paidAt: 1 }, { receiptNumber: 'OR-old' }, { confirmedBy: 'staff' },
        { paymentMethod: 'Stripe' }, { stripePayment: { sessionId: 'cs_test_old' } },
        { paymentRecovery: { phase: 'review' } }]) {
        const h = harness(t, overrides);
        await assert.rejects(cancelReservedOrder(id, { userId: owner, source: 'customer' }), { status: 409 });
        assert.equal(h.writes.length, 0);
        assert.equal(h.stock(), 4);
    }
});

test('historical cancellation does not fabricate stock restoration or previous refunds', async t => {
    const h = harness(t, { payment: true, inventoryStatus: undefined });
    await cancelReservedOrder(id, { source: 'admin' });
    assert.equal(h.stock(), 4);
    assert.equal(h.order().refund.status, 'Refund Required');
    const old = fixture({ status: 'Cancelled', payment: true, inventoryStatus: undefined });
    const snapshot = structuredClone(old);
    assert.equal(refundPresentation(old).status, 'Refund Required');
    assert.deepEqual(old, snapshot);
    for (const payment of [undefined, null, 'unknown']) {
        const summary = refundPresentation({ ...old, payment });
        assert.equal(summary.status, 'Refund Required');
        assert.match(summary.message, /review/);
    }
    assert.match(refundPresentation({ ...old, refund: { status: 'Refunded' } }).message, /not been confirmed/);
});

test('wrong ownership and progressed orders cannot create an obligation or restore inventory', async t => {
    const h = harness(t, { payment: true });
    await assert.rejects(cancelReservedOrder(id, { userId: id, source: 'customer' }), { status: 404 });
    assert.equal(h.writes.length, 0);
    const progressed = harness(t, { payment: true, status: 'Packing' });
    await assert.rejects(cancelReservedOrder(id, { userId: owner, source: 'customer' }), { status: 409 });
    assert.equal(progressed.writes.length, 0);
});

test('payment winning before cancellation write conflicts safely', async t => {
    const h = harness(t);
    h.race(order => { order.payment = true; order.paidAt = 1; });
    await assert.rejects(cancelReservedOrder(id, { userId: owner, source: 'customer' }), { status: 409 });
    assert.equal(h.writes.length, 0);
    assert.equal(h.stock(), 4);
});

test('inventory restoration failure rolls back cancellation and obligation together', async t => {
    const h = harness(t, { payment: true });
    t.mock.method(productModel, 'updateOne', async () => ({ matchedCount: 0 }));
    await assert.rejects(cancelReservedOrder(id, { userId: owner, source: 'customer' }));
    assert.equal(h.order().status, 'Order Placed');
    assert.equal(h.order().refund, undefined);
    assert.equal(h.stock(), 4);
});

test('customer and Admin endpoints ignore submitted refund claims and share the cancellation transaction', async t => {
    const h = harness(t, { payment: true });
    const res = response();
    await cancelCustomerOrder({ body: { orderId: id, userId: owner, refund: { status: 'Refunded' } } }, res);
    assert.equal(res.body.order.refund.status, 'Refund Required');
    assert.match(res.body.message, /no refund has been issued/);
    for (const status of ['Refund Pending', 'Refunded', 'Refund Failed']) {
        const repeat = response();
        await updateStatus({ body: { orderId: id, status: 'Cancelled', refund: { status } } }, repeat);
        assert.equal(repeat.body.order.refund.status, 'Refund Required');
    }
    assert.equal(h.writes.length, 1);
    const legacy = harness(t, { payment: true, inventoryStatus: undefined });
    const admin = response();
    await updateStatus({ body: { orderId: id, status: 'Cancelled' } }, admin);
    assert.equal(admin.body.success, true);
    assert.equal(legacy.order().refund.status, 'Refund Required');
    assert.equal(legacy.stock(), 4);
});

test('cashier cannot confirm payment after cancellation and cannot set refund metadata', async t => {
    const h = harness(t, { status: 'Cancelled' });
    const res = response();
    await confirmCashierPayment({ body: { orderId: id, paymentMethod: 'COD', receiptNumber: 'OR-123', refund: { status: 'Refunded' } }, staff: { identity: 'synthetic' } }, res);
    assert.equal(res.code, 409);
    assert.equal(h.writes.length, 0);
});

test('customer history classifies private payment evidence without disclosing it', async t => {
    const record = fixture({ status: 'Cancelled', stripePayment: { sessionId: 'private-provider-id' }, confirmedBy: 'private-staff-id' });
    t.mock.method(orderModel, 'find', () => ({ select() { return this; }, lean: async () => [record] }));
    const res = response();
    await userOrders({ body: { userId: owner } }, res);
    assert.equal(res.body.orders[0].refundSummary.status, 'Refund Required');
    assert.doesNotMatch(JSON.stringify(res.body), /private-provider-id|private-staff-id/);
    assert.equal(cancellationRefund(fixture()), undefined);
});
