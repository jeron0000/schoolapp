import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  stdin: { resolveDir: frontend, contents: `
    export { default as Provider } from './src/context/ShopContext.jsx';
    export { ShopContext } from './src/context/shopContext.js';
    export { default as Product } from './src/pages/Product.jsx';
    export { default as Cart } from './src/pages/Cart.jsx';
  ` },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  resolveExtensions: ['.js', '.jsx', '.json'],
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' },
  loader: { '.css': 'empty', '.png': 'dataurl', '.jpg': 'dataurl' },
  write: false
});
const compiled = new Module(path.join(frontend, 'shop-products-lifecycle-test.cjs'));
compiled.filename = path.join(frontend, 'shop-products-lifecycle-test.cjs');
compiled.paths = Module._nodeModulePaths(frontend);
const require = createRequire(compiled.filename);
const navigate = () => {};
compiled.require = name => name === 'react-router-dom'
  ? { ...require(name), useNavigate: () => navigate, useParams: () => ({ productId: 'synthetic-product' }) }
  : require(name);
compiled._compile(output.outputFiles[0].text, compiled.filename);
const { Provider, ShopContext } = compiled.exports;
const react = require('react');
const axios = require('axios');
const toast = require('react-toastify').toast;
const success = id => ({ data: { success: true, products: [{ _id: id }] } });

// Exercise the actual provider with persistent hook slots, dependency-aware
// effects and explicit cleanup. All requests stay as controlled promises.
const harness = t => {
  const slots = [];
  const requests = [];
  let cursor = 0;
  let scheduled = [];
  let writes = 0;
  const sameDependencies = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  t.mock.method(react, 'useState', initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = slots[index];
    slot.set ??= value => { writes++; slot.value = typeof value === 'function' ? value(slot.value) : value; };
    return [slot.value, slot.set];
  });
  t.mock.method(react, 'useRef', initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  });
  t.mock.method(react, 'useCallback', (callback, dependencies) => {
    const index = cursor++;
    if (!sameDependencies(slots[index]?.dependencies, dependencies)) slots[index] = { callback, dependencies };
    return slots[index].callback;
  });
  t.mock.method(react, 'useMemo', (calculate, dependencies) => {
    const index = cursor++;
    if (!sameDependencies(slots[index]?.dependencies, dependencies)) slots[index] = { value: calculate(), dependencies };
    return slots[index].value;
  });
  t.mock.method(react, 'useEffect', (callback, dependencies) => {
    const index = cursor++;
    const previous = slots[index];
    if (!sameDependencies(previous?.dependencies, dependencies)) {
      const slot = { callback, dependencies, cleanup: previous?.cleanup };
      slots[index] = slot;
      scheduled.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
    }
  });
  t.mock.method(axios, 'get', url => {
    if (url === 'https://api.example.test/api/category/public') {
      return Promise.resolve({
        data: {
          success: true,
          categories: [{ name: 'Information Technology', code: 'BSIT', scope: 'program' }],
          archivedCategories: [{ name: 'Hospitality Management', code: 'BSHM', scope: 'program' }],
        },
      });
    }
    assert.equal(url, 'https://api.example.test/api/product/list');
    let resolve, reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    requests.push({ resolve, reject });
    return promise;
  });
  t.mock.method(axios, 'post', () => assert.fail('Product loading must not issue cart/authentication mutations'));
  const notices = t.mock.method(toast, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => {
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else delete globalThis.localStorage;
  });
  const render = () => {
    cursor = 0;
    scheduled = [];
    const element = Provider({ children: 'unchanged children' });
    assert.equal(element.type, ShopContext.Provider);
    assert.equal(element.props.children, 'unchanged children');
    return element.props.value;
  };
  const cleanup = () => {
    for (const slot of slots) {
      slot.cleanup?.();
      if (slot.callback && slot.dependencies && 'cleanup' in slot) slot.cleanup = undefined;
    }
  };
  return {
    render, requests, notices, writes: () => writes,
    mount: () => { render(); for (const effect of scheduled) effect(); return render(); },
    unmount: cleanup,
    replayEffects: () => {
      cleanup();
      for (const slot of slots) if ('cleanup' in slot) slot.cleanup = slot.callback();
      return render();
    }
  };
};
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('initial successful load preserves products, context API and stable refresh callback', async t => {
  const h = harness(t);
  const initial = h.mount();
  assert.equal(initial.productsLoading, true);
  h.requests[0].resolve(success('initial'));
  await settle();
  const value = h.render();
  assert.equal(value.products[0]._id, 'initial');
  assert.equal(value.productsLoading, false);
  assert.equal(value.productError, '');
  assert.equal(value.getProductsData, initial.getProductsData);
  assert.deepEqual(value.productCategories, [
    { name: 'Information Technology', code: 'BSIT', scope: 'program' },
    { name: 'Hospitality Management', code: 'BSHM', scope: 'program', active: false },
  ]);
  assert.equal(value.categoriesLoading, false);
  assert.equal(value.categoryError, '');
  assert.equal(value.getProductCategories, initial.getProductCategories);
  assert.equal(value.currency, '₱');
  assert.equal(value.token, '');
  assert.equal(value.cartReady, true);
  assert.deepEqual(Object.keys(value).sort(), [
    'products', 'currency', 'delivery_fee', 'productsLoading', 'productError', 'search', 'setSearch',
    'productCategories', 'categoriesLoading', 'categoryError', 'getProductCategories',
    'showSearch', 'setShowSearch', 'cartItems', 'addToCart', 'setCartItems', 'cartReady', 'cartError',
    'reloadCart', 'isCartReady', 'beginCartCheckout', 'getCartCount', 'updateQuantity', 'getCartAmount',
    'navigate', 'backendUrl', 'setToken', 'token', 'sessionMessage', 'getProductsData', 'userId',
    'studentProfile', 'profileLoading', 'profileError', 'updateAcademicProgram'
  ].sort());
  h.unmount();
});

