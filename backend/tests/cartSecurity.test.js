import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { connectTestDatabase } from './helpers/database.js';
import userModel from '../models/userModel.js';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import cartRouter from '../routes/cartRoute.js';
import { issueAuthToken } from '../utils/authTokens.js';
import { addToCart, updateCart, getUserCart } from '../controllers/cartController.js';
import { mutateCart } from '../utils/cart.js';
import { cartSnapshot } from '../../shared/cart.js';

const userId = '1123456789abcdef01234567';
const itemId = '0123456789abcdef01234567';
const otherId = '2123456789abcdef01234567';
const body = overrides => ({ userId, itemId, size: 'M', expectedVersion: 0, expectedQuantity: 0, ...overrides });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } });
const call = async (handler, body) => { const res = response(); await handler({ body }, res); return res; };
const field = (object, path) => path.split('.').reduce((value, key) => value && Object.hasOwn(value, key) ? value[key] : undefined, object);
const matches = (object, filter) => Object.entries(filter).every(([path, expected]) => {
    if (path === '$and') return expected.every(clause => matches(object, clause));
    if (path === '$or') return expected.some(clause => matches(object, clause));
    const actual = field(object, path);
    if (expected && typeof expected === 'object') return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$type') return value === 'object' ? actual !== null && typeof actual === 'object' && !Array.isArray(actual) : typeof actual === 'number';
        if (operator === '$gte') return actual >= value;
        if (operator === '$lte') return actual <= value;
        if (operator === '$lt') return actual < value;
        assert.fail('Unsupported synthetic query operator');
    });
    return actual === expected;
});
const apply = (object, update) => {
    for (const [operator, changes] of Object.entries(update)) for (const [path, value] of Object.entries(changes)) {
        const keys = path.split('.'), last = keys.pop();
        let parent = object;
        for (const key of keys) parent = parent[key] ||= {};
        if (operator === '$unset') delete parent[last];
        else if (operator === '$inc') parent[last] = (parent[last] || 0) + value;
        else if (operator === '$set') parent[last] = value;
        else assert.fail('Unexpected whole-cart operation');
    }
};
const harness = (t, overrides = {}) => {
    const state = { user: { _id: userId, cartData: {}, ...overrides }, product: { _id: itemId, sizes: ['M', 'L', 'One Size'], inventory: { M: 100, L: 100, 'One Size': 10 } }, beforeWrite: null };
    const writes = [];
    t.mock.method(userModel, 'findById', id => ({ select() { return this; }, lean: async () => id === userId ? structuredClone(state.user) : null }));
    t.mock.method(productModel, 'findById', () => ({ lean: async () => structuredClone(state.product) }));
    t.mock.method(userModel, 'findOneAndUpdate', (filter, update, options) => ({ lean: async () => {
        state.beforeWrite?.();
        if (!matches(state.user, filter)) return null;
        assert.equal(options.returnDocument, 'after');
        assert.equal(options.runValidators, true);
        for (const changes of Object.values(update)) assert.ok(Object.keys(changes).every(path => /^cart(Data|Versions)\.[a-f\d]{24}\.[A-Za-z0-9 _-]+$/i.test(path)));
        apply(state.user, update);
        writes.push({ filter, update });
        return structuredClone(state.user);
    } }));
    for (const model of [productModel, orderModel]) for (const method of ['updateOne', 'findOneAndUpdate', 'create']) t.mock.method(model, method, () => assert.fail('Cart must never mutate products, reservations or orders'));
    t.mock.method(userModel, 'findByIdAndUpdate', () => assert.fail('Whole-cart replacement is prohibited'));
    return { state, writes };
};

test('request validation rejects dangerous keys, inheritance, malformed IDs/sizes/quantities before DB access', async t => {
    const read = t.mock.method(userModel, 'findById', () => assert.fail('Invalid input must not query user data'));
    const cases = [null, [], 'invalid', Object.create({ userId, itemId, size: 'M' }),
        ...['__proto__', 'constructor', 'prototype', 'x.y', '$M', ''].flatMap(key => [body({ itemId: key }), body({ size: key })]),
        body({ itemId: { $ne: null } }), body({ size: ['M'] }), body({ extra: {} }),
        JSON.parse('{"userId":"' + userId + '","itemId":"' + itemId + '","size":"M","__proto__":{"polluted":true}}')];
    for (const invalid of cases) assert.equal((await call(addToCart, invalid)).code, 400);
    for (const quantity of [-1, 0.1, '2', NaN, Infinity, null, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await call(updateCart, body({ quantity }))).code, 400);
    for (const expectedVersion of [-1, '0', 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await call(addToCart, body({ expectedVersion }))).code, 400);
    assert.equal(read.mock.callCount(), 0);
    assert.equal(Object.prototype.polluted, undefined);
    assert.throws(() => cartSnapshot({ cartData: JSON.parse('{"__proto__":{"polluted":1}}') }));
    assert.throws(() => cartSnapshot({ cartData: { [itemId]: JSON.parse('{"constructor":1}') } }));
    assert.throws(() => cartSnapshot({ cartData: Object.create({ [itemId]: { M: 1 } }) }));
});

