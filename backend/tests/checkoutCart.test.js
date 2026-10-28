import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { connectTestDatabase } from './helpers/database.js';
import userModel from '../models/userModel.js';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import categoryModel from '../models/categoryModel.js';
import orderRouter from '../routes/orderRoute.js';
import { issueAuthToken } from '../utils/authTokens.js';
import { placeOrder, placeOrderPaypal, verifyPaypal } from '../controllers/orderController.js';
import { PayPalVerificationClient } from '../utils/paypalPayment.js';
import { prepareCheckoutCart, clearCheckoutCart } from '../utils/checkoutCart.js';
import { getCartSnapshot, mutateCart } from '../utils/cart.js';

const userId = '1123456789abcdef01234567';
const id = '0123456789abcdef01234567';
const otherId = '2123456789abcdef01234567';
const items = [{ _id: id, size: 'M', quantity: 1, price: 1 }];
const snapshot = (cartData = { [id]: { M: 1 } }, cartVersions = { [id]: { M: 2 } }) => ({ cartData, cartVersions });
const request = overrides => ({ userId, items, amount: 1, requestId: randomUUID(), checkoutCart: snapshot(), ...overrides });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; } });
const invoke = async body => { const res = response(); await placeOrder({ body }, res); return res; };
const call = async body => (await invoke(body)).body;
const field = (object, path) => path.split('.').reduce((value, key) => value && Object.hasOwn(value, key) ? value[key] : undefined, object);
const matches = (object, filter) => Object.entries(filter).every(([path, expected]) => {
    if (path === '$and') return expected.every(clause => matches(object, clause));
    if (path === '$or') return expected.some(clause => matches(object, clause));
    const actual = field(object, path);
    if (expected && typeof expected === 'object') return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$type') return value === 'object' && actual !== null && typeof actual === 'object' && !Array.isArray(actual);
        assert.fail('Unexpected synthetic query operator: ' + operator);
    });
    return actual === expected;
});

test('order schema preserves historical addresses and requires authenticated pickup details for new orders', async () => {
    const common = { userId, items, amount: 235, paymentMethod: 'COD', payment: false, date: Date.now() };
    const historical = new orderModel({
        ...common,
        address: { firstName: 'Historical', lastName: 'Student' }
    });
    const pickup = new orderModel({
        ...common,
        student: { name: 'Synthetic Student', email: 'student@example.test', academicProgram: 'BSIT' },
        fulfillmentMethod: 'campus_pickup'
    });
    const incomplete = new orderModel(common);

    await assert.doesNotReject(historical.validate());
    await assert.doesNotReject(pickup.validate());
    await assert.rejects(incomplete.validate(), /Path `address` is required|Path `student` is required/);
});

const harness = t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    const state = {
        user: {
            _id: userId,
            name: 'Synthetic Student',
            email: 'student@example.test',
            academicProgram: 'BSIT',
            role: 'customer',
            ...snapshot()
        },
        orders: [],
        stock: 10,
        beforeClear: null,
        writes: 0
    };
    t.mock.method(userModel, 'findById', owner => ({ select() { return this; }, lean: async () => owner === userId ? structuredClone(state.user) : null }));
    t.mock.method(userModel, 'findByIdAndUpdate', () => assert.fail('Whole-cart replacement is prohibited'));
    t.mock.method(userModel, 'updateOne', async (filter, update) => {
        state.beforeClear?.();
        if (!matches(state.user, filter)) return { modifiedCount: 0 };
        assert.deepEqual(Object.keys(update).sort(), ['$inc', '$unset']);
        for (const [operator, changes] of Object.entries(update)) for (const [path, value] of Object.entries(changes)) {
            assert.match(path, /^cart(Data|Versions)\.[a-f\d]{24}\.[A-Za-z0-9 _-]+$/i);
            const keys = path.split('.'), key = keys.pop();
            let parent = state.user;
            for (const part of keys) parent = parent[part] ||= {};
            if (operator === '$unset') delete parent[key];
            else parent[key] = (parent[key] || 0) + value;
        }
        state.writes++;
        return { modifiedCount: 1 };
    });
    t.mock.method(orderModel, 'init', async () => {});
    t.mock.method(orderModel, 'findOne', key => {
        const query = { session() { return this; }, then(resolve, reject) { return Promise.resolve(state.orders.find(order => matches(order, key)) || null).then(resolve, reject); } };
        return query;
    });
    t.mock.method(mongoose.connection, 'transaction', async work => work({}));
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }));
    t.mock.method(productModel, 'findById', () => ({ session() { return this; }, lean: async () => ({ name: 'Synthetic uniform', price: 225, image: [], sizes: ['M'], inventory: { M: state.stock } }) }));
    t.mock.method(productModel, 'updateOne', async (_filter, update) => {
        const quantity = -update.$inc['inventory.M'];
        if (state.stock < quantity) return { modifiedCount: 0 };
        state.stock -= quantity;
        return { modifiedCount: 1 };
    });
    t.mock.method(orderModel, 'create', async ([data]) => {
        const order = { _id: otherId, status: 'Order Placed', ...structuredClone(data) };
        state.orders.push(order);
        return [order];
    });
    t.mock.method(console, 'log', () => {});
    return state;
};

