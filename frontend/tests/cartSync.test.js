import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { createCartSync } from '../src/utils/cartSync.js';
import { cartSnapshot, cartValue, withCartQuantity } from '../../shared/cart.js';

const itemId = '0123456789abcdef01234567';
const otherId = '1123456789abcdef01234567';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const harness = (initial = {}) => {
  let rendered = {}, ready = true, active = true;
  let server = cartSnapshot({ cartData: initial });
  const calls = [], errors = [];
  const state = { before: null };
  const manager = createCartSync({ onChange: value => { rendered = value; }, onReady: value => { ready = value; }, onError: message => { if (message) errors.push(message); } });
  const owner = { isCurrent: () => active, request: async (operation, body) => {
    calls.push({ operation, body });
    const special = await state.before?.(operation, body);
    if (special) return special;
    if (operation !== 'get') {
      assert.equal(body.expectedVersion, cartValue(server.cartVersions, body.itemId, body.size));
      assert.equal(body.expectedQuantity, cartValue(server.cartData, body.itemId, body.size));
      server.cartData = withCartQuantity(server.cartData, body.itemId, body.size, operation === 'add' ? body.expectedQuantity + 1 : body.quantity);
      server.cartVersions = withCartQuantity(server.cartVersions, body.itemId, body.size, body.expectedVersion + 1);
    }
    return { success: true, ...structuredClone(server) };
  } };
  return { manager, owner, calls, state, errors, rendered: () => rendered, ready: () => ready, server: () => server,
    setServer: value => { server = cartSnapshot(value); }, invalidate: () => { active = false; } };
};

test('guest cart additions use current state, preserve independent entries and never call persistence', async () => {
  const h = harness();
  await Promise.all([h.manager.change('add', itemId, 'M', undefined, 10), h.manager.change('add', itemId, 'M', undefined, 10),
    h.manager.change('add', otherId, 'One Size', undefined, 10)]);
  assert.deepEqual(h.rendered(), { [itemId]: { M: 2 }, [otherId]: { 'One Size': 1 } });
  await h.manager.change('update', itemId, 'M', 0, 0);
  assert.equal(h.rendered()[itemId].M, undefined);
  assert.equal(h.calls.length, 0);
});

