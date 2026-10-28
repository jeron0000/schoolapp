import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import mongoose from 'mongoose';
import paypal from '@paypal/checkout-server-sdk';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import userModel from '../models/userModel.js';
import { cancelReservedOrder } from '../utils/inventory.js';
import { getAllowedOrderStatuses } from '../utils/orderStatus.js';
import { createPayPalPaymentVerifier, paypalMinorUnits, PayPalVerificationClient } from '../utils/paypalPayment.js';
import { createPayPalWebhookRouter } from '../routes/paypalWebhookRoute.js';

const orderId = '0123456789abcdef01234567';
const userId = '1123456789abcdef01234567';
const otherOrderId = '2123456789abcdef01234567';
const paypalOrderId = 'SR3BORDER001';
const captureId = 'SR3BCAPTURE001';
const merchantId = 'SR3BMERCHANT';
const webhookId = 'SR3BWEBHOOK001';
const binding = () => ({ orderId: paypalOrderId, merchantId, environment: 'sandbox', currency: 'PHP', amountMinor: 46000 });
const fixtureOrder = overrides => ({ _id: orderId, userId, amount: 460, paymentCurrency: 'PHP', paymentMethod: 'Paypal',
    payment: false, status: 'Order Placed', inventoryStatus: 'reserved', requestId: 'sr3b-request-00001', date: 12345,
    address: { city: 'Synthetic campus' }, items: [{ _id: otherOrderId, size: 'M', price: 225, quantity: 2 }],
    paypalPayment: binding(), ...overrides });
const fixtureCapture = overrides => ({ id: captureId, status: 'COMPLETED', final_capture: true,
    amount: { currency_code: 'PHP', value: '460.00' }, payee: { merchant_id: merchantId }, custom_id: orderId,
    supplementary_data: { related_ids: { order_id: paypalOrderId } }, ...overrides });
const fixtureRemote = overrides => ({ id: paypalOrderId, intent: 'CAPTURE', status: 'COMPLETED', purchase_units: [{
    reference_id: orderId, custom_id: orderId, payee: { merchant_id: merchantId },
    amount: { currency_code: 'PHP', value: '460.00' }, payments: { captures: [fixtureCapture()] }
}], ...overrides });
const fixtureEvent = overrides => ({ id: 'WH-SR3B001', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource_type: 'capture', resource_version: '2.0', resource: fixtureCapture(), ...overrides });
const headers = () => ({ 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/SR3B',
    'paypal-transmission-id': 'SR3B-transmission', 'paypal-transmission-sig': 'SR3B-synthetic-signature',
    'paypal-transmission-time': '2026-10-14T00:00:00Z' });
