import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Buffer } from 'node:buffer';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  stdin: { resolveDir: frontend, contents: "export * from '../shared/authSession.js'; export { default as ProtectedRoute } from './src/components/ProtectedRoute.jsx';" },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  jsx: 'automatic', resolveExtensions: ['.js', '.jsx', '.json']
});
const compiled = new Module(path.join(frontend, 'auth-session-tests.cjs'));
compiled.filename = path.join(frontend, 'auth-session-tests.cjs');
compiled.paths = Module._nodeModulePaths(frontend);
compiled.require = createRequire(compiled.filename);
compiled._compile(result.outputFiles[0].text, compiled.filename);
const { sessionClaims, isSessionFailure, monitorSession, useAuthSession: invokeSessionHook, SESSION_MESSAGE } = compiled.exports;
const backendUrl = 'https://api.school.test';
const userId = '0123456789abcdef01234567';
const makeToken = (role = 'customer', overrides = {}) => {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { sub: role === 'admin' ? 'pamo-admin' : userId, role, iat,
    exp: iat + (role === 'customer' ? 604800 : 28800), ...overrides };
  return [JSON.stringify({ alg: 'HS256', typ: 'JWT' }), JSON.stringify(payload)]
    .map(value => Buffer.from(value).toString('base64url')).join('.') + '.synthetic-signature';
};

