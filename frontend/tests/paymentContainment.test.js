import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {
    resolveDir: frontend,
    loader: 'jsx',
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { MemoryRouter } from 'react-router-dom';
      import { ShopContext } from './src/context/shopContext.js';
      import PlaceOrder from './src/pages/PlaceOrder.jsx';
      import Verify from './src/pages/Verify.jsx';
      import Footer from './src/components/Footer.jsx';
      const product = { _id: '1123456789abcdef01234567', name: 'Synthetic uniform', price: 225,
        image: [], sizes: ['M'], inventory: { M: 5 } };
      const context = { products: [product], cartItems: { [product._id]: { M: 1 } }, currency: '$',
        delivery_fee: 10, getCartAmount: () => 225, productsLoading: false, productError: '',
        backendUrl: 'https://example.test', token: 'synthetic-only', navigate: () => {},
        getProductsData: () => {}, setCartItems: () => {}, profileLoading: false, profileError: '',
        studentProfile: { name: 'Synthetic Student', email: 'student@example.test', academicProgram: 'BSIT' } };
      export const checkout = () => renderToStaticMarkup(<MemoryRouter><ShopContext.Provider value={context}><PlaceOrder /></ShopContext.Provider></MemoryRouter>);
      export const verification = query => renderToStaticMarkup(<MemoryRouter initialEntries={['/verify' + query]}><ShopContext.Provider value={context}><Verify /></ShopContext.Provider></MemoryRouter>);
      export const footer = () => renderToStaticMarkup(<MemoryRouter><ShopContext.Provider value={context}><Footer /></ShopContext.Provider></MemoryRouter>);
      export const checkoutComponent = PlaceOrder;
      export const checkoutFixture = context;
    `
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.css': 'empty' },
  plugins: [{ name: 'synthetic-image-urls', setup(builder) {
    builder.onLoad({ filter: /\.(png|jpg)$/ }, () => ({ contents: 'export default "https://example.test/image.png"', loader: 'js' }));
  } }]
});
const compiledModule = new Module(path.join(frontend, 'payment-containment-ssr.cjs'));
compiledModule.filename = path.join(frontend, 'payment-containment-ssr.cjs');
compiledModule.paths = Module._nodeModulePaths(frontend);
compiledModule.require = createRequire(compiledModule.filename);
compiledModule._compile(compiled.outputFiles[0].text, compiledModule.filename);
const render = compiledModule.exports;

test('checkout defaults to COD and keeps provider controls disabled until server configuration loads', () => {
  const html = render.checkout();
  const inputs = html.match(/<input\b[^>]*type="radio"[^>]*>/g);
  assert.equal(inputs.length, 3);
  const cod = inputs.find(input => input.includes('value="cod"'));
  assert.match(cod, /\bchecked/);
  assert.doesNotMatch(cod, /\bdisabled/);
  for (const provider of ['stripe', 'paypal']) assert.match(inputs.find(input => input.includes(`value="${provider}"`)), /\bdisabled/);
  assert.match(html, /Stripe \(TEST\)/);
  assert.match(html, /PayPal \(SANDBOX\)/);
  assert.match(html, /No real money is charged/);
  assert.doesNotMatch(html, /Online methods continue to their payment provider|Continue to (Stripe|PayPal) for online payment/);
  assert.match(html, /type="submit"[^>]*>Place order/);
});

test('browser success flags never render a successful payment without server verification', () => {
  for (const query of ['', '?success=true&method=stripe', '?success=false&method=paypal', '?success=true&orderId=forged&method=unknown']) {
    const html = render.verification(query);
    assert.match(html, /Test payment verification/);
    assert.match(html, /role="status"/);
    assert.match(html, /check My Orders for the saved payment status/);
    assert.match(html, /href="\/orders"/);
    assert.match(html, /href="\/contact"/);
    assert.doesNotMatch(html, /animate-spin|Verifying your payment|aria-busy="true"|Payment successful/);
  }
});

test('return page uses authenticated verification and never sends a browser success assertion', async () => {
  const source = await readFile(new URL('../src/pages/Verify.jsx', import.meta.url), 'utf8');
  assert.match(source, /axios\.post/);
  assert.match(source, /headers: \{ token \}/);
  assert.match(source, /\{ orderId, cancelled \}/);
  assert.doesNotMatch(source, /params\.get\('success'\)|setCartItems|demo\/|payment: true/);
});

test('footer identifies test-only providers while retaining Pay as you claim', () => {
  const html = render.footer();
  assert.match(html, /Payment methods and availability/);
  assert.match(html, /Stripe \(TEST\)/);
  assert.match(html, /PayPal \(SANDBOX\)/);
  assert.match(html, /Pay as you claim/);
  assert.doesNotMatch(html, /Supported payment methods/);
});

test('configured provider checkout sends selected variants to the original endpoints and redirects without clearing the cart', async t => {
  const react = compiledModule.require('react');
  const axios = compiledModule.require('axios');
  let method = 'stripe';
  const redirected = [];
  const snapshot = { cartData: render.checkoutFixture.cartItems, cartVersions: {
    '1123456789abcdef01234567': { M: 2 }
  } };
  const complete = t.mock.fn(() => assert.fail('Provider checkout must not clear before confirmation'));
  t.mock.method(react, 'useContext', () => ({ ...render.checkoutFixture,
    getProductsData: async () => render.checkoutFixture.products,
    beginCartCheckout: () => ({ snapshot, isCurrent: () => true, complete, finish() {} })
  }));
  t.mock.method(react, 'useMemo', calculate => calculate());
  t.mock.method(react, 'useEffect', () => {});
  t.mock.method(react, 'useRef', value => ({ current: value }));
  t.mock.method(react, 'useState', initial => {
    if (initial === 'cod') return [method, () => {}];
    if (initial?.stripe === false) return [{ stripe: true, paypal: true }, () => {}];
    return [initial, () => {}];
  });
  const post = t.mock.method(axios, 'post', async (url, body) => {
    assert.ok(url.endsWith(method === 'stripe' ? '/api/order/Stripe' : '/api/order/Paypal'));
    assert.deepEqual(body.checkoutCart, snapshot);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].size, 'M');
    assert.equal(body.demoProvider, undefined);
    return { data: { success: true, session_url: 'https://provider.example.test/checkout' } };
  });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { assign: url => redirected.push(url) }
  } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: () => null, setItem() {}, removeItem() {}
  } });
  t.after(() => {
    for (const [key, descriptor] of [['window', previousWindow], ['sessionStorage', previousStorage]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const findForm = element => {
    if (!react.isValidElement(element)) return null;
    if (element.type === 'form') return element;
    for (const child of react.Children.toArray(element.props.children)) {
      const found = findForm(child);
      if (found) return found;
    }
    return null;
  };
  for (method of ['stripe', 'paypal']) {
    await findForm(render.checkoutComponent()).props.onSubmit({ preventDefault() {} });
  }
  assert.equal(post.mock.callCount(), 2);
  assert.equal(redirected.length, 2);
  assert.equal(complete.mock.callCount(), 0);
});

test('a stale or forged online selection is rejected before requests, saved checkout IDs or cart changes', async t => {
  const react = compiledModule.require('react');
  const axios = compiledModule.require('axios');
  const toast = compiledModule.require('react-toastify').toast;
  let method;
  const errors = [];
  const storageCalls = [];
  const requests = t.mock.method(axios, 'post', () => assert.fail('Unexpected checkout request'));
  const cartChanges = t.mock.fn(() => assert.fail('Unexpected cart mutation'));
  t.mock.method(toast, 'error', () => {});
  t.mock.method(react, 'useContext', () => ({ ...render.checkoutFixture, setCartItems: cartChanges }));
  t.mock.method(react, 'useMemo', calculate => calculate());
  t.mock.method(react, 'useEffect', () => {});
  t.mock.method(react, 'useRef', value => ({ current: value }));
  t.mock.method(react, 'useState', initial => [initial === 'cod' ? method : initial, value => { if (initial === '') errors.push(value); }]);
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: () => { storageCalls.push('read'); return null; },
    setItem: () => storageCalls.push('write'), removeItem: () => storageCalls.push('remove')
  } });
  const findForm = element => {
    if (!react.isValidElement(element)) return null;
    if (element.type === 'form') return element;
    for (const child of react.Children.toArray(element.props.children)) {
      const found = findForm(child);
      if (found) return found;
    }
    return null;
  };
  try {
    for (method of ['stripe', 'paypal']) {
      const form = findForm(render.checkoutComponent());
      assert.ok(form);
      await form.props.onSubmit({ preventDefault() {} });
    }
    assert.equal(errors.length, 2);
    assert.ok(errors.every(message => message.includes('Online payments are temporarily unavailable')));
    assert.equal(requests.mock.callCount(), 0);
    assert.equal(cartChanges.mock.callCount(), 0);
    assert.deepEqual(storageCalls, []);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