const clone = value => value == null ? value : structuredClone(value);
const field = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
const matches = (object, filter) => Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === 'object') {
        if (Object.hasOwn(expected, '$exists')) return (field(object, key) !== undefined) === expected.$exists;
        if (Object.hasOwn(expected, '$ne')) return field(object, key) !== expected.$ne;
    }
    return field(object, key) === expected;
});
const apply = (object, changes) => {
    for (const [key, value] of Object.entries(changes)) {
        const parts = key.split('.');
        const last = parts.pop();
        let target = object;
        for (const part of parts) target = target[part] ||= {};
        target[last] = clone(value);
    }
};
const harness = (t, orders = [fixtureOrder()], { cancellation = false } = {}) => {
    const stored = new Map(orders.map(order => [order._id, clone(order)]));
    const writes = [], indexCalls = [], providerCalls = [];
    const state = { remote: fixtureRemote(), capture: fixtureCapture(), signature: 'SUCCESS', beforeWrite: null, providerFailure: false };
    t.mock.method(orderModel, 'findOne', filter => {
        const value = clone([...stored.values()].find(order => matches(order, filter)) || null);
        return { session() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
    });
    t.mock.method(orderModel.collection, 'createIndex', async (keys, options) => {
        assert.equal(options.unique, true);
        indexCalls.push({ keys, options });
    });
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update, options) => {
        state.beforeWrite?.(filter, update);
        const order = [...stored.values()].find(value => matches(value, filter));
        if (!order) return null;
        const candidate = clone(order);
        apply(candidate, update.$set);
        if (update.$set.payment || update.$set.paypalPayment) {
            assert.ok(indexCalls.length >= 3, 'Replay indexes must exist before any binding/paid write');
            for (const identity of ['orderId', 'captureId', 'eventId']) {
                const id = candidate.paypalPayment?.[identity];
                if (typeof id !== 'string') continue;
                if ([...stored.values()].some(other => other._id !== candidate._id && other.paypalPayment?.merchantId === candidate.paypalPayment.merchantId
                    && other.paypalPayment?.environment === candidate.paypalPayment.environment && other.paypalPayment?.[identity] === id)) throw { code: 11000 };
            }
        }
        assert.equal(options.runValidators, true);
        stored.set(order._id, candidate);
        writes.push({ filter: clone(filter), changes: clone(update.$set) });
        return clone(candidate);
    });
    let restored = 0;
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }));
    for (const [model, methods] of [[productModel, ['findById', 'findOneAndUpdate']], [userModel, ['findByIdAndUpdate', 'updateOne']]]) {
        for (const method of methods) t.mock.method(model, method, () => assert.fail('Unexpected stock/cart write'));
    }
    t.mock.method(productModel, 'updateOne', async () => {
        if (!cancellation) assert.fail('Payment confirmation must not change stock');
        restored++;
        return { matchedCount: 1 };
    });
    t.mock.method(mongoose.connection, 'transaction', async callback => {
        if (!cancellation) assert.fail('Payment CAS must not invoke inventory transactions');
        return callback({ synthetic: true });
    });
    // Actual installed request classes, synthetic credentials, execute fully mocked before use.
    const client = new PayPalVerificationClient(new paypal.core.SandboxEnvironment('sr3b-synthetic-id', 'sr3b-synthetic-secret'));
    t.mock.method(client, 'execute', async request => {
        const body = Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString('utf8')) : request.body;
        providerCalls.push(clone({ path: request.path, verb: request.verb, body }));
        if (state.providerFailure) throw new Error('sr3b-synthetic-provider-secret');
        if (request.verb === 'GET' && request.path === '/v2/checkout/orders/' + paypalOrderId + '?') return { statusCode: 200, result: clone(state.remote) };
        if (request.verb === 'GET' && request.path === '/v2/payments/captures/' + captureId + '?') return { statusCode: 200, result: clone(state.capture) };
        if (request.verb === 'POST' && request.path === '/v1/notifications/verify-webhook-signature') {
            assert.equal(body.webhook_id, webhookId);
            assert.equal(request.headers['Content-Type'], 'application/json');
            return { statusCode: 200, result: { verification_status: state.signature } };
        }
        assert.fail('Unexpected provider request; creation/capture/refund must never run');
    });
    const verifier = createPayPalPaymentVerifier({ client, merchantId, environment: 'sandbox', currency: 'PHP', webhookId });
    return { stored, writes, indexCalls, providerCalls, state, client, verifier, restored: () => restored };
};
const expectCode = (promise, code) => assert.rejects(promise, error => error.code === code);
const webhook = (h, event = fixtureEvent(), overrides = {}) => h.verifier.processWebhook({ rawBody: Buffer.from(JSON.stringify(event)), headers: { ...headers(), ...overrides } });

test('PHP arithmetic rejects rounding, floating-point artifacts, unsafe values and unapproved contexts', t => {
    for (const [major, minor] of [[0, 0], [0.29, 29], [0.01, 1], [225.1, 22510], [460, 46000], [1e6, 100000000]]) assert.equal(paypalMinorUnits(major), minor);
    for (const amount of ['460', -1, Infinity, NaN, 0.001, 0.1 + 0.2, 1e-7, Number.MAX_SAFE_INTEGER]) assert.throws(() => paypalMinorUnits(amount));
    const h = harness(t);
    const options = { client: h.client, merchantId, environment: 'sandbox', currency: 'PHP' };
    for (const change of [{ currency: 'USD' }, { currency: undefined }, { environment: 'live' }, { environment: 'unknown' }, { merchantId: '' }, { client: {} }]) {
        assert.throws(() => createPayPalPaymentVerifier({ ...options, ...change }));
    }
});

