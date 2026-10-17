import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { connectTestDatabase } from './helpers/database.js';
import { readFile, readdir } from 'node:fs/promises';
import mongoose from 'mongoose';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import userModel from '../models/userModel.js';
import { PayPalVerificationClient } from '../utils/paypalPayment.js';
import { evaluatePaymentRecovery, registerRecoveryOperation, recordRecoveryOperationState, recordRecoveryDecision } from '../utils/paymentRecovery.js';

const orderId = '0123456789abcdef01234567';
const userId = '1123456789abcdef01234567';
const otherId = '2123456789abcdef01234567';
const fingerprint = value => createHash('sha256').update(JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry)).digest('hex');
const payloadHash = 'a'.repeat(64), resultHash = 'b'.repeat(64);
const bindingHash = order => fingerprint({ method: order.paymentMethod, stripe: order.stripePayment ?? null, paypal: order.paypalPayment ?? null });
const orderHash = order => fingerprint(Object.fromEntries(['status', 'payment', 'inventoryStatus', 'paymentMethod', 'amount', 'paymentCurrency', 'items', 'requestId', 'paidAt', 'stripePayment', 'paypalPayment'].map(key => [key, order[key] ?? null])));
const fixture = (provider = 'Stripe', overrides = {}) => ({
    _id: orderId, userId, status: 'Order Placed', payment: false, inventoryStatus: 'reserved',
    amount: 460, paymentCurrency: 'PHP', paymentMethod: provider, requestId: 'sr5b-checkout-00001',
    date: 1, address: {}, items: [{ _id: otherId, size: 'M', price: 225, quantity: 2 }],
    ...(provider === 'Stripe' ? { stripePayment: { sessionId: 'cs_test_SR5B', paymentIntentId: 'pi_SR5B',
        accountId: 'acct_SR5B', livemode: false, currency: 'php', amountMinor: 46000 } }
        : { paypalPayment: { orderId: 'PAYPALSR5B', captureId: 'CAPTURESR5B', merchantId: 'MERCHANTSR5B', environment: 'sandbox', currency: 'PHP', amountMinor: 46000 } }),
    ...overrides
});
const completeHistory = order => ({ ...order, paymentRecovery: {
    revision: 4, phase: 'hold', historyComplete: true, decisions: [], operations: [{
        id: 'sr5b-operation-00001', kind: 'create', requestKey: 'sr5b-provider-key-00001', payloadHash,
        bindingHash: bindingHash(order), orderHash: orderHash(order), state: 'resolved', resultHash, createdAt: 1, updatedAt: 2
    }]
} });
const observed = (order, resource, state) => {
    const stripe = order.paymentMethod === 'Stripe';
    const saved = stripe ? order.stripePayment : order.paypalPayment;
    return { provider: order.paymentMethod, resource, state, observedAt: 3, amountMinor: saved.amountMinor,
        currency: saved.currency, ...(stripe ? { accountId: saved.accountId, livemode: saved.livemode,
            transactionId: resource === 'session' ? saved.sessionId : saved.paymentIntentId }
            : { merchantId: saved.merchantId, environment: saved.environment,
                transactionId: resource === 'order' ? saved.orderId : saved.captureId }) };
};
const args = overrides => ({ orderId, userId, expectedRevision: 0, ...overrides });
const operation = overrides => args({ operationId: 'sr5b-operation-00001', kind: 'create', payloadHash, ...overrides });
const field = (value, path) => path.split('.').reduce((parent, key) => parent?.[key], value);
const matches = (order, filter) => Object.entries(filter).every(([path, value]) =>
    value && typeof value === 'object' && Object.hasOwn(value, '$exists')
        ? (field(order, path) !== undefined) === value.$exists
        : JSON.stringify(field(order, path)) === JSON.stringify(value));