test('stock/product/size and account validation are authoritative without arbitrary quantity limits', async t => {
    const h = harness(t);
    for (const [change, request] of [[{ product: null }, body()], [{ product: { sizes: ['L'], inventory: { L: 10 } } }, body()],
        [{ product: { sizes: ['M'], inventory: { M: 0 } } }, body()], [{ user: null }, body()]]) {
        const previous = structuredClone(h.state);
        Object.assign(h.state, change);
        assert.equal((await call(addToCart, request)).body.success, false);
        Object.assign(h.state, previous);
    }
    assert.equal(h.writes.length, 0);
    h.state.product.inventory.M = Number.MAX_SAFE_INTEGER;
    assert.equal((await call(updateCart, body({ quantity: Number.MAX_SAFE_INTEGER }))).body.success, true);
    const overflow = await call(addToCart, body({ expectedQuantity: Number.MAX_SAFE_INTEGER, expectedVersion: 1 }));
    assert.equal(overflow.code, 400);
});

test('valid quantities, dynamic sizes, zero removal and deleted-product cleanup preserve revisions', async t => {
    const h = harness(t);
    assert.equal((await call(addToCart, body())).body.success, true);
    assert.equal((await call(updateCart, body({ quantity: 4, expectedVersion: 1, expectedQuantity: 1 }))).body.cartData[itemId].M, 4);
    h.state.product = null;
    const removed = await call(updateCart, body({ quantity: 0, expectedVersion: 2, expectedQuantity: 4 }));
    assert.equal(removed.body.success, true);
    assert.equal(Object.hasOwn(removed.body.cartData[itemId], 'M'), false);
    assert.equal(removed.body.cartVersions[itemId].M, 3);
    assert.deepEqual((await call(getUserCart, { userId })).body.cartData, removed.body.cartData);
    assert.equal((await call(updateCart, body({ quantity: 0, expectedVersion: 3, expectedQuantity: 0 }))).body.success, true);
    assert.equal(h.writes.length, 4);
});

test('same-quantity and absent-entry removal intents still check atomic revisions instead of acknowledging a stale read', async t => {
    for (const quantity of [0, 1]) await t.test('quantity ' + quantity, async t => {
        const h = harness(t, { cartData: { [itemId]: { M: quantity } } });
        h.state.beforeWrite = () => {
            h.state.user.cartData[itemId].M = quantity + 1;
            h.state.user.cartVersions = { [itemId]: { M: 1 } };
        };
        assert.equal((await call(updateCart, body({ quantity, expectedQuantity: quantity }))).code, 409);
        assert.equal(h.writes.length, 0);
    });
});

test('legitimate hex ID casing is preserved so an existing upper-case cart entry remains removable', async t => {
    const upperId = itemId.toUpperCase();
    const h = harness(t, { cartData: { [upperId]: { M: 1 } } });
    const removed = await call(updateCart, body({ itemId: upperId, quantity: 0, expectedQuantity: 1 }));
    assert.equal(removed.body.success, true);
    assert.equal(h.state.user.cartData[upperId].M, undefined);
});

test('legacy simultaneous additions use $inc and independent entries never replace each other', async t => {
    const h = harness(t);
    const legacy = { userId, itemId, size: 'M' };
    const results = await Promise.all(Array.from({ length: 12 }, () => call(addToCart, legacy)));
    assert.ok(results.every(res => res.body.success));
    assert.equal(h.state.user.cartData[itemId].M, 12);
    assert.equal(h.state.user.cartVersions[itemId].M, 12);
    assert.ok((await Promise.all([call(addToCart, body({ itemId: otherId })), call(addToCart, body({ size: 'L' }))])).every(res => res.body.success));
    assert.deepEqual(h.state.user.cartData, { [itemId]: { M: 12, L: 1 }, [otherId]: { M: 1 } });
});