test('sandbox checkout reserves canonical selected items once and verified capture preserves unselected cart entries', async t => {
    const keys = ['PAMO_PAYMENT_MODE', 'PAYPAL_CLIENT_ID', 'PAYPAL_SECRET', 'PAYPAL_ENVIRONMENT', 'PAYPAL_MERCHANT_ID'];
    const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    t.after(() => {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    });
    Object.assign(process.env, { PAMO_PAYMENT_MODE: 'test', PAYPAL_CLIENT_ID: 'synthetic',
        PAYPAL_SECRET: 'synthetic', PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_MERCHANT_ID: 'SYNTHETICMERCHANT' });
    const h = harness(t);
    h.user.cartData[otherId] = { L: 3 };
    const body = request();
    const unit = { reference_id: otherId, custom_id: otherId, payee: { merchant_id: 'SYNTHETICMERCHANT' },
        amount: { currency_code: 'PHP', value: '235.00' } };
    const remote = { id: 'SYNTHETICORDER', status: 'CREATED', intent: 'CAPTURE', purchase_units: [unit],
        links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=SYNTHETICORDER' }] };
    const capture = { id: 'SYNTHETICCAPTURE', status: 'COMPLETED', final_capture: true,
        amount: unit.amount, payee: unit.payee, custom_id: otherId,
        supplementary_data: { related_ids: { order_id: remote.id } } };
    let captures = 0;
    t.mock.method(PayPalVerificationClient.prototype, 'execute', async request => {
        if (request.path.includes('/captures/')) return { statusCode: 200, result: capture };
        if (request.path.includes('/capture')) {
            captures++;
            remote.status = 'COMPLETED';
            unit.payments = { captures: [capture] };
        } else if (request.verb === 'POST') {
            assert.equal(request.body.purchase_units[0].amount.value, '235.00');
        }
        return { statusCode: request.verb === 'POST' ? 201 : 200, result: remote };
    });
    t.mock.method(orderModel.collection, 'createIndex', async () => {});
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update) => {
        const order = h.orders.find(order => matches(order, filter));
        if (!order) return null;
        for (const [key, value] of Object.entries(update.$set)) {
            const parts = key.split('.');
            const last = parts.pop();
            const parent = parts.reduce((value, part) => value[part] ||= {}, order);
            parent[last] = value;
        }
        return order;
    });
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = response();
        await placeOrderPaypal({ body, headers: { origin: 'http://localhost:5173' } }, res);
        assert.equal(res.body.success, true, JSON.stringify(res.body));
        assert.equal(res.body.session_url, remote.links[0].href);
    }
    assert.equal(h.orders.length, 1);
    assert.equal(h.stock, 9);
    assert.equal(h.writes, 0);
    const cancelled = response();
    await verifyPaypal({ body: { userId, orderId: otherId, cancelled: true } }, cancelled);
    assert.equal(cancelled.body.success, false);
    assert.equal(h.stock, 9);
    assert.equal(h.writes, 0);
    remote.status = 'APPROVED';
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = response();
        await verifyPaypal({ body: { userId, orderId: otherId, success: 'true', amount: 1 } }, res);
        assert.equal(res.body.success, true, JSON.stringify(res.body));
    }
    assert.equal(captures, 1);
    assert.equal(h.stock, 9);
    assert.equal(h.orders[0].amount, 235);
    assert.equal(h.orders[0].payment, true);
    assert.deepEqual(h.user.cartData, { [id]: {}, [otherId]: { L: 3 } });
    assert.equal(h.orders[0].receiptNumber, undefined);
});

