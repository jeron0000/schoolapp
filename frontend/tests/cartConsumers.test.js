import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  stdin: { resolveDir: frontend, loader: 'jsx', contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { MemoryRouter } from 'react-router-dom';
    import Cart from './src/pages/Cart.jsx';
    import PlaceOrder from './src/pages/PlaceOrder.jsx';
    import { ShopContext } from './src/context/shopContext.js';
    export { default as checkout } from './src/pages/PlaceOrder.jsx';
    export { default as cart } from './src/pages/Cart.jsx';
    export const cartHTML = (context, theme) => renderToStaticMarkup(<MemoryRouter><div data-theme={theme}><ShopContext.Provider value={context}><Cart /></ShopContext.Provider></div></MemoryRouter>);
    export const checkoutHTML = context => renderToStaticMarkup(<MemoryRouter><ShopContext.Provider value={context}><PlaceOrder /></ShopContext.Provider></MemoryRouter>);
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'], loader: { '.css': 'empty' },
  plugins: [{ name: 'synthetic-cart-assets', setup(builder) {
    builder.onLoad({ filter: /\.(png|jpg)$/ }, () => ({ contents: 'export default "https://example.test/synthetic.png"', loader: 'js' }));
  } }]
});
const compiled = new Module(path.join(frontend, 'cart-consumers-test.cjs'));
compiled.filename = path.join(frontend, 'cart-consumers-test.cjs');
compiled.paths = Module._nodeModulePaths(frontend);
compiled.require = createRequire(compiled.filename);
compiled._compile(output.outputFiles[0].text, compiled.filename);
const react = compiled.require('react');
const id = '0123456789abcdef01234567';
const product = { _id: id, name: 'Synthetic uniform', price: 225, image: [], sizes: ['M'], inventory: { M: 10 } };
const context = overrides => ({ products: [product], cartItems: { [id]: { M: 1 } }, currency: '$', delivery_fee: 10,
  getCartAmount: () => 225, backendUrl: 'https://api.example.test', token: 'synthetic-only', userId: 'student-1', navigate() {},
  getProductsData: async () => [product], updateQuantity: async () => {}, setCartItems() {},
  studentProfile: { name: 'Synthetic Student', email: 'student@example.test', academicProgram: 'BSIT' },
  profileLoading: false, profileError: '', ...overrides });
const find = (element, predicate) => {
  if (!react.isValidElement(element)) return null;
  if (predicate(element)) return element;
  for (const child of react.Children.toArray(element.props.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const storageFixture = (t, values) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: key => values[key] ?? null, setItem() {}, removeItem() {} }
  });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else Reflect.deleteProperty(globalThis, 'sessionStorage'); });
};
const hooks = (t, value, initialStorage = {}) => {
  t.mock.method(react, 'useContext', () => value);
  t.mock.method(react, 'useMemo', calculate => calculate());
  t.mock.method(react, 'useCallback', callback => callback);
  t.mock.method(react, 'useRef', current => ({ current }));
  t.mock.method(react, 'useEffect', () => {});
  t.mock.method(react, 'useState', initial => [initial, () => {}]);
  t.mock.method(compiled.require('react-toastify').toast, 'error', () => {});
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const storageChanges = [];
  const storageValues = new Map(Object.entries(initialStorage));
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => storageValues.get(key) ?? null,
    setItem: (key, value) => { storageValues.set(key, value); storageChanges.push('write'); },
    removeItem: key => { storageValues.delete(key); storageChanges.push('remove'); }
  } });
  t.after(() => { if (storage) Object.defineProperty(globalThis, 'sessionStorage', storage); else Reflect.deleteProperty(globalThis, 'sessionStorage'); });
  return storageChanges;
};

