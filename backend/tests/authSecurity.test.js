import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import express from 'express';
import { createHmac } from 'node:crypto';
import userModel from '../models/userModel.js';
import categoryModel from '../models/categoryModel.js';
import { loginUser, registerUser, adminLogin } from '../controllers/userController.js';
import authUser from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';
import cashierAuth from '../middleware/cashierAuth.js';
import { issueAuthToken, verifyAuthToken } from '../utils/authTokens.js';
import { ADMIN_SUBJECT, SESSION_SECONDS } from '../../shared/authPolicy.js';

process.env.JWT_SECRET = 'sr2-synthetic-signing-key-not-production';
process.env.ADMIN_EMAIL = 'admin@school.test';
process.env.ADMIN_PASSWORD = 'synthetic-admin-password';
const userId = '0123456789abcdef01234567';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const claims = role => {
    const iat = Math.floor(Date.now() / 1000);
    return { sub: role === 'admin' ? ADMIN_SUBJECT : userId, role, iat, exp: iat + SESSION_SECONDS[role] };
};
const rawToken = payload => {
    const encoded = [JSON.stringify({ alg: 'HS256', typ: 'JWT' }), JSON.stringify(payload)]
        .map(value => Buffer.from(value).toString('base64url')).join('.');
    return encoded + '.' + createHmac('sha256', process.env.JWT_SECRET).update(encoded).digest('base64url');
};
const assertToken = (token, role) => {
    const decoded = verifyAuthToken(token);
    assert.deepEqual(Object.keys(decoded).sort(), ['exp', 'iat', 'role', 'sub']);
    assert.equal(decoded.role, role);
    assert.equal(decoded.sub, role === 'admin' ? ADMIN_SUBJECT : userId);
    assert.equal(decoded.exp - decoded.iat, SESSION_SECONDS[role]);
    assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
    assert.doesNotMatch(JSON.stringify(decoded), /password|@|synthetic|secret/i);
};

test('all token roles use secret-free identity claims and bounded expiration', () => {
    for (const role of ['customer', 'admin', 'cashier']) {
        assertToken(issueAuthToken(role === 'admin' ? ADMIN_SUBJECT : userId, role), role);
    }
});

test('actual registration and login issue customer claims and ignore submitted roles', async t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    const password = 'synthetic-customer-password';
    const hash = await bcrypt.hash(password, 4);
    t.mock.method(userModel, 'findOne', async () => ({ _id: userId, password: hash, role: 'customer' }));
    const login = response();
    await loginUser({ body: { email: 'student@school.test', password, role: 'admin' } }, login);
    assertToken(login.body.token, 'customer');
    t.mock.method(userModel, 'findOne', async () => null);
    t.mock.method(userModel.prototype, 'save', async function () {
        assert.equal(this.role, 'customer');
        return { _id: userId, role: this.role };
    });
    const registration = response();
    await registerUser({ body: { name: 'Synthetic student', email: 'student@school.test', password, academicProgram: 'BSIT', role: 'cashier' } }, registration);
    assertToken(registration.body.token, 'customer');
});

test('actual admin and cashier login issue their proper identities and staff lifetimes', async t => {
    const admin = response();
    await adminLogin({ body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, role: 'customer' } }, admin);
    assertToken(admin.body.token, 'admin');
    const hash = await bcrypt.hash('synthetic-cashier-password', 4);
    t.mock.method(userModel, 'findOne', async query => {
        assert.equal(query.role, 'cashier');
        return { _id: userId, role: 'cashier', password: hash };
    });
    const cashier = response();
    await adminLogin({ body: { email: 'cashier@school.test', password: 'synthetic-cashier-password', role: 'admin' } }, cashier);
    assertToken(cashier.body.token, 'cashier');
    t.mock.method(userModel, 'findOne', async () => ({ _id: userId, role: 'cashier', password: hash }));
    const publicLogin = response();
    await loginUser({ body: { email: 'cashier@school.test', password: 'synthetic-cashier-password', role: 'customer' } }, publicLogin);
    assertToken(publicLogin.body.token, 'cashier');
});

