import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import { cancelReservedOrder, requestOrderCancellation, rejectOrderCancellation } from '../utils/inventory.js';
import { CANCELLATION_REVIEW_MS, getCancellationMode, getCancellationRequestLabel, isPaidOnlineOrder } from '../../shared/orderCancellation.js';
import { cancellationRefund } from '../utils/orderRefund.js';
import { refundPresentation, REFUND_STATUSES } from '../../shared/refund.js';
import { cancelCustomerOrder, requestCustomerCancellation, reviewCancellation, updateStatus, userOrders } from '../controllers/orderController.js';
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
    const matches = filter => Object.entries(filter).every(([key, value]) => {
        const actual = key.split('.').reduce((entry, part) => entry?.[part], order);
        if (value && typeof value === 'object' && Object.hasOwn(value, '$exists')) return (actual !== undefined) === value.$exists;
        if (value && typeof value === 'object' && Object.hasOwn(value, '$ne')) return actual !== value.$ne;
        return actual === value;
    });
    const document = () => ({ ...structuredClone(order), toObject: () => structuredClone(order) });
    t.mock.method(orderModel, 'findById', () => ({
        lean: async () => structuredClone(order),
        then(resolve, reject) { return Promise.resolve(document()).then(resolve, reject); }
    }));
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
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }));
    return { order: () => structuredClone(order), stock: () => stock, writes,
        race: callback => { beforeWrite = () => callback(order); } };
}

const requestApproval = async () => {
    const order = await requestOrderCancellation(id, owner, 'Cannot collect this order.');
    return { source: 'admin', cancellationRequestId: String(order.cancellationRequest._id) };
};

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

test('paid online exceptional cancellation persists one obligation and preserves all payment evidence on retries', async t => {
    const paid = { payment: true, paymentMethod: 'Stripe', paidAt: 1, paymentCurrency: 'PHP',
        stripePayment: { sessionId: 'cs_test_synthetic', chargeId: 'ch_synthetic', verifiedAt: 1 } };
    const h = harness(t, paid);
    const approval = { source: 'admin', exceptionReason: 'Unavailable merchandise', expectedStatus: 'Order Placed', expectedPayment: true };
    await cancelReservedOrder(id, approval);
    const first = h.order().refund;
    await cancelReservedOrder(id, approval);
    assert.equal(first.status, 'Refund Required');
    assert(Number.isSafeInteger(first.requiredAt));
    assert.deepEqual(h.order().refund, first);
    for (const [key, value] of Object.entries(paid)) assert.deepEqual(h.order()[key], value);
    assert.equal(h.stock(), 5);
    assert.equal(h.writes.length, 1);
});

test('paid Stripe and PayPal orders cannot use either ordinary student cancellation endpoint', async t => {
    for (const paymentMethod of ['Stripe', 'Paypal']) {
        const h = harness(t, { paymentMethod, payment: true, paidAt: 1, status: 'Approved' });
        assert.equal(isPaidOnlineOrder(h.order()), true);
        assert.equal(getCancellationMode(h.order()), null);
        const cancel = response();
        await cancelCustomerOrder({ body: { orderId: id, userId: owner, exceptionReason: 'Forged exception', source: 'admin' } }, cancel);
        assert.equal(cancel.code, 403);
        assert.match(cancel.body.message, /paid online.*cannot be cancelled directly/);
        const request = response();
        await requestCustomerCancellation({ body: { orderId: id, userId: owner, reason: 'Please cancel' } }, request);
        assert.equal(request.code, 403);
        assert.equal(h.stock(), 4);
        assert.equal(h.writes.length, 0);
    }
});

test('online pending and failed payment evidence stays under existing conservative handling', async t => {
    for (const paymentMethod of ['Stripe', 'Paypal']) {
        for (const paymentRecovery of [undefined, { phase: 'pending' }, { phase: 'failed' }]) {
            const h = harness(t, { paymentMethod, payment: false, paymentRecovery });
            assert.equal(isPaidOnlineOrder(h.order()), false);
            await assert.rejects(requestOrderCancellation(id, owner, 'Cancel'), { status: 409 });
            await assert.rejects(cancelReservedOrder(id, { userId: owner, source: 'customer' }), { status: 409 });
            assert.equal(h.stock(), 4);
            assert.equal(h.writes.length, 0);
        }
    }
});

