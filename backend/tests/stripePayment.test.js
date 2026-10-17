import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import userModel from '../models/userModel.js';
import { cancelReservedOrder } from '../utils/inventory.js';
import { getAllowedOrderStatuses } from '../utils/orderStatus.js';
import { createStripePaymentVerifier, stripeMinorUnits } from '../utils/stripePayment.js';
import { createStripeWebhookRouter } from '../routes/stripeWebhookRoute.js';

const orderId = '0123456789abcdef01234567';
const userId = '1123456789abcdef01234567';
const otherOrderId = '2123456789abcdef01234567';
const accountId = 'acct_SR3ATEST';
const sessionId = 'cs_test_SR3AA';
const intentId = 'pi_SR3AA';
const chargeId = 'ch_SR3AA';
const secret = 'whsec_sr3a_synthetic_only';
const binding = () => ({ sessionId, paymentIntentId: intentId, accountId, livemode: false, currency: 'php', amountMinor: 46000 });
const fixtureOrder = overrides => ({ _id: orderId, userId, amount: 460, paymentCurrency: 'PHP', paymentMethod: 'Stripe',
    payment: false, status: 'Order Placed', inventoryStatus: 'reserved', requestId: 'sr3a-request-00001', date: 12345,
    address: { city: 'Synthetic campus' }, items: [{ _id: otherOrderId, size: 'M', price: 225, quantity: 2 }],
    stripePayment: binding(), ...overrides });
const fixtureSession = overrides => ({ object: 'checkout.session', id: sessionId, livemode: false, currency: 'php', amount_total: 46000,
    mode: 'payment', status: 'complete', payment_status: 'paid', payment_intent: intentId, payment_method_types: ['card'],
    client_reference_id: orderId, metadata: { orderId, userId }, ...overrides });
const fixtureCharge = overrides => ({ object: 'charge', id: chargeId, payment_intent: intentId, amount: 46000, amount_captured: 46000,
    currency: 'php', livemode: false, status: 'succeeded', paid: true, captured: true, refunded: false, amount_refunded: 0,
    disputed: false, payment_method_details: { type: 'card' }, ...overrides });
const fixtureIntent = overrides => ({ object: 'payment_intent', id: intentId, status: 'succeeded', amount: 46000, amount_received: 46000,
    currency: 'php', livemode: false, metadata: { orderId, userId }, latest_charge: fixtureCharge(), ...overrides });
const fixtureEvent = overrides => ({ object: 'event', id: 'evt_SR3AA', type: 'checkout.session.completed', livemode: false,
    created: Math.floor(Date.now() / 1000), data: { object: { object: 'checkout.session', id: sessionId } }, ...overrides });
