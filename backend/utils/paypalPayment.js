import paypal from '@paypal/checkout-server-sdk';
import orderModel from '../models/orderModel.js';

const activeStatuses = ['Order Placed', 'Approved', 'Packing', 'Sent to Cashier', 'Shipped'];
const objectId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const providerId = value => typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value);
const eventIdCheck = value => typeof value === 'string' && /^WH-[A-Za-z0-9-]{1,47}$/.test(value);
const apiHosts = {
    sandbox: ['https://api.sandbox.paypal.com', 'https://api-m.sandbox.paypal.com'],
    live: ['https://api.paypal.com', 'https://api-m.paypal.com']
};
const signaturePath = '/v1/notifications/verify-webhook-signature';

// The installed SDK JSON serializer would reformat webhook_event. Keep the
// exact event bytes in this request only; OAuth and other SDK JSON remain intact.
export class PayPalVerificationClient extends paypal.core.PayPalHttpClient {
    constructor(environment) {
        super(environment);
        const sdkEncoder = this.encoder;
        this.encoder = {
            serializeRequest(request) {
                if (request.path === signaturePath && Buffer.isBuffer(request.body)) {
                    return request.body;
                }
                return sdkEncoder.serializeRequest(request);
            },
            deserializeResponse(body, headers) {
                return sdkEncoder.deserializeResponse(body, headers);
            }
        };
    }
}

class PayPalPaymentError extends Error {
    constructor(code, status) {
        super('PayPal payment cannot be verified. Contact PAMO for review.');
        this.code = code;
        this.status = status;
    }
}
const fail = (code, status = 409) => {
    throw new PayPalPaymentError(code, status);
};
const safeMinor = minor => {
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail('invalid_amount');
    }
    return Number(minor);
};

// PHP-only contained contract, with exact decimal arithmetic and no rounding/FX.
// Kept independent of Stripe error types and its protected verification module.
export const paypalMinorUnits = amount => {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        fail('invalid_amount');
    }
    const match = String(amount).match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);
    if (!match) {
        fail('invalid_amount');
    }
    const digits = BigInt(match[1] + (match[2] || ''));
    const scale = 2 + Number(match[3] || 0) - (match[2]?.length || 0);
    let divisor = 1n;
    if (scale < 0) {
        divisor = 10n ** BigInt(-scale);
    }
    if (digits % divisor) {
        fail('unsupported_precision');
    }

    let minor;
    if (scale < 0) {
        minor = digits / divisor;
    } else {
        minor = digits * 10n ** BigInt(scale);
    }
    return safeMinor(minor);
};
const providerMinor = amount => {
    if (typeof amount !== 'string' || amount.length > 25 || !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
        fail('invalid_provider_amount');
    }
    const [whole, fraction = ''] = amount.split('.');
    return safeMinor(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
};
const orderAmount = order => {
    const amount = paypalMinorUnits(order.amount);
    if (!amount || order.paymentCurrency !== 'PHP' || !Array.isArray(order.items) || !order.items.length) {
        fail('invalid_order_amount');
    }
    let subtotal = 0;
    for (const item of order.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
            fail('invalid_order_amount');
        }
        const line = paypalMinorUnits(item.price) * item.quantity;
        subtotal += line;
        if (!Number.isSafeInteger(line) || !Number.isSafeInteger(subtotal)) {
            fail('invalid_order_amount');
        }
    }
    // Canonical stored amount already includes its fee. Never reprice historical items.
    if (subtotal > amount) {
        fail('invalid_order_amount');
    }
    return amount;
};
const ensureIndexes = async () => {
    for (const identity of ['orderId', 'captureId', 'eventId']) {
        const identityPath = 'paypalPayment.' + identity;
        await orderModel.collection.createIndex(
            { 'paypalPayment.merchantId': 1, 'paypalPayment.environment': 1, [identityPath]: 1 },
            {
                name: 'paypal_' + identity + '_unique',
                unique: true,
                partialFilterExpression: { [identityPath]: { $type: 'string' } }
            }
        );
    }
};
const protectedOperation = operation => async args => {
    try {
        return await operation(args);
    } catch (error) {
        if (error instanceof PayPalPaymentError) {
            throw error;
        }
        if (error?.code === 11000) {
            fail('provider_replay', 409);
        }
        fail('verification_unavailable', 503);
    }
};