const harness = (t, initial = fixture()) => {
    const state = { order: structuredClone(initial), writes: [], beforeWrite: null };
    t.mock.method(orderModel, 'findOne', filter => ({ lean: async () => matches(state.order, filter) ? structuredClone(state.order) : null }));
    t.mock.method(orderModel, 'findOneAndUpdate', (filter, update, options) => ({ lean: async () => {
        state.beforeWrite?.();
        if (!matches(state.order, filter)) return null;
        assert.deepEqual(Object.keys(update), ['$set']);
        assert.deepEqual(Object.keys(update.$set), ['paymentRecovery']);
        assert.equal(options.returnDocument, 'after');
        assert.equal(options.runValidators, true);
        state.order.paymentRecovery = structuredClone(update.$set.paymentRecovery);
        state.writes.push({ filter, update });
        return structuredClone(state.order);
    } }));
    for (const model of [productModel, userModel]) for (const method of ['updateOne', 'findOneAndUpdate', 'create', 'findByIdAndUpdate']) {
        t.mock.method(model, method, () => assert.fail('Recovery must not change stock/cart/user data'));
    }
    t.mock.method(mongoose.connection, 'transaction', () => assert.fail('Dormant metadata must not run restoration transactions'));
    t.mock.method(PayPalVerificationClient.prototype, 'execute', () => assert.fail('No provider calls allowed'));
    t.mock.method(globalThis, 'fetch', () => assert.fail('No external requests allowed'));
    return state;
};

test('optional schema does not add metadata/defaults/indexes to historical COD or online orders', () => {
    for (const provider of ['COD', 'Stripe', 'Paypal']) {
        const order = new orderModel(fixture(provider));
        assert.equal(order.paymentRecovery, undefined);
        assert.equal(Object.hasOwn(order.toObject(), 'paymentRecovery'), false);
    }
    assert.ok(orderModel.schema.indexes().every(([keys]) => Object.keys(keys).every(key => !key.startsWith('paymentRecovery'))));
    const invalid = new orderModel(completeHistory(fixture()));
    invalid.paymentRecovery.phase = 'released';
    assert.ok(invalid.paymentRecovery.validateSync());
});

test('pending/processing/retryable/terminal observations remain unable to release', () => {
    const stripe = completeHistory(fixture()), paypal = completeHistory(fixture('Paypal'));
    const cases = [[stripe, 'session', 'open', 'pending'], [stripe, 'session', 'complete', 'pending'],
        [stripe, 'intent', 'requires_action', 'pending'], [stripe, 'intent', 'requires_capture', 'pending'],
        [stripe, 'intent', 'processing', 'processing'], [stripe, 'intent', 'requires_payment_method', 'retryable'],
        [stripe, 'session', 'expired', 'terminal_nonpayment'], [stripe, 'intent', 'canceled', 'terminal_nonpayment'],
        [paypal, 'order', 'CREATED', 'pending'], [paypal, 'order', 'APPROVED', 'pending'],
        [paypal, 'order', 'COMPLETED', 'pending'], [paypal, 'order', 'VOIDED', 'terminal_nonpayment'],
        [paypal, 'capture', 'PENDING', 'processing'], [paypal, 'capture', 'DECLINED', 'retryable'],
        [paypal, 'capture', 'FAILED', 'retryable']];
    for (const [order, resource, state, classification] of cases) {
        const result = evaluatePaymentRecovery(order, observed(order, resource, state));
        assert.equal(result.classification, classification, state);
        assert.equal(result.releaseEligible, false);
        assert.equal(result.reconciliationRequired, true);
    }
    assert.equal(evaluatePaymentRecovery(paypal, observed(paypal, 'order', 'EXPIRED')).classification, 'manual_review');
});