test('missing configured admin credentials cannot authenticate missing request fields', async t => {
    const saved = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    t.after(() => { process.env.ADMIN_EMAIL = saved.email; process.env.ADMIN_PASSWORD = saved.password; });
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    t.mock.method(userModel, 'findOne', async () => assert.fail('Missing fields must not query accounts'));
    const res = response();
    await adminLogin({ body: {} }, res);
    assert.equal(res.body.success, false);
    assert.equal(res.body.token, undefined);
});

test('expired, expiryless, credential-bearing, malformed and unsupported JWT claims are rejected', () => {
    const valid = claims('customer');
    const without = key => Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));
    const invalid = [
        undefined, null, '', 'not-a-token', {}, jwt.sign('synthetic-email+synthetic-password', process.env.JWT_SECRET),
        jwt.sign({ id: userId }, process.env.JWT_SECRET),
        ...['exp', 'sub', 'role'].map(key => jwt.sign(without(key), process.env.JWT_SECRET)),
        jwt.sign(valid, process.env.JWT_SECRET, { noTimestamp: true }),
        jwt.sign({ ...valid, exp: valid.iat - 1 }, process.env.JWT_SECRET),
        jwt.sign({ ...valid, iat: valid.iat + 10 }, process.env.JWT_SECRET),
        jwt.sign({ ...valid, exp: valid.iat + SESSION_SECONDS.customer + 1 }, process.env.JWT_SECRET),
        rawToken({ ...valid, sub: { $ne: null } }),
        jwt.sign({ ...valid, role: ['customer'] }, process.env.JWT_SECRET),
        jwt.sign({ ...valid, role: 'constructor' }, process.env.JWT_SECRET),
        jwt.sign({ ...valid, sub: 'not-an-id' }, process.env.JWT_SECRET),
        jwt.sign({ ...valid, password: 'synthetic-only' }, process.env.JWT_SECRET),
        jwt.sign({ ...claims('admin'), sub: userId }, process.env.JWT_SECRET),
        jwt.sign({ ...claims('cashier'), exp: valid.exp }, process.env.JWT_SECRET),
        jwt.sign({ ...valid, exp: valid.exp + 0.5 }, process.env.JWT_SECRET),
        jwt.sign(valid, 'different-synthetic-signing-key'),
        ...['none', 'HS384', 'HS512'].map(algorithm => jwt.sign(valid, process.env.JWT_SECRET, { algorithm }))
    ];
    for (const token of invalid) assert.throws(() => verifyAuthToken(token));
    const parts = issueAuthToken(userId, 'customer').split('.');
    parts[1] = Buffer.from(JSON.stringify({ ...valid, role: 'admin', sub: ADMIN_SUBJECT })).toString('base64url');
    assert.throws(() => verifyAuthToken(parts.join('.')));
});

test('every verifier rejects legacy and expired tokens without identity mutation or logging', async t => {
    const log = t.mock.method(console, 'log', () => {});
    t.mock.method(userModel, 'findOne', async () => assert.fail('Invalid token must not query permissions'));
    const invalid = [undefined, 'malformed', jwt.sign({ id: userId }, process.env.JWT_SECRET),
        jwt.sign('synthetic-credential-string', process.env.JWT_SECRET),
        jwt.sign({ ...claims('customer'), exp: Math.floor(Date.now() / 1000) - 1 }, process.env.JWT_SECRET)];
    for (const middleware of [authUser, adminAuth, cashierAuth]) {
        for (const token of invalid) {
            const req = { headers: { token }, body: { userId: 'forged' } };
            const res = response();
            await middleware(req, res, () => assert.fail('Unexpected access'));
            assert.equal(res.code, 401);
            assert.equal(res.body.success, false);
            assert.equal(req.body.userId, 'forged');
            assert.equal(req.staff, undefined);
        }
    }
    assert.equal(log.mock.callCount(), 0);
});