const environment = (t, saved = '') => {
  const storage = new Map(saved ? [['token', saved]] : []);
  const timers = new Map();
  const handlers = new Map();
  const listeners = { window: new Map(), document: new Map() };
  let nextTimer = 0, nextInterceptor = 0;
  const events = target => ({
    addEventListener: (name, handler) => listeners[target].set(name, handler),
    removeEventListener: (name, handler) => { if (listeners[target].get(name) === handler) listeners[target].delete(name); }
  });
  for (const [name, value] of Object.entries({
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    window: { ...events('window'), setTimeout: (handler, delay) => { const id = ++nextTimer; timers.set(id, { handler, delay }); return id; }, clearTimeout: id => timers.delete(id) },
    document: events('document')
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
  const client = { interceptors: { response: {
    use: (_success, failure) => { const id = ++nextInterceptor; handlers.set(id, failure); return id; },
    eject: id => handlers.delete(id)
  } } };
  return { storage, timers, handlers, listeners, client };
};
const failure = (token, status = 401, url = backendUrl + '/api/cart/get') => ({ response: { status }, config: { url, headers: { token } } });

test('session restoration accepts proper role/expiry claims and rejects unsupported/legacy sessions', () => {
  for (const role of ['customer', 'admin', 'cashier']) {
    const token = makeToken(role);
    assert.equal(sessionClaims(token, role === 'customer' ? 'customer' : 'staff').role, role);
    assert.equal(sessionClaims(token, role === 'customer' ? 'staff' : 'customer'), null);
  }
  for (const token of ['', 'opaque-legacy-token', 'x.y.z', makeToken('customer', { exp: 1 }),
    makeToken('customer', { exp: undefined }), makeToken('customer', { password: 'synthetic-only' }),
    makeToken('admin', { sub: userId }), makeToken('customer', { role: ['customer'] })]) {
    assert.equal(sessionClaims(token, 'customer'), null);
    assert.equal(sessionClaims(token, 'staff'), null);
  }
});

test('only a matching-token backend 401 invalidates a session', () => {
  const token = makeToken();
  assert.equal(isSessionFailure(failure(token), token, backendUrl), true);
  assert.equal(isSessionFailure({ response: { status: 401 }, config: { baseURL: backendUrl, url: '/api/cart/get', headers: { get: () => token } } }, token, backendUrl), true);
  for (const error of [failure('older-token'), failure(token, 403), failure(token, 429), failure(token, 500),
    failure(token, 401, 'https://other.school.test/api/cart/get'), failure(undefined),
    { message: 'Network error' }, { response: { status: 401 } }]) {
    assert.equal(isSessionFailure(error, token, backendUrl), false);
  }
});

test('expiration and tab activation invalidate once; cleanup removes timer, listeners and interceptor', t => {
  const env = environment(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const exp = Math.floor(now / 1000) + 10;
  const token = makeToken('customer', { exp });
  let invalidations = 0;
  const stop = monitorSession({ token, scope: 'customer', client: env.client, backendUrl, onInvalid: () => invalidations++ });
  assert.equal(env.timers.size, 1);
  assert.equal(env.handlers.size, 1);
  assert.equal([...env.timers.values()][0].delay, exp * 1000 - now);
  now = exp * 1000;
  [...env.timers.values()][0].handler();
  env.listeners.window.get('focus')();
  env.listeners.document.get('visibilitychange')();
  assert.equal(invalidations, 1);
  stop();
  assert.equal(env.timers.size, 0);
  assert.equal(env.handlers.size, 0);
  assert.equal(env.listeners.window.size, 0);
  assert.equal(env.listeners.document.size, 0);
});

test('authenticated 401s end once; public errors and stale responses cannot end a replacement session', async t => {
  const env = environment(t);
  const token = makeToken();
  let endedA = 0, endedB = 0;
  const stopA = monitorSession({ token, scope: 'customer', client: env.client, backendUrl, onInvalid: () => endedA++ });
  const oldHandler = [...env.handlers.values()][0];
  for (const error of [failure('stale'), failure(undefined), failure(token, 403), failure(token, 500)]) {
    await assert.rejects(oldHandler(error));
  }
  assert.equal(endedA, 0);
  stopA();
  const tokenB = makeToken('customer', { sub: '1123456789abcdef01234567' });
  const stopB = monitorSession({ token: tokenB, scope: 'customer', client: env.client, backendUrl, onInvalid: () => endedB++ });
  await assert.rejects(oldHandler(failure(token)));
  assert.equal(endedA, 0);
  assert.equal(endedB, 0);
  const currentHandler = [...env.handlers.values()][0];
  await assert.rejects(currentHandler(failure(tokenB)));
  await assert.rejects(currentHandler(failure(tokenB)));
  assert.equal(endedB, 1);
  stopB();
});

const hookHarness = (t, env, scope, onEnd = () => {}) => {
  const react = compiled.require('react');
  const slots = [];
  let cursor = 0, effect, cleanup;
  t.mock.method(react, 'useState', initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  });
  t.mock.method(react, 'useRef', initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  });
  t.mock.method(react, 'useCallback', callback => callback);
  t.mock.method(react, 'useEffect', callback => { effect = callback; });
  return {
    render: () => { cursor = 0; return invokeSessionHook(env.client, backendUrl, scope, onEnd); },
    flush: () => { cleanup?.(); cleanup = effect(); },
    unmount: () => cleanup?.()
  };
};

test('hook removes stored legacy state and presents reauthentication feedback', t => {
  const env = environment(t, 'legacy-expiryless-token');
  const hook = hookHarness(t, env, 'customer');
  const state = hook.render();
  assert.equal(state.token, '');
  assert.equal(state.sessionMessage, SESSION_MESSAGE);
  hook.flush();
  assert.equal(env.storage.has('token'), false);
  assert.equal(env.timers.size, 0);
  assert.equal(env.handlers.size, 0);
});

test('hook restores valid state, supports login/logout, clears private cart and stops stale monitors immediately', async t => {
  const tokenA = makeToken();
  const env = environment(t, tokenA);
  let cartClears = 0;
  const hook = hookHarness(t, env, 'customer', () => cartClears++);
  let state = hook.render();
  assert.equal(state.token, tokenA);
  hook.flush();
  assert.equal(state.isCurrentSession(tokenA), true);
  state.setToken(tokenA);
  assert.equal(env.timers.size, 1);
  assert.equal(env.handlers.size, 1);
  const oldHandler = [...env.handlers.values()][0];
  const tokenB = makeToken('customer', { sub: '1123456789abcdef01234567' });
  state.setToken(tokenB);
  assert.equal(state.isCurrentSession(tokenA), false);
  await assert.rejects(oldHandler(failure(tokenA)));
  state = hook.render();
  assert.equal(state.token, tokenB);
  assert.equal(state.sessionMessage, '');
  hook.flush();
  assert.equal(env.timers.size, 1);
  assert.equal(env.handlers.size, 1);
  await assert.rejects([...env.handlers.values()][0](failure(tokenB)));
  state = hook.render();
  assert.equal(state.token, '');
  assert.equal(state.sessionMessage, SESSION_MESSAGE);
  assert.equal(env.storage.has('token'), false);
  assert.equal(cartClears, 1);
  state.setToken(tokenA);
  state = hook.render();
  hook.flush();
  state.setToken('');
  state = hook.render();
  assert.equal(state.sessionMessage, '');
  assert.equal(cartClears, 2);
  assert.equal(env.storage.has('token'), false);
  assert.equal(env.timers.size, 0);
  assert.equal(env.handlers.size, 0);
  hook.unmount();
});

test('blocked localStorage cannot crash restoration or logout', t => {
  const env = environment(t);
  t.mock.method(globalThis.localStorage, 'getItem', () => { throw new Error('Blocked storage'); });
  t.mock.method(globalThis.localStorage, 'removeItem', () => { throw new Error('Blocked storage'); });
  const hook = hookHarness(t, env, 'staff');
  const state = hook.render();
  assert.equal(state.token, '');
  assert.doesNotThrow(() => state.setToken(''));
});

test('protected customer routes recover expired sessions directly to Student Login', t => {
  const react = compiled.require('react');
  let context;
  t.mock.method(react, 'useContext', () => context);
  t.mock.method(react, 'useState', () => [true, () => {}]);
  t.mock.method(react, 'useEffect', () => {});
  context = { token: '', sessionMessage: SESSION_MESSAGE };
  assert.equal(compiled.exports.ProtectedRoute().props.to, '/login?step=student');
  context = { token: '', sessionMessage: '' };
  assert.equal(compiled.exports.ProtectedRoute().props.to, '/login');
  context = { token: makeToken(), sessionMessage: '' };
  assert.equal(compiled.exports.ProtectedRoute().type.name, 'Outlet');
});
