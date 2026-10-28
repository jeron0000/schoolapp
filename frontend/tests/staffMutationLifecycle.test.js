import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'staff-mutation-test.cjs'));
const realReact = requireAdmin('react');
let currentRunner;
let environment;
const react = {
  ...realReact,
  useState: initial => currentRunner.state(initial),
  useRef: initial => currentRunner.ref(initial),
  useCallback: (callback, dependencies) => currentRunner.callback(callback, dependencies),
  useEffect: (callback, dependencies) => currentRunner.effect(callback, dependencies, 'passive'),
  useLayoutEffect: (callback, dependencies) => currentRunner.effect(callback, dependencies, 'layout')
};
const axios = {
  get: async () => ({ data: { success: true, categories: [], archivedCategories: [] } }),
  post: (url, body, options) => {
    let resolve, reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    environment.requests.push({ url, body, options, resolve, reject });
    return promise;
  }
};
const output = await build({
  stdin: { resolveDir: admin, contents: `
    export { default as Orders } from './src/pages/Orders.jsx';
    export { default as Cashier } from './src/pages/Cashier.jsx';
  ` },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
const compiled = new Module(path.join(admin, 'staff-mutation-test.cjs'));
compiled.filename = path.join(admin, 'staff-mutation-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return react;
  if (name === 'axios') return axios;
  if (name === 'react-router-dom') return { useLocation: () => currentRunner.location };
  if (name === 'react-toastify') return { toast: {
    success: (message, options) => environment.toasts.push(['success', message, options]),
    error: message => environment.toasts.push(['error', message])
  } };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);

// Use the real parent view mapping; only navigation itself is simulated.
const layout = readFileSync(path.join(admin, 'src/components/CashierLayout.jsx'), 'utf8');
const views = runInNewContext(layout.match(/const views = (\[[\s\S]*?\n\])/)[1]);
const changeFilter = runInNewContext('filter => ' + layout.match(/const changeFilter = filter => ([^\r\n]+)/)[1], {
  views,
  navigate: destination => { environment.navigation.push(destination); environment.path = destination; }
});
const fixtures = () => ['A', 'B'].map((_id, index) => ({
  _id, date: index + 1, amount: 225, payment: false, paymentMethod: 'COD', paymentCurrency: 'PHP',
  status: 'Sent to Cashier', allowedStatuses: ['Approved', 'Cancelled'], items: [], address: {}
}));
const success = (withOrder = true) => ({ data: {
  success: true, message: 'Synthetic completion',
  ...(withOrder ? { order: { ...fixtures()[0], payment: true, status: 'Packing' } } : {})
} });
const failure = () => Object.assign(new Error('Synthetic failure'), { response: { data: { message: 'Synthetic failure' } } });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const sameDependencies = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const find = (element, predicate) => {
  if (!realReact.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of realReact.Children.toArray(element.props.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
};

// Persistent hook slots model commit cleanup, token/view changes and unmount.
// No server operation is aborted, and every response is controlled by the test.
const runner = (t, kind, token = 'synthetic-old') => {
  const h = {
    slots: [], cursor: 0, effects: [], active: true, writes: [],
    location: { pathname: kind === 'Orders' ? '/orders' : '/cashier/payments', key: 'initial', state: null },
    props: { token, title: 'Payments', filter: 'Awaiting Payment', onFilterChange: changeFilter }
  };
  h.state = initial => {
    const index = h.cursor++;
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    const slot = h.slots[index];
    return [slot.value, value => {
      h.writes.push({ active: h.active });
      slot.value = typeof value === 'function' ? value(slot.value) : value;
    }];
  };
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial };
  h.callback = (callback, dependencies) => {
    const index = h.cursor++;
    if (!sameDependencies(h.slots[index]?.dependencies, dependencies)) h.slots[index] = { callback, dependencies };
    return h.slots[index].callback;
  };
  h.effect = (callback, dependencies, phase) => {
    const index = h.cursor++;
    const previous = h.slots[index];
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      const slot = { dependencies, callback, phase, cleanup: previous?.cleanup };
      h.slots[index] = slot;
      h.effects.push({ phase, run: () => { slot.cleanup?.(); slot.cleanup = callback(); } });
    }
  };
  h.render = () => {
    h.cursor = 0;
    h.effects = [];
    currentRunner = h;
    try { h.tree = compiled.exports[kind](h.props); }
    finally { currentRunner = null; }
    const attachRefs = node => {
      if (!realReact.isValidElement(node)) return;
      const ref = node.props.ref;
      if (ref && typeof ref === 'object' && !ref.current) ref.current = {
        open: false, show() { this.open = true; }, showModal() { this.open = true; }, close() { this.open = false; }
      };
      realReact.Children.toArray(node.props.children).forEach(attachRefs);
    };
    attachRefs(h.tree);
    return h;
  };
  h.flush = () => {
    for (const phase of ['layout', 'passive']) for (const effect of h.effects) if (effect.phase === phase) effect.run();
  };
  h.unmount = () => {
    h.active = false;
    for (const slot of h.slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined; }
  };
  h.replayEffects = () => {
    for (const slot of h.slots) slot?.cleanup?.();
    for (const phase of ['layout', 'passive']) {
      for (const slot of h.slots) if (slot?.phase === phase) slot.cleanup = slot.callback();
    }
  };
  h.update = (props = {}, location = {}) => {
    Object.assign(h.props, props);
    Object.assign(h.location, location);
    h.render();
    h.flush();
  };
  h.api = () => {
    h.render();
    return find(h.tree, node => kind === 'Orders' ? typeof node.props.onAction === 'function' : typeof node.props.onConfirm === 'function').props;
  };
  h.mutate = () => {
    const api = h.api();
    return kind === 'Orders' ? api.onAction(fixtures()[0], 'Approved') : api.onConfirm('A', { paymentMethod: 'COD', receiptNumber: 'SYNTHETIC-OR' });
  };
  h.select = id => {
    h.render();
    const node = find(h.tree, element => kind === 'Orders'
      ? element.props['aria-label'] === 'View order ' + id
      : typeof element.props.onView === 'function');
    if (kind === 'Orders') node.props.onClick();
    else node.props.onView(id);
    h.render();
  };
  h.refresh = () => {
    h.render();
    return find(h.tree, node => node.type === 'button' && typeof node.props.onClick === 'function'
      && JSON.stringify(node.props.children).includes('Refresh')).props.onClick();
  };
  h.render();
  h.flush();
  t.after(h.unmount);
  return h;
};
const setup = t => {
  environment = { requests: [], toasts: [], navigation: [], path: '/cashier/payments' };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    innerWidth: 1600, confirm: () => true,
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  } });
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: null, body: { style: { overflow: '' } } } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
  });
  return environment;
};
const ready = async (t, kind, token) => {
  const h = runner(t, kind, token);
  environment.requests.at(-1).resolve({ data: { success: true, orders: fixtures() } });
  await settle();
  h.render();
  return h;
};