for (const component of ['cart', 'checkout']) {
  test(`${component} reuses product lookup across quantity changes and replaces it on catalog refresh`, t => {
    let reads = 0;
    const original = { ...product, get _id() { reads++; return id; }, image: ['https://example.test/original.png'] };
    const duplicate = { ...product, get _id() { reads++; return id; }, name: 'Wrong duplicate', price: 999 };
    const value = context({ products: [original, duplicate] });
    hooks(t, value);
    let memo;
    t.mock.method(react, 'useMemo', (calculate, dependencies) => {
      if (!memo || !dependencies.every((value, index) => Object.is(value, memo.dependencies[index]))) {
        memo = { value: calculate(), dependencies };
      }
      return memo.value;
    });
    const render = () => compiled.exports[component]();
    const image = tree => find(tree, element => element.type?.name === 'ImageWithFallback');
    const item = tree => find(tree, element => element.type?.name === 'CartItem')?.props.item;
    const first = render();
    if (component === 'cart') assert.equal(item(first).product, original);
    else assert.equal(image(first).props.src, original.image[0]);
    assert.equal(reads, 2);
    value.cartItems = { [id]: { M: 2, L: 1 } };
    render();
    assert.equal(reads, 2, 'Quantity rerenders must reuse the same catalog index');
    const refreshed = { ...product, name: 'Refreshed uniform', price: 20.1, image: ['https://example.test/refreshed.png'] };
    value.products = [refreshed];
    const next = render();
    if (component === 'cart') assert.equal(item(next).product, refreshed);
    else assert.equal(image(next).props.src, refreshed.image[0]);
    value.products = [];
    const deleted = render();
    if (component === 'cart') assert.equal(item(deleted).product, undefined);
    else assert.equal(image(deleted).props.src, undefined);
  });
}

test('existing Cart checkout interaction is disabled while persistence is pending in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const pending = compiled.exports.cartHTML(context({ cartReady: false }), theme);
    assert.match(pending, /aria-disabled="true"[^>]*href="\/place-order"/);
    assert.match(pending, /aria-label="Quantity for Synthetic uniform, size M"/);
    assert.match(pending, /aria-label="Remove Synthetic uniform, size M"/);
    const ready = compiled.exports.cartHTML(context({ cartReady: true }), theme);
    assert.match(ready, /aria-disabled="false"[^>]*href="\/place-order"/);
  }
});

test('Cart totals and availability use only the persisted selected variants', t => {
  const selection = {
    known: [JSON.stringify([id, 'M']), JSON.stringify([id, 'L'])],
    selected: [JSON.stringify([id, 'L'])]
  };
  storageFixture(t, { 'pamo-cart-selection:student-1': JSON.stringify(selection) });
  const html = compiled.exports.cartHTML(context({
    products: [{ ...product, sizes: ['M', 'L'], inventory: { M: 0, L: 10 } }],
    cartItems: { [id]: { M: 1, L: 2 } }
  }), 'dark');

  assert.match(html, /Selected: 2 items/);
  assert.match(html, /Checkout \(2 items\)/);
  assert.match(html, /aria-disabled="false"[^>]*href="\/place-order"/);
});

test('Cart and selected checkout display individual listing items with original IDs', t => {
  const secondId = '1123456789abcdef01234567';
  const selection = {
    known: [JSON.stringify([id, 'M']), JSON.stringify([secondId, 'M'])],
    selected: [JSON.stringify([secondId, 'M'])]
  };
  storageFixture(t, { 'pamo-cart-selection:student-1': JSON.stringify(selection) });
  const value = context({
    products: [{ ...product, optionLabel: 'Classic Shirt' }, { ...product, _id: secondId, name: 'Washday Shirt', optionLabel: 'Washday Shirt', price: 350 }],
    cartItems: { [id]: { M: 1 }, [secondId]: { M: 2 } }
  });
  for (const theme of ['light', 'dark']) {
    const html = compiled.exports.cartHTML(value, theme);
    assert.match(html, /Item · Classic Shirt/);
    assert.match(html, /Item · Washday Shirt/);
    assert.match(html, new RegExp(`/product/${secondId}`));
  }
  const checkout = compiled.exports.checkoutHTML(value);
  assert.match(checkout, /Item · Washday Shirt/);
  assert.doesNotMatch(checkout, /Item · Classic Shirt/);
  assert.deepEqual(value.cartItems[id], { M: 1 });
});