test('optional schema never backfills old COD/online orders and scopes partial replay indexes', () => {
    for (const paymentMethod of ['COD', 'Stripe', 'Paypal']) {
        const old = new orderModel({ userId, items: [], amount: 10, address: {}, paymentMethod, date: 1 });
        assert.equal(old.paypalPayment, undefined);
    }
    for (const identity of ['orderId', 'captureId', 'eventId']) {
        const [keys, options] = orderModel.schema.indexes().find(([, options]) => options.name === 'paypal_' + identity + '_unique');
        assert.deepEqual(keys, { 'paypalPayment.merchantId': 1, 'paypalPayment.environment': 1, ['paypalPayment.' + identity]: 1 });
        assert.equal(options.unique, true);
        assert.deepEqual(options.partialFilterExpression, { ['paypalPayment.' + identity]: { $type: 'string' } });
    }
});

test('independent order lookup binds an approved order without claiming capture/paid settlement', async t => {
    const h = harness(t, [fixtureOrder({ paypalPayment: undefined })]);
    h.state.remote.status = 'APPROVED';
    delete h.state.remote.purchase_units[0].payments;
    assert.deepEqual(await h.verifier.bindOrder({ orderId, userId, paypalOrderId }), { bound: true, paypalOrderId });
    assert.deepEqual(h.stored.get(orderId).paypalPayment, binding());
    assert.equal(h.stored.get(orderId).payment, false);
    assert.equal(h.writes.length, 1);
    await h.verifier.bindOrder({ orderId, userId, paypalOrderId });
    assert.equal(h.writes.length, 1);
    await expectCode(h.verifier.bindOrder({ orderId, userId, paypalOrderId: 'OTHER' }), 'binding_conflict');
    await expectCode(h.verifier.confirmPayment({ orderId, userId, success: true }), 'not_settled');
    assert.equal(h.writes.length, 1);
});

test('binding refuses wrong identity, owner, merchant, amount, currency, intent and historical inference', async t => {
    const cases = [remote => { remote.id = 'OTHER'; }, remote => { remote.intent = 'AUTHORIZE'; }, remote => { remote.status = 'VOIDED'; },
        remote => { remote.purchase_units[0].reference_id = otherOrderId; }, remote => { remote.purchase_units[0].custom_id = otherOrderId; },
        remote => { remote.purchase_units[0].payee.merchant_id = 'OTHER'; }, remote => { remote.purchase_units[0].amount.value = '459.99'; },
        remote => { remote.purchase_units[0].amount.currency_code = 'USD'; }, remote => { remote.purchase_units.push(clone(remote.purchase_units[0])); },
        remote => { remote.purchase_units[0].payments.captures.push(fixtureCapture()); }, remote => { remote.purchase_units[0].payments.captures[0].id = ''; }];
    for (const [index, change] of cases.entries()) await t.test('provider mismatch ' + index, async t => {
        const h = harness(t, [fixtureOrder({ paypalPayment: undefined })]);
        change(h.state.remote);
        await assert.rejects(h.verifier.bindOrder({ orderId, userId, paypalOrderId }));
        assert.equal(h.writes.length, 0);
    });
    const h = harness(t, [fixtureOrder({ paypalPayment: undefined, requestId: undefined })]);
    await expectCode(h.verifier.bindOrder({ orderId, userId: otherOrderId, paypalOrderId }), 'order_not_found');
    await expectCode(h.verifier.bindOrder({ orderId, userId, paypalOrderId }), 'order_requires_review');
    assert.equal(h.providerCalls.length, 0);
});

test('completed full capture sets payment/evidence only, keeping approval, stock, cart and workflow intact', async t => {
    const initial = fixtureOrder({ confirmedBy: 'synthetic-staff', sentToCashierAt: 400, receiptNumber: 'synthetic-preserved' });
    const h = harness(t, [initial]);
    assert.deepEqual(await h.verifier.confirmPayment({ orderId, userId, success: false, captureId: 'UNTRUSTED' }), { paid: true, alreadyVerified: false });
    const paid = h.stored.get(orderId);
    const expected = clone(initial);
    expected.payment = true;
    expected.paidAt = paid.paidAt;
    Object.assign(expected.paypalPayment, { captureId, verifiedAt: paid.paidAt });
    assert.deepEqual(paid, expected);
    assert.deepEqual(getAllowedOrderStatuses(paid), ['Approved']);
    assert.deepEqual(h.providerCalls.map(call => call.verb), ['GET', 'GET']);
    assert.equal(h.restored(), 0);
});