test('only matching persisted SR-3 evidence classifies as verified paid; observations cannot mark payment paid', () => {
    for (const provider of ['Stripe', 'Paypal']) {
        const order = fixture(provider, { payment: true, paidAt: 123 });
        const saved = provider === 'Stripe' ? order.stripePayment : order.paypalPayment;
        Object.assign(saved, { verifiedAt: 123, ...(provider === 'Stripe' ? { chargeId: 'ch_SR5B' } : {}) });
        const paid = evaluatePaymentRecovery(order);
        assert.equal(paid.classification, 'verified_paid');
        assert.equal(paid.releaseEligible, false);
        assert.equal(paid.reconciliationRequired, true, 'No inferred complete legacy operation history');
        order.paidAt = 124;
        assert.equal(evaluatePaymentRecovery(order).classification, 'manual_review');
        const unpaid = completeHistory(fixture(provider));
        const result = evaluatePaymentRecovery(unpaid, observed(unpaid, provider === 'Stripe' ? 'intent' : 'capture', provider === 'Stripe' ? 'succeeded' : 'COMPLETED'));
        assert.equal(result.reason, 'settlement_requires_verifier');
        assert.equal(unpaid.payment, false);
    }
});

test('legacy/missing bindings, incomplete histories, in-flight outcomes and binding changes require review', () => {
    const order = completeHistory(fixture());
    for (const changed of [fixture(), { ...order, stripePayment: undefined },
        { ...order, paymentRecovery: { ...order.paymentRecovery, historyComplete: false } },
        { ...order, paymentRecovery: { ...order.paymentRecovery, operations: [] } },
        { ...order, stripePayment: { ...order.stripePayment, sessionId: 'cs_test_OTHER' } }]) {
        assert.equal(evaluatePaymentRecovery(changed).classification, 'manual_review');
    }
    for (const state of ['planned', 'in_flight', 'unknown']) {
        const changed = structuredClone(order);
        changed.paymentRecovery.operations[0].state = state;
        delete changed.paymentRecovery.operations[0].resultHash;
        const result = evaluatePaymentRecovery(changed, observed(changed, 'session', 'expired'));
        assert.equal(result.reason, 'operation_outcome_unknown');
        assert.equal(result.releaseEligible, false);
    }
});

test('invalid context, amount, currency, status, prototype inputs and partial paid evidence fail closed', () => {
    const order = completeHistory(fixture()), observation = observed(order, 'session', 'expired');
    for (const changes of [{ transactionId: 'cs_test_OTHER' }, { accountId: 'acct_OTHER' }, { amountMinor: 1 },
        { currency: 'usd' }, { livemode: true }, { state: 'failed' }, { observedAt: NaN }, { observedAt: 0 },
        { success: true }, { merchantId: 'OTHER' }]) {
        assert.equal(evaluatePaymentRecovery(order, { ...observation, ...changes }).classification, 'manual_review');
    }
    assert.equal(evaluatePaymentRecovery(order, Object.create(observation)).classification, 'manual_review');
    for (const changes of [{ amount: 0.1 + 0.2 }, { paymentCurrency: 'USD' }, { payment: true }, { paidAt: 123 },
        { stripePayment: { ...order.stripePayment, chargeId: 'ch_PARTIAL' } }, { paypalPayment: fixture('Paypal').paypalPayment },
        { status: 'Approved' }, { inventoryStatus: undefined }]) {
        assert.equal(evaluatePaymentRecovery({ ...order, ...changes }).classification, 'manual_review');
    }
});

test('released/late-paid/reversal classifications never change stock, payment or workflow', async t => {
    const h = harness(t, completeHistory(fixture('Paypal', { inventoryStatus: 'released', status: 'Cancelled' })));
    const before = structuredClone(h.order);
    assert.equal(evaluatePaymentRecovery(h.order).classification, 'already_released');
    assert.equal(evaluatePaymentRecovery(h.order).reconciliationRequired, true);
    assert.equal(evaluatePaymentRecovery({ ...h.order, paidAt: 123 }).reason, 'partial_payment_evidence');
    assert.equal(evaluatePaymentRecovery(h.order, observed(h.order, 'capture', 'COMPLETED')).reason, 'paid_after_release');
    for (const state of ['REFUNDED', 'PARTIALLY_REFUNDED']) assert.equal(evaluatePaymentRecovery(h.order, observed(h.order, 'capture', state)).reason, 'financial_reversal');
    assert.deepEqual(h.order, before);
    const metadata = await recordRecoveryDecision(args({ expectedRevision: 4, evaluationId: 'sr5b-evaluation-00001', observation: observed(h.order, 'capture', 'COMPLETED') }));
    assert.equal(metadata.phase, 'review');
    assert.equal(metadata.decisions[0].releaseEligible, false);
    assert.deepEqual({ ...h.order, paymentRecovery: before.paymentRecovery }, before);
});