const clone = value => value == null ? value : structuredClone(value);
const field = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
const matches = (object, filter) => Object.entries(filter).every(([key, expected]) =>
    expected && typeof expected === 'object' && Object.hasOwn(expected, '$exists')
        ? (field(object, key) !== undefined) === expected.$exists : field(object, key) === expected);
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
    const state = { session: fixtureSession(), intent: fixtureIntent(), account: { object: 'account', id: accountId }, beforeWrite: null };
    const query = filter => {
        const value = clone([...stored.values()].find(order => matches(order, filter)) || null);
        return { session() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
    };
    t.mock.method(orderModel, 'findOne', query);
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
        if (update.$set.payment || update.$set.stripePayment) {
            assert.ok(indexCalls.length >= 3, 'Replay indexes must exist before payment/binding mutation');
            for (const identity of ['sessionId', 'paymentIntentId', 'eventId']) {
                const id = candidate.stripePayment?.[identity];
                if (typeof id !== 'string') continue;
                if ([...stored.values()].some(other => other._id !== candidate._id && other.stripePayment?.accountId === candidate.stripePayment.accountId
                    && other.stripePayment?.livemode === candidate.stripePayment.livemode && other.stripePayment?.[identity] === id)) throw { code: 11000 };
            }
        }
        assert.equal(options.runValidators, true);
        stored.set(order._id, candidate);
        writes.push({ filter: clone(filter), changes: clone(update.$set) });
        return clone(candidate);
    });
    let restored = 0;
    for (const [model, methods] of [[productModel, ['findById', 'findOneAndUpdate']], [userModel, ['findByIdAndUpdate', 'updateOne']]]) {
        for (const method of methods) t.mock.method(model, method, () => assert.fail('Unexpected stock/cart operation'));
    }
    t.mock.method(productModel, 'updateOne', async () => {
        if (!cancellation) assert.fail('Payment confirmation must never change stock');
        restored++;
        return { matchedCount: 1 };
    });
    t.mock.method(mongoose.connection, 'transaction', async callback => {
        if (!cancellation) assert.fail('Single-order payment CAS must not invoke inventory transactions');
        return callback({ synthetic: true });
    });
    const stripe = new Stripe('sk_test_sr3a_fixture_only', { maxNetworkRetries: 0 });
    t.mock.method(stripe.accounts, 'retrieve', async (...args) => { assert.equal(args.length, 0); providerCalls.push('account'); return clone(state.account); });
    t.mock.method(stripe.checkout.sessions, 'retrieve', async id => { providerCalls.push('session'); assert.equal(id, state.session.id); return clone(state.session); });
    t.mock.method(stripe.paymentIntents, 'retrieve', async (id, params) => {
        providerCalls.push('intent'); assert.equal(id, state.intent.id); assert.deepEqual(params, { expand: ['latest_charge'] }); return clone(state.intent);
    });
    t.mock.method(stripe.checkout.sessions, 'create', () => assert.fail('No real/new checkout is authorized'));
    t.mock.method(stripe.paymentIntents, 'create', () => assert.fail('No real/new payment is authorized'));
    const verifier = createStripePaymentVerifier({ stripe, accountId, livemode: false, currency: 'php' });
    return { stored, writes, indexCalls, providerCalls, state, stripe, verifier, restored: () => restored };
};
const expectCode = (promise, code) => assert.rejects(promise, error => error.code === code);

test('minor-unit conversion is exact, never rounds unsupported precision and rejects unsafe values', () => {
    for (const [major, minor] of [[0, 0], [0.29, 29], [0.01, 1], [225.1, 22510], [460, 46000], [1e6, 100000000]]) {
        assert.equal(stripeMinorUnits(major), minor);
    }
    for (const invalid of ['460', -1, Infinity, NaN, 0.001, 0.1 + 0.2, 1e-7, Number.MAX_SAFE_INTEGER]) assert.throws(() => stripeMinorUnits(invalid));
    for (const options of [{}, { accountId, livemode: false, currency: 'usd' }, { accountId, livemode: 'false', currency: 'php' }]) {
        assert.throws(() => createStripePaymentVerifier(options));
    }
});

test('optional schema leaves historical orders untouched and defines partial unique provider identities', () => {
    const legacy = new orderModel({ userId, items: [], amount: 10, address: {}, status: 'Order Placed', paymentMethod: 'COD', date: 1 });
    assert.equal(legacy.stripePayment, undefined);
    const indexes = orderModel.schema.indexes();
    for (const identity of ['sessionId', 'paymentIntentId', 'eventId']) {
        const entry = indexes.find(([, options]) => options.name === 'stripe_' + identity + '_unique');
        assert.equal(entry[1].unique, true);
        assert.deepEqual(entry[1].partialFilterExpression, { ['stripePayment.' + identity]: { $type: 'string' } });
    }
});

