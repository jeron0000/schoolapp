import { createHash, randomUUID } from 'node:crypto';
import orderModel from '../models/orderModel.js';
import { stripeMinorUnits } from './stripePayment.js';
import { paypalMinorUnits } from './paypalPayment.js';
import { cartRecord, validCartId, validCartNumber } from '../../shared/cart.js';

// Metadata-only foundation. No provider client, inventory imports, executor or enable switch.
const online = order => ['Stripe', 'Paypal'].includes(order?.paymentMethod);
const identity = value => typeof value === 'string' && /^[A-Za-z0-9-]{16,100}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value, (_key, entry) => cartRecord(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry)).digest('hex');
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const positiveTime = value => Number.isSafeInteger(value) && value > 0;
const stripeId = (value, prefix) => typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);
const paypalId = value => typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value);
const onlyKeys = (record, keys) => cartRecord(record) && Reflect.ownKeys(record).every(key => keys.includes(key));
class RecoveryMetadataError extends Error {
    constructor(code, status) {
        super('Payment recovery metadata requires review.');
        this.code = code;
        this.status = status;
    }
}
const fail = (code, status = 409) => {
    throw new RecoveryMetadataError(code, status);
};
const decision = (classification, reason, reconciliationRequired = true) => ({
    classification, reason, reconciliationRequired, releaseEligible: false
});

const binding = order => {
    if (!online(order) || order.paymentCurrency !== 'PHP') fail('unsupported_order');
    if (order.stripePayment && order.paypalPayment) fail('conflicting_binding');
    const stripe = order.paymentMethod === 'Stripe';
    const saved = stripe ? order.stripePayment : order.paypalPayment;
    if (!saved) fail('missing_binding');
    const minorUnits = stripe ? stripeMinorUnits : paypalMinorUnits;
    const amount = minorUnits(order.amount);
    if (!amount || !Array.isArray(order.items) || !order.items.length) fail('invalid_amount');
    let subtotal = 0;
    for (const item of order.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) fail('invalid_amount');
        const line = minorUnits(item.price) * item.quantity;
        subtotal += line;
        if (!Number.isSafeInteger(line) || !Number.isSafeInteger(subtotal)) fail('invalid_amount');
    }
    if (subtotal > amount || saved.amountMinor !== amount) fail('amount_mismatch');
    if (stripe) {
        if (typeof saved.livemode !== 'boolean' || !stripeId(saved.accountId, 'acct_') || saved.currency !== 'php'
            || !stripeId(saved.sessionId, saved.livemode ? 'cs_live_' : 'cs_test_')
            || (saved.paymentIntentId !== undefined && !stripeId(saved.paymentIntentId, 'pi_'))) fail('invalid_binding');
    } else if (!paypalId(saved.orderId) || !paypalId(saved.merchantId) || !['sandbox', 'live'].includes(saved.environment)
        || saved.currency !== 'PHP' || (saved.captureId !== undefined && !paypalId(saved.captureId))) fail('invalid_binding');
    const verified = positiveTime(saved.verifiedAt) && order.paidAt === saved.verifiedAt
        && (stripe ? stripeId(saved.paymentIntentId, 'pi_') && stripeId(saved.chargeId, 'ch_') : paypalId(saved.captureId));
    return { saved, verified, stripe };
};