test('Cart disables checkout when every variant is deselected', t => {
  const selection = {
    known: [JSON.stringify([id, 'M'])],
    selected: []
  };
  storageFixture(t, { 'pamo-cart-selection:student-1': JSON.stringify(selection) });
  const html = compiled.exports.cartHTML(context(), 'light');

  assert.match(html, /Selected: 0 items/);
  assert.match(html, /Checkout \(0 items\)/);
  assert.match(html, /aria-disabled="true"[^>]*href="\/place-order"/);
});

test('failed cart restoration uses an accessible persistent error/reload action instead of an empty-cart claim', () => {
  for (const theme of ['light', 'dark']) {
    const html = compiled.exports.cartHTML(context({ cartItems: {}, cartReady: false, cartError: 'Synthetic cart unavailable.', reloadCart() {} }), theme);
    assert.match(html, /role="alert"/);
    assert.match(html, /Synthetic cart unavailable/);
    assert.match(html, /Reload cart/);
    assert.match(html, /Your cart needs attention/);
    assert.doesNotMatch(html, /Your cart is empty/);
  }
});

test('checkout submission refuses an unsynchronized cart before digest, API or cart clearing', async t => {
  const storage = hooks(t, context({ beginCartCheckout() { throw new Error('Cart is still syncing.'); } }));
  const request = t.mock.method(compiled.require('axios'), 'post', () => assert.fail('Pending cart must not submit'));
  const form = find(compiled.exports.checkout(), element => element.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(request.mock.callCount(), 0);
  assert.deepEqual(storage, []);
});

test('online checkout policy is prepared without enabling frozen payment methods', async t => {
  hooks(t, context());
  t.mock.method(react, 'useState', initial => [initial === 'cod' ? 'stripe' : initial, () => {}]);
  const tree = compiled.exports.checkout();
  const notice = find(tree, element => element.type === 'p' && react.Children.toArray(element.props.children)
    .some(child => typeof child === 'string' && child.includes('After online payment')));
  assert.ok(notice);
  assert.equal(find(notice, element => element.type?.name === 'Link' || element.props.to === '/contact').props.to, '/contact');
  assert.equal(find(tree, element => element.type === 'input' && element.props.value === 'stripe').props.disabled, true);
  assert.equal(find(tree, element => element.type === 'input' && element.props.value === 'paypal').props.disabled, true);
  t.mock.method(compiled.require('axios'), 'post', () => assert.fail('Online processing remains disabled'));
  await find(tree, element => element.type === 'form').props.onSubmit({ preventDefault() {} });
});

test('checkout uses read-only account identity instead of client contact or address fields', t => {
  hooks(t, context({
    productCategories: [{ code: 'BSIT', name: 'Information Technology', scope: 'program' }]
  }));
  const tree = compiled.exports.checkout();
  assert.equal(find(tree, element => element.type === 'input' && element.props.name === 'firstName'), null);
  assert.equal(find(tree, element => element.type === 'input' && element.props.name === 'street'), null);
  assert.ok(find(tree, element => element.type === 'dd' && element.props.children === 'Synthetic Student'));
  assert.ok(find(tree, element => element.type === 'dd' && element.props.children === 'Information Technology'));
});

test('checkout blocks submission and links to My Account when the program is missing', t => {
  hooks(t, context({
    studentProfile: { name: 'Synthetic Student', email: 'student@example.test', academicProgram: null }
  }));
  const tree = compiled.exports.checkout();
  const submit = find(tree, element => element.type === 'button' && element.props.type === 'submit');
  const accountLink = find(tree, element => element.props.to === '/account');
  assert.equal(submit.props.disabled, true);
  assert.ok(accountLink);
});

test('checkout refreshes prices and requires review before submitting a changed total', async t => {
  const refreshedProduct = { ...product, price: 250 };
  const lease = {
    snapshot: { cartData: { [id]: { M: 1 } }, cartVersions: { [id]: { M: 1 } } },
    isCurrent: () => true,
    complete: t.mock.fn(),
    finish: t.mock.fn()
  };
  const storage = hooks(t, context({
    beginCartCheckout: () => lease,
    getProductsData: async () => [refreshedProduct]
  }));
  const request = t.mock.method(compiled.require('axios'), 'post', () => {
    assert.fail('Changed prices must be reviewed before checkout');
  });

  const form = find(compiled.exports.checkout(), element => element.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });

  assert.equal(request.mock.callCount(), 0);
  assert.equal(lease.complete.mock.callCount(), 0);
  assert.equal(lease.finish.mock.callCount(), 1);
  assert.deepEqual(storage, []);
});