test('single-device COD uses canonical prices, reserves once and clears only checkout-covered entries', async t => {
    const h = harness(t), body = request();
    h.user.cartData[otherId] = { L: 3 };
    const placed = await call(body);
    assert.equal(placed.success, true);
    assert.equal(placed.cartCleanupPending, false);
    assert.equal(h.orders[0].amount, 235);
    assert.equal(h.orders[0].payment, false);
    assert.equal(h.orders[0].inventoryStatus, 'reserved');
    assert.equal(h.stock, 9);
    assert.deepEqual(await getCartSnapshot(userId), snapshot({ [id]: {}, [otherId]: { L: 3 } }, { [id]: { M: 3 } }));
    assert.equal((await call(body)).orderId, placed.orderId);
    assert.equal(h.orders.length, 1);
    assert.equal(h.stock, 9);
    assert.equal(h.writes, 1);
});

test('checkout snapshots the server color and retains its product ID through retries and renaming', async t => {
    const h = harness(t);
    t.mock.method(productModel, 'findById', () => ({ session() { return this; }, lean: async () => ({
        name: 'Green Washday', optionLabel: 'Department Shirt', colorLabel: 'Green', price: 225, image: [], sizes: ['M'], inventory: { M: h.stock }
    }) }));
    const body = request({ items: [{ ...items[0], optionLabel: 'Forged Item', colorLabel: 'Forged Red', variantGroupId: otherId }] });
    const placed = await call(body);
    assert.equal(placed.success, true);
    assert.equal(h.orders[0].items[0]._id, id);
    assert.equal(h.orders[0].items[0].colorLabel, 'Green');
    assert.equal(h.orders[0].items[0].optionLabel, 'Department Shirt');
    t.mock.method(productModel, 'findById', () => assert.fail('Idempotent retries use the saved snapshot'));
    assert.equal((await call(body)).orderId, placed.orderId);
    assert.equal(h.orders[0].items[0].colorLabel, 'Green');
    assert.equal(h.orders[0].items[0].optionLabel, 'Department Shirt');
    assert.equal(h.stock, 9);
});

test('selective checkout validates the chosen subset and preserves unselected cart entries', async t => {
    const h = harness(t);
    h.user.cartData[otherId] = { L: 3 };
    h.user.cartVersions[otherId] = { L: 7 };
    const checkoutCart = snapshot(h.user.cartData, h.user.cartVersions);

    assert.deepEqual(prepareCheckoutCart(checkoutCart, items), snapshot(
        { [id]: { M: 1 } },
        { [id]: { M: 2 } }
    ));

    const placed = await call(request({ checkoutCart }));
    assert.equal(placed.success, true);
    assert.deepEqual(h.user.cartData, { [id]: {}, [otherId]: { L: 3 } });
    assert.deepEqual(h.user.cartVersions, { [id]: { M: 3 }, [otherId]: { L: 7 } });
    assert.equal(h.stock, 9);
});

test('stale checkout prices are rejected before inventory or order writes', async t => {
    const h = harness(t);
    const result = await invoke(request({
        pricingQuote: [{ _id: id, size: 'M', price: 224 }]
    }));

    assert.equal(result.code, 409);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, 'STALE_PRODUCT_PRICE');
    assert.match(result.body.message, /prices changed/i);
    assert.equal(h.stock, 10);
    assert.equal(h.orders.length, 0);
    assert.equal(h.writes, 0);
});