test('client success/order/capture identifiers cannot bootstrap or bypass durable owner binding', async t => {
    const h = harness(t, [fixtureOrder({ paypalPayment: undefined })]);
    await expectCode(h.verifier.confirmPayment({ orderId, userId, success: true, paypalOrderId, captureId }), 'binding_mismatch');
    await expectCode(h.verifier.confirmPayment({ orderId, userId: otherOrderId, success: true }), 'order_not_found');
    assert.equal(h.providerCalls.length, 0);
    assert.equal(h.writes.length, 0);
});

test('order completion alone and mismatched/pending/failed/refunded/partial captures fail closed', async t => {
    const cases = [
        ['remote', { status: 'APPROVED' }], ['remote', { status: 'CREATED' }], ['remote', { id: 'OTHER' }], ['remote', { intent: 'AUTHORIZE' }],
        ['capture', { id: 'OTHER' }], ['capture', { supplementary_data: { related_ids: { order_id: 'OTHER' } } }],
        ['capture', { supplementary_data: { related_ids: { order_id: paypalOrderId, authorization_id: 'OTHER' } } }],
        ['capture', { payee: { merchant_id: 'OTHER' } }], ['capture', { payee: undefined }], ['capture', { custom_id: otherOrderId }],
        ['capture', { amount: { currency_code: 'USD', value: '460.00' } }], ['capture', { amount: { currency_code: 'PHP', value: '460.01' } }],
        ['capture', { amount: { currency_code: 'PHP', value: '460.001' } }], ['capture', { amount: { currency_code: 'PHP', value: 460 } }],
        ['capture', { final_capture: false }], ['capture', { status: 'PENDING' }], ['capture', { status: 'DECLINED' }],
        ['capture', { status: 'FAILED' }], ['capture', { status: 'REFUNDED' }], ['capture', { status: 'PARTIALLY_REFUNDED' }],
        ['capture', { seller_receivable_breakdown: { exchange_rate: {} } }]
    ];
    for (const [index, [resource, changes]] of cases.entries()) await t.test('settlement mismatch ' + index, async t => {
        const h = harness(t);
        Object.assign(h.state[resource], changes);
        await assert.rejects(h.verifier.confirmPayment({ orderId, userId, success: true }));
        assert.equal(h.writes.length, 0);
    });
    for (const change of [unit => { unit.payments.captures = []; }, unit => { unit.payments.captures.push(fixtureCapture()); },
        unit => { unit.payments.captures[0].status = 'PENDING'; }, unit => { unit.payments.captures[0].final_capture = false; },
        unit => { unit.payments.refunds = [{ id: 'OTHER' }]; }, unit => { unit.payee.merchant_id = 'OTHER'; },
        unit => { unit.amount.currency_code = 'USD'; }, unit => { unit.payment_instruction = {}; }]) await t.test('ambiguous/unsupported order capture', async t => {
        const h = harness(t);
        change(h.state.remote.purchase_units[0]);
        await assert.rejects(h.verifier.confirmPayment({ orderId, userId }));
        assert.equal(h.writes.length, 0);
    });
});

test('local currency, binding, precision and unsafe workflow records cannot be silently repaired', async t => {
    for (const changes of [{ paymentCurrency: undefined }, { paymentCurrency: 'USD' }, { amount: 460.001 }, { amount: 0.1 + 0.2 },
        { amount: 459 }, { items: [] }, { items: [{ price: 460.001, quantity: 1 }] }, { items: [{ price: 1, quantity: 0 }] },
        { paymentMethod: 'COD' }, { payment: true }, { paidAt: 1 }, { status: 'Cancelled', inventoryStatus: 'released' },
        { status: 'Claimed' }, { status: 'Ready To Claim' }, { inventoryStatus: undefined },
        { paypalPayment: { ...binding(), environment: 'live' } }, { paypalPayment: { ...binding(), merchantId: 'OTHER' } },
        { paypalPayment: { ...binding(), captureId: 'OTHER' } }, { paypalPayment: { ...binding(), amountMinor: 45999 } }]) await t.test(JSON.stringify(changes), async t => {
        const h = harness(t, [fixtureOrder(changes)]);
        await assert.rejects(h.verifier.confirmPayment({ orderId, userId }));
        assert.equal(h.writes.length, 0);
    });
});