test('operation identity is durable/idempotent and cannot be replaced or replayed as a new same-kind attempt', async t => {
    const h = harness(t);
    const first = await registerRecoveryOperation(operation());
    assert.equal(first.historyComplete, false);
    assert.equal(first.revision, 1);
    assert.equal(first.operations[0].state, 'planned');
    assert.match(first.operations[0].requestKey, /^[a-f\d-]{36}$/);
    assert.deepEqual(await registerRecoveryOperation(operation()), first);
    assert.equal(h.writes.length, 1);
    await assert.rejects(registerRecoveryOperation(operation({ payloadHash: resultHash })), { code: 'operation_conflict' });
    await assert.rejects(registerRecoveryOperation(operation({ operationId: 'sr5b-operation-00002', expectedRevision: 1 })), { code: 'operation_conflict' });
    assert.equal(h.writes.length, 1);
});

test('journal states advance monotonically, never execute, and unknown outcomes cannot be retried by changing state', async t => {
    const h = harness(t);
    await registerRecoveryOperation(operation());
    await recordRecoveryOperationState(args({ expectedRevision: 1, operationId: 'sr5b-operation-00001', state: 'in_flight' }));
    await recordRecoveryOperationState(args({ expectedRevision: 2, operationId: 'sr5b-operation-00001', state: 'unknown' }));
    await assert.rejects(recordRecoveryOperationState(args({ expectedRevision: 3, operationId: 'sr5b-operation-00001', state: 'in_flight' })), { code: 'operation_conflict' });
    await recordRecoveryOperationState(args({ expectedRevision: 3, operationId: 'sr5b-operation-00001', state: 'resolved', resultHash }));
    const saved = await recordRecoveryOperationState(args({ expectedRevision: 3, operationId: 'sr5b-operation-00001', state: 'resolved', resultHash }));
    assert.equal(saved.revision, 4);
    assert.equal(h.writes.length, 4);
    await assert.rejects(recordRecoveryOperationState(args({ expectedRevision: 4, operationId: 'sr5b-operation-00001', state: 'resolved', resultHash: payloadHash })), { code: 'operation_conflict' });
    assert.equal(h.order.inventoryStatus, 'reserved');
    assert.equal(h.order.payment, false);
});

test('duplicate evaluations record one decision, while changed inputs/order/operation outcomes invalidate reuse', async t => {
    const h = harness(t, completeHistory(fixture()));
    const evaluate = args({ expectedRevision: 4, evaluationId: 'sr5b-evaluation-00001', observation: observed(h.order, 'session', 'expired') });
    const first = await recordRecoveryDecision(evaluate);
    assert.equal(first.decisions[0].classification, 'terminal_nonpayment');
    assert.deepEqual(await recordRecoveryDecision(evaluate), first);
    const reordered = Object.fromEntries(Object.entries(evaluate.observation).reverse());
    assert.deepEqual(await recordRecoveryDecision({ ...evaluate, observation: reordered }), first);
    assert.equal(h.writes.length, 1);
    await assert.rejects(recordRecoveryDecision({ ...evaluate, observation: { ...evaluate.observation, state: 'open' } }), { code: 'evaluation_conflict' });
    h.order.paymentRecovery.operations[0].updatedAt = 3;
    await assert.rejects(recordRecoveryDecision(evaluate), { code: 'evaluation_conflict' });
    h.order.payment = true;
    await assert.rejects(recordRecoveryDecision(evaluate), { code: 'evaluation_conflict' });
});