for (const kind of ['Orders', 'Cashier']) {
  for (const failed of [false, true]) {
    test(`${kind}: active ${failed ? 'failure' : 'success'} retains feedback and releases submission lock`, async t => {
      const env = setup(t);
      const h = await ready(t, kind);
      const pending = h.mutate();
      const request = env.requests.at(-1);
      assert.equal(h.api().pending, true);
      failed ? request.reject(failure()) : request.resolve(success());
      assert.equal(await pending, undefined);
      assert.equal(h.api().pending, false);
      assert.equal(env.toasts.at(-1)[0], failed ? 'error' : 'success');
      assert.deepEqual(env.navigation, kind === 'Cashier' && !failed ? ['/cashier/paid'] : []);
      const next = h.mutate();
      assert.notEqual(env.requests.at(-1), request);
      env.requests.at(-1).reject(failure());
      await next;
    });

    test(`${kind}: unmount/logout before ${failed ? 'failure' : 'success'} suppresses all completion UI effects`, async t => {
      const env = setup(t);
      const h = await ready(t, kind);
      const pending = h.mutate();
      const request = env.requests.at(-1);
      h.unmount();
      env.path = '/login';
      const writes = h.writes.length;
      failed ? request.reject(failure()) : request.resolve(success());
      assert.equal(await pending, undefined);
      assert.equal(h.writes.length, writes);
      assert.deepEqual(env.toasts, []);
      assert.deepEqual(env.navigation, []);
      assert.equal(env.path, '/login');
      assert.equal(env.requests.length, 2);
    });

    test(`${kind}: newer same-instance navigation suppresses late ${failed ? 'failure' : 'success'}`, async t => {
      const env = setup(t);
      const h = await ready(t, kind);
      const pending = h.mutate();
      const request = env.requests.at(-1);
      h.update(kind === 'Cashier' ? { filter: 'Transactions' } : {}, { key: 'new-navigation', pathname: kind === 'Cashier' ? '/cashier/transactions' : '/orders' });
      env.path = h.location.pathname;
      failed ? request.reject(failure()) : request.resolve(success());
      await pending;
      assert.deepEqual(env.toasts, []);
      assert.deepEqual(env.navigation, []);
      h.select('A');
      assert.equal(h.api().order.payment, false);
      assert.equal(h.api().pending, false);
    });
  }

  test(`${kind}: token replacement keeps newer data and releases only the old request's busy lock`, async t => {
    const env = setup(t);
    const h = await ready(t, kind);
    const pending = h.mutate();
    const request = env.requests.at(-1);
    h.update({ token: 'synthetic-replacement' });
    const read = env.requests.at(-1);
    assert.notEqual(read, request);
    read.resolve({ data: { success: true, orders: fixtures().map(order => ({ ...order, status: 'Replacement view' })) } });
    await settle();
    request.resolve(success());
    await pending;
    h.select('A');
    assert.equal(h.api().order.status, 'Replacement view');
    assert.equal(h.api().order.payment, false);
    assert.equal(h.api().pending, false);
    assert.deepEqual(env.toasts, []);
    assert.deepEqual(env.navigation, []);
    const next = h.mutate();
    assert.equal(env.requests.at(-1).options.headers.token, 'synthetic-replacement');
    env.requests.at(-1).reject(failure());
    await next;
  });

  test(`${kind}: a remounted session receives no late results or notifications`, async t => {
    const env = setup(t);
    const old = await ready(t, kind);
    const pending = old.mutate();
    const request = env.requests.at(-1);
    old.unmount();
    const current = await ready(t, kind, 'synthetic-new-session');
    const writes = current.writes.length;
    request.resolve(success());
    await pending;
    assert.equal(current.writes.length, writes);
    assert.deepEqual(env.toasts, []);
    assert.deepEqual(env.navigation, []);
  });

  test(`${kind}: rapid duplicate submissions issue one uncancelled backend operation`, async t => {
    const env = setup(t);
    const h = await ready(t, kind);
    const pending = h.mutate();
    const request = env.requests.at(-1);
    await h.mutate();
    assert.equal(env.requests.length, 2);
    assert.equal(request.options.signal, undefined);
    h.update({}, { key: 'away-and-back' });
    await h.mutate();
    assert.equal(env.requests.length, 2);
    request.resolve(success());
    await pending;
    assert.equal(h.api().pending, false);
  });

  test(`${kind}: existing list generation ignores obsolete responses and unmounted reads`, async t => {
    const env = setup(t);
    const h = await ready(t, kind);
    const first = h.refresh();
    const older = env.requests.at(-1);
    const second = h.refresh();
    env.requests.at(-1).resolve({ data: { success: true, orders: fixtures() } });
    await second;
    const writes = h.writes.length;
    older.resolve({ data: { success: true, orders: [] } });
    await first;
    assert.equal(h.writes.length, writes);
    const last = h.refresh();
    const read = env.requests.at(-1);
    h.unmount();
    const before = h.writes.length;
    read.reject(failure());
    await last;
    assert.equal(h.writes.length, before);
  });

  test(`${kind}: effect replay permits legitimate mutations after cleanup/setup`, async t => {
    const env = setup(t);
    const h = await ready(t, kind);
    h.replayEffects();
    env.requests.at(-1).resolve({ data: { success: true, orders: fixtures() } });
    await settle();
    const pending = h.mutate();
    env.requests.at(-1).resolve(success());
    await pending;
    assert.equal(env.toasts.at(-1)[0], 'success');
    assert.equal(h.api().pending, false);
  });
}

