import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import express from 'express';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import multer from 'multer';
import userModel from '../models/userModel.js';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import categoryModel from '../models/categoryModel.js';
import { loginUser, registerUser, adminLogin } from '../controllers/userController.js';
import { addProduct, listProducts, singleProduct, removeProduct, updateProductFlags, updateStock } from '../controllers/productController.js';
import { placeOrder, allOrders, userOrders, updateStatus } from '../controllers/orderController.js';
import userRouter from '../routes/userRoute.js';
import { createAuthThrottle } from '../middleware/authThrottle.js';
import { apiErrorHandler } from '../middleware/apiErrorHandler.js';
import { verifyAuthToken } from '../utils/authTokens.js';

process.env.JWT_SECRET = 'sr6b1-synthetic-signing-key-not-production';
process.env.ADMIN_EMAIL = 'admin@school.test';
process.env.ADMIN_PASSWORD = 'synthetic-admin-password';
const id = '0123456789abcdef01234567';
const email = 'student@school.test';
const privateError = () => new Error('synthetic-private-driver-details-and-secret');
const response = () => Object.assign(new EventEmitter(), {
    code: 200, locals: {}, headers: {},
    status(code) { this.code = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; }
});
const call = async (handler, body) => {
    const res = response();
    await handler({ body }, res);
    return res;
};

test('malformed credential types never query, hash, compare passwords or save accounts', async t => {
    t.mock.method(userModel, 'findOne', () => assert.fail('Malformed credentials must not query accounts'));
    t.mock.method(userModel.prototype, 'save', () => assert.fail('Malformed credentials must not create accounts'));
    t.mock.method(bcrypt, 'compare', () => assert.fail('Malformed credentials must not reach bcrypt'));
    t.mock.method(bcrypt, 'hash', () => assert.fail('Malformed credentials must not be hashed'));
    const invalid = [undefined, null, [], 'input', {},
        ...[undefined, null, 10, [], { $ne: null }, { $regex: '.*' }, '', 'x'.repeat(255)].map(value => ({ email: value, password: 'synthetic-password' })),
        ...[undefined, null, 10, [], {}, ''].map(value => ({ email, password: value })),
        Object.create({ email, password: 'synthetic-password' })];
    for (const handler of [loginUser, registerUser, adminLogin]) for (const body of invalid) {
        assert.equal((await call(handler, body)).body.success, false);
    }
});

test('registration rejects bad format, weak passwords and over-72-byte passwords before querying', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    t.mock.method(userModel, 'findOne', () => assert.fail('Invalid registration must not query accounts'));
    for (const body of [{ email: 'not-an-email', password: 'synthetic-password' },
        ...['short', 'x'.repeat(73), 'é'.repeat(37), '😀'.repeat(19)].map(password => ({ email, password }))]) {
        const res = await call(registerUser, { name: 'Synthetic student', academicProgram: 'BSIT', ...body });
        assert.equal(res.body.success, false);
        assert.doesNotMatch(JSON.stringify(res.body), /synthetic-private|stack|CastError/);
    }
});

test('new registrations accept ASCII and multibyte passwords at the 72-byte boundary', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    t.mock.method(userModel, 'findOne', async () => null);
    t.mock.method(bcrypt, 'genSalt', async () => bcrypt.genSaltSync(4));
    t.mock.method(userModel.prototype, 'save', async function () {
        assert.equal(this.role, 'customer');
        return { _id: id };
    });
    for (const password of ['x'.repeat(72), 'é'.repeat(36)]) {
        assert.equal(Buffer.byteLength(password, 'utf8'), 72);
        const res = await call(registerUser, { name: 'Synthetic student', email, password, academicProgram: 'BSIT', role: 'admin' });
        assert.equal(res.body.success, true);
        assert.equal(verifyAuthToken(res.body.token).role, 'customer');
        assert.equal(res.locals.authenticationSucceeded, true);
    }
});