test('same-entry CAS detects simultaneous/repeated requests and ABA changes while independent sizes succeed', async t => {
    const h = harness(t);
    const simultaneous = await Promise.all([call(addToCart, body()), call(addToCart, body())]);
    assert.deepEqual(simultaneous.map(res => res.code).sort(), [200, 409]);
    assert.equal(h.state.user.cartData[itemId].M, 1);
    const changes = await Promise.all([call(updateCart, body({ quantity: 2, expectedVersion: 1, expectedQuantity: 1 })),
        call(updateCart, body({ quantity: 3, expectedVersion: 1, expectedQuantity: 1 }))]);
    assert.deepEqual(changes.map(res => res.code).sort(), [200, 409]);
    const quantity = h.state.user.cartData[itemId].M;
    await call(updateCart, body({ quantity: 0, expectedVersion: 2, expectedQuantity: quantity }));
    await call(addToCart, body({ expectedVersion: 3 }));
    assert.equal(h.state.user.cartData[itemId].M, 1);
    assert.equal((await call(updateCart, body({ quantity: 5, expectedVersion: 1, expectedQuantity: 1 }))).code, 409);
    assert.equal(h.state.user.cartData[itemId].M, 1);
    assert.equal((await call(updateCart, { userId, itemId, size: 'M', quantity: 5 })).code, 409);
});

test('stale cart clear, version races, database errors and corrupt records never report a successful write', async t => {
    const h = harness(t, { cartData: { [itemId]: { M: 1 } }, cartVersions: { [itemId]: { M: 1 } } });
    h.state.beforeWrite = () => { h.state.user.cartData = {}; };
    assert.equal((await call(updateCart, body({ quantity: 2, expectedVersion: 1, expectedQuantity: 1 }))).code, 409);
    assert.equal(h.writes.length, 0);
    h.state.beforeWrite = null;
    const write = t.mock.method(userModel, 'findOneAndUpdate', () => { throw new Error('synthetic-db-secret'); });
    const failed = await call(addToCart, body({ expectedVersion: 1 }));
    assert.equal(failed.code, 503);
    assert.doesNotMatch(failed.body.message, /secret/);
    write.mock.restore();
    for (const cartData of [null, [], { [itemId]: 'invalid' }, { [itemId]: { M: '2' } }]) {
        h.state.user.cartData = cartData;
        assert.equal((await call(getUserCart, { userId })).code, 409);
    }
});

test('authenticated routes use signed owner identity and preserve wrong-role restrictions', async t => {
    const h = harness(t);
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'sr4-synthetic-auth-only';
    t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
    const app = express();
    app.use(express.json()); app.use('/api/cart', cartRouter);
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const send = async token => fetch('http://127.0.0.1:' + server.address().port + '/api/cart/add', {
        method: 'POST', headers: { 'content-type': 'application/json', token }, body: JSON.stringify(body({ userId: otherId }))
    });
    assert.equal((await send('invalid')).status, 401);
    assert.equal((await send(issueAuthToken(userId, 'cashier'))).status, 403);
    const valid = await send(issueAuthToken(userId, 'customer'));
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).success, true);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].filter._id, userId);
});

test('actual MongoDB atomic cart concurrency in an explicitly configured isolated local database', {
    skip: process.env.PAMO_CART_INTEGRATION !== '1', timeout: 60000
}, async t => {
    const { database } = await connectTestDatabase(t, mongoose, 'cart');
    const user = await userModel.create({ name: 'Synthetic cart', email: database + '@example.test', password: 'synthetic-not-real' });
    const product = await productModel.create({ name: 'Synthetic cart item', description: 'Isolated test', price: 225, image: [], category: 'Men', subCategory: 'BSIT', sizes: ['M', 'L'], inventory: { M: 100, L: 100 }, date: 1 });
    const request = { userId: String(user._id), itemId: String(product._id), size: 'M' };
    const results = await Promise.all(Array.from({ length: 20 }, () => mutateCart(request, 'add')));
    assert.equal(results.length, 20);
    let stored = await userModel.findById(user._id).lean();
    assert.equal(stored.cartData[request.itemId].M, 20);
    assert.equal(stored.cartVersions[request.itemId].M, 20);
    const update = { ...request, quantity: 25, expectedVersion: 20, expectedQuantity: 20 };
    const competing = await Promise.allSettled([mutateCart(update, 'update'), mutateCart({ ...update, quantity: 30 }, 'update')]);
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(competing.find(result => result.status === 'rejected').reason.status, 409);
    stored = await userModel.findById(user._id).lean();
    await Promise.all([mutateCart({ ...request, size: 'L' }, 'add'), mutateCart({ ...request, quantity: 0, expectedVersion: 21, expectedQuantity: stored.cartData[request.itemId].M }, 'update')]);
    stored = await userModel.findById(user._id).lean();
    assert.equal(stored.cartData[request.itemId].L, 1);
    assert.equal(stored.cartData[request.itemId].M, undefined);
    assert.equal(stored.cartVersions[request.itemId].M, 22);
    assert.deepEqual((await productModel.findById(product._id).lean()).inventory, { M: 100, L: 100 });
});