test('the next scheduled price activation triggers one catalog refresh without polling', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const h = harness(t);
  h.mount();
  h.requests[0].resolve({
    data: {
      success: true,
      products: [{ _id: 'before-change' }],
      nextPriceChangeAt: new Date(Date.now() + 1000).toISOString()
    }
  });
  await settle();

  assert.equal(h.requests.length, 1);
  t.mock.timers.tick(1000);
  t.mock.timers.tick(0);
  await settle();
  assert.equal(h.requests.length, 2);

  h.requests[1].resolve(success('after-change'));
  await settle();
  assert.equal(h.render().products[0]._id, 'after-change');
  h.unmount();
});

test('returning to a visible tab refreshes stale products once', async t => {
  let clock = 1_000_000;
  t.mock.method(Date, 'now', () => clock);
  const listeners = {};
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const documentSurface = {
    visibilityState: 'hidden',
    addEventListener: (name, listener) => { listeners[name] = listener; },
    removeEventListener: name => { delete listeners[name]; }
  };
  const windowSurface = {
    addEventListener: (name, listener) => { listeners[name] = listener; },
    removeEventListener: name => { delete listeners[name]; }
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentSurface });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowSurface });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  });

  const h = harness(t);
  h.mount();
  h.requests[0].resolve(success('initial'));
  await settle();
  clock += 2000;

  listeners.visibilitychange();
  assert.equal(h.requests.length, 1);
  documentSurface.visibilityState = 'visible';
  listeners.visibilitychange();
  listeners.focus();
  assert.equal(h.requests.length, 2);

  h.requests[1].resolve(success('visible-refresh'));
  await settle();
  assert.equal(h.render().products[0]._id, 'visible-refresh');
  h.unmount();
});

test('latest network and application failures preserve messages, existing products and fulfilled refresh promises', async t => {
  const h = harness(t);
  h.mount();
  h.requests[0].resolve(success('retained'));
  await settle();
  const failed = h.render().getProductsData();
  assert.equal(h.render().productsLoading, true);
  h.requests[1].reject(new Error('Network unavailable'));
  assert.equal(await failed, undefined);
  assert.equal(h.render().productError, 'Network unavailable');
  const invalid = h.render().getProductsData();
  h.requests[2].resolve({ data: { success: false, message: 'Catalog unavailable' } });
  assert.equal(await invalid, undefined);
  assert.equal(h.render().productsLoading, false);
  assert.equal(h.render().productError, 'Catalog unavailable');
  assert.equal(h.render().products[0]._id, 'retained');
  assert.equal(h.notices.mock.callCount(), 2);
  h.unmount();
});

for (const olderFailure of [false, true]) {
  for (const newerFailure of [false, true]) {
    test(`latest request wins: older ${olderFailure ? 'failure' : 'success'} after newer ${newerFailure ? 'failure' : 'success'}`, async t => {
      const h = harness(t);
      const initial = h.mount();
      const latest = initial.getProductsData();
      if (newerFailure) h.requests[1].reject(new Error('Newer failure'));
      else h.requests[1].resolve(success('newer'));
      assert.deepEqual(await latest, newerFailure ? undefined : [{ _id: 'newer' }]);
      const writes = h.writes();
      const notices = h.notices.mock.callCount();
      if (olderFailure) h.requests[0].reject(new Error('Older failure'));
      else h.requests[0].resolve(success('older'));
      await settle();
      assert.equal(h.writes(), writes);
      assert.equal(h.notices.mock.callCount(), notices);
      const value = h.render();
      assert.equal(value.productError, newerFailure ? 'Newer failure' : '');
      assert.deepEqual(value.products, newerFailure ? [] : [{ _id: 'newer' }]);
      assert.equal(value.productsLoading, false);
      h.unmount();
    });
  }
}