// Dormant internal infrastructure: no checkout/capture POST, public controller or production import.
export const createPayPalPaymentVerifier = ({ client, merchantId, environment, currency, webhookId } = {}) => {
    const baseUrl = client?.environment?.baseUrl;
    const invalidContext = !providerId(merchantId)
        || currency !== 'PHP'
        || !['sandbox', 'live'].includes(environment)
        || !apiHosts[environment].includes(baseUrl)
        || !(client instanceof PayPalVerificationClient)
        || (webhookId !== undefined && !providerId(webhookId));
    if (invalidContext) {
        fail('unsupported_context', 503);
    }

    const read = async request => {
        // PayPal responses do not have a Stripe-style livemode field. The authenticated API host is the boundary.
        if (client.environment?.baseUrl !== baseUrl) {
            fail('environment_mismatch');
        }
        let response;
        try {
            response = await client.execute(request);
        } catch {
            fail('provider_unavailable', 503);
        }
        if (response?.statusCode !== 200 || !response.result || typeof response.result !== 'object') {
            fail('provider_unavailable', 503);
        }
        return response.result;
    };
    const amountCheck = (amount, expected) => {
        if (amount?.currency_code !== currency || providerMinor(amount.value) !== expected) {
            fail('amount_currency_mismatch');
        }
    };
    const providerOrderCheck = (remote, order, expectedId, amount) => {
        if (remote?.id !== expectedId || remote.intent !== 'CAPTURE' || remote.purchase_units?.length !== 1) {
            fail('provider_order_mismatch');
        }
        const unit = remote.purchase_units[0];
        const invalidUnit = unit.reference_id !== String(order._id)
            || unit.custom_id !== String(order._id)
            || unit.payee?.merchant_id !== merchantId
            || unit.payment_instruction != null;
        if (invalidUnit) {
            fail('provider_order_mismatch');
        }
        amountCheck(unit.amount, amount);
        if (unit.payments?.authorizations?.length || unit.payments?.refunds?.length) {
            fail('unsupported_payment');
        }
        return unit;
    };
    const bindingCheck = order => {
        const binding = order.paypalPayment;
        const invalidIdentity = !binding
            || !providerId(binding.orderId)
            || binding.merchantId !== merchantId
            || binding.environment !== environment
            || binding.currency !== currency
            || (binding.captureId !== undefined && !providerId(binding.captureId));
        if (invalidIdentity) {
            fail('binding_mismatch');
        }
        if (binding.amountMinor !== orderAmount(order) || order.paymentMethod !== 'Paypal') {
            fail('binding_mismatch');
        }
        return binding;
    };
    const evidenceCheck = binding => {
        return providerId(binding.captureId)
            && Number.isSafeInteger(binding.verifiedAt)
            && binding.verifiedAt > 0;
    };
    const activeOrderCheck = order => {
        const inactiveOrder = order.payment !== false
            || order.inventoryStatus !== 'reserved'
            || !activeStatuses.includes(order.status)
            || order.paidAt !== undefined || order.paypalPayment?.verifiedAt !== undefined
            || order.paypalPayment?.eventId !== undefined;
        if (inactiveOrder) {
            fail('order_requires_review');
        }
    };
    const orderFilter = order => ({
        _id: order._id,
        userId: order.userId,
        paymentMethod: 'Paypal',
        payment: false,
        status: order.status,
        inventoryStatus: 'reserved',
        amount: order.amount,
        paymentCurrency: order.paymentCurrency,
        paidAt: { $exists: false }
    });
    const bindOrder = protectedOperation(async ({ orderId, userId, paypalOrderId }) => {
        if (!objectId(orderId) || !objectId(userId) || !providerId(paypalOrderId)) {
            fail('invalid_identity', 400);
        }
        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) {
            fail('order_not_found', 404);
        }
        const amount = orderAmount(order);
        if (order.paypalPayment) {
            const binding = bindingCheck(order);
            if (binding.orderId !== paypalOrderId) {
                fail('binding_conflict');
            }
            return { bound: true, paypalOrderId };
        }
        const invalidOrder = order.paymentMethod !== 'Paypal'
            || order.status !== 'Order Placed'
            || typeof order.requestId !== 'string'
            || !/^[A-Za-z0-9-]{16,100}$/.test(order.requestId);
        if (invalidOrder) {
            fail('order_requires_review');
        }
        activeOrderCheck(order);
        const remote = await read(new paypal.orders.OrdersGetRequest(paypalOrderId));
        const unit = providerOrderCheck(remote, order, paypalOrderId, amount);
        if (!['CREATED', 'APPROVED', 'COMPLETED'].includes(remote.status)) {
            fail('provider_order_mismatch');
        }
        const captures = unit.payments?.captures ?? [];
        if (!Array.isArray(captures) || captures.length > 1 || (captures.length && !providerId(captures[0]?.id))) {
            fail('capture_mismatch');
        }
        const binding = { orderId: paypalOrderId, merchantId, environment, currency, amountMinor: amount };
        if (captures.length) {
            binding.captureId = captures[0].id;
        }
        await ensureIndexes();
        const updated = await orderModel.findOneAndUpdate(
            { ...orderFilter(order), paypalPayment: { $exists: false } },
            { $set: { paypalPayment: binding } },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) {
            fail('binding_conflict');
        }
        return { bound: true, paypalOrderId };
    });

    const settleOrder = async (order, notification) => {
        const binding = bindingCheck(order);
        if (notification && binding.captureId !== undefined && notification.captureId !== binding.captureId) {
            fail('capture_mismatch');
        }
        if (order.payment === true) {
            if (!evidenceCheck(binding) || order.paidAt !== binding.verifiedAt) {
                fail('order_requires_review');
            }
            return { paid: true, alreadyVerified: true };
        }
        activeOrderCheck(order);
        const remote = await read(new paypal.orders.OrdersGetRequest(binding.orderId));
        const unit = providerOrderCheck(remote, order, binding.orderId, binding.amountMinor);
        if (remote.status !== 'COMPLETED') {
            fail('not_settled');
        }
        const captures = unit.payments?.captures;
        if (!Array.isArray(captures) || captures.length !== 1 || !providerId(captures[0]?.id)) {
            fail('capture_mismatch');
        }
        const embedded = captures[0];
        if ((binding.captureId !== undefined && binding.captureId !== embedded.id)
            || (notification && notification.captureId !== embedded.id)) {
            fail('capture_mismatch');
        }
        amountCheck(embedded.amount, binding.amountMinor);
        if (embedded.status !== 'COMPLETED' || embedded.final_capture !== true) {
            fail('not_settled');
        }

        const capture = await read(new paypal.payments.CapturesGetRequest(embedded.id));
        const invalidCapture = capture.id !== embedded.id
            || capture.supplementary_data?.related_ids?.order_id !== binding.orderId
            || capture.supplementary_data?.related_ids?.authorization_id != null
            || capture.payee?.merchant_id !== merchantId
            || (capture.custom_id != null && capture.custom_id !== String(order._id));
        if (invalidCapture) {
            fail('capture_mismatch');
        }
        amountCheck(capture.amount, binding.amountMinor);
        if (capture.status !== 'COMPLETED' || capture.final_capture !== true) {
            fail('not_settled');
        }
        if (capture.seller_receivable_breakdown?.exchange_rate != null) {
            fail('unsupported_payment');
        }

        await ensureIndexes();
        const verifiedAt = Date.now();
        const filter = {
            ...orderFilter(order),
            'paypalPayment.orderId': binding.orderId,
            'paypalPayment.merchantId': merchantId,
            'paypalPayment.environment': environment,
            'paypalPayment.currency': currency,
            'paypalPayment.amountMinor': binding.amountMinor,
            'paypalPayment.captureId': binding.captureId ?? { $exists: false },
            'paypalPayment.verifiedAt': { $exists: false },
            'paypalPayment.eventId': { $exists: false }
        };
        const verifiedValues = {
            payment: true,
            paidAt: verifiedAt,
            'paypalPayment.captureId': capture.id,
            'paypalPayment.verifiedAt': verifiedAt
        };
        if (notification) {
            verifiedValues['paypalPayment.eventId'] = notification.eventId;
        }
        const updated = await orderModel.findOneAndUpdate(
            filter,
            { $set: verifiedValues },
            { returnDocument: 'after', runValidators: true }
        );
        if (!updated) {
            const current = await orderModel.findOne({ _id: order._id, userId: order.userId });
            const currentBinding = current && bindingCheck(current);
            const alreadyVerified = current?.payment === true
                && currentBinding.orderId === binding.orderId
                && currentBinding.captureId === capture.id
                && evidenceCheck(currentBinding)
                && current.paidAt === currentBinding.verifiedAt;
            if (alreadyVerified) {
                return { paid: true, alreadyVerified: true };
            }
            fail('order_changed');
        }
        return { paid: true, alreadyVerified: false };
    };
    const confirmPayment = protectedOperation(async ({ orderId, userId }) => {
        if (!objectId(orderId) || !objectId(userId)) {
            fail('invalid_identity', 400);
        }
        const order = await orderModel.findOne({ _id: orderId, userId });
        if (!order) {
            fail('order_not_found', 404);
        }
        return settleOrder(order);
    });

    // Authentication is inside the service: there is no callable unsigned event settlement method.
    const processWebhook = protectedOperation(async ({ rawBody, headers }) => {
        if (!webhookId) {
            fail('webhook_unavailable', 503);
        }
        if (!Buffer.isBuffer(rawBody) || !rawBody.length || rawBody.length > 256 * 1024) {
            fail('invalid_event', 400);
        }

        const rawEvent = Buffer.from(rawBody);
        let event;
        try {
            event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawEvent));
        } catch {
            fail('invalid_event', 400);
        }
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            fail('invalid_event', 400);
        }

        const body = { webhook_id: webhookId };
        for (const [field, max] of [['auth_algo', 100], ['cert_url', 500], ['transmission_id', 50], ['transmission_sig', 500], ['transmission_time', 100]]) {
            const value = headers?.['paypal-' + field.replaceAll('_', '-')];
            if (typeof value !== 'string' || !value.length || value.length > max || /[\r\n]/.test(value)) {
                fail('invalid_signature', 400);
            }
            body[field] = value;
        }

        let certificate;
        try {
            certificate = new URL(body.cert_url);
        } catch {
            fail('invalid_signature', 400);
        }
        const invalidCertificate = !Object.values(apiHosts).flat().includes(certificate.origin)
            || certificate.username
            || certificate.password
            || certificate.search
            || certificate.hash
            || !certificate.pathname.startsWith('/v1/notifications/certs/');
        const invalidTransmission = !/^[A-Za-z0-9]+$/.test(body.auth_algo)
            || !Number.isFinite(Date.parse(body.transmission_time));
        if (invalidCertificate || invalidTransmission) {
            fail('invalid_signature', 400);
        }

        const postback = Buffer.concat([
            Buffer.from(JSON.stringify(body).slice(0, -1) + ',"webhook_event":'),
            rawEvent,
            Buffer.from('}')
        ]);
        const verified = await read({
            path: signaturePath,
            verb: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: postback
        });
        if (verified.verification_status !== 'SUCCESS') {
            fail('invalid_signature', 400);
        }

        const unsupportedEvent = !eventIdCheck(event.id)
            || event.event_type !== 'PAYMENT.CAPTURE.COMPLETED'
            || event.resource_type !== 'capture'
            || event.resource_version !== '2.0'
            || !providerId(event.resource?.id)
            || !providerId(event.resource?.supplementary_data?.related_ids?.order_id);
        if (unsupportedEvent) {
            fail('unsupported_event', 400);
        }
        const resource = event.resource;
        if (resource.status !== 'COMPLETED' || resource.final_capture !== true || resource.payee?.merchant_id !== merchantId) {
            fail('capture_mismatch');
        }
        const order = await orderModel.findOne({
            'paypalPayment.orderId': resource.supplementary_data.related_ids.order_id,
            'paypalPayment.merchantId': merchantId,
            'paypalPayment.environment': environment
        });
        if (!order) {
            fail('unbound_order');
        }
        amountCheck(resource.amount, bindingCheck(order).amountMinor);
        return settleOrder(order, { captureId: resource.id, eventId: event.id });
    });
    return { bindOrder, confirmPayment, processWebhook };
};