test('client rejects pollution, inherited size keys, invalid quantities and stock overflow before optimistic mutation', async () => {
  const h = harness();
  for (const id of ['__proto__', 'constructor', { $ne: null }]) await assert.rejects(h.manager.change('add', id, 'M', undefined, 10));
  for (const size of ['__proto__', 'constructor', 'prototype', 'M.L', '$M', ['M']]) await assert.rejects(h.manager.change('add', itemId, size, undefined, 10));
  for (const quantity of [-1, 0.1, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(h.manager.change('update', itemId, 'M', quantity, 10));
  await assert.rejects(h.manager.change('add', itemId, 'M', undefined, 0));
  assert.deepEqual(h.rendered(), {});
  assert.equal(Object.prototype.polluted, undefined);
});

test('restoration is a barrier and serial requests derive expected versions from confirmed state', async () => {
  const h = harness({ [itemId]: { M: 1 } });
  const load = deferred();
  h.state.before = async operation => { if (operation === 'get') await load.promise; };
  h.manager.connect(h.owner);
  const first = h.manager.change('add', itemId, 'M', undefined, 10);
  const second = h.manager.change('update', itemId, 'M', 4, 10);
  assert.equal(h.manager.isReady(), false);
  assert.equal(h.rendered()[itemId].M, 4);
  await tick();
  assert.deepEqual(h.calls.map(call => call.operation), ['get']);
  load.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(h.calls.slice(1).map(call => call.body.expectedQuantity), [1, 2]);
  assert.deepEqual(h.calls.slice(1).map(call => call.body.expectedVersion), [0, 1]);
  assert.equal(h.rendered()[itemId].M, 4);
  assert.equal(h.manager.isReady(), true);
});

test('application-level rejection removes only its failed optimistic intention and preserves queued newer intent', async () => {
  const h = harness();
  h.manager.connect(h.owner); await tick();
  const gate = deferred();
  h.state.before = async (operation, body) => {
    if (operation === 'add' && body.itemId === itemId) { await gate.promise; return { success: false, message: 'Synthetic stock changed.' }; }
  };
  const results = Promise.allSettled([h.manager.change('add', itemId, 'M', undefined, 10), h.manager.change('add', otherId, 'M', undefined, 10)]);
  assert.equal(h.rendered()[itemId].M, 1);
  assert.equal(h.rendered()[otherId].M, 1);
  gate.resolve();
  const settled = await results;
  assert.equal(settled[0].status, 'rejected');
  assert.match(settled[0].reason.message, /stock changed/);
  assert.equal(settled[1].status, 'fulfilled');
  assert.equal(h.rendered()[itemId], undefined);
  assert.equal(h.rendered()[otherId].M, 1);
  assert.equal(h.manager.isReady(), true);
});

test('commit-then-timeout refreshes canonical cart without replaying or falsely resolving the mutation', async () => {
  const h = harness();
  h.manager.connect(h.owner); await tick();
  h.state.before = async (operation, body) => {
    if (operation === 'add') {
      h.setServer({ cartData: { [itemId]: { M: 1 } }, cartVersions: { [itemId]: { M: body.expectedVersion + 1 } } });
      throw new Error('Synthetic network timeout');
    }
  };
  await assert.rejects(h.manager.change('add', itemId, 'M', undefined, 10), /timeout/);
  assert.equal(h.rendered()[itemId].M, 1);
  assert.equal(h.calls.filter(call => call.operation === 'add').length, 1);
  assert.equal(h.manager.isReady(), true);
});

test('failed writes and failed recovery keep checkout blocked until a valid restoration succeeds', async () => {
  const h = harness({ [itemId]: { M: 1 } });
  h.manager.connect(h.owner); await tick();
  h.state.before = async () => { throw new Error('Synthetic offline'); };
  await assert.rejects(h.manager.change('update', itemId, 'M', 2, 10), /offline/);
  assert.equal(h.rendered()[itemId].M, 1);
  assert.equal(h.manager.isReady(), false);
  assert.throws(() => h.manager.beginCheckout(), /syncing/);
  h.state.before = null;
  await h.manager.change('update', itemId, 'M', 3, 10);
  assert.equal(h.rendered()[itemId].M, 3);
  assert.equal(h.manager.isReady(), true);
});

test('failed initial load cannot produce success; guest-to-login loads server cart without merging guest data', async () => {
  const h = harness({ [otherId]: { L: 2 } });
  await h.manager.change('add', itemId, 'M', undefined, 10);
  h.state.before = async () => ({ success: false, message: 'Synthetic unavailable.' });
  h.manager.connect(h.owner); await tick();
  assert.deepEqual(h.rendered(), {});
  assert.equal(h.manager.isReady(), false);
  assert.equal(h.errors.length, 1);
  await assert.rejects(h.manager.change('add', itemId, 'M', undefined, 10), /unavailable/);
  h.state.before = null;
  await h.manager.retry();
  assert.deepEqual(h.rendered(), { [otherId]: { L: 2 } });
});

test('late restoration and writes cannot mutate a replacement session or an explicitly cleared cart', async () => {
  const h = harness({ [itemId]: { M: 2 } }), other = harness({ [otherId]: { L: 3 } });
  const gate = deferred();
  h.state.before = async operation => { if (operation === 'get') await gate.promise; };
  h.manager.connect(h.owner);
  h.manager.connect(other.owner); await tick();
  gate.resolve(); await tick();
  assert.deepEqual(h.rendered(), { [otherId]: { L: 3 } });
  const write = deferred();
  other.state.before = async operation => { if (operation === 'add') await write.promise; };
  const result = h.manager.change('add', otherId, 'L', undefined, 10);
  const rejection = assert.rejects(result, /session changed/);
  await tick();
  h.manager.reset();
  write.resolve(); await rejection;
  assert.deepEqual(h.rendered(), {});
});

test('successful checkout refresh retains concurrent additions and the new removal revision', async () => {
  const h = harness();
  h.manager.connect(h.owner); await tick();
  await h.manager.change('add', itemId, 'M', undefined, 10);
  const lease = h.manager.beginCheckout();
  assert.equal(lease.isCurrent(), true);
  await assert.rejects(h.manager.change('add', otherId, 'M', undefined, 10), /checkout/);
  assert.deepEqual(lease.snapshot, h.server());
  h.setServer({ cartData: { [otherId]: { L: 3 } }, cartVersions: { [itemId]: { M: 2 }, [otherId]: { L: 1 } } });
  await lease.complete(false); lease.finish();
  assert.equal(lease.isCurrent(), false);
  assert.equal(h.rendered()[otherId].L, 3);
  await h.manager.change('add', itemId, 'M', undefined, 10);
  assert.equal(h.calls.at(-1).body.expectedVersion, 2);
  assert.equal(h.rendered()[itemId].M, 1);
});

test('failed checkout leaves cart intact; failed success refresh blocks checkout until reload', async () => {
  const h = harness({ [itemId]: { M: 1 } });
  h.manager.connect(h.owner); await tick();
  const failed = h.manager.beginCheckout();
  failed.finish();
  assert.equal(h.rendered()[itemId].M, 1);
  assert.equal(h.manager.isReady(), true);
  const succeeded = h.manager.beginCheckout();
  h.state.before = async () => { throw new Error('Synthetic reload failure'); };
  await succeeded.complete(false); succeeded.finish();
  assert.equal(h.rendered()[itemId].M, 1);
  assert.equal(h.manager.isReady(), false);
  assert.match(h.errors.at(-1), /order was placed/);
  h.setServer({ cartData: { [otherId]: { M: 2 } }, cartVersions: { [itemId]: { M: 1 } } });
  h.state.before = null; await h.manager.retry();
  assert.deepEqual(h.rendered(), h.server().cartData);
  assert.equal(h.manager.isReady(), true);
});

test('checkout refresh cannot change a replacement owner; cleanup warnings remain truthful', async () => {
  const h = harness({ [itemId]: { M: 1 } }), other = harness({ [otherId]: { L: 2 } });
  h.manager.connect(h.owner); await tick();
  const lease = h.manager.beginCheckout(), gate = deferred();
  h.state.before = async () => { await gate.promise; };
  const refresh = lease.complete(false);
  h.manager.connect(other.owner); await tick();
  gate.resolve(); await refresh; lease.finish();
  assert.deepEqual(h.rendered(), other.server().cartData);
  assert.equal(h.errors.length, 0);
  const next = h.manager.beginCheckout();
  await next.complete(true); next.finish();
  assert.match(h.errors.at(-1), /cleanup could not be confirmed/);
  assert.deepEqual(h.rendered(), other.server().cartData);
});

test('checkout lease becomes invalid on token invalidation and cannot unlock a newer checkout', async () => {
  const h = harness();
  h.manager.connect(h.owner); await tick();
  const lease = h.manager.beginCheckout();
  h.invalidate();
  assert.equal(lease.isCurrent(), false);
  h.manager.connect(null);
  const next = h.manager.beginCheckout();
  lease.finish();
  assert.equal(h.manager.isReady(), false);
  assert.equal(next.isCurrent(), true);
  next.finish();
  assert.equal(h.manager.isReady(), true);
});

test('a queued reload cannot issue an old-owner request after logout or restore old private state', async () => {
  const h = harness();
  h.manager.connect(h.owner); await tick();
  const gate = deferred();
  h.state.before = async operation => { if (operation === 'add') await gate.promise; };
  const results = Promise.allSettled([h.manager.change('add', itemId, 'M', undefined, 10), h.manager.retry()]);
  await tick();
  const readsBeforeLogout = h.calls.filter(call => call.operation === 'get').length;
  h.invalidate(); h.manager.connect(null);
  gate.resolve(); await results;
  assert.equal(h.calls.filter(call => call.operation === 'get').length, readsBeforeLogout);
  assert.deepEqual(h.rendered(), {});
  assert.equal(h.manager.isReady(), true);
});

test('unsafe server snapshots and restored max-integer quantities do not corrupt optimistic state', async () => {
  const h = harness({ [itemId]: { M: Number.MAX_SAFE_INTEGER } });
  const gate = deferred();
  h.state.before = async operation => { if (operation === 'get') await gate.promise; };
  h.manager.connect(h.owner);
  const result = h.manager.change('add', itemId, 'M', undefined, Number.MAX_SAFE_INTEGER);
  const rejection = assert.rejects(result);
  h.state.before = async operation => {
    if (operation === 'get') await gate.promise;
    else return { success: false, message: 'Synthetic overflow.' };
  };
  gate.resolve(); await rejection;
  assert.equal(h.rendered()[itemId].M, Number.MAX_SAFE_INTEGER);
  assert.equal(h.manager.isReady(), true);
  h.state.before = async () => ({ success: true, cartData: JSON.parse('{"__proto__":{"polluted":1}}'), cartVersions: {} });
  h.manager.connect(h.owner); await tick();
  assert.equal(h.manager.isReady(), false);
  assert.equal(Object.prototype.polluted, undefined);
});