test('logout during asynchronous fingerprint work cannot submit or store a stale checkout', async t => {
  let valid = true;
  const digest = deferred();
  const lease = { isCurrent: () => valid, finish: t.mock.fn() };
  const storage = hooks(t, context({ beginCartCheckout: () => lease }));
  t.mock.method(crypto.subtle, 'digest', () => digest.promise);
  const request = t.mock.method(compiled.require('axios'), 'post', () => assert.fail('Stale checkout must not submit'));
  const form = find(compiled.exports.checkout(), element => element.type === 'form');
  const submitted = form.props.onSubmit({ preventDefault() {} });
  valid = false; digest.resolve(new ArrayBuffer(32)); await submitted;
  assert.equal(request.mock.callCount(), 0);
  assert.deepEqual(storage, []);
  assert.equal(lease.finish.mock.callCount(), 1);
});

test('old successful checkout response cannot clear or navigate a replacement customer session', async t => {
  let valid = true;
  const network = deferred();
  const reached = deferred();
  const cartChanges = t.mock.fn(), navigation = t.mock.fn();
  const storage = hooks(t, context({ beginCartCheckout: () => ({ isCurrent: () => valid, finish() {} }), setCartItems: cartChanges, navigate: navigation }));
  t.mock.method(compiled.require('axios'), 'post', () => { reached.resolve(); return network.promise; });
  const form = find(compiled.exports.checkout(), element => element.type === 'form');
  const submitted = form.props.onSubmit({ preventDefault() {} });
  await reached.promise; valid = false; network.resolve({ data: { success: true } }); await submitted;
  assert.equal(cartChanges.mock.callCount(), 0);
  assert.equal(navigation.mock.callCount(), 0);
  assert.deepEqual(storage, ['write']);
});