test('missing accounts and incorrect passwords have the same login response and both perform bcrypt verification', async t => {
    const hash = await bcrypt.hash('synthetic-password', 4);
    const find = t.mock.method(userModel, 'findOne', async () => null);
    const compare = t.mock.method(bcrypt, 'compare');
    for (const handler of [loginUser, adminLogin]) {
        find.mock.mockImplementation(async () => null);
        const missing = await call(handler, { email, password: 'wrong-password' });
        find.mock.mockImplementation(async () => ({ _id: id, role: 'cashier', password: hash }));
        const incorrect = await call(handler, { email, password: 'wrong-password' });
        assert.deepEqual(missing.body, incorrect.body);
        assert.equal(missing.code, incorrect.code);
        assert.deepEqual(missing.body, { success: false, message: 'Invalid email or password.' });
    }
    assert.equal(compare.mock.callCount(), 4);
});

test('historical long bcrypt passwords remain usable by customer and cashier accounts', async t => {
    const password = 'x'.repeat(72) + '-historical-suffix';
    const hash = await bcrypt.hash(password, 4);
    t.mock.method(userModel, 'findOne', async () => ({ _id: id, role: 'customer', password: hash }));
    assert.equal((await call(loginUser, { email, password })).body.success, true);
    assert.equal((await call(loginUser, { email, password: 'wrong-' + password })).body.success, false);
    t.mock.method(userModel, 'findOne', async () => ({ _id: id, role: 'cashier', password: hash }));
    const cashier = await call(adminLogin, { email, password });
    assert.equal(verifyAuthToken(cashier.body.token).role, 'cashier');
});

test('configured admin credentials preserve exact comparison without bcrypt truncation', async () => {
    const saved = process.env.ADMIN_PASSWORD;
    try {
        process.env.ADMIN_PASSWORD = 'x'.repeat(72) + '-admin-suffix';
        const res = await call(adminLogin, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
        assert.equal(verifyAuthToken(res.body.token).role, 'admin');
    } finally { process.env.ADMIN_PASSWORD = saved; }
});

test('duplicate registration and database failures disclose no account or internal error details', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    const find = t.mock.method(userModel, 'findOne', async () => ({ _id: id }));
    const duplicate = await call(registerUser, { name: 'Synthetic student', email, password: 'synthetic-password', academicProgram: 'BSIT' });
    find.mock.mockImplementation(async () => { throw privateError(); });
    const failed = await call(registerUser, { name: 'Synthetic student', email, password: 'synthetic-password', academicProgram: 'BSIT' });
    assert.deepEqual(duplicate.body, failed.body);
    assert.doesNotMatch(JSON.stringify(failed.body), /private-driver|already exists/);
    for (const handler of [loginUser, adminLogin]) {
        const res = await call(handler, { email, password: 'synthetic-password' });
        assert.equal(res.body.success, false);
        assert.doesNotMatch(JSON.stringify(res.body), /private-driver|secret|stack/);
    }
});

test('throttle counts failures/in-flight requests, returns retry timing and expires naturally', () => {
    let time = 0;
    const throttle = createAuthThrottle({ limit: 2, windowMs: 1000, now: () => time });
    let calls = 0;
    const attempt = () => { const res = response(); throttle({ ip: 'client' }, res, () => calls++); return res; };
    attempt(); attempt();
    const blocked = attempt();
    assert.equal(calls, 2);
    assert.equal(blocked.code, 429);
    assert.equal(blocked.headers['Retry-After'], '1');
    time = 1000;
    attempt();
    assert.equal(calls, 3);
});

test('successful authentication refunds only its own attempt and cannot reset other failures', () => {
    const throttle = createAuthThrottle({ limit: 2 });
    const attempt = () => { const res = response(); throttle({ ip: 'client' }, res, () => {}); return res; };
    attempt().emit('finish');
    const success = attempt();
    success.locals.authenticationSucceeded = true;
    success.emit('finish');
    assert.equal(attempt().code, 200);
    assert.equal(attempt().code, 429);
});