test('Admin online exceptions require a reason, reject completed/stale orders, and restore at most once', async t => {
    const h = harness(t, { paymentMethod: 'Paypal', payment: true, paidAt: 10,
        paypalPayment: { captureId: 'preserved-capture', verifiedAt: 10 } });
    let res = response();
    await reviewCancellation({ body: { orderId: id, decision: 'exception', expectedStatus: 'Order Placed', reason: ' ' } }, res);
    assert.equal(res.code, 400);
    assert.equal(h.writes.length, 0);
    const body = { orderId: id, decision: 'exception', expectedStatus: 'Order Placed', reason: 'Merchant cannot supply the item.' };
    const results = [response(), response()];
    await Promise.all(results.map(result => reviewCancellation({ body }, result)));
    assert.ok(results.every(result => result.body.success));
    assert.equal(h.stock(), 5);
    assert.equal(h.writes.length, 1);
    assert.equal(h.order().cancellationRequest.reason, body.reason);
    assert.equal(h.order().refund.status, 'Refund Required');
    assert.equal(h.order().paypalPayment.captureId, 'preserved-capture');
    for (const status of ['Claimed', 'Completed']) {
        const terminal = harness(t, { paymentMethod: 'Stripe', payment: true, status });
        res = response();
        await reviewCancellation({ body: { ...body, expectedStatus: status } }, res);
        assert.equal(res.code, 409);
        assert.equal(terminal.writes.length, 0);
    }
    const stale = harness(t, { paymentMethod: 'Stripe', payment: true, status: 'Ready To Claim' });
    stale.race(order => { order.status = 'Claimed'; });
    res = response();
    await reviewCancellation({ body: { ...body, expectedStatus: 'Ready To Claim' } }, res);
    assert.equal(res.code, 409);
    assert.equal(stale.writes.length, 0);
});

test('legacy pending online requests remain reviewable and payment-method races reject new requests', async t => {
    const requestId = '2123456789abcdef01234567';
    for (const decision of ['approve', 'reject']) {
        const h = harness(t, { paymentMethod: 'Stripe', payment: true, cancellationRequest: {
            _id: requestId, status: 'pending', reason: 'Existing request', requestedAt: 1
        } });
        const res = response();
        await reviewCancellation({ body: { orderId: id, requestId, decision, reason: 'Already prepared.' } }, res);
        assert.equal(res.body.success, true);
        assert.equal(h.stock(), decision === 'approve' ? 5 : 4);
    }
    const h = harness(t, { payment: true });
    h.race(order => { order.paymentMethod = 'Stripe'; });
    await assert.rejects(requestOrderCancellation(id, owner, 'Cancel'), { status: 409 });
    assert.equal(h.writes.length, 0);
});