test('customer ownership comes from signed sub, never request fields, and staff cannot use customer routes', async () => {
    const req = { headers: { token: issueAuthToken(userId, 'customer') }, body: { userId: 'another-user', role: 'admin' } };
    let calls = 0;
    await authUser(req, response(), () => calls++);
    assert.equal(req.body.userId, userId);
    assert.equal(calls, 1);
    for (const role of ['admin', 'cashier']) {
        const res = response();
        await authUser({ headers: { token: issueAuthToken(role === 'admin' ? ADMIN_SUBJECT : userId, role) }, body: {} }, res, () => assert.fail('Staff cannot impersonate customers'));
        assert.equal(res.code, 403);
    }
});

test('admin routes deny valid customer/cashier sessions and accept only the admin identity', async () => {
    for (const role of ['customer', 'cashier']) {
        const res = response();
        await adminAuth({ headers: { token: issueAuthToken(userId, role) } }, res, () => assert.fail('Unexpected admin access'));
        assert.equal(res.code, 403);
    }
    let allowed = false;
    await adminAuth({ headers: { token: issueAuthToken(ADMIN_SUBJECT, 'admin') } }, response(), () => { allowed = true; });
    assert.equal(allowed, true);
});

test('cashier authorization retains database revocation, identity, and role separation', async t => {
    let authorized = true;
    const lookup = t.mock.method(userModel, 'findOne', async query => {
        assert.deepEqual(query, { _id: userId, role: 'cashier' });
        return authorized ? { email: 'cashier@school.test' } : null;
    });
    const token = issueAuthToken(userId, 'cashier');
    const req = { headers: { token } };
    await cashierAuth(req, response(), () => {});
    assert.deepEqual(req.staff, { role: 'cashier', identity: 'cashier@school.test' });
    authorized = false;
    const revoked = response();
    await cashierAuth({ headers: { token } }, revoked, () => assert.fail('Revoked cashier must be denied'));
    assert.equal(revoked.code, 403);
    const customer = response();
    await cashierAuth({ headers: { token: issueAuthToken(userId, 'customer') }, body: { role: 'cashier' } }, customer, () => assert.fail('Role injection'));
    assert.equal(customer.code, 403);
    assert.equal(lookup.mock.callCount(), 2);
});

test('real HTTP middleware boundaries preserve header contract and cross-role denial', async t => {
    t.mock.method(userModel, 'findOne', async () => ({ email: 'cashier@school.test' }));
    const app = express();
    app.use(express.json());
    for (const [route, middleware] of [['customer', authUser], ['admin', adminAuth], ['cashier', cashierAuth]]) {
        app.post('/' + route, middleware, (req, res) => res.json({ success: true, identity: req.staff?.role || req.body.userId }));
    }
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    for (const role of ['customer', 'admin', 'cashier']) {
        const token = issueAuthToken(role === 'admin' ? ADMIN_SUBJECT : userId, role);
        for (const route of ['customer', 'admin', 'cashier']) {
            const res = await fetch('http://127.0.0.1:' + server.address().port + '/' + route, {
                method: 'POST', headers: { token, 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'forged', role: 'admin' })
            });
            const permitted = role === route || (role === 'admin' && route === 'cashier');
            assert.equal(res.status, permitted ? 200 : 403);
        }
    }
});

test('missing signing configuration fails closed without exposing a secret', t => {
    const saved = process.env.JWT_SECRET;
    t.after(() => { process.env.JWT_SECRET = saved; });
    const token = issueAuthToken(userId, 'customer');
    delete process.env.JWT_SECRET;
    assert.throws(() => issueAuthToken(userId, 'customer'), /Authentication is temporarily unavailable/);
    assert.throws(() => verifyAuthToken(token), /Authentication is temporarily unavailable/);
});