test('stale successful completions cannot refund a newer window; abandoned requests retain their budget', () => {
    let time = 0;
    const throttle = createAuthThrottle({ limit: 1, windowMs: 1000, now: () => time });
    const attempt = () => { const res = response(); throttle({ ip: 'client' }, res, () => {}); return res; };
    const old = attempt();
    old.emit('close');
    assert.equal(attempt().code, 429);
    time = 1000;
    attempt();
    old.locals.authenticationSucceeded = true;
    old.emit('finish');
    assert.equal(attempt().code, 429);
});

test('throttle bounds stored clients and permits expired capacity to be reused', () => {
    let time = 0;
    const throttle = createAuthThrottle({ limit: 2, maxClients: 2, windowMs: 1000, now: () => time });
    const attempt = ip => { const res = response(); throttle({ ip }, res, () => {}); return res; };
    attempt('a'); attempt('b');
    assert.equal(attempt('c').code, 429);
    assert.equal(attempt('a').code, 200);
    time = 1000;
    assert.equal(attempt('c').code, 200);
});

test('all authentication routes share one throttle before their existing controllers', () => {
    const handlers = { '/login': loginUser, '/register': registerUser, '/admin': adminLogin };
    const routes = Object.keys(handlers).map(path => userRouter.stack.find(layer => layer.route?.path === path).route);
    for (const route of routes) {
        assert.equal(route.stack[0].handle, routes[0].stack[0].handle);
        assert.equal(route.stack[1].handle, handlers[route.path]);
    }
});

const server = async (t, app) => {
    const listener = app.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    t.after(() => new Promise(resolve => { listener.close(resolve); listener.closeAllConnections(); }));
    return `http://127.0.0.1:${listener.address().port}`;
};

