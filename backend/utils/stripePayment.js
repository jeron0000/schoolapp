import orderModel from '../models/orderModel.js';

const activeStatuses = ['Order Placed', 'Approved', 'Packing', 'Sent to Cashier', 'Shipped'];
const objectId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const providerId = (value, prefix) => typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9]+$').test(value);
class StripePaymentError extends Error {
    constructor(code, status) {
        super('Stripe payment cannot be verified. Contact PAMO for review.');
        this.code = code;
        this.status = status;
    }
}
const fail = (code, status = 409) => { throw new StripePaymentError(code, status); };

// Decimal digits, not floating-point multiplication or implicit rounding.
export const stripeMinorUnits = amount => {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) fail('invalid_amount');
    const match = String(amount).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);
    if (!match) fail('invalid_amount');
    const digits = BigInt(match[1] + (match[2] || ''));
    const scale = 2 + Number(match[3] || 0) - (match[2]?.length || 0);
    const divisor = scale < 0 ? 10n ** BigInt(-scale) : 1n;
    if (digits % divisor) fail('unsupported_precision');
    const minor = scale < 0 ? digits / divisor : digits * 10n ** BigInt(scale);
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid_amount');
    return Number(minor);
};

const orderAmount = order => {
    const amount = stripeMinorUnits(order.amount);
    if (!amount || order.paymentCurrency !== 'PHP' || !Array.isArray(order.items) || !order.items.length) fail('invalid_order_amount');
    let subtotal = 0;
    for (const item of order.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) fail('invalid_order_amount');
        const line = stripeMinorUnits(item.price) * item.quantity;
        subtotal += line;
        if (!Number.isSafeInteger(line) || !Number.isSafeInteger(subtotal)) fail('invalid_order_amount');
    }
    // Stored canonical amount already includes its fee; never reprice or add it again.
    if (subtotal > amount) fail('invalid_order_amount');
    return amount;
};

const ensureIndexes = async () => {
    for (const identity of ['sessionId', 'paymentIntentId', 'eventId']) {
        await orderModel.collection.createIndex({ 'stripePayment.accountId': 1, 'stripePayment.livemode': 1, ['stripePayment.' + identity]: 1 }, {
            name: 'stripe_' + identity + '_unique', unique: true,
            partialFilterExpression: { ['stripePayment.' + identity]: { $type: 'string' } }
        });
    }
};

const protectedOperation = operation => async args => {
    try { return await operation(args); }
    catch (error) {
        if (error instanceof StripePaymentError) throw error;
        fail(error?.code === 11000 ? 'provider_replay' : 'verification_unavailable', error?.code === 11000 ? 409 : 503);
    }
};