test('binding independently retrieves the session and freezes canonical account/environment/amount/ownership', async t => {
    const h = harness(t, [fixtureOrder({ stripePayment: undefined })]);
    h.state.session = fixtureSession({ status: 'open', payment_status: 'unpaid', payment_intent: null });
    assert.deepEqual(await h.verifier.bindSession({ orderId, userId, sessionId }), { bound: true, sessionId });
    assert.deepEqual(h.stored.get(orderId).stripePayment, { sessionId, accountId, livemode: false, currency: 'php', amountMinor: 46000 });
    assert.equal(h.writes.length, 1);
    assert.equal(h.stored.get(orderId).payment, false);
    assert.equal(h.stored.get(orderId).inventoryStatus, 'reserved');
    assert.deepEqual(await h.verifier.bindSession({ orderId, userId, sessionId }), { bound: true, sessionId });
    await expectCode(h.verifier.bindSession({ orderId, userId, sessionId: 'cs_test_OTHER' }), 'binding_conflict');
    assert.equal(h.writes.length, 1);
});

test('binding rejects mismatched owner/metadata/amount/environment and cannot infer historical identities', async t => {
    for (const overrides of [{ metadata: {} }, { client_reference_id: otherOrderId }, { amount_total: 45999 }, { currency: 'usd' }, { livemode: true }, { status: 'expired' }]) {
        await t.test(JSON.stringify(overrides), async t => {
            const h = harness(t, [fixtureOrder({ stripePayment: undefined })]);
            h.state.session = fixtureSession(overrides);
            await assert.rejects(h.verifier.bindSession({ orderId, userId, sessionId }));
            assert.equal(h.writes.length, 0);
        });
    }
    const h = harness(t, [fixtureOrder({ stripePayment: undefined, requestId: undefined })]);
    await expectCode(h.verifier.bindSession({ orderId, userId: otherOrderId, sessionId }), 'order_not_found');
    await expectCode(h.verifier.bindSession({ orderId, userId, sessionId }), 'order_requires_review');
    assert.equal(h.providerCalls.length, 0);
});

test('valid captured settlement changes only payment/evidence, preserving approval and every business field', async t => {
    const initial = fixtureOrder({ sentToCashierAt: 400, receiptNumber: 'synthetic-preserved', confirmedBy: 'synthetic-staff' });
    const h = harness(t, [initial]);
    assert.deepEqual(await h.verifier.confirmPayment({ orderId, userId, success: 'false' }), { paid: true, alreadyVerified: false });
    const paid = h.stored.get(orderId);
    const expected = clone(initial);
    expected.payment = true;
    expected.paidAt = paid.paidAt;
    Object.assign(expected.stripePayment, { chargeId, verifiedAt: paid.paidAt });
    assert.deepEqual(paid, expected);
    assert.deepEqual(getAllowedOrderStatuses(paid), ['Approved', 'Cancelled']);
    assert.equal(h.restored(), 0);
    assert.equal(h.writes.length, 1);
});

test('browser flags or customer identifiers cannot establish payment evidence or bypass owner binding', async t => {
    const h = harness(t, [fixtureOrder({ stripePayment: undefined })]);
    await expectCode(h.verifier.confirmPayment({ orderId, userId, success: true, paymentIntentId: intentId, sessionId }), 'binding_mismatch');
    await expectCode(h.verifier.confirmPayment({ orderId, userId: otherOrderId, success: 'true' }), 'order_not_found');
    assert.equal(h.writes.length, 0);
    assert.equal(h.providerCalls.length, 0);
});

