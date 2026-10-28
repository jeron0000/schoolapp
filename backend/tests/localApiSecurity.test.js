import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { configureLocalApiSecurity, LOCAL_API_HOST, LOCAL_UI_ORIGINS } from '../config/localApiSecurity.js';
import { apiErrorHandler } from '../middleware/apiErrorHandler.js';
import authUser from '../middleware/auth.js';
import { issueAuthToken } from '../utils/authTokens.js';

process.env.JWT_SECRET = 'sr6b6-synthetic-only-signing-key';
const owner = '0123456789abcdef01234567';

async function server(t, env = {}) {
    const app = express();
    configureLocalApiSecurity(app, env);
    app.use(express.json());
    let calls = 0;
    app.post('/api/private', authUser, (req, res) => { calls++; res.json({ success: true, owner: req.body.userId }); });
    app.use(apiErrorHandler);
    const listener = app.listen(0, LOCAL_API_HOST);
    await new Promise(resolve => listener.once('listening', resolve));
    t.after(() => new Promise(resolve => listener.close(resolve)));
    return { app, calls: () => calls, url: `http://localhost:${listener.address().port}/api/private` };
}

test('local origins retain token preflight support without wildcard origins or cookie credentials', async t => {
    const { url, app } = await server(t);
    assert.equal(app.get('trust proxy'), false);
    assert.equal(app.enabled('x-powered-by'), false);
    for (const origin of LOCAL_UI_ORIGINS) {
        const res = await fetch(url, { method: 'OPTIONS', headers: {
            Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'token,content-type'
        } });
        assert.equal(res.status, 204);
        assert.equal(res.headers.get('access-control-allow-origin'), origin);
        assert.match(res.headers.get('access-control-allow-headers'), /token/);
        assert.equal(res.headers.get('access-control-allow-credentials'), null);
        assert.equal(res.headers.get('x-powered-by'), null);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    }
});

test('untrusted origins are rejected before parsing or authenticated API effects', async t => {
    const h = await server(t);
    for (const origin of ['https://untrusted.example', 'http://localhost.attacker.test:5173', 'null', 'http://localhost:9999']) {
        const res = await fetch(h.url, { method: 'POST', headers: {
            Origin: origin, token: issueAuthToken(owner, 'customer'), 'Content-Type': 'application/json'
        }, body: '{malformed' });
        assert.equal(res.status, 403);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.doesNotMatch(JSON.stringify(await res.json()), /stack|Origin is not permitted/);
    }
    assert.equal(h.calls(), 0);
});

test('same-origin/native clients still require valid ownership and API responses are not cached', async t => {
    const h = await server(t);
    let res = await fetch(h.url, { method: 'POST' });
    assert.equal(res.status, 401);
    for (const origin of [undefined, 'http://localhost:5173', 'http://127.0.0.1:5174']) {
        res = await fetch(h.url, { method: 'POST', headers: {
            ...(origin ? { Origin: origin } : {}), token: issueAuthToken(owner, 'customer'), 'Content-Type': 'application/json'
        }, body: JSON.stringify({ userId: 'forged' }) });
        assert.equal(res.status, 200);
        assert.equal((await res.json()).owner, owner);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
        assert.equal(res.headers.get('x-frame-options'), 'DENY');
    }
    const wrongRole = await fetch(h.url, { method: 'POST', headers: { token: issueAuthToken(owner, 'cashier') } });
    assert.equal(wrongRole.status, 403);
});

test('production permits only exact configured HTTPS origins and keeps token preflight', async t => {
    const origin = 'https://store.example.test';
    const h = await server(t, { NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: origin + ',https://admin.example.test' });
    for (const allowed of [origin, 'https://admin.example.test']) {
        const res = await fetch(h.url, { method: 'OPTIONS', headers: {
            Origin: allowed, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'token,content-type'
        } });
        assert.equal(res.status, 204);
        assert.equal(res.headers.get('access-control-allow-origin'), allowed);
    }
    for (const blocked of ['http://localhost:5173', origin + '.attacker.test', 'https://other.example.test']) {
        const res = await fetch(h.url, { headers: { Origin: blocked } });
        assert.equal(res.status, 403);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
    }
});

test('production rejects absent, wildcard, HTTP and malformed CORS configuration', () => {
    for (const origins of ['', '*', 'http://store.example.test', 'https://store.example.test/',
        'https://store.example.test/path', 'https://user:password@store.example.test']) {
        assert.throws(() => configureLocalApiSecurity(express(), {
            NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: origins
        }), /CORS_ALLOWED_ORIGINS/);
    }
    assert.throws(() => configureLocalApiSecurity(express(), { VERCEL: '1' }), /CORS_ALLOWED_ORIGINS/);
});

test('environment variants are ignored while example files remain reviewable', () => {
    const names = ['backend/.env', 'backend/.env.local', 'backend/.env.production', 'backend/service.env.local',
        'backend/.env.example', 'backend/.env.development.example', 'admin/.env.example', 'frontend/.env.example'];
    const output = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
        cwd: new URL('../../', import.meta.url), input: names.join('\n') + '\n', encoding: 'utf8'
    }).trim().split(/\r?\n/);
    assert.deepEqual(output, names.slice(0, 4));
});

test('production entry point uses loopback and applies the configuration before body parsing', async () => {
    const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
    assert.match(source, /app\.listen\(port, LOCAL_API_HOST,/);
    assert(source.indexOf('configureLocalApiSecurity(app)') < source.indexOf('app.use(express.json())'));
});