test('concurrent metadata writers and stale revisions cannot overwrite another decision', async t => {
    const h = harness(t);
    const results = await Promise.allSettled([recordRecoveryDecision(args({ evaluationId: 'sr5b-evaluation-00001' })),
        recordRecoveryDecision(args({ evaluationId: 'sr5b-evaluation-00002' }))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'revision_conflict');
    assert.equal(h.writes.length, 1);
    await assert.rejects(recordRecoveryDecision(args({ evaluationId: 'sr5b-evaluation-00003' })), { code: 'revision_conflict' });
    assert.equal(h.order.paymentRecovery.decisions.length, 1);
});

test('payment/status/inventory/binding races invalidate metadata CAS; a review phase blocks new operations', async t => {
    for (const changed of [{ payment: true }, { status: 'Cancelled' }, { inventoryStatus: 'released' },
        { stripePayment: { ...fixture().stripePayment, sessionId: 'cs_test_OTHER' } }]) await t.test(JSON.stringify(changed), async t => {
        const h = harness(t);
        h.beforeWrite = () => Object.assign(h.order, changed);
        await assert.rejects(registerRecoveryOperation(operation()), { code: 'revision_conflict' });
        assert.equal(h.writes.length, 0);
    });
    const h = harness(t);
    await recordRecoveryDecision(args({ evaluationId: 'sr5b-evaluation-00001' }));
    await assert.rejects(registerRecoveryOperation(operation({ expectedRevision: 1 })), { code: 'operation_requires_review' });
    assert.equal(h.writes.length, 1);
});

test('stale worker revisions and old in-flight timestamps never establish completion or release', async t => {
    const h = harness(t);
    await registerRecoveryOperation(operation());
    await recordRecoveryOperationState(args({ expectedRevision: 1, operationId: 'sr5b-operation-00001', state: 'in_flight' }));
    await assert.rejects(recordRecoveryOperationState(args({ expectedRevision: 1, operationId: 'sr5b-operation-00001', state: 'unknown' })), { code: 'revision_conflict' });
    h.order.paymentRecovery.historyComplete = true;
    h.order.paymentRecovery.operations[0].createdAt = 1;
    h.order.paymentRecovery.operations[0].updatedAt = 1;
    const result = evaluatePaymentRecovery(h.order, observed(h.order, 'session', 'expired'));
    assert.equal(result.reason, 'operation_outcome_unknown');
    assert.equal(result.releaseEligible, false);
    assert.equal(h.order.paymentRecovery.operations[0].state, 'in_flight');
    assert.equal(h.writes.length, 2);
});

test('a registered payload cannot advance after canonical order values change without changing its binding', async t => {
    const h = harness(t);
    await registerRecoveryOperation(operation());
    h.order.amount = 470;
    await assert.rejects(recordRecoveryOperationState(args({ expectedRevision: 1, operationId: 'sr5b-operation-00001', state: 'in_flight' })), { code: 'operation_conflict' });
    await assert.rejects(registerRecoveryOperation(operation({ expectedRevision: 1 })), { code: 'operation_conflict' });
    assert.equal(h.order.paymentRecovery.operations[0].state, 'planned');
    assert.equal(h.writes.length, 1);
});

test('audit metadata rejects coercible flags, duplicate identities and unknown fields without normalizing them', () => {
    const order = completeHistory(fixture());
    const audit = { id: 'sr5b-evaluation-00001', inputHash: payloadHash, orderHash: resultHash,
        classification: 'manual_review', reason: 'provider_lookup_required', releaseEligible: false,
        reconciliationRequired: true, recordedAt: 1 };
    for (const altered of [{ ...audit, releaseEligible: 'false' }, { ...audit, releaseEligible: true },
        { ...audit, reconciliationRequired: 'true' }, { ...audit, extra: true }, { ...audit, recordedAt: NaN }]) {
        const changed = structuredClone(order);
        changed.paymentRecovery.decisions = [altered];
        assert.equal(evaluatePaymentRecovery(changed).reason, 'invalid_metadata');
    }
    order.paymentRecovery.decisions = [audit, audit];
    assert.equal(evaluatePaymentRecovery(order).reason, 'invalid_metadata');
});

test('ownership, malformed input, corrupt history, revision overflow and database errors fail safely', async t => {
    const h = harness(t);
    await assert.rejects(registerRecoveryOperation(operation({ userId: otherId })), { code: 'order_not_found' });
    for (const changed of [{ orderId: { $ne: null } }, { expectedRevision: -1 }, { expectedRevision: '0' }, { payloadHash: 'secret-like-unvalidated' }]) {
        await assert.rejects(registerRecoveryOperation(operation(changed)));
    }
    h.order.paymentRecovery = { revision: Number.MAX_SAFE_INTEGER, phase: 'hold', historyComplete: false, operations: [], decisions: [] };
    await assert.rejects(registerRecoveryOperation(operation({ expectedRevision: Number.MAX_SAFE_INTEGER })), { code: 'revision_conflict' });
    h.order.paymentRecovery.phase = 'released';
    await assert.rejects(recordRecoveryDecision(args({ evaluationId: 'sr5b-evaluation-00001' })), { code: 'invalid_metadata' });
    t.mock.method(orderModel, 'findOne', () => { throw new Error('synthetic-db-private-details'); });
    await assert.rejects(registerRecoveryOperation(operation()), error => error.code === 'metadata_unavailable' && !error.message.includes('private-details'));
    assert.equal(h.writes.length, 0);
});

test('foundation has no executor, provider mutations, stock release API or production import', async () => {
    const module = await import('../utils/paymentRecovery.js');
    assert.deepEqual(Object.keys(module).sort(), ['evaluatePaymentRecovery', 'recordRecoveryDecision', 'recordRecoveryOperationState', 'registerRecoveryOperation']);
    const source = await readFile(new URL('../utils/paymentRecovery.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /import.*(?:inventory\.js|productModel|stripeWebhook|paypalWebhook)|process\.env|setInterval|setTimeout|fetch\(/);
    for (const folder of ['controllers', 'routes']) for (const file of await readdir(new URL('../' + folder + '/', import.meta.url))) {
        if (file.endsWith('.js')) assert.doesNotMatch(await readFile(new URL('../' + folder + '/' + file, import.meta.url), 'utf8'), /utils\/paymentRecovery/);
    }
    assert.doesNotMatch(await readFile(new URL('../server.js', import.meta.url), 'utf8'), /paymentRecovery/);
    const cod = fixture('COD');
    assert.equal(evaluatePaymentRecovery(cod).classification, 'excluded');
    assert.equal(evaluatePaymentRecovery(cod).releaseEligible, false);
});

test('isolated local MongoDB metadata CAS and preservation of payment/inventory', {
    skip: process.env.PAMO_RECOVERY_INTEGRATION !== '1', timeout: 60000
}, async t => {
    await connectTestDatabase(t, mongoose, 'recovery');
    const order = await orderModel.create(fixture());
    const before = order.toObject();
    const results = await Promise.allSettled([registerRecoveryOperation(operation()), registerRecoveryOperation(operation())]);
    assert.ok(results.some(result => result.status === 'fulfilled'));
    for (const result of results.filter(result => result.status === 'rejected')) assert.equal(result.reason.code, 'revision_conflict');
    const repeated = await registerRecoveryOperation(operation());
    assert.equal(repeated.revision, 1);
    const stored = await orderModel.findById(orderId).lean();
    delete stored.paymentRecovery;
    assert.deepEqual(stored, before);
});