test('real HTTP throttling cannot be bypassed with role routes, email changes or forwarded IP headers', async t => {
    t.mock.method(userModel, 'findOne', () => assert.fail('Malformed input must not query accounts'));
    const app = express();
    app.use(express.json());
    app.use('/api/user', userRouter);
    app.use(apiErrorHandler);
    const base = await server(t, app);
    for (let index = 0; index < 21; index++) {
        const result = await fetch(base + '/api/user/' + ['login', 'admin', 'register'][index % 3], {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${index}` },
            body: JSON.stringify({ email: { $ne: String(index) }, password: 'synthetic-password' })
        });
        assert.equal(result.status, index < 20 ? 200 : 429);
        assert.equal((await result.json()).success, false);
        if (index === 20) assert.ok(Number(result.headers.get('Retry-After')) >= 1);
    }
});

test('global middleware returns safe JSON for malformed/oversized bodies and unexpected failures', async t => {
    const log = t.mock.method(console, 'error', () => {});
    const app = express();
    app.use(express.json());
    app.post('/body', (_req, res) => res.json({ success: true }));
    app.get('/failure', () => { throw privateError(); });
    app.use(apiErrorHandler);
    const base = await server(t, app);
    for (const [body, expected] of [['{"synthetic-private-body":', 400], [JSON.stringify({ value: 'x'.repeat(110000) }), 413]]) {
        const result = await fetch(base + '/body', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        assert.equal(result.status, expected);
        assert.doesNotMatch(JSON.stringify(await result.json()), /synthetic-private|stack|SyntaxError/);
    }
    const result = await fetch(base + '/failure');
    assert.equal(result.status, 500);
    assert.deepEqual(await result.json(), { success: false, message: 'Unable to process your request. Please try again.' });
    assert.equal(log.mock.callCount(), 0);
});

test('upload/other client errors are sanitized, and already-started responses delegate only a safe error', () => {
    for (const [error, status] of [[new multer.MulterError('LIMIT_FILE_SIZE', 'synthetic-private-field'), 413],
        [new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'synthetic-private-field'), 400],
        [Object.assign(privateError(), { status: 415 }), 415]]) {
        const res = response();
        apiErrorHandler(error, {}, res, () => assert.fail('Unexpected default handler'));
        assert.equal(res.code, status);
        assert.doesNotMatch(JSON.stringify(res.body), /private|driver|stack/);
    }
    apiErrorHandler(privateError(), {}, { headersSent: true }, error => {
        assert.equal(error.message, 'Unable to finish the request.');
        assert.doesNotMatch(error.stack, /private-driver/);
    });
});

test('product endpoints never expose or log raw database/provider exceptions', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    const logged = [];
    t.mock.method(console, 'log', (...args) => logged.push(args));
    t.mock.method(productModel, 'find', () => { throw privateError(); });
    t.mock.method(productModel, 'findOne', () => { throw privateError(); });
    t.mock.method(productModel, 'findById', () => ({ lean: async () => { throw privateError(); }, then: (_resolve, reject) => reject(privateError()) }));
    t.mock.method(productModel, 'findByIdAndUpdate', async () => { throw privateError(); });
    t.mock.method(productModel.prototype, 'save', async () => { throw privateError(); });
    t.mock.method(mongoose.connection, 'transaction', async () => { throw privateError(); });
    const cases = [[listProducts, {}], [singleProduct, { productId: id }], [updateProductFlags, { id, NewArrival: true }],
        [updateStock, { id, adjustments: { M: 1 } }], [removeProduct, { id }]];
    for (const [handler, body] of cases) {
        const res = await call(handler, body);
        assert.equal(res.body.success, false);
        assert.doesNotMatch(JSON.stringify(res.body), /private-driver|secret|stack|mongoose/);
    }
    const added = response();
    await addProduct({ body: { name: 'Synthetic product', description: 'Synthetic', price: '10', category: 'Men', subCategory: 'BSIT', sizes: '["M"]', inventory: '{"M":1}' }, files: {} }, added);
    assert.equal(added.body.success, false);
    assert.doesNotMatch(JSON.stringify(added.body), /private-driver|secret|stack/);
    assert.doesNotMatch(JSON.stringify(logged), /private-driver|secret/);
});

test('order endpoint failures remain safe without changing payment or inventory behavior', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    const log = t.mock.method(console, 'log', () => {});
    t.mock.method(userModel, 'findById', () => ({
        select() { return this; },
        lean: async () => ({ name: 'Synthetic Student', email: 'student@example.test', academicProgram: 'BSIT', role: 'customer' })
    }));
    t.mock.method(orderModel, 'init', async () => { throw privateError(); });
    const find = t.mock.method(orderModel, 'find', async () => { throw privateError(); });
    t.mock.method(orderModel, 'findById', async () => { throw privateError(); });
    t.mock.method(productModel, 'updateOne', () => assert.fail('Failed checkout must not touch stock'));
    for (const [handler, body] of [[placeOrder, { userId: id, requestId: 'synthetic-request-123', items: [{ _id: id, size: 'M', quantity: 1 }], address: { firstName: 'Synthetic', lastName: 'Student', email: 'student@example.test', phone: '09171234567', street: '123 Campus Road', city: 'Carmona', state: 'Cavite', zipcode: '4116', country: 'Philippines' } }],
        [allOrders, {}], [updateStatus, { orderId: id, status: 'Approved' }]]) {
        const res = await call(handler, body);
        assert.equal(res.body.success, false);
        assert.doesNotMatch(JSON.stringify(res.body), /private-driver|secret|stack/);
    }
    find.mock.mockImplementation(() => ({ select: () => ({ lean: async () => { throw privateError(); } }) }));
    const res = await call(userOrders, { userId: id });
    assert.equal(res.body.success, false);
    assert.doesNotMatch(JSON.stringify(res.body), /private-driver|secret|stack/);
    assert.equal(log.mock.callCount(), 0);
});