test('Orders: active fallback reconciliation completes before success feedback', async t => {
  const env = setup(t);
  const h = await ready(t, 'Orders');
  const pending = h.mutate();
  env.requests.at(-1).resolve(success(false));
  await settle();
  assert.equal(env.requests.length, 3);
  assert(env.requests.at(-1).url.endsWith('/api/order/list'));
  assert.equal(env.toasts.length, 0);
  env.requests.at(-1).resolve({ data: { success: true, orders: fixtures() } });
  await pending;
  assert.equal(env.toasts.at(-1)[0], 'success');
  assert.equal(h.api().pending, false);
});

test('Orders: unmount before mutation completion prevents fallback reconciliation', async t => {
  const env = setup(t);
  const h = await ready(t, 'Orders');
  const pending = h.mutate();
  const request = env.requests.at(-1);
  h.unmount();
  request.resolve(success(false));
  await settle();
  // Resolve any unexpected baseline read so this regression fails rather than hangs.
  const unexpected = env.requests.at(-1);
  if (unexpected !== request) unexpected.resolve({ data: { success: true, orders: fixtures() } });
  await pending;
  assert.equal(env.requests.length, 2);
  assert.deepEqual(env.toasts, []);
});

test('Orders: leaving during fallback reconciliation suppresses its late notification', async t => {
  const env = setup(t);
  const h = await ready(t, 'Orders');
  const pending = h.mutate();
  env.requests.at(-1).resolve(success(false));
  await settle();
  const read = env.requests.at(-1);
  h.unmount();
  const before = h.writes.length;
  read.resolve({ data: { success: true, orders: fixtures() } });
  await pending;
  assert.deepEqual(env.toasts, []);
  assert.equal(h.writes.length, before);
});