test('confirmed COD submission sends revision evidence, refreshes the cart and retains the existing redirect', async t => {
  const cartChanges = t.mock.fn(), navigation = t.mock.fn();
  const snapshot = { cartData: { [id]: { M: 1 } }, cartVersions: { [id]: { M: 4 } } };
  const lease = { snapshot, isCurrent: () => true, complete: t.mock.fn(async () => {}), finish: t.mock.fn() };
  const storage = hooks(t, context({ beginCartCheckout: () => lease, setCartItems: cartChanges, navigate: navigation }));
  const request = t.mock.method(compiled.require('axios'), 'post', async (url, data, options) => {
    assert.equal(url, 'https://api.example.test/api/order/place');
    assert.equal(data.amount, 235);
    assert.equal(Object.hasOwn(data, 'address'), false);
    assert.equal(Object.hasOwn(data, 'student'), false);
    assert.equal(data.items[0].quantity, 1);
    assert.deepEqual(data.pricingQuote, [{ _id: id, size: 'M', price: 225 }]);
    assert.deepEqual(data.checkoutCart, snapshot);
    assert.equal(options.headers.token, 'synthetic-only');
    return { data: { success: true } };
  });
  const form = find(compiled.exports.checkout(), element => element.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(request.mock.callCount(), 1);
  assert.equal(cartChanges.mock.callCount(), 0);
  assert.equal(lease.complete.mock.callCount(), 1);
  assert.deepEqual(navigation.mock.calls[0].arguments, ['/orders']);
  assert.deepEqual(storage, ['write', 'remove', 'write']);
  assert.equal(lease.finish.mock.callCount(), 1);
});

test('checkout submits only selected variants while retaining full revision evidence', async t => {
  const secondProduct = { ...product, _id: '2123456789abcdef01234567', name: 'Synthetic accessory', price: 100 };
  const cartItems = { [id]: { M: 1, L: 2 }, [secondProduct._id]: { M: 1 } };
  const snapshot = {
    cartData: structuredClone(cartItems),
    cartVersions: { [id]: { M: 4, L: 2 }, [secondProduct._id]: { M: 1 } }
  };
  const selection = {
    known: [JSON.stringify([id, 'M']), JSON.stringify([id, 'L']), JSON.stringify([secondProduct._id, 'M'])],
    selected: [JSON.stringify([id, 'L'])]
  };
  const value = context({
    products: [product, secondProduct],
    cartItems,
    getProductsData: async () => [product, secondProduct],
    beginCartCheckout: () => ({ snapshot, isCurrent: () => true, complete: async () => {}, finish() {} })
  });
  hooks(t, value, { 'pamo-cart-selection:student-1': JSON.stringify(selection) });
  const request = t.mock.method(compiled.require('axios'), 'post', async (_url, body) => {
    assert.deepEqual(body.items.map(item => [item._id, item.size, item.quantity]), [[id, 'L', 2]]);
    assert.equal(body.amount, 460);
    assert.deepEqual(body.checkoutCart, snapshot);
    return { data: { success: true } };
  });

  await find(compiled.exports.checkout(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(request.mock.callCount(), 1);
});

test('enabled demo checkout sends only selected items and keeps cart data until simulated success', async t => {
  const complete = t.mock.fn();
  const navigate = t.mock.fn();
  const value = context({
    navigate,
    beginCartCheckout: () => ({
      snapshot: { cartData: { [id]: { M: 1 } }, cartVersions: { [id]: { M: 2 } } },
      isCurrent: () => true, complete, finish() {}
    })
  });
  hooks(t, value);
  let stateIndex = 0;
  t.mock.method(react, 'useState', initial => {
    const index = stateIndex++;
    if (index === 0) return ['paypal', () => {}];
    if (index === 1) return [true, () => {}];
    return [initial, () => {}];
  });
  const post = t.mock.method(compiled.require('axios'), 'post', async (url, data) => {
    assert.equal(url, 'https://api.example.test/api/order/demo/place');
    assert.equal(data.demoProvider, 'paypal');
    assert.equal(data.amount, 235);
    return { data: { success: true, orderId: 'demo-order-1' } };
  });
  const tree = compiled.exports.checkout();
  assert.equal(find(tree, element => element.type === 'input' && element.props.value === 'paypal').props.disabled, false);
  await find(tree, element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(post.mock.callCount(), 1);
  assert.equal(complete.mock.callCount(), 0);
  assert.deepEqual(value.cartItems[id], { M: 1 });
  assert.deepEqual(navigate.mock.calls[0].arguments, ['/demo-payment/demo-order-1']);
});

test('checkout submits the confirmed lease snapshot rather than an older render and fingerprints revisions', async t => {
  const snapshot = { cartData: { [id]: { M: 2 } }, cartVersions: { [id]: { M: 6 } } };
  hooks(t, context({ beginCartCheckout: () => ({ snapshot, isCurrent: () => true, complete: async () => {}, finish() {} }) }));
  const digest = t.mock.method(crypto.subtle, 'digest', async (_algorithm, bytes) => {
    const signature = JSON.parse(new TextDecoder().decode(bytes));
    assert.deepEqual(signature.checkoutCart, snapshot);
    assert.equal(signature.items[0][2], 2);
    return new ArrayBuffer(32);
  });
  t.mock.method(compiled.require('axios'), 'post', async (_url, body) => {
    assert.equal(body.items[0].quantity, 2);
    assert.deepEqual(body.checkoutCart, snapshot);
    return { data: { success: true } };
  });
  await find(compiled.exports.checkout(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(digest.mock.callCount(), 1);
});

test('logout during successful checkout refresh cannot remove request storage or navigate a replacement session', async t => {
  let valid = true;
  const refresh = deferred(), reached = deferred(), navigation = t.mock.fn();
  const storage = hooks(t, context({ navigate: navigation, beginCartCheckout: () => ({
    isCurrent: () => valid, complete: async () => { reached.resolve(); await refresh.promise; }, finish() {}
  }) }));
  t.mock.method(compiled.require('axios'), 'post', async () => ({ data: { success: true } }));
  const submitted = find(compiled.exports.checkout(), element => element.type === 'form').props.onSubmit({ preventDefault() {} });
  await reached.promise;
  valid = false; refresh.resolve(); await submitted;
  assert.equal(navigation.mock.callCount(), 0);
  assert.deepEqual(storage, ['write']);
});
