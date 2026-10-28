import { createHash, randomUUID } from 'node:crypto';
import orderModel from '../models/orderModel.js';
import { stripeMinorUnits } from './stripePayment.js';
import { paypalMinorUnits } from './paypalPayment.js';
import { cartRecord, validCartId, validCartNumber } from '../../shared/cart.js';

// Metadata-only foundation. No provider client, inventory imports, executor or enable switch.
const online = order => ['Stripe', 'Paypal'].includes(order?.paymentMethod);
const identity = value => typeof value === 'string' && /^[A-Za-z0-9-]{16,100}$/.test(value);
const sortedRecord = entry => {
    if (!cartRecord(entry)) {
        return entry;
    }
    return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
};
const digest = value => createHash('sha256')
    .update(JSON.stringify(value, (_key, entry) => sortedRecord(entry)))
    .digest('hex');
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value);
const positiveTime = value => Number.isSafeInteger(value) && value > 0;
const stripeId = (value, prefix) => typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);
const paypalId = value => typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value);
const onlyKeys = (record, keys) => cartRecord(record) && Reflect.ownKeys(record).every(key => keys.includes(key));
const operationKinds = ['create', 'capture', 'close'];
const operationStates = ['planned', 'in_flight', 'unknown', 'resolved'];
const classifications = ['excluded', 'verified_paid', 'already_released', 'pending', 'processing', 'retryable', 'terminal_nonpayment', 'manual_review'];
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

const validOperationResult = operation => {
    if (operation.state === 'resolved') {
        return hash(operation.resultHash);
    }
    return operation.resultHash === undefined;
};

const validStoredOperation = (operation, ids, kinds, requestKeys) => {
    return onlyKeys(operation, ['id', 'kind', 'requestKey', 'payloadHash', 'bindingHash', 'orderHash', 'state', 'resultHash', 'createdAt', 'updatedAt'])
        && identity(operation.id)
        && identity(operation.requestKey)
        && operationKinds.includes(operation.kind)
        && hash(operation.payloadHash)
        && hash(operation.bindingHash)
        && hash(operation.orderHash)
        && operationStates.includes(operation.state)
        && positiveTime(operation.createdAt)
        && positiveTime(operation.updatedAt)
        && validOperationResult(operation)
        && !ids.has(operation.id)
        && !kinds.has(operation.kind)
        && !requestKeys.has(operation.requestKey);
};

const validStoredDecision = (entry, evaluationIds) => {
    return onlyKeys(entry, ['id', 'inputHash', 'orderHash', 'classification', 'reason', 'reconciliationRequired', 'releaseEligible', 'recordedAt'])
        && identity(entry.id)
        && hash(entry.inputHash)
        && hash(entry.orderHash)
        && classifications.includes(entry.classification)
        && typeof entry.reason === 'string'
        && /^[a-z_]{1,80}$/.test(entry.reason)
        && typeof entry.reconciliationRequired === 'boolean'
        && entry.releaseEligible === false
        && positiveTime(entry.recordedAt)
        && !evaluationIds.has(entry.id);
};

const binding = order => {
    if (!online(order) || order.paymentCurrency !== 'PHP') {
        fail('unsupported_order');
    }
    if (order.stripePayment && order.paypalPayment) {
        fail('conflicting_binding');
    }

    const stripe = order.paymentMethod === 'Stripe';
    let saved = order.paypalPayment;
    let minorUnits = paypalMinorUnits;
    if (stripe) {
        saved = order.stripePayment;
        minorUnits = stripeMinorUnits;
    }
    if (!saved) {
        fail('missing_binding');
    }

    const amount = minorUnits(order.amount);
    if (!amount || !Array.isArray(order.items) || !order.items.length) {
        fail('invalid_amount');
    }

    let subtotal = 0;
    for (const item of order.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
            fail('invalid_amount');
        }
        const line = minorUnits(item.price) * item.quantity;
        subtotal += line;
        if (!Number.isSafeInteger(line) || !Number.isSafeInteger(subtotal)) {
            fail('invalid_amount');
        }
    }
    if (subtotal > amount || saved.amountMinor !== amount) {
        fail('amount_mismatch');
    }

    if (stripe) {
        let sessionPrefix = 'cs_test_';
        if (saved.livemode) {
            sessionPrefix = 'cs_live_';
        }
        const invalidStripeBinding = typeof saved.livemode !== 'boolean'
            || !stripeId(saved.accountId, 'acct_')
            || saved.currency !== 'php'
            || !stripeId(saved.sessionId, sessionPrefix)
            || (saved.paymentIntentId !== undefined && !stripeId(saved.paymentIntentId, 'pi_'));
        if (invalidStripeBinding) {
            fail('invalid_binding');
        }
    } else {
        const invalidPayPalBinding = !paypalId(saved.orderId)
            || !paypalId(saved.merchantId)
            || !['sandbox', 'live'].includes(saved.environment)
            || saved.currency !== 'PHP'
            || (saved.captureId !== undefined && !paypalId(saved.captureId));
        if (invalidPayPalBinding) {
            fail('invalid_binding');
        }
    }

    let hasProviderEvidence = paypalId(saved.captureId);
    if (stripe) {
        hasProviderEvidence = stripeId(saved.paymentIntentId, 'pi_') && stripeId(saved.chargeId, 'ch_');
    }
    const verified = positiveTime(saved.verifiedAt)
        && order.paidAt === saved.verifiedAt
        && hasProviderEvidence;
    return { saved, verified, stripe };
};