const recoveryMetadata = order => {
    const saved = order.paymentRecovery;
    if (saved === undefined) return { revision: 0, phase: 'hold', historyComplete: false, operations: [], decisions: [] };
    if (!onlyKeys(saved, ['revision', 'phase', 'historyComplete', 'operations', 'decisions'])
        || !validCartNumber(saved.revision) || !['hold', 'review'].includes(saved.phase)
        || typeof saved.historyComplete !== 'boolean' || !Array.isArray(saved.operations) || !Array.isArray(saved.decisions)) fail('invalid_metadata');
    const ids = new Set(), kinds = new Set(), keys = new Set();
    for (const operation of saved.operations) {
        if (!onlyKeys(operation, ['id', 'kind', 'requestKey', 'payloadHash', 'bindingHash', 'orderHash', 'state', 'resultHash', 'createdAt', 'updatedAt'])
            || !identity(operation.id) || !identity(operation.requestKey)
            || !['create', 'capture', 'close'].includes(operation.kind) || !hash(operation.payloadHash)
            || !hash(operation.bindingHash) || !hash(operation.orderHash)
            || !['planned', 'in_flight', 'unknown', 'resolved'].includes(operation.state)
            || !positiveTime(operation.createdAt) || !positiveTime(operation.updatedAt)
            || (operation.state === 'resolved' ? !hash(operation.resultHash) : operation.resultHash !== undefined)
            || ids.has(operation.id) || kinds.has(operation.kind) || keys.has(operation.requestKey)) fail('invalid_metadata');
        ids.add(operation.id); kinds.add(operation.kind); keys.add(operation.requestKey);
    }
    const evaluationIds = new Set();
    const classifications = ['excluded', 'verified_paid', 'already_released', 'pending', 'processing', 'retryable', 'terminal_nonpayment', 'manual_review'];
    for (const entry of saved.decisions) {
        if (!onlyKeys(entry, ['id', 'inputHash', 'orderHash', 'classification', 'reason', 'reconciliationRequired', 'releaseEligible', 'recordedAt'])
            || !identity(entry.id) || !hash(entry.inputHash) || !hash(entry.orderHash) || !classifications.includes(entry.classification)
            || typeof entry.reason !== 'string' || !/^[a-z_]{1,80}$/.test(entry.reason)
            || typeof entry.reconciliationRequired !== 'boolean' || entry.releaseEligible !== false
            || !positiveTime(entry.recordedAt) || evaluationIds.has(entry.id)) fail('invalid_metadata');
        evaluationIds.add(entry.id);
    }
    // Schema validation also rejects unknown nested fields; no silent legacy cleanup.
    try {
        const checked = new orderModel({ paymentRecovery: saved }).paymentRecovery;
        if (checked.validateSync()) fail('invalid_metadata');
    } catch { fail('invalid_metadata'); }
    return structuredClone(saved);
};