test('session completion alone, wrong transaction identity, amount, currency and lifecycle cannot settle', async t => {
    const cases = [
        ['session', { id: 'cs_test_OTHER' }], ['session', { payment_intent: 'pi_OTHER' }],
        ['session', { amount_total: 46001 }], ['session', { currency: 'usd' }], ['session', { livemode: true }],
        ['session', { status: 'open' }], ['session', { status: 'expired' }], ['session', { payment_status: 'unpaid' }],
        ['session', { payment_status: 'no_payment_required' }], ['session', { metadata: { orderId: otherOrderId, userId } }],
        ['intent', { amount: 45999 }], ['intent', { amount_received: 45999 }], ['intent', { currency: 'usd' }],
        ['intent', { livemode: true }], ['intent', { metadata: { orderId, userId: otherOrderId } }],
        ['intent', { status: 'processing' }], ['intent', { status: 'requires_capture' }], ['intent', { status: 'canceled' }],
        ['intent', { on_behalf_of: 'acct_OTHER' }], ['intent', { application: 'ca_OTHER' }],
        ['charge', { payment_intent: 'pi_OTHER' }], ['charge', { captured: false }], ['charge', { amount_captured: 45999 }],
        ['charge', { refunded: true }], ['charge', { amount_refunded: 1 }], ['charge', { disputed: true }],
        ['charge', { payment_method_details: { type: 'us_bank_account' } }], ['account', { id: 'acct_OTHER' }]
    ];
    for (const [part, overrides] of cases) await t.test(part + JSON.stringify(overrides), async t => {
        const h = harness(t);
        if (part === 'charge') h.state.intent.latest_charge = fixtureCharge(overrides);
        else Object.assign(h.state[part], overrides);
        // Let the fake return the deliberately mismatched ID, as a hostile/unverifiable provider result.
        if (part === 'session' && overrides.id) t.mock.method(h.stripe.checkout.sessions, 'retrieve', async () => clone(h.state.session));
        await assert.rejects(h.verifier.confirmPayment({ orderId, userId }));
        assert.equal(h.writes.length, 0);
        assert.equal(h.stored.get(orderId).payment, false);
    });
});

test('unbound, already-paid-unverified, cancelled, released, wrong-method and ambiguous-precision orders require review', async t => {
    for (const overrides of [{ stripePayment: undefined }, { payment: true }, { status: 'Cancelled', inventoryStatus: 'released' },
        { inventoryStatus: 'released' }, { paymentMethod: 'COD' }, { status: 'Claimed' }, { status: 'Ready To Claim' },
        { amount: 460.001 }, { paymentCurrency: undefined }, { paidAt: 123 }, { items: [{ price: 225.001, quantity: 2 }] }]) {
        await t.test(JSON.stringify(overrides), async t => {
            const h = harness(t, [fixtureOrder(overrides)]);
            const before = clone(h.stored.get(orderId));
            await assert.rejects(h.verifier.confirmPayment({ orderId, userId }));
            assert.deepEqual(h.stored.get(orderId), before);
            assert.equal(h.providerCalls.length, 0);
        });
    }
});

test('write-once intent adoption comes only from a bound authoritative session, not caller data', async t => {
    const b = binding(); delete b.paymentIntentId;
    const h = harness(t, [fixtureOrder({ stripePayment: b })]);
    await h.verifier.confirmPayment({ orderId, userId, paymentIntentId: 'pi_FORGED' });
    assert.equal(h.stored.get(orderId).stripePayment.paymentIntentId, intentId);
    assert.deepEqual(h.writes[0].filter['stripePayment.paymentIntentId'], { $exists: false });
});

test('duplicate and concurrent confirmation produce exactly one atomic transition and stable timestamps', async t => {
    const h = harness(t);
    const results = await Promise.all(Array.from({ length: 8 }, () => h.verifier.confirmPayment({ orderId, userId })));
    assert.equal(results.filter(result => !result.alreadyVerified).length, 1);
    assert.equal(h.writes.length, 1);
    const first = clone(h.stored.get(orderId));
    await h.verifier.confirmPayment({ orderId, userId });
    assert.deepEqual(h.stored.get(orderId), first);
});

test('unique session, intent and event indexes fail closed against cross-order replay or unavailable protection', async t => {
    for (const identity of ['sessionId', 'paymentIntentId', 'eventId']) await t.test(identity, async t => {
        const conflicting = fixtureOrder({ _id: otherOrderId, stripePayment: { ...binding(), sessionId: 'cs_test_OTHER', paymentIntentId: 'pi_OTHER', eventId: 'evt_OTHER' } });
        conflicting.stripePayment[identity] = identity === 'eventId' ? 'evt_SR3AA' : binding()[identity];
        const h = harness(t, [fixtureOrder({ stripePayment: identity === 'sessionId' ? undefined : binding() }), conflicting]);
        const attempt = identity === 'sessionId' ? h.verifier.bindSession({ orderId, userId, sessionId }) : h.verifier.processEvent(fixtureEvent());
        await expectCode(attempt, 'provider_replay');
        assert.equal(h.stored.get(orderId).payment, false);
        assert.equal(h.writes.length, 0);
    });
    const h = harness(t);
    t.mock.method(orderModel.collection, 'createIndex', async () => { throw new Error('Synthetic index failure'); });
    await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'verification_unavailable');
    assert.equal(h.writes.length, 0);
});