test('checkout snapshots authenticated student identity and ignores client identity fields', async t => {
    const h = harness(t);
    const placed = await invoke(request({
        address: { firstName: 'Forged', email: 'forged@example.test' },
        student: { name: 'Forged Student', academicProgram: 'BSHM' }
    }));
    assert.equal(placed.code, 200);
    assert.equal(placed.body.success, true);
    assert.equal(h.stock, 9);
    assert.equal(h.orders.length, 1);
    assert.deepEqual(h.orders[0].student, {
        name: 'Synthetic Student',
        email: 'student@example.test',
        academicProgram: 'BSIT'
    });
    assert.equal(h.orders[0].fulfillmentMethod, 'campus_pickup');
    assert.equal(h.orders[0].address, undefined);
});

test('checkout rejects an incomplete student profile before reserving stock', async t => {
    const h = harness(t);
    delete h.user.academicProgram;

    const result = await invoke(request());

    assert.equal(result.code, 409);
    assert.equal(result.body.code, 'PROFILE_INCOMPLETE');
    assert.match(result.body.message, /academic program/i);
    assert.equal(h.stock, 10);
    assert.equal(h.orders.length, 0);
    assert.equal(h.writes, 0);
});

test('checkout accepts existing students in renamed or archived managed programs without changing codes', async t => {
    const h = harness(t);
    h.user.academicProgram = 'digital-arts';
    t.mock.method(categoryModel, 'findOne', filter => {
        assert.deepEqual(filter, { code: 'digital-arts', scope: 'program' });
        return { select() { return this; }, lean: async () => ({ active: false, name: 'Creative Arts' }) };
    });
    const result = await invoke(request());
    assert.equal(result.body.success, true);
    assert.equal(h.orders[0].student.academicProgram, 'digital-arts');
    const order = new orderModel(h.orders[0]);
    await assert.doesNotReject(order.validate());
    assert.equal(h.stock, 9);
});

test('checkout rejects unknown, merchandise and removed programs before stock or order writes', async t => {
    const h = harness(t);
    for (const [program, managed] of [['school-supplies', null], ['missing-program', null], ['EXTRA', { active: true }], ['removed-program', { active: false, removed: true }]]) {
        h.user.academicProgram = program;
        t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => managed }));
        const result = await invoke(request());
        assert.equal(result.code, 409);
        assert.equal(result.body.code, 'PROFILE_INCOMPLETE');
    }
    assert.equal(h.stock, 10);
    assert.equal(h.orders.length, 0);
});

test('same-entry additions, quantity changes, same-quantity newer revisions and ABA preserve the changed entry', async t => {
    for (const [quantity, version] of [[2, 3], [4, 3], [1, 3], [1, 4], [1, 1]]) await t.test(quantity + '/' + version, async t => {
        const h = harness(t);
        h.beforeClear = () => {
            h.user.cartData[id].M = quantity;
            h.user.cartVersions[id].M = version;
            h.user.cartData[otherId] = { L: 2 };
        };
        assert.equal((await call(request())).success, true);
        assert.equal(h.writes, 0);
        assert.deepEqual((await getCartSnapshot(userId)).cartData, { [id]: { M: quantity }, [otherId]: { L: 2 } });
        assert.equal(h.stock, 9);
    });
});

test('independent size updates and additions during cleanup survive; retries use first-order evidence', async t => {
    const h = harness(t), body = request();
    h.beforeClear = () => { h.user.cartData[id].L = 4; h.user.cartData[otherId] = { M: 2 }; };
    await call(body);
    h.beforeClear = null;
    h.user.cartData[id].M = 1;
    h.user.cartVersions[id].M = 4;
    assert.equal((await call({ ...body, checkoutCart: snapshot(h.user.cartData, h.user.cartVersions), items: body.items })).success, true);
    // An otherwise valid retry with newer evidence still cannot consume a re-added entry.
    assert.equal((await call({ ...body, checkoutCart: snapshot({ [id]: { M: 1 } }, { [id]: { M: 4 } }) })).success, true);
    assert.deepEqual(h.user.cartData, { [id]: { L: 4, M: 1 }, [otherId]: { M: 2 } });
    assert.equal(h.writes, 1);
    assert.equal(h.stock, 9);
});