const recoveryMetadata = order => {
    const saved = order.paymentRecovery;
    if (saved === undefined) {
        return { revision: 0, phase: 'hold', historyComplete: false, operations: [], decisions: [] };
    }

    const invalidRoot = !onlyKeys(saved, ['revision', 'phase', 'historyComplete', 'operations', 'decisions'])
        || !validCartNumber(saved.revision) || !['hold', 'review'].includes(saved.phase)
        || typeof saved.historyComplete !== 'boolean'
        || !Array.isArray(saved.operations)
        || !Array.isArray(saved.decisions);
    if (invalidRoot) {
        fail('invalid_metadata');
    }

    const ids = new Set();
    const kinds = new Set();
    const requestKeys = new Set();
    for (const operation of saved.operations) {
        if (!validStoredOperation(operation, ids, kinds, requestKeys)) {
            fail('invalid_metadata');
        }
        ids.add(operation.id);
        kinds.add(operation.kind);
        requestKeys.add(operation.requestKey);
    }

    const evaluationIds = new Set();
    for (const entry of saved.decisions) {
        if (!validStoredDecision(entry, evaluationIds)) {
            fail('invalid_metadata');
        }
        evaluationIds.add(entry.id);
    }
    // Schema validation also rejects unknown nested fields; no silent legacy cleanup.
    try {
        const checked = new orderModel({ paymentRecovery: saved }).paymentRecovery;
        if (checked.validateSync()) {
            fail('invalid_metadata');
        }
    } catch {
        fail('invalid_metadata');
    }
    return structuredClone(saved);
};