// Observations are internal classification inputs, NOT authenticated settlement evidence.
// Future adapters must verify provider provenance. No observation can authorize a release.
const observationCheck = (order, observation, currentBinding) => {
    if (!cartRecord(observation)) fail('invalid_observation');
    const allowed = ['provider', 'resource', 'transactionId', 'accountId', 'livemode', 'merchantId', 'environment', 'currency', 'amountMinor', 'state', 'observedAt'];
    if (Reflect.ownKeys(observation).some(key => !allowed.includes(key)) || !positiveTime(observation.observedAt)
        || observation.provider !== order.paymentMethod || observation.amountMinor !== currentBinding.saved.amountMinor
        || observation.currency !== currentBinding.saved.currency) fail('observation_mismatch');
    const saved = currentBinding.saved;
    let states, expectedId;
    if (currentBinding.stripe) {
        if (observation.accountId !== saved.accountId || observation.livemode !== saved.livemode
            || observation.merchantId !== undefined || observation.environment !== undefined) fail('observation_mismatch');
        if (observation.resource === 'session') {
            expectedId = saved.sessionId;
            states = ['open', 'complete', 'expired'];
        } else if (observation.resource === 'intent') {
            expectedId = saved.paymentIntentId;
            states = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture', 'processing', 'succeeded', 'canceled'];
        }
    } else {
        if (observation.merchantId !== saved.merchantId || observation.environment !== saved.environment
            || observation.accountId !== undefined || observation.livemode !== undefined) fail('observation_mismatch');
        if (observation.resource === 'order') {
            expectedId = saved.orderId;
            states = ['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'];
        } else if (observation.resource === 'capture') {
            expectedId = saved.captureId;
            states = ['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'FAILED'];
        }
    }
    if (!expectedId || observation.transactionId !== expectedId || !states?.includes(observation.state)) fail('observation_mismatch');
};

export const evaluatePaymentRecovery = (order, observation) => {
    if (!online(order)) return decision('excluded', 'non_online_order', false);
    let currentBinding, metadata;
    try {
        currentBinding = binding(order);
        metadata = recoveryMetadata(order);
        if (observation !== undefined) observationCheck(order, observation, currentBinding);
    } catch (error) {
        return decision('manual_review', error.code || 'invalid_evidence');
    }
    const state = observation?.state;
    if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(state)) return decision('manual_review', 'financial_reversal');
    const observedPaid = (observation?.resource === 'intent' && state === 'succeeded')
        || (observation?.resource === 'capture' && state === 'COMPLETED');
    if (order.inventoryStatus === 'released') {
        if (observedPaid || order.payment === true) return decision('manual_review', 'paid_after_release');
        if (order.payment !== false || order.paidAt !== undefined || currentBinding.saved.verifiedAt !== undefined
            || currentBinding.saved.chargeId !== undefined || currentBinding.saved.eventId !== undefined) return decision('manual_review', 'partial_payment_evidence');
        // Stock must not move again; financial reconciliation is still independent.
        return decision('already_released', 'inventory_already_released');
    }
    if (order.payment === true) {
        if (!currentBinding.verified) return decision('manual_review', 'unverified_paid_history');
        const incomplete = !metadata.historyComplete || metadata.operations.some(operation => operation.state !== 'resolved'
            || operation.bindingHash !== bindingHash(order) || operation.orderHash !== digest(orderSnapshot(order)));
        return decision('verified_paid', observation && !observedPaid ? 'provider_state_conflicts_with_paid_evidence'
            : 'persisted_provider_verification', incomplete || (observation !== undefined && !observedPaid));
    }
    if (order.payment !== false || order.paidAt !== undefined || currentBinding.saved.verifiedAt !== undefined
        || currentBinding.saved.chargeId !== undefined || currentBinding.saved.eventId !== undefined) return decision('manual_review', 'partial_payment_evidence');
    if (observedPaid) return decision('manual_review', 'settlement_requires_verifier');
    if (order.status !== 'Order Placed' || order.inventoryStatus !== 'reserved') return decision('manual_review', 'ineligible_order_state');
    if (!metadata.historyComplete || !metadata.operations.some(operation => operation.kind === 'create')) return decision('manual_review', 'incomplete_operation_history');
    if (metadata.operations.some(operation => operation.state !== 'resolved')) return decision('manual_review', 'operation_outcome_unknown');
    if (metadata.operations.some(operation => operation.bindingHash !== bindingHash(order)
        || operation.orderHash !== digest(orderSnapshot(order)))) return decision('manual_review', 'binding_history_changed');
    if (observation === undefined) return decision('manual_review', 'provider_lookup_required');
    if (['expired', 'canceled', 'VOIDED'].includes(state)) return decision('terminal_nonpayment', 'terminal_observation_requires_reconciliation');
    if (['processing', 'PENDING'].includes(state)) return decision('processing', 'payment_processing');
    if (['requires_payment_method', 'DECLINED', 'FAILED'].includes(state)) return decision('retryable', 'failure_does_not_close_all_attempts');
    return decision('pending', 'payment_not_conclusively_closed');
};

const orderFields = ['status', 'payment', 'inventoryStatus', 'paymentMethod', 'amount', 'paymentCurrency', 'items', 'requestId', 'paidAt', 'stripePayment', 'paypalPayment'];
const orderSnapshot = order => Object.fromEntries(orderFields.map(key => [key, order[key] ?? null]));
const bindingHash = order => digest({ method: order.paymentMethod, stripe: order.stripePayment ?? null, paypal: order.paypalPayment ?? null });
const readOrder = async ({ orderId, userId, expectedRevision }) => {
    if (!validCartId(orderId) || !validCartId(userId) || !validCartNumber(expectedRevision)) fail('invalid_identity', 400);
    const order = await orderModel.findOne({ _id: orderId, userId }).lean();
    if (!order) fail('order_not_found', 404);
    if (!online(order)) fail('non_online_order');
    return { order, metadata: recoveryMetadata(order) };
};
const saveMetadata = async (args, order, previous, next) => {
    if (args.expectedRevision !== previous.revision || previous.revision === Number.MAX_SAFE_INTEGER) fail('revision_conflict');
    const filter = { _id: order._id, userId: args.userId, paymentRecovery: order.paymentRecovery ?? { $exists: false } };
    for (const key of orderFields) filter[key] = order[key] === undefined ? { $exists: false } : order[key];
    const updated = await orderModel.findOneAndUpdate(filter, { $set: { paymentRecovery: { ...next, revision: previous.revision + 1 } } },
        { returnDocument: 'after', runValidators: true }).lean();
    if (!updated) fail('revision_conflict');
    return updated.paymentRecovery;
};
const metadataOperation = operation => async args => {
    try {
        if (!cartRecord(args)) fail('invalid_request', 400);
        return await operation(args);
    }
    catch (error) {
        if (error instanceof RecoveryMetadataError) throw error;
        fail('metadata_unavailable', 503);
    }
};