test('simultaneous repeated cleanup is at most once; missing historical revisions safely become tombstones', async t => {
    const h = harness(t);
    h.user.cartVersions = {};
    const order = { userId, items, paymentMethod: 'COD', checkoutCart: snapshot(undefined, {}) };
    await Promise.all(Array.from({ length: 10 }, () => clearCheckoutCart(order, userId)));
    assert.equal(h.writes, 1);
    assert.equal(h.user.cartVersions[id].M, 1);
    assert.equal(h.stock, 10);
});

test('partial cleanup retries skip completed entries and preserve additions made between attempts', async t => {
    const h = harness(t);
    h.user.cartData[otherId] = { M: 2 };
    h.user.cartVersions[otherId] = { M: 5 };
    const order = { userId, paymentMethod: 'COD', items: [...items, { _id: otherId, size: 'M', quantity: 2 }],
        checkoutCart: structuredClone(snapshot(h.user.cartData, h.user.cartVersions)) };
    const original = userModel.updateOne.bind(userModel);
    let attempts = 0;
    const failure = t.mock.method(userModel, 'updateOne', async (...args) => {
        if (++attempts === 2) throw new Error('Synthetic second-entry failure');
        return original(...args);
    });
    await assert.rejects(clearCheckoutCart(order, userId), /second-entry/);
    assert.equal(h.user.cartData[id].M, undefined);
    h.user.cartData[id].M = 1;
    h.user.cartVersions[id].M = 4;
    failure.mock.restore();
    await clearCheckoutCart(order, userId);
    assert.equal(h.user.cartData[id].M, 1);
    assert.equal(h.user.cartData[otherId].M, undefined);
    assert.equal(h.user.cartVersions[otherId].M, 6);
    assert.equal(h.writes, 2);
    assert.equal(h.stock, 10);
});

test('failed checkout does not clear; committed checkout cleanup failure is reported as successful with a warning', async t => {
    const h = harness(t), body = request();
    h.stock = 0;
    assert.equal((await call(body)).success, false);
    assert.deepEqual(h.user.cartData, snapshot().cartData);
    assert.equal(h.orders.length, 0);
    h.stock = 10;
    const write = t.mock.method(userModel, 'updateOne', () => { throw new Error('synthetic-private-db-error'); });
    const placed = await call(body);
    assert.equal(placed.success, true);
    assert.equal(placed.cartCleanupPending, true);
    assert.doesNotMatch(JSON.stringify(placed), /private-db-error/);
    assert.equal(h.orders.length, 1);
    assert.equal(h.stock, 9);
    write.mock.restore();
    assert.equal((await call(body)).cartCleanupPending, false);
    assert.equal(h.writes, 1);
    assert.equal(h.stock, 9);
});

test('legacy clients/orders clear nothing; malformed, unrelated or duplicate-alias evidence fails before any reservation', async t => {
    const h = harness(t);
    const bad = [null, [], { cartData: {}, cartVersions: {} }, { ...snapshot(), extra: 1 },
        snapshot({ [otherId]: { M: 1 } }), snapshot(undefined, { [id]: { M: -1 } }),
        snapshot(JSON.parse('{"__proto__":{"M":1}}')),
        snapshot({ [id]: { M: 1 }, [id.toUpperCase()]: { M: 1 } })];
    for (const checkoutCart of bad) assert.equal((await call(request({ checkoutCart }))).success, false);
    assert.equal(h.orders.length, 0);
    assert.equal(h.stock, 10);
    assert.equal((await call(request({ checkoutCart: undefined }))).success, true);
    assert.deepEqual(h.user.cartData, snapshot().cartData);
    assert.equal(h.writes, 0);
    await clearCheckoutCart({ userId, paymentMethod: 'COD', items }, userId);
    assert.equal(prepareCheckoutCart(undefined, items), undefined);
});