test('older failures cannot end loading while the newest refresh is pending', async t => {
  const h = harness(t);
  const value = h.mount();
  const latest = value.getProductsData();
  h.requests[0].reject(new Error('Obsolete failure'));
  await settle();
  assert.equal(h.render().productsLoading, true);
  assert.equal(h.render().productError, '');
  assert.equal(h.notices.mock.callCount(), 0);
  h.requests[1].resolve(success('latest'));
  await latest;
  assert.equal(h.render().productsLoading, false);
  h.unmount();
});

test('rapid refreshes and stale application failures cannot change the newest result', async t => {
  const h = harness(t);
  const value = h.mount();
  const refreshes = Array.from({ length: 8 }, () => value.getProductsData());
  h.requests[8].resolve(success('latest'));
  await refreshes[7];
  for (let i = 0; i < 8; i++) h.requests[i].resolve({ data: { success: false, message: 'Obsolete response' } });
  await Promise.all(refreshes);
  await settle();
  assert.equal(h.render().products[0]._id, 'latest');
  assert.equal(h.render().productError, '');
  assert.equal(h.notices.mock.callCount(), 0);
  h.unmount();
});

for (const failure of [false, true]) {
  test(`unmount invalidates active ${failure ? 'failure' : 'success'} and retained refresh callbacks`, async t => {
    const h = harness(t);
    const value = h.mount();
    h.unmount();
    const writes = h.writes();
    if (failure) h.requests[0].reject(new Error('Late failure'));
    else h.requests[0].resolve(success('late'));
    await settle();
    assert.equal(h.writes(), writes);
    assert.equal(h.notices.mock.callCount(), 0);
    assert.equal(await value.getProductsData(), undefined);
    assert.equal(h.requests.length, 1);
    assert.equal(h.writes(), writes);
  });
}

test('Strict Mode effect cleanup/setup replay allows new loads and subsequent refreshes', async t => {
  const h = harness(t);
  h.mount();
  const value = h.replayEffects();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve(success('replayed'));
  await settle();
  h.requests[0].resolve(success('obsolete first setup'));
  await settle();
  assert.equal(h.render().products[0]._id, 'replayed');
  const refresh = value.getProductsData();
  h.requests[2].resolve(success('refreshed'));
  await refresh;
  assert.equal(h.render().products[0]._id, 'refreshed');
  h.unmount();
});

test('a freshly mounted provider accepts new loads while the previous instance stays invalidated', async t => {
  const old = harness(t);
  old.mount();
  old.unmount();
  const current = harness(t);
  current.mount();
  current.requests[0].resolve(success('remounted'));
  await settle();
  const oldWrites = old.writes();
  old.requests[0].resolve(success('old instance'));
  await settle();
  assert.equal(old.writes(), oldWrites);
  assert.equal(current.render().products[0]._id, 'remounted');
  const refresh = current.render().getProductsData();
  current.requests[1].resolve(success('subsequent'));
  await refresh;
  assert.equal(current.render().products[0]._id, 'subsequent');
  current.unmount();
});

for (const name of ['Product', 'Cart']) {
  test(`${name} retains its existing mount refresh through the provider's public callback`, async t => {
    const h = harness(t);
    const value = h.mount();
    const effects = [];
    const mocks = [
      t.mock.method(react, 'useContext', context => { assert.equal(context, ShopContext); return value; }),
      t.mock.method(react, 'useEffect', (callback, dependencies) => { effects.push({ callback, dependencies }); }),
      t.mock.method(react, 'useLayoutEffect', () => {}),
      t.mock.method(react, 'useState', initial => [typeof initial === 'function' ? initial() : initial, () => {}]),
      t.mock.method(react, 'useRef', current => ({ current }))
    ];
    assert(react.isValidElement(compiled.exports[name]()));
    assert(effects.some(effect => effect.dependencies.includes(value.getProductsData)));
    for (const effect of effects) effect.callback();
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve(success('consumer refresh'));
    h.requests[0].resolve(success('older provider load'));
    await settle();
    for (const mock of mocks) mock.mock.restore();
    assert.equal(h.render().products[0]._id, 'consumer refresh');
    h.unmount();
  });
}