test('API host and environment are explicit, fail closed if the client changes, and accept no arbitrary URLs', async t => {
    const h = harness(t);
    h.client.environment.baseUrl = 'https://api.paypal.com';
    await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'environment_mismatch');
    for (const baseUrl of ['https://attacker.example', 'http://api.sandbox.paypal.com', 'https://api.sandbox.paypal.com.attacker.example']) {
        h.client.environment.baseUrl = baseUrl;
        assert.throws(() => createPayPalPaymentVerifier({ client: h.client, merchantId, environment: 'sandbox', currency: 'PHP' }));
    }
    assert.equal(h.providerCalls.length, 0);
    assert.equal(h.writes.length, 0);
});

test('concurrent confirmations and retries preserve one payment effect and the original verification timestamp', async t => {
    const h = harness(t);
    const results = await Promise.all(Array.from({ length: 8 }, () => h.verifier.confirmPayment({ orderId, userId })));
    assert.ok(results.every(result => result.paid));
    assert.equal(results.filter(result => !result.alreadyVerified).length, 1);
    const first = clone(h.stored.get(orderId));
    assert.deepEqual(await h.verifier.confirmPayment({ orderId, userId }), { paid: true, alreadyVerified: true });
    assert.deepEqual(h.stored.get(orderId), first);
    assert.equal(h.writes.length, 1);
});

test('unique provider order/capture/event identities prevent replay and unavailable indexes block all writes', async t => {
    for (const identity of ['orderId', 'captureId', 'eventId']) await t.test(identity, async t => {
        const conflicting = fixtureOrder({ _id: otherOrderId, paypalPayment: { ...binding(), orderId: 'OTHER', captureId: 'OTHER', eventId: 'WH-OTHER' } });
        let conflictingIdentity = paypalOrderId;
        if (identity === 'eventId') conflictingIdentity = 'WH-SR3B001';
        else if (identity === 'captureId') conflictingIdentity = captureId;
        conflicting.paypalPayment[identity] = conflictingIdentity;
        const h = harness(t, [fixtureOrder({ paypalPayment: identity === 'orderId' ? undefined : binding() }), conflicting]);
        const attempt = identity === 'orderId' ? h.verifier.bindOrder({ orderId, userId, paypalOrderId }) : webhook(h);
        await expectCode(attempt, 'provider_replay');
        assert.equal(h.stored.get(orderId).payment, false);
        assert.equal(h.writes.length, 0);
    });
    const h = harness(t);
    t.mock.method(orderModel.collection, 'createIndex', async () => { throw new Error('Synthetic index unavailable'); });
    await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'verification_unavailable');
    assert.equal(h.writes.length, 0);
});

test('cancellation, amount, status and binding races cannot overwrite another transition', async t => {
    for (const changes of [{ status: 'Cancelled', inventoryStatus: 'released' }, { status: 'Approved' }, { amount: 461 },
        { paypalPayment: { ...binding(), orderId: 'OTHER' } }]) await t.test(JSON.stringify(changes), async t => {
        const h = harness(t);
        h.state.beforeWrite = () => Object.assign(h.stored.get(orderId), changes);
        await assert.rejects(h.verifier.confirmPayment({ orderId, userId }));
        assert.equal(h.writes.length, 0);
        assert.equal(h.stored.get(orderId).payment, false);
        assert.equal(h.restored(), 0);
    });
});

test('paid online orders require exceptional Admin cancellation with evidence and once-only stock restoration', async t => {
    const h = harness(t, [fixtureOrder()], { cancellation: true });
    await h.verifier.confirmPayment({ orderId, userId });
    const evidence = clone(h.stored.get(orderId).paypalPayment);
    const paidAt = h.stored.get(orderId).paidAt;
    await assert.rejects(cancelReservedOrder(orderId, { userId, source: 'customer' }), { code: 'ONLINE_CANCELLATION_RESTRICTED' });
    const options = { source: 'admin', exceptionReason: 'The merchant cannot fulfill this order.', expectedStatus: 'Order Placed', expectedPayment: true };
    await cancelReservedOrder(orderId, options);
    await cancelReservedOrder(orderId, options);
    assert.equal(h.stored.get(orderId).status, 'Cancelled');
    assert.equal(h.stored.get(orderId).inventoryStatus, 'released');
    assert.equal(h.stored.get(orderId).payment, true);
    assert.equal(h.stored.get(orderId).refund.status, 'Refund Required');
    assert.equal(h.stored.get(orderId).paidAt, paidAt);
    assert.deepEqual(h.stored.get(orderId).paypalPayment, evidence);
    await h.verifier.confirmPayment({ orderId, userId });
    assert.equal(h.restored(), 1);
});