// Observations are internal classification inputs, NOT authenticated settlement evidence.
// Future adapters must verify provider provenance. No observation can authorize a release.
const observationCheck = (order, observation, currentBinding) => {
    if (!cartRecord(observation)) {
        fail('invalid_observation');
    }
    const allowed = ['provider', 'resource', 'transactionId', 'accountId', 'livemode', 'merchantId', 'environment', 'currency', 'amountMinor', 'state', 'observedAt'];
    const invalidCommonFields = Reflect.ownKeys(observation).some(key => !allowed.includes(key))
        || !positiveTime(observation.observedAt)
        || observation.provider !== order.paymentMethod || observation.amountMinor !== currentBinding.saved.amountMinor
        || observation.currency !== currentBinding.saved.currency;
    if (invalidCommonFields) {
        fail('observation_mismatch');
    }

    const saved = currentBinding.saved;
    let states;
    let expectedId;
    if (currentBinding.stripe) {
        const invalidStripeContext = observation.accountId !== saved.accountId
            || observation.livemode !== saved.livemode
            || observation.merchantId !== undefined
            || observation.environment !== undefined;
        if (invalidStripeContext) {
            fail('observation_mismatch');
        }
        if (observation.resource === 'session') {
            expectedId = saved.sessionId;
            states = ['open', 'complete', 'expired'];
        } else if (observation.resource === 'intent') {
            expectedId = saved.paymentIntentId;
            states = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture', 'processing', 'succeeded', 'canceled'];
        }
    } else {
        const invalidPayPalContext = observation.merchantId !== saved.merchantId
            || observation.environment !== saved.environment
            || observation.accountId !== undefined
            || observation.livemode !== undefined;
        if (invalidPayPalContext) {
            fail('observation_mismatch');
        }
        if (observation.resource === 'order') {
            expectedId = saved.orderId;
            states = ['CREATED', 'SAVED', 'APPROVED', 'VOIDED', 'COMPLETED', 'PAYER_ACTION_REQUIRED'];
        } else if (observation.resource === 'capture') {
            expectedId = saved.captureId;
            states = ['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'PENDING', 'REFUNDED', 'FAILED'];
        }
    }
    if (!expectedId || observation.transactionId !== expectedId || !states?.includes(observation.state)) {
        fail('observation_mismatch');
    }
};

const hasPartialPaymentEvidence = (order, savedBinding) => {
    return order.payment !== false
        || order.paidAt !== undefined
        || savedBinding.verifiedAt !== undefined
        || savedBinding.chargeId !== undefined
        || savedBinding.eventId !== undefined;
};

const operationMatchesOrder = (operation, order) => {
    return operation.bindingHash === bindingHash(order)
        && operation.orderHash === digest(orderSnapshot(order));
};

export const evaluatePaymentRecovery = (order, observation) => {
    if (!online(order)) {
        return decision('excluded', 'non_online_order', false);
    }

    let currentBinding;
    let metadata;
    try {
        currentBinding = binding(order);
        metadata = recoveryMetadata(order);
        if (observation !== undefined) {
            observationCheck(order, observation, currentBinding);
        }
    } catch (error) {
        return decision('manual_review', error.code || 'invalid_evidence');
    }

    const state = observation?.state;
    if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(state)) {
        return decision('manual_review', 'financial_reversal');
    }
    const observedPaid = (observation?.resource === 'intent' && state === 'succeeded')
        || (observation?.resource === 'capture' && state === 'COMPLETED');
    if (order.inventoryStatus === 'released') {
        if (observedPaid || order.payment === true) {
            return decision('manual_review', 'paid_after_release');
        }
        if (hasPartialPaymentEvidence(order, currentBinding.saved)) {
            return decision('manual_review', 'partial_payment_evidence');
        }
        // Stock must not move again; financial reconciliation is still independent.
        return decision('already_released', 'inventory_already_released');
    }

    if (order.payment === true) {
        if (!currentBinding.verified) {
            return decision('manual_review', 'unverified_paid_history');
        }
        const incomplete = !metadata.historyComplete || metadata.operations.some(operation => operation.state !== 'resolved'
            || !operationMatchesOrder(operation, order));
        let reason = 'persisted_provider_verification';
        if (observation && !observedPaid) {
            reason = 'provider_state_conflicts_with_paid_evidence';
        }
        const reconciliationRequired = incomplete || (observation !== undefined && !observedPaid);
        return decision('verified_paid', reason, reconciliationRequired);
    }

    if (hasPartialPaymentEvidence(order, currentBinding.saved)) {
        return decision('manual_review', 'partial_payment_evidence');
    }
    if (observedPaid) {
        return decision('manual_review', 'settlement_requires_verifier');
    }
    if (order.status !== 'Order Placed' || order.inventoryStatus !== 'reserved') {
        return decision('manual_review', 'ineligible_order_state');
    }
    if (!metadata.historyComplete || !metadata.operations.some(operation => operation.kind === 'create')) {
        return decision('manual_review', 'incomplete_operation_history');
    }
    if (metadata.operations.some(operation => operation.state !== 'resolved')) {
        return decision('manual_review', 'operation_outcome_unknown');
    }
    if (metadata.operations.some(operation => !operationMatchesOrder(operation, order))) {
        return decision('manual_review', 'binding_history_changed');
    }
    if (observation === undefined) {
        return decision('manual_review', 'provider_lookup_required');
    }
    if (['expired', 'canceled', 'VOIDED'].includes(state)) {
        return decision('terminal_nonpayment', 'terminal_observation_requires_reconciliation');
    }
    if (['processing', 'PENDING'].includes(state)) {
        return decision('processing', 'payment_processing');
    }
    if (['requires_payment_method', 'DECLINED', 'FAILED'].includes(state)) {
        return decision('retryable', 'failure_does_not_close_all_attempts');
    }
    return decision('pending', 'payment_not_conclusively_closed');
};

const orderFields = ['status', 'payment', 'inventoryStatus', 'paymentMethod', 'amount', 'paymentCurrency', 'items', 'requestId', 'paidAt', 'stripePayment', 'paypalPayment'];
const orderSnapshot = order => Object.fromEntries(orderFields.map(key => [key, order[key] ?? null]));
const bindingHash = order => digest({ method: order.paymentMethod, stripe: order.stripePayment ?? null, paypal: order.paypalPayment ?? null });
const readOrder = async ({ orderId, userId, expectedRevision }) => {
    if (!validCartId(orderId) || !validCartId(userId) || !validCartNumber(expectedRevision)) {
        fail('invalid_identity', 400);
    }
    const order = await orderModel.findOne({ _id: orderId, userId }).lean();
    if (!order) {
        fail('order_not_found', 404);
    }
    if (!online(order)) {
        fail('non_online_order');
    }
    return { order, metadata: recoveryMetadata(order) };
};

const storedOrMissing = value => {
    if (value === undefined) {
        return { $exists: false };
    }
    return value;
};

const saveMetadata = async (args, order, previous, next) => {
    if (args.expectedRevision !== previous.revision || previous.revision === Number.MAX_SAFE_INTEGER) {
        fail('revision_conflict');
    }
    const filter = { _id: order._id, userId: args.userId, paymentRecovery: order.paymentRecovery ?? { $exists: false } };
    for (const key of orderFields) {
        filter[key] = storedOrMissing(order[key]);
    }
    const updated = await orderModel.findOneAndUpdate(
        filter,
        { $set: { paymentRecovery: { ...next, revision: previous.revision + 1 } } },
        { returnDocument: 'after', runValidators: true }
    ).lean();
    if (!updated) {
        fail('revision_conflict');
    }
    return updated.paymentRecovery;
};

