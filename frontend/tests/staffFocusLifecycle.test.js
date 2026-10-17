import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'staff-focus-test.cjs'));
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
const output = await build({
  stdin: { resolveDir: admin, contents: `
    export { default as Orders } from './src/pages/Orders.jsx';
    export { default as Cashier } from './src/pages/Cashier.jsx';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
const compiled = new Module(path.join(admin, 'staff-focus-test.cjs'));
compiled.filename = path.join(admin, 'staff-focus-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return react;
  if (name === 'react-router-dom') return { useLocation: () => currentRunner.location };
  if (name === 'react-toastify') return { toast: { success() {}, error() {} } };
  if (name === 'axios') return { post: (url, _body, options) => {
    assert(url.endsWith('/list'), 'Focus tests must never issue mutations');
    assert.equal(options.headers.token, 'synthetic-only');
    return Promise.resolve({ data: { success: true, orders: fixtures } });
  } };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);
const fixtures = ['A', 'B'].map((_id, date) => ({
  _id, date, amount: 225, payment: false, paymentMethod: 'COD', paymentCurrency: 'PHP',
  status: 'Sent to Cashier', allowedStatuses: [], items: [], address: {}
}));
const find = (element, predicate) => {
  if (!realReact.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of realReact.Children.toArray(element.props.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
};
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const sameDependencies = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

const setup = (t, width = 390, reducedMotion = false) => {
  const env = { timers: new Map(), callbacks: [], focus: [], scroll: [], panel: null, width, reducedMotion, unmounts: [] };
  let nextTimer = 0;
  const globals = {
    window: {
      innerWidth: width,
      setTimeout: (callback, delay) => {
        assert.equal(delay, 0);
        env.callbacks.push(callback);
        env.timers.set(++nextTimer, callback);
        return nextTimer;
      },
      clearTimeout: id => env.timers.delete(id),
      matchMedia: query => {
        assert(['(prefers-reduced-motion: reduce)', '(min-width: 1280px)'].includes(query));
        return { matches: query.includes('1280') ? width >= 1280 : env.reducedMotion, addEventListener() {}, removeEventListener() {} };
      }
    },
    document: { body: { style: { overflow: '' } }, activeElement: null, getElementById: id => env.panel?.id === id ? env.panel : null }
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      for (const unmount of env.unmounts.splice(0)) unmount();
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  env.runTimers = () => {
    for (const [id, callback] of [...env.timers]) { env.timers.delete(id); callback(); }
  };
  environment = env;
  return env;
};

// Model hook commits and DOM targets while using the actual page event handlers.
const mount = async (t, kind) => {
  const h = {
    slots: [], cursor: 0, effects: [], panel: null,
    props: { token: 'synthetic-only', title: 'Payments', filter: 'Awaiting Payment', onFilterChange() {} },
    location: { key: 'initial', state: null }
  };
  h.state = initial => {
    const index = h.cursor++;
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    const slot = h.slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
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
      const slot = { dependencies, cleanup: previous?.cleanup };
      h.slots[index] = slot;
      h.effects.push({ phase, run: () => { slot.cleanup?.(); slot.cleanup = callback(); } });
    }
  };
  h.commit = () => {
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
    h.details = find(h.tree, node => kind === 'Orders'
      ? typeof node.props.onAction === 'function'
      : typeof node.props.onConfirm === 'function');
    const order = h.details.props.order;
    if (!order) h.panel = null;
    else if (h.panel?.orderId !== order._id) {
      const panel = {
        id: kind === 'Orders' ? 'order-details' : 'payment-details', orderId: order._id,
        scrollIntoView: options => environment.scroll.push({ panel, options }),
        focus: options => environment.focus.push({ panel, options })
      };
      h.panel = panel;
    }
    environment.panel = h.panel;
    for (const phase of ['layout', 'passive']) for (const effect of h.effects) if (effect.phase === phase) effect.run();
    return h;
  };
  h.view = id => {
    if (kind === 'Orders') find(h.tree, node => node.props['aria-label'] === 'View order ' + id).props.onClick();
    else find(h.tree, node => typeof node.props.onView === 'function').props.onView(id);
    return h.commit();
  };
  h.close = () => { h.details.props.onClose(); return h.commit(); };
  h.unmount = () => {
    for (const slot of h.slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined; }
    if (environment.panel === h.panel) environment.panel = null;
  };
  h.commit();
  await settle();
  h.commit();
  environment.unmounts.push(h.unmount);
  return h;
};

for (const kind of ['Orders', 'Cashier']) {
  for (const reducedMotion of [false, true]) {
    test(`${kind}: mobile View opens and focuses its keyboard-focusable panel (${reducedMotion ? 'reduced' : 'normal'} motion)`, async t => {
      const env = setup(t, 390, reducedMotion);
      const h = await mount(t, kind);
      h.view('A');
      assert.equal(h.details.props.order._id, 'A');
      assert.equal(env.focus.length, 0);
      assert.equal(env.timers.size, 1);
      env.runTimers();
      assert.equal(env.focus.length, 1);
      assert.equal(env.focus[0].panel, h.panel);
      assert.deepEqual(env.focus[0].options, { preventScroll: true });
      assert.deepEqual(env.scroll[0].options, { behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      assert.equal(env.timers.size, 0);
      // OrderDetails is stateless; PaymentDetails needs only its two local input states.
      currentRunner = { state: initial => [initial, () => {}] };
      const markup = h.details.type(h.details.props);
      currentRunner = null;
      assert.equal(markup.props.id, h.panel.id);
      assert.equal(markup.props.tabIndex, -1);
    });
  }

  test(`${kind}: desktop selection schedules no focus or scroll`, async t => {
    const env = setup(t, 1280);
    const h = await mount(t, kind);
    h.view('A');
    assert.equal(env.timers.size, 0);
    env.runTimers();
    assert.equal(env.focus.length, 0);
    assert.equal(env.scroll.length, 0);
  });

  test(`${kind}: rapid selections focus only the newest panel once`, async t => {
    const env = setup(t);
    const h = await mount(t, kind);
    h.view('A');
    h.view('B');
    const queued = env.timers.size;
    env.runTimers();
    assert.equal(env.focus.length, 1);
    assert.equal(env.scroll.length, 1);
    assert.equal(env.focus[0].panel.orderId, 'B');
    assert.equal(queued, 1);
  });

  test(`${kind}: closing details clears pending focus and cannot target an unrelated matching ID`, async t => {
    const env = setup(t);
    const h = await mount(t, kind);
    h.view('A');
    const oldPanel = h.panel;
    h.close();
    const queued = env.timers.size;
    env.panel = oldPanel;
    env.runTimers();
    assert.equal(env.focus.length, 0);
    assert.equal(env.scroll.length, 0);
    assert.equal(queued, 0);
  });

  test(`${kind}: navigation invalidates focus even if a panel with the same ID remains`, async t => {
    const env = setup(t);
    const h = await mount(t, kind);
    h.view('A');
    h.location.key = 'new-navigation';
    h.commit();
    assert.equal(env.timers.size, 0);
    env.runTimers();
    assert.equal(env.focus.length, 0);
    assert.equal(env.scroll.length, 0);
  });

  test(`${kind}: unmount prevents a timer from focusing the next mounted instance`, async t => {
    const env = setup(t);
    const old = await mount(t, kind);
    old.view('A');
    old.unmount();
    const current = await mount(t, kind);
    current.view('B');
    const queued = env.timers.size;
    env.runTimers();
    assert.equal(env.focus.length, 1);
    assert.equal(env.focus[0].panel, current.panel);
    assert.equal(env.focus[0].panel.orderId, 'B');
    assert.equal(queued, 1);
  });

  test(`${kind}: repeated View on the same selection still focuses, and cleanup removes its timer`, async t => {
    const env = setup(t);
    const h = await mount(t, kind);
    h.view('A');
    env.runTimers();
    h.view('A');
    assert.equal(env.timers.size, 1);
    env.runTimers();
    assert.equal(env.focus.length, 2);
    h.view('A');
    h.unmount();
    assert.equal(env.timers.size, 0);
  });

  test(`${kind}: repeated mount/unmount leaves no obsolete timers`, async t => {
    const env = setup(t);
    for (let i = 0; i < 4; i++) {
      const h = await mount(t, kind);
      h.view('A');
      h.unmount();
    }
    assert.equal(env.timers.size, 0);
    env.runTimers();
    assert.equal(env.focus.length, 0);
  });

  test(`${kind}: invalidated callbacks cannot act even if retained by the timer dispatcher`, async t => {
    const env = setup(t);
    const h = await mount(t, kind);
    h.view('A');
    const callback = env.callbacks.at(-1);
    const panel = h.panel;
    h.close();
    env.panel = panel;
    callback();
    assert.equal(env.focus.length, 0);
    assert.equal(env.scroll.length, 0);
  });
}