// Dormant internal service. No public controller, production router or flag calls it.
export const createStripePaymentVerifier = ({ stripe, accountId, livemode, currency } = {}) => {
    if (!providerId(accountId, 'acct_') || typeof livemode !== 'boolean' || currency !== 'php') fail('unsupported_context', 503);
    const sessionId = value => providerId(value, livemode ? 'cs_live_' : 'cs_test_');
    const read = async operation => {
        try { return await operation(); }
        catch { fail('provider_unavailable', 503); }
    };
    const accountCheck = async () => {
        const account = await read(() => stripe.accounts.retrieve());
        if (account?.object !== 'account' || account.id !== accountId) fail('account_mismatch');
    };
    const sessionCheck = (session, order, expectedSessionId, amount) => {
        if (session?.object !== 'checkout.session' || session.id !== expectedSessionId
            || session.mode !== 'payment' || session.livemode !== livemode || session.currency !== currency
            || session.amount_total !== amount || !Number.isSafeInteger(session.amount_total)
            || session.client_reference_id !== String(order._id)
            || session.metadata?.orderId !== String(order._id) || session.metadata?.userId !== order.userId
            || session.payment_method_types?.length !== 1 || session.payment_method_types[0] !== 'card'
            || session.recovered_from != null) fail('session_mismatch');
    };
    const bindingCheck = order => {
        const binding = order.stripePayment;
        if (!binding || !sessionId(binding.sessionId) || binding.accountId !== accountId
            || binding.livemode !== livemode || binding.currency !== currency
            || !Number.isSafeInteger(binding.amountMinor) || binding.amountMinor <= 0
            || binding.amountMinor !== orderAmount(order) || order.paymentMethod !== 'Stripe') fail('binding_mismatch');
        return binding;
    };
    const evidenceCheck = binding => providerId(binding.paymentIntentId, 'pi_') && providerId(binding.chargeId, 'ch_')
        && Number.isSafeInteger(binding.verifiedAt) && binding.verifiedAt > 0;
    const activeOrderCheck = order => {
        if (order.payment !== false || order.inventoryStatus !== 'reserved' || !activeStatuses.includes(order.status)
            || order.paidAt !== undefined || order.stripePayment?.verifiedAt !== undefined
            || order.stripePayment?.chargeId !== undefined || order.stripePayment?.eventId !== undefined) fail('order_requires_review');
    };
    const bindingFilter = order => ({
        _id: order._id, userId: order.userId, paymentMethod: 'Stripe', payment: false,
        status: order.status, inventoryStatus: 'reserved', amount: order.amount, paymentCurrency: order.paymentCurrency,
        paidAt: { $exists: false }
    });

    const bindSession = protectedOperation(async ({ orderId, userId, sessionId: requestedSessionId }) => {
        if (!objectId(orderId) || !objectId(userId) || !sessionId(requestedSessionId)) fail('invalid_identity', 400);
        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) fail('order_not_found', 404);
        const amount = orderAmount(order);
        if (order.stripePayment) {
            const binding = bindingCheck(order);
            if (binding.sessionId !== requestedSessionId) fail('binding_conflict');
            return { bound: true, sessionId: binding.sessionId };
        }
        if (order.paymentMethod !== 'Stripe' || order.status !== 'Order Placed'
            || typeof order.requestId !== 'string' || !/^[A-Za-z0-9-]{16,100}$/.test(order.requestId)) fail('order_requires_review');
        activeOrderCheck(order);
        await accountCheck();
        const session = await read(() => stripe.checkout.sessions.retrieve(requestedSessionId));
        sessionCheck(session, order, requestedSessionId, amount);
        if (!['open', 'complete'].includes(session.status)) fail('session_mismatch');
        const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (intentId != null && !providerId(intentId, 'pi_')) fail('intent_mismatch');
        await ensureIndexes();
        const binding = { sessionId: requestedSessionId, accountId, livemode, currency, amountMinor: amount,
            ...(intentId ? { paymentIntentId: intentId } : {}) };
        const updated = await orderModel.findOneAndUpdate({ ...bindingFilter(order), stripePayment: { $exists: false } },
            { $set: { stripePayment: binding } }, { new: true, runValidators: true });
        if (!updated) fail('binding_conflict');
        return { bound: true, sessionId: binding.sessionId };
    });

    const settleOrder = async (order, eventId) => {
        const binding = bindingCheck(order);
        if (order.payment === true) {
            if (!evidenceCheck(binding) || order.paidAt !== binding.verifiedAt) fail('order_requires_review');
            return { paid: true, alreadyVerified: true };
        }
        activeOrderCheck(order);
        await accountCheck();
        const session = await read(() => stripe.checkout.sessions.retrieve(binding.sessionId));
        sessionCheck(session, order, binding.sessionId, binding.amountMinor);
        if (session.status !== 'complete' || session.payment_status !== 'paid') fail('not_settled');
        const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (!providerId(intentId, 'pi_') || (binding.paymentIntentId != null && binding.paymentIntentId !== intentId)) fail('intent_mismatch');
        const intent = await read(() => stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] }));
        if (intent?.object !== 'payment_intent' || intent.id !== intentId || intent.livemode !== livemode
            || intent.currency !== currency || intent.amount !== binding.amountMinor || intent.amount_received !== binding.amountMinor
            || intent.metadata?.orderId !== String(order._id) || intent.metadata?.userId !== order.userId
            || intent.application != null || intent.on_behalf_of != null || intent.transfer_data != null
            || intent.application_fee_amount != null) fail('intent_mismatch');
        if (intent.status !== 'succeeded') fail('not_settled');
        const charge = intent.latest_charge;
        if (charge?.object !== 'charge' || !providerId(charge.id, 'ch_') || charge.payment_intent !== intentId
            || charge.livemode !== livemode || charge.currency !== currency || charge.amount !== binding.amountMinor
            || charge.amount_captured !== binding.amountMinor || charge.status !== 'succeeded'
            || charge.paid !== true || charge.captured !== true || charge.refunded !== false || charge.amount_refunded !== 0
            || charge.disputed !== false || charge.payment_method_details?.type !== 'card'
            || charge.application != null || charge.on_behalf_of != null || charge.transfer_data != null) fail('charge_mismatch');
        await ensureIndexes();
        const verifiedAt = Date.now();
        const filter = { ...bindingFilter(order), 'stripePayment.sessionId': binding.sessionId,
            'stripePayment.accountId': accountId, 'stripePayment.livemode': livemode,
            'stripePayment.currency': currency, 'stripePayment.amountMinor': binding.amountMinor,
            'stripePayment.paymentIntentId': binding.paymentIntentId ?? { $exists: false },
            'stripePayment.verifiedAt': { $exists: false }, 'stripePayment.chargeId': { $exists: false },
            'stripePayment.eventId': { $exists: false } };
        const updated = await orderModel.findOneAndUpdate(filter, { $set: {
            payment: true, paidAt: verifiedAt, 'stripePayment.verifiedAt': verifiedAt,
            'stripePayment.paymentIntentId': intentId, 'stripePayment.chargeId': charge.id,
            ...(eventId ? { 'stripePayment.eventId': eventId } : {})
        } }, { new: true, runValidators: true });
        if (!updated) {
            const current = await orderModel.findOne({ _id: order._id, userId: order.userId });
            const currentBinding = current && bindingCheck(current);
            if (current?.payment === true && currentBinding.sessionId === binding.sessionId
                && currentBinding.paymentIntentId === intentId && currentBinding.chargeId === charge.id
                && evidenceCheck(currentBinding) && current.paidAt === currentBinding.verifiedAt) return { paid: true, alreadyVerified: true };
            fail('order_changed');
        }
        return { paid: true, alreadyVerified: false };
    };

    const confirmPayment = protectedOperation(async ({ orderId, userId }) => {
        if (!objectId(orderId) || !objectId(userId)) fail('invalid_identity', 400);
        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) fail('order_not_found', 404);
        return settleOrder(order);
    });

    // Accept only the authenticated event supplied by the raw-body webhook adapter.
    const processEvent = protectedOperation(async event => {
        if (event?.object !== 'event' || !providerId(event.id, 'evt_') || event.livemode !== livemode
            || event.account != null || event.context != null || !Number.isSafeInteger(event.created) || event.created <= 0
            || !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
            || event.data?.object?.object !== 'checkout.session' || !sessionId(event.data.object.id)) fail('unsupported_event', 400);
        const order = await orderModel.findOne({ 'stripePayment.sessionId': event.data.object.id,
            'stripePayment.accountId': accountId, 'stripePayment.livemode': livemode });
        if (!order) fail('unbound_session', 409);
        return settleOrder(order, event.id);
    });

    return { bindSession, confirmPayment, processEvent };
};