const metadataOperation = operation => async args => {
    try {
        if (!cartRecord(args)) {
            fail('invalid_request', 400);
        }
        return await operation(args);
    } catch (error) {
        if (error instanceof RecoveryMetadataError) {
            throw error;
        }
        fail('metadata_unavailable', 503);
    }
};

export const registerRecoveryOperation = metadataOperation(async args => {
    if (!identity(args.operationId) || !operationKinds.includes(args.kind) || !hash(args.payloadHash)) {
        fail('invalid_operation', 400);
    }
    const { order, metadata } = await readOrder(args);
    const ineligibleOrder = order.status !== 'Order Placed'
        || order.inventoryStatus !== 'reserved'
        || order.payment !== false
        || order.paidAt !== undefined
        || metadata.phase !== 'hold';
    if (ineligibleOrder) {
        fail('operation_requires_review');
    }
    if (args.kind !== 'create') {
        binding(order);
    }

    const target = bindingHash(order);
    const existing = metadata.operations.find(operation => operation.id === args.operationId);
    if (existing) {
        const conflicts = existing.kind !== args.kind
            || existing.payloadHash !== args.payloadHash
            || existing.bindingHash !== target
            || existing.orderHash !== digest(orderSnapshot(order));
        if (conflicts) {
            fail('operation_conflict');
        }
        return metadata;
    }
    if (metadata.operations.some(operation => operation.kind === args.kind)) {
        fail('operation_conflict');
    }

    const now = Date.now();
    const operation = {
        id: args.operationId,
        kind: args.kind,
        requestKey: randomUUID(),
        payloadHash: args.payloadHash,
        bindingHash: target,
        orderHash: digest(orderSnapshot(order)),
        state: 'planned',
        createdAt: now,
        updatedAt: now
    };
    return saveMetadata(args, order, metadata, { ...metadata, operations: [...metadata.operations, operation] });
});

export const recordRecoveryOperationState = metadataOperation(async args => {
    let hasValidResult = args.resultHash === undefined;
    if (args.state === 'resolved') {
        hasValidResult = hash(args.resultHash);
    }
    if (!identity(args.operationId) || !['in_flight', 'unknown', 'resolved'].includes(args.state) || !hasValidResult) {
        fail('invalid_operation', 400);
    }

    const { order, metadata } = await readOrder(args);
    const operation = metadata.operations.find(entry => entry.id === args.operationId);
    if (!operation || !operationMatchesOrder(operation, order)) {
        fail('operation_conflict');
    }
    if (operation.state === args.state && operation.resultHash === args.resultHash) {
        return metadata;
    }

    const transitions = { planned: ['in_flight'], in_flight: ['unknown', 'resolved'], unknown: ['resolved'], resolved: [] };
    const cannotStart = args.state === 'in_flight'
        && (metadata.phase !== 'hold'
            || order.payment !== false
            || order.status !== 'Order Placed'
            || order.inventoryStatus !== 'reserved');
    if (!transitions[operation.state].includes(args.state) || cannotStart) {
        fail('operation_conflict');
    }

    const changed = { ...operation, state: args.state, updatedAt: Date.now() };
    if (args.resultHash) {
        changed.resultHash = args.resultHash;
    }
    const operations = metadata.operations.map(entry => {
        if (entry.id === operation.id) {
            return changed;
        }
        return entry;
    });
    return saveMetadata(args, order, metadata, { ...metadata, operations });
});

export const recordRecoveryDecision = metadataOperation(async args => {
    if (!identity(args.evaluationId)) {
        fail('invalid_evaluation', 400);
    }
    const { order, metadata } = await readOrder(args);
    const inputHash = digest(args.observation ?? null);
    const orderHash = digest({ order: orderSnapshot(order), historyComplete: metadata.historyComplete, operations: metadata.operations });
    const existing = metadata.decisions.find(entry => entry.id === args.evaluationId);
    if (existing) {
        if (existing.inputHash !== inputHash || existing.orderHash !== orderHash) {
            fail('evaluation_conflict');
        }
        return metadata;
    }
    const result = evaluatePaymentRecovery(order, args.observation);
    const entry = { id: args.evaluationId, inputHash, orderHash, ...result, recordedAt: Date.now() };
    let phase = metadata.phase;
    if (result.classification === 'manual_review') {
        phase = 'review';
    }
    return saveMetadata(args, order, metadata, {
        ...metadata,
        phase,
        decisions: [...metadata.decisions, entry]
    });
});