test('cancellation/status races cannot overwrite workflow or released stock', async t => {
    for (const changes of [{ status: 'Cancelled', inventoryStatus: 'released' }, { status: 'Approved' }, { amount: 461 }]) await t.test(JSON.stringify(changes), async t => {
        const h = harness(t);
        h.state.beforeWrite = () => Object.assign(h.stored.get(orderId), changes);
        await expectCode(h.verifier.confirmPayment({ orderId, userId }), changes.amount ? 'binding_mismatch' : 'order_changed');
        assert.equal(h.writes.length, 0);
        assert.equal(h.stored.get(orderId).payment, false);
        assert.equal(h.restored(), 0);
    });
});

test('payment-first preserves existing paid pre-approval cancellation and once-only restoration', async t => {
    const h = harness(t, [fixtureOrder()], { cancellation: true });
    await h.verifier.confirmPayment({ orderId, userId });
    const evidence = clone(h.stored.get(orderId).stripePayment);
    const timestamp = h.stored.get(orderId).paidAt;
    await cancelReservedOrder(orderId, { userId, source: 'customer' });
    await cancelReservedOrder(orderId, { userId, source: 'customer' });
    const cancelled = h.stored.get(orderId);
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(cancelled.inventoryStatus, 'released');
    assert.equal(cancelled.payment, true);
    assert.equal(cancelled.refund.status, 'Refund Required');
    assert.equal(cancelled.paidAt, timestamp);
    assert.deepEqual(cancelled.stripePayment, evidence);
    assert.equal(h.restored(), 1);
    await h.verifier.confirmPayment({ orderId, userId });
    assert.equal(h.restored(), 1);
});

test('provider/database failures remain retryable, without partial paid evidence or secret errors', async t => {
    const h = harness(t);
    t.mock.method(h.stripe.paymentIntents, 'retrieve', async () => { throw new Error('synthetic-provider-secret-do-not-expose'); });
    await assert.rejects(h.verifier.confirmPayment({ orderId, userId }), error => error.status === 503 && !error.message.includes('secret'));
    assert.equal(h.writes.length, 0);
    t.mock.method(h.stripe.paymentIntents, 'retrieve', async () => clone(h.state.intent));
    await h.verifier.confirmPayment({ orderId, userId });
    assert.equal(h.writes.length, 1);
    await t.test('database failure before the atomic update leaves no payment evidence', async t => {
        const h = harness(t);
        const initial = clone(h.stored.get(orderId));
        t.mock.method(orderModel, 'findOneAndUpdate', async () => { throw new Error('Synthetic DB unavailable'); });
        await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'verification_unavailable');
        assert.deepEqual(h.stored.get(orderId), initial);
    });
    await t.test('lost response after an atomic commit retries against the durable evidence', async t => {
        const h = harness(t);
        const update = orderModel.findOneAndUpdate;
        t.mock.method(orderModel, 'findOneAndUpdate', async (...args) => {
            await update(...args);
            throw new Error('Synthetic lost update response');
        });
        await expectCode(h.verifier.confirmPayment({ orderId, userId }), 'verification_unavailable');
        const committed = clone(h.stored.get(orderId));
        assert.equal(committed.payment, true);
        assert.equal(committed.paidAt, committed.stripePayment.verifiedAt);
        assert.deepEqual(await h.verifier.confirmPayment({ orderId, userId }), { paid: true, alreadyVerified: true });
        assert.deepEqual(h.stored.get(orderId), committed);
        assert.equal(h.writes.length, 1);
    });
});