for (const failed of [false, true]) {
  test(`Orders: navigation during fallback read ignores its late ${failed ? 'failure' : 'data'}`, async t => {
    const env = setup(t);
    const h = await ready(t, 'Orders');
    const pending = h.mutate();
    env.requests.at(-1).resolve(success(false));
    await settle();
    const read = env.requests.at(-1);
    h.update({}, { key: 'new-view-during-reconciliation' });
    if (failed) read.reject(failure());
    else read.resolve({ data: { success: true, orders: fixtures().map(order => ({ ...order, payment: true })) } });
    await pending;
    assert.deepEqual(env.toasts, []);
    h.select('A');
    assert.equal(h.api().order.payment, false);
    assert.equal(h.api().pending, false);
  });
}

test('Orders: selection and local filters may change without losing valid order completion', async t => {
  const env = setup(t);
  const h = await ready(t, 'Orders');
  h.select('A');
  const pending = h.mutate();
  const request = env.requests.at(-1);
  h.select('B');
  assert.equal(h.api().order._id, 'B');
  h.render();
  const filterButton = find(h.tree, node => node.type === 'button' && node.props['aria-pressed'] === false
    && typeof node.props.onClick === 'function');
  assert(filterButton);
  filterButton.props.onClick();
  request.resolve(success());
  await pending;
  assert.equal(h.api().order, undefined);
  assert.equal(env.toasts.at(-1)[0], 'success');
  const allOrders = find(h.tree, node => node.type === 'button' && node.props['aria-pressed'] === false
    && JSON.stringify(node.props.children).includes('All Orders'));
  allOrders.props.onClick();
  h.select('A');
  assert.equal(h.api().order.payment, true);
});

test('Cashier: a filter-only view change suppresses automatic Paid navigation', async t => {
  const env = setup(t);
  const h = await ready(t, 'Cashier');
  const pending = h.mutate();
  h.update({ filter: 'Receipt Records' });
  env.requests.at(-1).resolve(success());
  await pending;
  assert.deepEqual(env.navigation, []);
  assert.deepEqual(env.toasts, []);
  assert.equal(h.api().pending, false);
});

