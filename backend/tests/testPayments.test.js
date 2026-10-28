import test from 'node:test';
import assert from 'node:assert/strict';
import orderModel from '../models/orderModel.js';
import { PayPalVerificationClient } from '../utils/paypalPayment.js';
import paypal from '@paypal/checkout-server-sdk';
import { testPaymentOptions, paymentReturnOrigin, openTestPayment, confirmTestPayment } from '../utils/testPayments.js';
import { clearCheckoutCart } from '../utils/checkoutCart.js';
import userModel from '../models/userModel.js';

const orderId = '0123456789abcdef01234567';
const userId = '1123456789abcdef01234567';
const productId = '2123456789abcdef01234567';
const fixture = method => ({ _id: orderId, userId, paymentMethod: method, paymentCurrency: 'PHP',
    amount: 235, payment: false, status: 'Order Placed', inventoryStatus: 'reserved',
    requestId: 'test-checkout-000001', items: [{ _id: productId, size: 'M', price: 225, quantity: 1 }] });
const field = (record, key) => key.split('.').reduce((value, part) => value?.[part], record);
const harness = (t, method) => {
    const order = fixture(method);
    let writes = 0;
    t.mock.method(orderModel.collection, 'createIndex', async () => {});
    t.mock.method(orderModel, 'findOne', async () => structuredClone(order));
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update) => {
        for (const [key, expected] of Object.entries(filter)) {
            const value = field(order, key);
            if (expected && typeof expected === 'object' && '$exists' in expected) {
                if ((value !== undefined) !== expected.$exists) return null;
            } else if (value !== expected) return null;
        }
        for (const [key, value] of Object.entries(update.$set)) {
            const path = key.split('.');
            const last = path.pop();
            const parent = path.reduce((record, part) => record[part] ||= {}, order);
            parent[last] = structuredClone(value);
        }
        writes++;
        return structuredClone(order);
    });
    return { order, writes: () => writes };
};

test('only existing test credentials enable providers; disabled/demo/live configurations stay blocked', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_test_synthetic', PAYPAL_CLIENT_ID: 'synthetic', PAYPAL_SECRET: 'synthetic' };
    assert.deepEqual(testPaymentOptions(env), { stripe: true, paypal: true });
    for (const mode of ['disabled', 'demo', 'live', 'production']) {
        assert.deepEqual(testPaymentOptions({ ...env, PAMO_PAYMENT_MODE: mode }), { stripe: false, paypal: false });
    }
    assert.deepEqual(testPaymentOptions({ ...env, STRIPE_SECRET_KEY: 'sk_live_synthetic', PAYPAL_ENVIRONMENT: 'live' }),
        { stripe: false, paypal: false });
    assert.equal(paymentReturnOrigin('http://localhost:5173', {}), 'http://localhost:5173');
    assert.throws(() => paymentReturnOrigin('https://attacker.example', {}));
});

test('Stripe opens canonical PHP test sessions and concurrent confirmations settle once without inventory writes', async t => {
    const h = harness(t, 'Stripe');
    const metadata = { orderId, userId };
    const session = { object: 'checkout.session', id: 'cs_test_SYNTHETIC', livemode: false,
        mode: 'payment', status: 'open', payment_status: 'unpaid', currency: 'php', amount_total: 23500,
        client_reference_id: orderId, metadata, payment_method_types: ['card'],
        url: 'https://checkout.stripe.com/test/synthetic' };
    const charge = { object: 'charge', id: 'ch_SYNTHETIC', payment_intent: 'pi_SYNTHETIC', livemode: false,
        currency: 'php', amount: 23500, amount_captured: 23500, status: 'succeeded', paid: true,
        captured: true, refunded: false, amount_refunded: 0, disputed: false, payment_method_details: { type: 'card' } };
    const client = { accounts: { retrieve: async () => ({ object: 'account', id: 'acct_SYNTHETIC' }) },
        checkout: { sessions: {
            create: async (payload, options) => {
                assert.equal(payload.line_items[0].price_data.unit_amount, 23500);
                assert.deepEqual(payload.payment_intent_data.metadata, metadata);
                assert.equal(options.idempotencyKey, 'checkout-' + orderId);
                return session;
            }, retrieve: async () => session
        } }, paymentIntents: { retrieve: async () => ({ object: 'payment_intent', id: 'pi_SYNTHETIC', livemode: false,
            metadata, currency: 'php', amount: 23500, amount_received: 23500, status: 'succeeded', latest_charge: charge }) } };
    assert.equal(await openTestPayment(h.order, 'stripe', 'http://localhost:5173', client), session.url);
    await assert.rejects(confirmTestPayment(h.order, 'stripe', {}, client), { code: 'not_settled' });
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_SYNTHETIC' });
    const results = await Promise.all([confirmTestPayment(h.order, 'stripe', {}, client), confirmTestPayment(h.order, 'stripe', {}, client)]);
    assert.ok(results.every(result => result.paid));
    assert.equal(h.writes(), 2); // One binding and one authoritative payment update.
    assert.equal(h.order.stripePayment.livemode, false);
    assert.equal(h.order.inventoryStatus, 'reserved');
    assert.equal(h.order.receiptNumber, undefined);
});

