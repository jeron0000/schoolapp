import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';
import { allowedOrigins } from '../config/localApiSecurity.js';
import { createStripePaymentVerifier, stripeMinorUnits } from './stripePayment.js';
import { createPayPalPaymentVerifier, PayPalVerificationClient, paypalMinorUnits } from './paypalPayment.js';

const unavailable = message => Object.assign(new Error(message), { status: 503 });

// Existing credentials enable only provider test environments. Live mode is never supported here.
export const testPaymentOptions = (env = process.env) => {
    const enabled = !env.PAMO_PAYMENT_MODE || env.PAMO_PAYMENT_MODE === 'test';
    return {
        stripe: enabled && /^sk_test_\S+$/.test(env.STRIPE_SECRET_KEY || ''),
        paypal: enabled && Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET)
            && (!env.PAYPAL_ENVIRONMENT || env.PAYPAL_ENVIRONMENT === 'sandbox')
    };
};

export const paymentReturnOrigin = (origin, env = process.env) => {
    if (!allowedOrigins(env).includes(origin)) {
        throw Object.assign(new Error('Open checkout from the configured PAMO Storefront.'), { status: 400 });
    }
    return origin;
};

export const testPaymentClient = method => {
    if (!testPaymentOptions()[method]) throw unavailable('This test payment method is not configured. Use Pay as you claim.');
    if (method === 'stripe') return new Stripe(process.env.STRIPE_SECRET_KEY);
    return new PayPalVerificationClient(new paypal.core.SandboxEnvironment(
        process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_SECRET
    ));
};

const stripeVerifier = async stripe => {
    const account = await stripe.accounts.retrieve();
    return createStripePaymentVerifier({ stripe, accountId: account.id, livemode: false, currency: 'php' });
};

const paypalVerifier = (client, merchantId) => createPayPalPaymentVerifier({
    client, merchantId, environment: 'sandbox', currency: 'PHP'
});

export const openTestPayment = async (order, method, origin, client = testPaymentClient(method)) => {
    const orderId = String(order._id);
    const metadata = { orderId, userId: order.userId };
    const returnUrl = `${origin}/verify?orderId=${orderId}&method=${method}`;
    if (method === 'stripe') {
        const verifier = await stripeVerifier(client);
        let session;
        if (order.stripePayment) {
            session = await client.checkout.sessions.retrieve(order.stripePayment.sessionId);
        } else {
            session = await client.checkout.sessions.create({
                mode: 'payment', payment_method_types: ['card'],
                client_reference_id: orderId, metadata,
                payment_intent_data: { metadata },
                line_items: [{ quantity: 1, price_data: {
                    currency: 'php', unit_amount: stripeMinorUnits(order.amount),
                    product_data: { name: 'PAMO campus order (TEST)' }
                } }],
                success_url: returnUrl, cancel_url: returnUrl + '&cancelled=true'
            }, { idempotencyKey: 'checkout-' + orderId });
        }
        await verifier.bindSession({ orderId, userId: order.userId, sessionId: session.id });
        if (session.livemode !== false) throw unavailable('Live Stripe sessions are not permitted.');
        if (session.status === 'complete') return returnUrl;
        if (session.status !== 'open' || !session.url?.startsWith('https://checkout.stripe.com/')) {
            throw unavailable('This test payment session is unavailable. Check My Orders before retrying.');
        }
        return session.url;
    }
    let remote;
    if (order.paypalPayment) {
        remote = (await client.execute(new paypal.orders.OrdersGetRequest(order.paypalPayment.orderId))).result;
    } else {
        const request = new paypal.orders.OrdersCreateRequest();
        request.headers['PayPal-Request-Id'] = 'checkout-' + orderId;
        request.prefer('return=representation');
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{ reference_id: orderId, custom_id: orderId,
                amount: { currency_code: 'PHP', value: (paypalMinorUnits(order.amount) / 100).toFixed(2) } }],
            application_context: { return_url: returnUrl, cancel_url: returnUrl + '&cancelled=true' }
        });
        remote = (await client.execute(request)).result;
    }
    // Read merchant identity from the authenticated sandbox API, never the browser.
    const saved = (await client.execute(new paypal.orders.OrdersGetRequest(remote.id))).result;
    const merchantId = process.env.PAYPAL_MERCHANT_ID || saved.purchase_units?.[0]?.payee?.merchant_id;
    await paypalVerifier(client, merchantId).bindOrder({ orderId, userId: order.userId, paypalOrderId: remote.id });
    if (saved.status === 'COMPLETED') return returnUrl;
    const approval = saved.links?.find(link => link.rel === 'approve')?.href;
    if (!approval || new URL(approval).origin !== 'https://www.sandbox.paypal.com') {
        throw unavailable('PayPal sandbox approval is unavailable. Check My Orders before retrying.');
    }
    return approval;
};

export const confirmTestPayment = async (order, method, { cancelled = false } = {}, client = testPaymentClient(method)) => {
    const identity = { orderId: String(order._id), userId: order.userId };
    if (method === 'stripe') {
        if (order.stripePayment?.livemode !== false) throw unavailable('A bound Stripe test session is required.');
        return (await stripeVerifier(client)).confirmPayment(identity);
    }
    const binding = order.paypalPayment;
    if (binding?.environment !== 'sandbox') throw unavailable('A bound PayPal sandbox order is required.');
    if (!order.payment && !cancelled) {
        if (order.payment !== false || order.inventoryStatus !== 'reserved' || order.refund
            || order.paidAt !== undefined || binding.verifiedAt !== undefined
            || order.cancellationRequest?.status === 'pending'
            || !['Order Placed', 'Approved', 'Packing', 'Sent to Cashier', 'Shipped'].includes(order.status)) {
            throw unavailable('This order requires PAMO review before payment.');
        }
        const remote = (await client.execute(new paypal.orders.OrdersGetRequest(binding.orderId))).result;
        const unit = remote.purchase_units?.[0];
        if (remote.id !== binding.orderId || remote.intent !== 'CAPTURE' || remote.purchase_units?.length !== 1
            || unit.reference_id !== identity.orderId || unit.custom_id !== identity.orderId
            || unit.payee?.merchant_id !== binding.merchantId || unit.amount?.currency_code !== 'PHP'
            || unit.amount.value !== (binding.amountMinor / 100).toFixed(2)
            || binding.amountMinor !== paypalMinorUnits(order.amount)) {
            throw unavailable('PayPal sandbox order does not match the saved checkout.');
        }
        if (remote.status === 'APPROVED') {
            const capture = new paypal.orders.OrdersCaptureRequest(binding.orderId);
            capture.headers['PayPal-Request-Id'] = 'capture-' + String(order._id);
            capture.requestBody({});
            try {
                await client.execute(capture);
            } catch {
                // A timeout or concurrent callback may have captured it. Only authoritative reads can settle it.
            }
        }
    }
    return paypalVerifier(client, binding.merchantId).confirmPayment(identity);
};