test('provider outages, malformed/retry responses and lost database responses fail safely without losing evidence', async t => {
    for (const result of [{ statusCode: 202, result: fixtureCapture() }, { statusCode: 200 }, { statusCode: 500, result: fixtureCapture() }]) await t.test('ambiguous provider response', async t => {
        const h = harness(t);
        t.mock.method(h.client, 'execute', async () => result);
        await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'provider_unavailable');
        assert.equal(h.writes.length, 0);
    });
    const h = harness(t);
    h.state.providerFailure = true;
    await assert.rejects(h.verifier.confirmPayment({ orderId, userId }), error => error.status === 503 && !error.message.includes('secret'));
    assert.equal(h.writes.length, 0);
    h.state.providerFailure = false;
    const update = orderModel.findOneAndUpdate;
    t.mock.method(orderModel, 'findOneAndUpdate', async (...args) => { await update(...args); throw new Error('Synthetic lost response'); });
    await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'verification_unavailable');
    const first = clone(h.stored.get(orderId));
    assert.equal(first.payment, true);
    assert.deepEqual(await h.verifier.confirmPayment({ orderId, userId }), { paid: true, alreadyVerified: true });
    assert.deepEqual(h.stored.get(orderId), first);
    assert.equal(h.writes.length, 1);
});

const webhookServer = async (t, h, { parsedFirst = false } = {}) => {
    const app = express();
    if (parsedFirst) app.use(express.json());
    app.use('/paypal-test', createPayPalWebhookRouter({ verifier: h.verifier }));
    app.use(express.json());
    app.post('/json-test', (req, res) => res.json(req.body));
    const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = 'http://127.0.0.1:' + server.address().port;
    return { base, send: async (event = fixtureEvent(), { payload = JSON.stringify(event), headerChanges = {} } = {}) => {
        const res = await fetch(base + '/paypal-test', { method: 'POST', headers: { 'content-type': 'application/json', ...headers(), ...headerChanges }, body: payload });
        return { status: res.status, body: await res.json() };
    } };
};

test('provider signature SUCCESS is required before any local lookup, including direct service invocation', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h);
    const lookup = t.mock.method(orderModel, 'findOne', () => assert.fail('Unauthenticated event must not query orders'));
    for (const signature of ['FAILURE', undefined, 'success']) {
        h.state.signature = signature;
        assert.equal((await server.send()).status, 400);
    }
    h.state.signature = 'SUCCESS';
    for (const headerChanges of [{ 'paypal-auth-algo': '' }, { 'paypal-cert-url': 'https://attacker.example/cert' },
        { 'paypal-transmission-time': 'invalid' }, { 'paypal-transmission-sig': '' }]) {
        assert.equal((await server.send(undefined, { headerChanges })).status, 400);
    }
    assert.equal((await server.send(undefined, { payload: 'not-json' })).status, 400);
    assert.equal((await server.send(undefined, { payload: 'x'.repeat(256 * 1024 + 1) })).status, 413);
    await expectCode(webhook(h, fixtureEvent(), { 'paypal-transmission-sig': undefined }), 'invalid_signature');
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(h.writes.length, 0);
    assert.equal(h.providerCalls.length, 3);
});