test('PayPal sandbox create/capture uses original order identity and repeated callbacks preserve evidence', async t => {
    const h = harness(t, 'Paypal');
    const unit = { reference_id: orderId, custom_id: orderId, payee: { merchant_id: 'SYNTHETICMERCHANT' },
        amount: { currency_code: 'PHP', value: '235.00' } };
    const capture = { id: 'SYNTHETICCAPTURE', status: 'COMPLETED', final_capture: true, amount: unit.amount,
        payee: unit.payee, custom_id: orderId, supplementary_data: { related_ids: { order_id: 'SYNTHETICORDER' } } };
    const remote = { id: 'SYNTHETICORDER', status: 'CREATED', intent: 'CAPTURE', purchase_units: [unit],
        links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETICORDER' }] };
    const client = new PayPalVerificationClient(new paypal.core.SandboxEnvironment('synthetic', 'synthetic'));
    let captures = 0;
    t.mock.method(client, 'execute', async request => {
        if (request.path.includes('/captures/')) return { statusCode: 200, result: capture };
        if (request.path.includes('/capture')) {
            assert.equal(request.headers['PayPal-Request-Id'], 'capture-' + orderId);
            captures++;
            remote.status = 'COMPLETED';
            unit.payments = { captures: [capture] };
            return { statusCode: 201, result: remote };
        }
        if (request.verb === 'POST') {
            assert.equal(request.body.purchase_units[0].amount.value, '235.00');
            assert.equal(request.body.purchase_units[0].custom_id, orderId);
            assert.equal(request.headers['PayPal-Request-Id'], 'checkout-' + orderId);
        }
        return { statusCode: request.verb === 'POST' ? 201 : 200, result: remote };
    });
    assert.equal(await openTestPayment(h.order, 'paypal', 'http://localhost:5173', client), remote.links[0].href);
    remote.status = 'APPROVED';
    await assert.rejects(confirmTestPayment(h.order, 'paypal', { cancelled: true }, client), { code: 'not_settled' });
    assert.equal(captures, 0);
    unit.custom_id = productId;
    await assert.rejects(confirmTestPayment(h.order, 'paypal', {}, client));
    assert.equal(captures, 0);
    unit.custom_id = orderId;
    await confirmTestPayment(h.order, 'paypal', {}, client);
    await confirmTestPayment(h.order, 'paypal', {}, client);
    assert.equal(captures, 1);
    assert.equal(h.writes(), 2);
    assert.equal(h.order.paypalPayment.environment, 'sandbox');
    assert.equal(h.order.inventoryStatus, 'reserved');
    assert.equal(h.order.receiptNumber, undefined);
});

test('verified provider cleanup removes only the purchased variant using its saved revision', async t => {
    const order = { ...fixture('Stripe'), payment: true, paidAt: 123,
        stripePayment: { verifiedAt: 123, chargeId: 'ch_SYNTHETIC' },
        checkoutCart: { cartData: { [productId]: { M: 1 } }, cartVersions: { [productId]: { M: 2 } } } };
    t.mock.method(userModel, 'findById', () => ({ select() { return this; }, lean: async () => order.checkoutCart }));
    const update = t.mock.method(userModel, 'updateOne', async (filter, changes) => {
        assert.equal(filter._id, userId);
        assert.ok(JSON.stringify(filter).includes('cartVersions.' + productId + '.M'));
        assert.deepEqual(Object.keys(changes.$unset), ['cartData.' + productId + '.M']);
        return { modifiedCount: 1 };
    });
    await clearCheckoutCart(order, userId);
    assert.equal(update.mock.callCount(), 1);
    await assert.rejects(clearCheckoutCart({ ...order, payment: false }, userId));
});