const readyClaim = async t => {
  const h = runner(t, 'Orders');
  const order = { ...fixtures()[0], payment: true, status: 'Ready To Claim', allowedStatuses: ['Claimed'] };
  environment.requests[0].resolve({ data: { success: true, orders: [order] } });
  await settle();
  h.select('A');
  return { h, order };
};
const button = (h, text) => find(h.tree, node => node.type === 'button' && node.props.children === text);

test('Orders V2: payment selection composes with progress without changing order states', async t => {
  const env = setup(t);
  const h = runner(t, 'Orders');
  const orders = [
    { ...fixtures()[0], status: 'Ready To Claim', payment: true },
    { ...fixtures()[1], status: 'Ready To Claim', payment: false }
  ];
  env.requests[0].resolve({ data: { success: true, orders } });
  await settle();
  h.render();
  assert.equal(h.api().order, undefined, 'inspector is closed until View');
  const progress = find(h.tree, node => node.props['aria-label'] === 'Filter orders');
  assert(!find(progress, node => node.type === 'button' && JSON.stringify(node.props.children).includes('"Paid"')));
  find(h.tree, node => node.type === 'select').props.onChange({ target: { value: 'Paid' } });
  h.render();
  assert(find(h.tree, node => node.props['aria-label'] === 'View order A'));
  assert(!find(h.tree, node => node.props['aria-label'] === 'View order B'));
  find(h.tree, node => node.type === 'button' && JSON.stringify(node.props.children).includes('Ready for Release')).props.onClick();
  h.render();
  assert(find(h.tree, node => node.props['aria-label'] === 'View order A'));
  assert.equal(env.requests.length, 1);
  assert(orders.every(order => order.status === 'Ready To Claim'));
});

test('Orders V2: claim requires deliberate confirmation and prevents duplicate mutations', async t => {
  const env = setup(t);
  const { h, order } = await readyClaim(t);
  h.api().onAction(order, 'Claimed');
  h.render(); h.flush();
  assert.equal(env.requests.length, 1, 'opening confirmation cannot change an order');
  const confirm = button(h, 'Confirm Claim');
  const pending = confirm.props.onClick();
  await confirm.props.onClick();
  assert.equal(env.requests.length, 2);
  assert.deepEqual(env.requests[1].body, { orderId: 'A', status: 'Claimed' });
  h.render();
  assert(button(h, 'Updating…').props.disabled);
  env.requests[1].resolve({ data: { success: true, order: { ...order, status: 'Claimed', allowedStatuses: [] } } });
  await pending;
  assert.equal(h.api().order.status, 'Claimed');
  assert.equal(h.api().pending, false);
  const [, content, options] = env.toasts.at(-1);
  const renderedToast = content.type(content.props);
  assert(find(renderedToast, node => node.props.children === 'Order successfully claimed'));
  assert(find(renderedToast, node => node.props.children === 'The order has been marked as claimed.'));
  assert.equal(options.autoClose, 4000);
  assert.equal(options.hideProgressBar, true);
  assert.equal(options.icon, false);
});

test('Orders V2: cancelled confirmation and ineligible claim make no requests', async t => {
  const env = setup(t);
  const { h, order } = await readyClaim(t);
  h.api().onAction(order, 'Claimed');
  h.render();
  button(h, 'Keep reviewing').props.onClick();
  h.render();
  assert(button(h, 'Confirm Claim').props.disabled);
  h.api().onAction({ ...order, allowedStatuses: [] }, 'Claimed');
  h.render();
  assert(button(h, 'Confirm Claim').props.disabled);
  assert.equal(env.requests.length, 1);
});