const webhookServer = async (t, h, { parsedFirst = false } = {}) => {
    const app = express();
    if (parsedFirst) app.use(express.json());
    app.use('/stripe-test', createStripeWebhookRouter({ stripe: h.stripe, webhookSecret: secret, verifier: h.verifier }));
    app.use(express.json());
    app.post('/json-test', (req, res) => res.json(req.body));
    const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = 'http://127.0.0.1:' + server.address().port;
    return { base, send: async (event, { payload = JSON.stringify(event), signature, signingSecret = secret, timestamp } = {}) => {
        const header = signature ?? h.stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret, ...(timestamp ? { timestamp } : {}) });
        const res = await fetch(base + '/stripe-test', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
        return { status: res.status, body: await res.json() };
    } };
};

test('real SDK signature verification preserves raw bytes and rejects tampering/stale secrets before lookup', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h);
    const lookup = t.mock.method(orderModel, 'findOne', () => assert.fail('Invalid signature must not query orders'));
    const raw = JSON.stringify(fixtureEvent());
    const originalSignature = h.stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
    for (const options of [{ signature: 'invalid' }, { signature: originalSignature, payload: raw + ' ' }, { payload: 'not-json' },
        { signingSecret: 'whsec_wrong_synthetic' }, { timestamp: Math.floor(Date.now() / 1000) - 301 }]) {
        assert.equal((await server.send(fixtureEvent(), options)).status, 400);
    }
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(h.providerCalls.length, 0);
    const missingSignature = await fetch(server.base + '/stripe-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw });
    assert.equal(missingSignature.status, 400);
    const json = await fetch(server.base + '/json-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"preserved":true}' });
    assert.deepEqual(await json.json(), { preserved: true });
});

test('signed duplicate/out-of-order notifications verify current provider state and never reverse payment', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h);
    h.state.session.payment_status = 'unpaid';
    assert.deepEqual((await server.send(fixtureEvent())).body, { success: true, paid: false, pending: true });
    assert.equal(h.writes.length, 0);
    h.state.session.payment_status = 'paid';
    const settled = fixtureEvent({ type: 'checkout.session.async_payment_succeeded', id: 'evt_SR3AB' });
    const responses = await Promise.all([server.send(settled), server.send(settled), server.send(settled)]);
    assert.ok(responses.every(result => result.status === 200 && result.body.paid));
    assert.equal(h.writes.length, 1);
    const first = clone(h.stored.get(orderId));
    assert.equal((await server.send(fixtureEvent())).body.alreadyVerified, true);
    assert.equal((await server.send(fixtureEvent({ type: 'checkout.session.async_payment_failed' }))).status, 400);
    assert.deepEqual(h.stored.get(orderId), first);
});

test('unsupported events/account/environment and unknown sessions cannot bootstrap a binding', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h);
    for (const overrides of [{ type: 'payment_intent.succeeded' }, { account: 'acct_OTHER' }, { context: 'org_OTHER' }, { livemode: true }, { created: 0 }]) {
        assert.equal((await server.send(fixtureEvent(overrides))).status, 400);
    }
    const unknown = fixtureEvent({ data: { object: { object: 'checkout.session', id: 'cs_test_UNKNOWN', metadata: { orderId, userId } } } });
    assert.equal((await server.send(unknown)).status, 409);
    assert.equal(h.writes.length, 0);
    assert.equal(h.providerCalls.length, 0);
});

test('parsed JSON before raw webhook middleware fails closed; production routing remains unmounted', async t => {
    const h = harness(t);
    const server = await webhookServer(t, h, { parsedFirst: true });
    assert.equal((await server.send(fixtureEvent())).status, 400);
    assert.equal(h.writes.length, 0);
    assert.equal(h.providerCalls.length, 0);
    const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /stripeWebhookRoute|createStripePaymentVerifier|stripePayment/);
});