test('SDK postback preserves raw event bytes, whitespace and escapes without affecting normal JSON/OAuth encoding', async t => {
    const h = harness(t);
    const raw = '  ' + JSON.stringify(fixtureEvent(), null, 2).replace('COMPLETED', '\\u0043OMPLETED') + '\n';
    const execute = h.client.execute;
    t.mock.method(h.client, 'execute', async request => {
        if (request.path === '/v1/notifications/verify-webhook-signature') {
            const encoded = h.client.encoder.serializeRequest({ ...request, headers: { 'content-type': 'application/json' } });
            assert.ok(Buffer.isBuffer(encoded));
            const prefix = encoded.indexOf(Buffer.from(',"webhook_event":')) + ',"webhook_event":'.length;
            assert.deepEqual(encoded.subarray(prefix, -1), Buffer.from(raw));
            assert.equal(JSON.parse(encoded.toString()).webhook_event.id, fixtureEvent().id);
        }
        return execute(request);
    });
    const server = await webhookServer(t, h);
    assert.equal((await server.send(undefined, { payload: raw })).status, 200);
    assert.equal(h.client.encoder.serializeRequest({ path: '/ordinary', headers: { 'content-type': 'application/json' }, body: { normal: true } }), '{"normal":true}');
    assert.equal(h.client.encoder.serializeRequest({ path: '/v1/oauth2/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: { grant_type: 'client_credentials' } }), 'grant_type=client_credentials');
    assert.deepEqual(h.client.encoder.deserializeResponse('{"verification_status":"SUCCESS"}', { 'content-type': 'application/json' }), { verification_status: 'SUCCESS' });
    await expectCode(h.verifier.processWebhook({ rawBody: Buffer.from([0xff]), headers: headers() }), 'invalid_event');
    await expectCode(h.verifier.processWebhook({ rawBody: {}, headers: headers() }), 'invalid_event');
});

test('authenticated duplicate/out-of-order notifications use fresh provider state and never reverse paid evidence', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h);
    h.state.capture.status = 'PENDING';
    assert.equal((await server.send()).status, 409);
    assert.equal(h.writes.length, 0);
    h.state.capture.status = 'COMPLETED';
    const results = await Promise.all([server.send(), server.send(), server.send()]);
    assert.ok(results.every(result => result.status === 200 && result.body.paid));
    assert.equal(h.writes.length, 1);
    const first = clone(h.stored.get(orderId));
    assert.equal(first.paypalPayment.eventId, 'WH-SR3B001');
    assert.equal((await server.send(fixtureEvent({ id: 'WH-SR3B002' }))).body.alreadyVerified, true);
    assert.equal((await server.send(fixtureEvent({ event_type: 'PAYMENT.CAPTURE.REFUNDED' }))).status, 400);
    assert.deepEqual(h.stored.get(orderId), first);
    assert.deepEqual(h.providerCalls[0].body, { webhook_id: webhookId, webhook_event: fixtureEvent(),
        auth_algo: headers()['paypal-auth-algo'], cert_url: headers()['paypal-cert-url'], transmission_id: headers()['paypal-transmission-id'],
        transmission_sig: headers()['paypal-transmission-sig'], transmission_time: headers()['paypal-transmission-time'] });
});

test('signed unsupported, wrong capture/merchant/currency and unbound notifications cannot bootstrap/settle orders', async t => {
    for (const event of [fixtureEvent({ event_type: 'CHECKOUT.ORDER.APPROVED' }), fixtureEvent({ resource_version: '1.0' }),
        fixtureEvent({ id: 'invalid' }), fixtureEvent({ resource: fixtureCapture({ id: 'OTHER' }) }),
        fixtureEvent({ resource: fixtureCapture({ supplementary_data: { related_ids: { order_id: 'OTHER' } } }) }),
        fixtureEvent({ resource: fixtureCapture({ payee: { merchant_id: 'OTHER' } }) }),
        fixtureEvent({ resource: fixtureCapture({ amount: { currency_code: 'USD', value: '460.00' } }) }),
        fixtureEvent({ resource: fixtureCapture({ status: 'PENDING' }) })]) await t.test(event.id, async t => {
        const h = harness(t);
        await assert.rejects(webhook(h, event));
        assert.equal(h.writes.length, 0);
    });
});

test('JSON middleware ordering fails closed, unrelated JSON handling works, production services remain unmounted', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h, { parsedFirst: true });
    assert.equal((await server.send()).status, 400);
    assert.equal(h.providerCalls.length, 0);
    const json = await fetch(server.base + '/json-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"preserved":true}' });
    assert.deepEqual(await json.json(), { preserved: true });
    const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /paypalWebhookRoute|createPayPalPaymentVerifier|paypalPayment|stripeWebhookRoute/);
});