test('Orders V2: rejected claim refreshes authoritative eligibility and keeps selected context', async t => {
  const env = setup(t);
  const { h, order } = await readyClaim(t);
  h.api().onAction(order, 'Claimed');
  h.render();
  const pending = button(h, 'Confirm Claim').props.onClick();
  env.requests[1].reject(failure());
  await settle();
  assert.equal(env.requests.length, 3);
  assert(env.requests[2].url.endsWith('/api/order/list'));
  env.requests[2].resolve({ data: { success: true, orders: [{ ...order, status: 'Claimed', allowedStatuses: [] }] } });
  await pending;
  assert.equal(h.api().order._id, 'A');
  assert.deepEqual(h.api().order.allowedStatuses, []);
  assert.equal(h.api().error, 'Synthetic failure');
});

test('Orders V2: late claim failure after unmount cannot refresh or notify the next view', async t => {
  const env = setup(t);
  const { h, order } = await readyClaim(t);
  h.api().onAction(order, 'Claimed');
  h.render();
  const pending = button(h, 'Confirm Claim').props.onClick();
  h.unmount();
  env.requests[1].reject(failure());
  await pending;
  assert.equal(env.requests.length, 2);
  assert.deepEqual(env.toasts, []);
});

for (const decision of ['approve', 'reject']) test(`cancellation review: ${decision} requires confirmation and submits once`, async t => {
  const env = setup(t);
  const h = runner(t, 'Orders');
  const order = { ...fixtures()[0], status: 'Packing', payment: true, allowedStatuses: [],
    cancellationRequest: { _id: 'request-A', status: 'pending', reason: 'Wrong size', requestedAt: Date.now() } };
  env.requests[0].resolve({ data: { success: true, orders: [order] } });
  await settle();
  h.select('A');
  h.api().onReview(order, decision);
  h.render(); h.flush();
  assert.equal(env.requests.length, 1);
  if (decision === 'reject') {
    assert.equal(button(h, 'Confirm Decision').props.disabled, true);
    find(h.tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Preparation already started.' } });
    h.render();
  }
  const confirm = button(h, 'Confirm Decision');
  assert.equal(confirm.props.disabled, false);
  const pending = confirm.props.onClick();
  await confirm.props.onClick();
  assert.equal(env.requests.length, 2);
  assert(env.requests[1].url.endsWith('/api/order/cancellation/review'));
  assert.deepEqual(env.requests[1].body, { orderId: 'A', requestId: 'request-A', decision,
    ...(decision === 'reject' ? { reason: 'Preparation already started.' } : {}) });
  const updated = { ...order, status: decision === 'approve' ? 'Cancelled' : 'Packing',
    cancellationRequest: { ...order.cancellationRequest, status: decision === 'approve' ? 'approved' : 'rejected' } };
  env.requests[1].resolve({ data: { success: true, message: 'Decision saved.', order: updated } });
  await pending;
  assert.equal(h.api().order.cancellationRequest.status, updated.cancellationRequest.status);
  assert.equal(h.api().pending, false);
});

test('exceptional online cancellation reuses Admin confirmation, requires a reason, and submits once', async t => {
  const env = setup(t);
  const h = runner(t, 'Orders');
  const order = { ...fixtures()[0], status: 'Packing', paymentMethod: 'Paypal', payment: true, allowedStatuses: [] };
  env.requests[0].resolve({ data: { success: true, orders: [order] } });
  await settle();
  h.select('A');
  h.api().onReview(order, 'exception');
  h.render(); h.flush();
  assert.equal(env.requests.length, 1);
  assert.equal(button(h, 'Confirm Decision').props.disabled, true);
  find(h.tree, node => node.type === 'textarea').props.onChange({ target: { value: 'Merchant cannot fulfill the item.' } });
  h.render();
  const confirm = button(h, 'Confirm Decision');
  const pending = confirm.props.onClick();
  await confirm.props.onClick();
  assert.equal(env.requests.length, 2);
  assert.deepEqual(env.requests[1].body, {
    orderId: 'A', decision: 'exception', expectedStatus: 'Packing', reason: 'Merchant cannot fulfill the item.'
  });
  env.requests[1].resolve({ data: { success: true, message: 'Refund requires review.', order: {
    ...order, status: 'Cancelled', refund: { status: 'Refund Required', requiredAt: 1 }
  } } });
  await pending;
  assert.equal(h.api().order.refund.status, 'Refund Required');
  assert.equal(h.api().pending, false);
});