export const registerRecoveryOperation = metadataOperation(async args => {
    if (!identity(args.operationId) || !['create', 'capture', 'close'].includes(args.kind) || !hash(args.payloadHash)) fail('invalid_operation', 400);
    const { order, metadata } = await readOrder(args);
    if (order.status !== 'Order Placed' || order.inventoryStatus !== 'reserved' || order.payment !== false
        || order.paidAt !== undefined || metadata.phase !== 'hold') fail('operation_requires_review');
    if (args.kind !== 'create') binding(order);
    const target = bindingHash(order);
    const existing = metadata.operations.find(operation => operation.id === args.operationId);
    if (existing) {
        if (existing.kind !== args.kind || existing.payloadHash !== args.payloadHash || existing.bindingHash !== target
            || existing.orderHash !== digest(orderSnapshot(order))) fail('operation_conflict');
        return metadata;
    }
    if (metadata.operations.some(operation => operation.kind === args.kind)) fail('operation_conflict');
    const now = Date.now();
    const operation = { id: args.operationId, kind: args.kind, requestKey: randomUUID(), payloadHash: args.payloadHash,
        bindingHash: target, orderHash: digest(orderSnapshot(order)), state: 'planned', createdAt: now, updatedAt: now };
    return saveMetadata(args, order, metadata, { ...metadata, operations: [...metadata.operations, operation] });
});

export const recordRecoveryOperationState = metadataOperation(async args => {
    if (!identity(args.operationId) || !['in_flight', 'unknown', 'resolved'].includes(args.state)
        || (args.state === 'resolved' ? !hash(args.resultHash) : args.resultHash !== undefined)) fail('invalid_operation', 400);
    const { order, metadata } = await readOrder(args);
    const operation = metadata.operations.find(entry => entry.id === args.operationId);
    if (!operation || operation.bindingHash !== bindingHash(order) || operation.orderHash !== digest(orderSnapshot(order))) fail('operation_conflict');
    if (operation.state === args.state && operation.resultHash === args.resultHash) return metadata;
    const transitions = { planned: ['in_flight'], in_flight: ['unknown', 'resolved'], unknown: ['resolved'], resolved: [] };
    if (!transitions[operation.state].includes(args.state) || (args.state === 'in_flight'
        && (metadata.phase !== 'hold' || order.payment !== false || order.status !== 'Order Placed' || order.inventoryStatus !== 'reserved'))) fail('operation_conflict');
    const changed = { ...operation, state: args.state, updatedAt: Date.now(), ...(args.resultHash ? { resultHash: args.resultHash } : {}) };
    return saveMetadata(args, order, metadata, { ...metadata, operations: metadata.operations.map(entry => entry.id === operation.id ? changed : entry) });
});

export const recordRecoveryDecision = metadataOperation(async args => {
    if (!identity(args.evaluationId)) fail('invalid_evaluation', 400);
    const { order, metadata } = await readOrder(args);
    const inputHash = digest(args.observation ?? null);
    const orderHash = digest({ order: orderSnapshot(order), historyComplete: metadata.historyComplete, operations: metadata.operations });
    const existing = metadata.decisions.find(entry => entry.id === args.evaluationId);
    if (existing) {
        if (existing.inputHash !== inputHash || existing.orderHash !== orderHash) fail('evaluation_conflict');
        return metadata;
    }
    const result = evaluatePaymentRecovery(order, args.observation);
    const entry = { id: args.evaluationId, inputHash, orderHash, ...result, recordedAt: Date.now() };
    return saveMetadata(args, order, metadata, { ...metadata, phase: result.classification === 'manual_review' ? 'review' : metadata.phase,
        decisions: [...metadata.decisions, entry] });
});