test('concurrent cancellation predicates permit only one release and one obligation', async t => {
    const h = harness(t, { payment: true });
    const approval = await requestApproval();
    const results = await Promise.allSettled(Array.from({ length: 2 }, () => cancelReservedOrder(id, approval)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(h.writes.length, 2);
    assert.equal(h.stock(), 5);
    assert.equal(h.writes[1].refund.status, 'Refund Required');
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
    await cancelReservedOrder(id, await requestApproval());
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
    const approval = await requestApproval();
    t.mock.method(productModel, 'updateOne', async () => ({ matchedCount: 0 }));
    await assert.rejects(cancelReservedOrder(id, approval));
    assert.equal(h.order().status, 'Order Placed');
    assert.equal(h.order().refund, undefined);
    assert.equal(h.stock(), 4);
});

test('customer and Admin endpoints ignore submitted refund claims and share the cancellation transaction', async t => {
    const h = harness(t);
    const res = response();
    await cancelCustomerOrder({ body: { orderId: id, userId: owner, refund: { status: 'Refunded' } } }, res);
    assert.equal(res.body.order.refund, undefined);
    for (const status of ['Refund Pending', 'Refunded', 'Refund Failed']) {
        const repeat = response();
        await updateStatus({ body: { orderId: id, status: 'Cancelled', refund: { status } } }, repeat);
        assert.equal(repeat.body.order.refund, undefined);
    }
    assert.equal(h.writes.length, 1);
    const legacy = harness(t, { payment: true, inventoryStatus: undefined });
    const admin = response();
    await updateStatus({ body: { orderId: id, status: 'Cancelled' } }, admin);
    assert.equal(admin.code, 409);
    assert.equal(legacy.order().refund, undefined);
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

test('cancellation eligibility distinguishes immediate, review, terminal, and ambiguous states', () => {
    assert.equal(getCancellationMode(fixture()), 'immediate');
    assert.equal(getCancellationMode(fixture({ payment: true })), 'request');
    for (const status of ['Approved', 'Packing', 'Sent to Cashier']) {
        assert.equal(getCancellationMode(fixture({ status })), 'request');
    }
    assert.equal(getCancellationMode(fixture({ status: 'Ready To Claim', payment: true })), 'request');
    for (const status of ['Shipped', 'Claimed', 'Completed', 'Cancelled', 'unknown']) {
        assert.equal(getCancellationMode(fixture({ status, payment: true })), null);
    }
    for (const overrides of [{ paidAt: 1 }, { payment: undefined }, { inventoryStatus: 'released' },
        { cancellationRequest: { status: 'pending' } }, { status: 'Ready To Claim' }]) {
        assert.equal(getCancellationMode(fixture(overrides)), null);
    }
});

test('paid and approved requests persist reasons and timestamps without restoring inventory', async t => {
    for (const overrides of [{ payment: true }, { status: 'Approved' }]) {
        const h = harness(t, overrides);
        const result = response();
        await requestCustomerCancellation({ body: { orderId: id, userId: owner, reason: '  Wrong size  ' } }, result);
        assert.equal(result.body.success, true);
        assert.equal(h.order().cancellationRequest.reason, 'Wrong size');
        assert.equal(typeof h.order().cancellationRequest.requestedAt, 'number');
        assert.equal(h.order().cancellationRequest.status, 'pending');
        assert.equal(h.order().status, overrides.status || 'Order Placed');
        assert.equal(h.stock(), 4);
        await assert.rejects(requestOrderCancellation(id, owner, 'Duplicate'), { status: 409 });
        assert.equal(h.writes.length, 1);
    }
});

test('request validation rejects blank reasons, wrong owners, and completed orders', async t => {
    harness(t, { payment: true });
    for (const reason of ['', '   ', null, 'x'.repeat(1001)]) {
        await assert.rejects(requestOrderCancellation(id, owner, reason), { status: 400 });
    }
    await assert.rejects(requestOrderCancellation(id, id, 'Wrong owner'), { status: 404 });
    for (const status of ['Claimed', 'Completed', 'Shipped']) {
        const h = harness(t, { status, payment: true });
        await assert.rejects(requestOrderCancellation(id, owner, 'Changed plans'), { status: 409 });
        assert.equal(h.writes.length, 0);
    }
});

test('Admin approval cancels, releases once, and retains receipt and refund evidence', async t => {
    const h = harness(t, { status: 'Packing', payment: true, receiptNumber: 'OR-101', paidAt: 100 });
    const approval = await requestApproval();
    const requestId = approval.cancellationRequestId;
    for (let i = 0; i < 2; i++) {
        const res = response();
        await reviewCancellation({ body: { orderId: id, requestId, decision: 'approve' } }, res);
        assert.equal(res.body.success, true);
    }
    assert.equal(h.order().status, 'Cancelled');
    assert.equal(h.order().cancellationRequest.status, 'approved');
    assert.equal(h.order().refund.status, 'Refund Required');
    assert.equal(h.order().receiptNumber, 'OR-101');
    assert.equal(h.order().paidAt, 100);
    assert.equal(h.stock(), 5);
    assert.equal(h.writes.length, 2);
});

test('rejection requires a reason, releases no stock, and stale reviews cannot affect a new request', async t => {
    const h = harness(t, { status: 'Approved' });
    const approval = await requestApproval();
    await assert.rejects(rejectOrderCancellation(id, approval.cancellationRequestId, ''), { status: 400 });
    await rejectOrderCancellation(id, approval.cancellationRequestId, 'Preparation cannot be stopped.');
    assert.equal(h.order().cancellationRequest.status, 'rejected');
    assert.equal(h.order().cancellationRequest.rejectionReason, 'Preparation cannot be stopped.');
    assert.equal(h.order().status, 'Approved');
    assert.equal(h.stock(), 4);
    await requestOrderCancellation(id, owner, 'Please reconsider.');
    await assert.rejects(cancelReservedOrder(id, approval), { status: 409 });
    assert.equal(h.order().cancellationRequest.status, 'pending');
});

test('overdue starts at 24 hours and leaves the stored request pending and actionable', async t => {
    const h = harness(t, { payment: true });
    const approval = await requestApproval();
    const request = h.order().cancellationRequest;
    assert.equal(getCancellationRequestLabel(request, request.requestedAt + CANCELLATION_REVIEW_MS - 1), 'Pending Review');
    assert.equal(getCancellationRequestLabel(request, request.requestedAt + CANCELLATION_REVIEW_MS), 'Overdue');
    assert.equal(h.order().status, 'Order Placed');
    await cancelReservedOrder(id, approval);
    assert.equal(h.order().status, 'Cancelled');
});

test('pending requests block fulfillment and cashier payment, including read/write races', async t => {
    const h = harness(t, { status: 'Sent to Cashier', paymentCurrency: 'PHP' });
    await requestApproval();
    const payment = response();
    await confirmCashierPayment({ body: { orderId: id, paymentMethod: 'COD', receiptNumber: 'OR-102' } }, payment);
    assert.equal(payment.code, 409);
    const fulfillment = response();
    await updateStatus({ body: { orderId: id, status: 'Ready To Claim' } }, fulfillment);
    assert.equal(fulfillment.code, 409);
    assert.equal(h.stock(), 4);

    for (const [status, payment, next] of [
        ['Order Placed', true, 'Approved'], ['Approved', false, 'Sent to Cashier'],
        ['Packing', true, 'Ready To Claim'], ['Ready To Claim', true, 'Claimed']
    ]) {
        const held = harness(t, { status, payment });
        await requestApproval();
        const result = response();
        await updateStatus({ body: { orderId: id, status: next } }, result);
        assert.equal(result.code, 409);
        assert.equal(held.writes.length, 1, 'only the request may be written');
        assert.equal(held.stock(), 4);
    }

    const race = harness(t);
    race.race(order => { order.cancellationRequest = { status: 'pending' }; });
    const approval = response();
    await updateStatus({ body: { orderId: id, status: 'Approved' } }, approval);
    assert.equal(approval.code, 409);
    assert.equal(race.writes.length, 0);
});

test('paid orders cannot bypass review using ordinary Student or Admin cancellation', async t => {
    const h = harness(t, { payment: true, receiptNumber: 'OR-paid' });
    const student = response();
    await cancelCustomerOrder({ body: { orderId: id, userId: owner } }, student);
    assert.equal(student.code, 409);
    const admin = response();
    await updateStatus({ body: { orderId: id, status: 'Cancelled' } }, admin);
    assert.equal(admin.code, 409);
    assert.equal(h.writes.length, 0);
    assert.equal(h.stock(), 4);
});

test('concurrent review decisions allow one decision and at most one stock release', async t => {
    const h = harness(t, { payment: true });
    const approval = await requestApproval();
    const results = await Promise.allSettled([
        cancelReservedOrder(id, approval),
        rejectOrderCancellation(id, approval.cancellationRequestId, 'Unable to stop preparation.')
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(h.writes.length, 2);
    assert.equal(h.stock(), h.order().status === 'Cancelled' ? 5 : 4);
});

test('concurrent submissions keep one pending request and stale fulfillment changes reject submissions', async t => {
    const h = harness(t, { status: 'Approved' });
    const results = await Promise.allSettled([
        requestOrderCancellation(id, owner, 'First request'),
        requestOrderCancellation(id, owner, 'Duplicate request')
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(h.writes.length, 1);
    assert.equal(h.stock(), 4);
    const stale = harness(t, { status: 'Ready To Claim', payment: true });
    stale.race(order => { order.status = 'Claimed'; });
    await assert.rejects(requestOrderCancellation(id, owner, 'Too late'), { status: 409 });
    assert.equal(stale.writes.length, 0);
});