test('cleanup rejects wrong owners/providers, preserves corrupt carts and cannot overflow revisions', async t => {
    const h = harness(t);
    const order = { userId, paymentMethod: 'COD', items, checkoutCart: snapshot() };
    await assert.rejects(clearCheckoutCart(order, otherId), /owner/);
    await assert.rejects(clearCheckoutCart({ ...order, paymentMethod: 'Stripe' }, userId), /owner/);
    h.user.cartData = { [id]: { M: '1' } };
    await assert.rejects(clearCheckoutCart(order, userId), /review/);
    h.user = { _id: userId, ...snapshot(undefined, { [id]: { M: Number.MAX_SAFE_INTEGER } }) };
    await clearCheckoutCart({ ...order, checkoutCart: snapshot(undefined, h.user.cartVersions) }, userId);
    assert.equal(h.writes, 0);
    assert.equal(h.user.cartData[id].M, 1);
});

test('COD HTTP route preserves SR-2 role/owner isolation, ignoring a forged cart owner', async t => {
    const h = harness(t);
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'synthetic-cod-cart-auth-only';
    t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
    const app = express(); app.use(express.json()); app.use('/api/order', orderRouter);
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const post = token => fetch('http://127.0.0.1:' + server.address().port + '/api/order/place', {
        method: 'POST', headers: { 'content-type': 'application/json', token }, body: JSON.stringify(request({ userId: otherId }))
    });
    assert.equal((await post('invalid')).status, 401);
    assert.equal((await post(issueAuthToken(userId, 'cashier'))).status, 403);
    assert.equal((await (await post(issueAuthToken(userId, 'customer'))).json()).success, true);
    assert.equal(h.orders[0].userId, userId);
    assert.equal(h.writes, 1);
});

test('isolated local MongoDB COD reservation/cleanup concurrency and persisted reload', {
    skip: process.env.PAMO_COD_CART_INTEGRATION !== '1', timeout: 60000
}, async t => {
    const { database } = await connectTestDatabase(t, mongoose, 'checkoutCart');
    const user = await userModel.create({ name: 'Synthetic COD cart', email: database + '@example.test', password: 'synthetic-not-real', academicProgram: 'BSIT' });
    const product = await productModel.create({ name: 'Synthetic uniform', description: 'Isolated test', price: 225, image: [], category: 'Men', subCategory: 'BSIT', sizes: ['M', 'L'], inventory: { M: 10, L: 10 }, date: 1 });
    const owner = String(user._id), itemId = String(product._id);
    const add = { userId: owner, itemId, size: 'M' };
    await mutateCart(add, 'add');
    const body = request({ userId: owner, items: [{ _id: itemId, size: 'M', quantity: 1 }], checkoutCart: await getCartSnapshot(owner) });
    // A newer same-entry quantity must survive a stale checkout.
    await mutateCart({ ...add, expectedVersion: 1, expectedQuantity: 1 }, 'add');
    await mutateCart({ ...add, size: 'L' }, 'add');
    assert.equal((await call(body)).success, true);
    assert.deepEqual((await getCartSnapshot(owner)).cartData[itemId], { M: 2, L: 1 });
    const next = { ...body, requestId: randomUUID(), items: [{ _id: itemId, size: 'M', quantity: 2 }], checkoutCart: snapshot({ [itemId]: { M: 2 } }, { [itemId]: { M: 2 } }) };
    const attempts = await Promise.all(Array.from({ length: 8 }, () => call(next)));
    assert.ok(attempts.every(result => result.success));
    assert.equal(new Set(attempts.map(result => String(result.orderId))).size, 1);
    const saved = await getCartSnapshot(owner);
    assert.deepEqual(saved.cartData[itemId], { L: 1 });
    assert.equal(saved.cartVersions[itemId].M, 3);
    await mutateCart({ ...add, expectedVersion: 3, expectedQuantity: 0 }, 'add');
    assert.equal((await call(next)).success, true);
    assert.equal((await getCartSnapshot(owner)).cartData[itemId].M, 1);
    assert.equal((await productModel.findById(itemId).lean()).inventory.M, 7);
    assert.equal(await orderModel.countDocuments({ userId: owner }), 2);
});
