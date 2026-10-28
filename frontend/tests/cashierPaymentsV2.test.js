import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'cashier-payments-v2-test.cjs'));
const React = requireAdmin('react');
const { renderToStaticMarkup } = requireAdmin('react-dom/server');
let runner;
const hooks = {
  ...React,
  useState: initial => runner.state(initial),
  useRef: initial => runner.ref(initial),
  useEffect: callback => runner.effects.push(callback),
  useLayoutEffect: () => {},
  useCallback: callback => callback
};
const output = await build({
  stdin: { resolveDir: admin, contents: `
    export { default as Details } from './src/components/PaymentDetails.jsx';
    export { default as List } from './src/components/CashierTable.jsx';
    export { default as Inspector } from './src/components/CashierPaymentInspector.jsx';
    export { default as Page } from './src/pages/Cashier.jsx';
    export { containDialogFocus } from './src/utils/dialogFocus.js';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
const compiled = new Module(path.join(admin, 'cashier-payments-v2-test.cjs'));
compiled.filename = path.join(admin, 'cashier-payments-v2-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return hooks;
  if (name === 'react-router-dom') return { useLocation: () => ({ key: 'synthetic-view', state: null }), Link: ({ to, ...props }) => React.createElement('a', { href: to, ...props }) };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);
const all = (node, predicate, found = []) => {
  if (!React.isValidElement(node)) return found;
  if (predicate(node)) found.push(node);
  React.Children.forEach(node.props.children, child => all(child, predicate, found));
  return found;
};
const find = (node, predicate) => all(node, predicate)[0];
const record = extra => ({
  _id: 'synthetic-order-0123456789', status: 'Sent to Cashier', payment: false,
  paymentMethod: 'COD', paymentCurrency: 'PHP', amount: 235, sentToCashierAt: 1,
  address: { firstName: 'Synthetic', lastName: 'Student', email: 'student@example.test', phone: '123' },
  items: [{ _id: 'item', name: 'Uniform', size: 'M', price: 225, quantity: 1, image: ['https://images.example.test/original.png'] }],
  ...extra
});
const mount = (kind, props) => {
  const h = { slots: [], cursor: 0, effects: [], props };
  h.state = initial => {
    const index = h.cursor++;
    const slot = h.slots[index] ??= { value: initial };
    return [slot.value, next => { slot.value = next; }];
  };
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial };
  h.render = () => { runner = h; h.cursor = 0; h.effects = []; h.tree = compiled.exports[kind](h.props); return h.tree; };
  h.html = () => { runner = h; return renderToStaticMarkup(h.tree); };
  h.render();
  return h;
};

test('verified online payments record a receipt separately and test references remain visibly distinguished', () => {
  for (const livemode of [false, true]) {
    const calls = [];
    const order = record({ payment: true, paymentMethod: 'Stripe', paidAt: 123, status: 'Approved',
      stripePayment: { sessionId: 'cs_fixture', paymentIntentId: 'pi_fixture', chargeId: 'ch_fixture',
        accountId: 'acct_fixture', livemode, verifiedAt: 123 } });
    const h = mount('Details', { v2: true, order, pending: false, onConfirm: (...args) => calls.push(args) });
    assert.match(h.html(), /Awaiting Official Receipt/);
    const expected = livemode ? 'Record Official Receipt' : 'Record Test Receipt Reference';
    assert.match(h.html(), new RegExp(expected));
    if (!livemode) assert.match(h.html(), /not a genuine school-issued receipt/);
    find(h.tree, node => node.type === 'input').props.onChange({ target: { value: ' OR-ONLINE ' } });
    h.render();
    find(h.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.deepEqual(calls, [[order._id, { receiptNumber: 'OR-ONLINE', receiptOnly: true }]]);
    h.props = { ...h.props, pending: true };
    h.render();
    assert.equal(find(h.tree, node => node.type === 'button' && node.props.type === 'submit').props.disabled, true);
    h.props = { ...h.props, pending: false, order: { ...order, receiptNumber: 'OR-ONLINE' } };
    h.render();
    assert.equal(all(h.tree, node => node.type === 'form').length, 0);
    assert.match(h.html(), livemode ? /OR-ONLINE/ : /TEST — OR-ONLINE/);
    const directory = mount('List', { orders: [h.props.order], filter: 'Receipt Records', selectedId: order._id,
      onSelect() {}, onFilterChange() {}, query: '', onQueryChange() {} });
    assert.match(directory.html(), livemode ? /OR-ONLINE/ : /TEST — OR-ONLINE/);
  }
});

test('eligible confirmation preserves receipt validation, trimmed payload, cancel reset and pending behavior', () => {
  const confirmations = [];
  const h = mount('Details', { v2: true, order: record(), pending: false, onConfirm: (...args) => confirmations.push(args), onClose() {} });
  const submit = () => find(h.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  submit(); assert.equal(confirmations.length, 0);
  const input = find(h.tree, node => node.type === 'input');
  assert.equal(input.props.required, true); assert.equal(input.props.maxLength, 100); assert.equal(input.props.autoComplete, 'off');
  input.props.onChange({ target: { value: '  TEST-001  ' } }); h.render(); submit();
  assert.deepEqual(confirmations, [[record()._id, { paymentMethod: 'COD', receiptNumber: 'TEST-001' }]]);
  h.props.pending = true; h.render(); submit();
  assert.equal(confirmations.length, 1);
  assert(all(h.tree, node => ['input', 'select', 'button'].includes(node.type)).every(node => node.props.disabled));
  h.props.pending = false; h.render();
  find(h.tree, node => node.type === 'button' && node.props.children === 'Cancel Payment').props.onClick();
  h.render(); assert.equal(find(h.tree, node => node.type === 'input').props.value, '');
});

for (const [name, changes] of [
  ['paid', { payment: true }], ['wrong status', { status: 'Order Placed' }],
  ['online provider', { paymentMethod: 'Stripe' }], ['unverified currency', { paymentCurrency: undefined }],
  ['foreign currency', { paymentCurrency: 'USD' }], ['zero', { amount: 0 }], ['fractional cent', { amount: 235.001 }]
]) test('review-only or ineligible records never expose confirmation: ' + name, () => {
  const h = mount('Details', { v2: true, order: record(changes), onClose() {} });
  assert.equal(all(h.tree, node => node.type === 'form').length, 0);
});

test('paid details retain references, images, historical amounts, receipts, attribution and refunds', () => {
  const h = mount('Details', { v2: true, pending: false, onClose() {}, order: record({
    payment: true, status: 'Cancelled', paymentCurrency: undefined, receiptNumber: 'TEST-001',
    paidAt: 2, confirmedBy: 'staff@example.test', refund: { status: 'Refund Required', requiredAt: 3 }
  }) });
  const html = h.html();
  for (const value of ['synthetic-order-0123456789', 'original.png', '225.00', '10.00', '235.00', 'currency unverified', 'TEST-001', 'staff@example.test', 'Refund Required', 'No second confirmation action']) assert(html.includes(value), value);
  assert.doesNotMatch(html, /<form/);
  assert.equal(find(h.tree, node => node.type === 'img').props.src, record().items[0].image[0]);
});

test('malformed historical addresses remain render-safe in V2', () => {
  const h = mount('Details', { v2: true, order: record({ address: { firstName: {}, email: [], phone: false } }) });
  assert.match(h.html(), /Name not provided/);
  assert.match(h.html(), /Email not provided/);
});

test('list distinguishes empty queue, search misses, loading and errors; View preserves the full ID', () => {
  const props = { v2: true, orders: [], filter: 'Awaiting Payment' };
  assert.match(mount('List', props).html(), /No payments awaiting confirmation/);
  assert.match(mount('List', { ...props, query: 'missing' }).html(), /No matching payments/);
  assert.match(mount('List', { ...props, loading: true }).html(), /Loading payments/);
  const failed = mount('List', { ...props, error: 'Synthetic failure' }).html();
  assert.match(failed, /Payment records unavailable/); assert.doesNotMatch(failed, /Queue is empty/);
  const viewed = [];
  const h = mount('List', { ...props, orders: [record()], onView: id => viewed.push(id) });
  find(h.tree, node => node.type === 'button').props.onClick();
  assert.deepEqual(viewed, [record()._id]);
  assert.equal(find(h.tree, node => node.type === 'img').props.src, record().items[0].image[0]);
});

test('Payments has two contextual filters; Transactions and Receipt Records are separate read-only directories', () => {
  for (const filter of ['Awaiting Payment', 'Paid', 'Transactions', 'Receipt Records']) {
    const h = mount('Page', { token: 'synthetic-only', title: filter, filter, onFilterChange() {} });
    const group = find(h.tree, node => node.props['aria-label'] === 'Filter payments');
    assert.equal(all(group, node => node.type === 'button').length, ['Transactions', 'Receipt Records'].includes(filter) ? 0 : 2);
    if (['Awaiting Payment', 'Paid'].includes(filter)) {
      assert.deepEqual(all(h.tree, node => typeof node.props.to === 'string').map(node => node.props.to), ['/cashier/transactions', '/cashier/receipts']);
    }
  }
});

test('Receipt Details preserves original receipt, audit data, items, fees and unverified currency without actions', () => {
  const order = record({ payment: true, status: 'Claimed', receiptNumber: 'OR-0000123', paidAt: 2, confirmedBy: 'staff@example.test', paymentCurrency: undefined });
  const h = mount('Details', { v2: true, receiptRecord: true, order, onClose() {} });
  const html = h.html();
  for (const value of ['Receipt Details', 'No. OR-0000123', order._id, 'staff@example.test', '235.00', '225.00', '10.00', 'currency unverified', 'original.png', 'Paid', 'Claimed']) assert(html.includes(value), value);
  assert(html.indexOf('No. OR-0000123') < html.indexOf('Confirmed payment amount'));
  assert.doesNotMatch(html, /<form|<input|<select|Copy number|Confirm Payment|Cancel Payment/);
  const content = find(h.tree, node => node.props['aria-label'] === 'Receipt record content');
  assert.equal(content.props.tabIndex, 0);
  assert.equal(content.props.role, 'region');
  assert.equal(all(h.tree, node => node.props.className?.split(' ').includes('cashier-payment-details-body')).length, 1);
  const payable = mount('Details', { v2: true, receiptRecord: true, order: record(), onClose() {} });
  assert.equal(all(payable.tree, node => ['form', 'input', 'select'].includes(node.type)).length, 0);
  const malformed = mount('Details', { v2: true, receiptRecord: true, order: { ...order, address: { firstName: {}, phone: [] } } }).html();
  assert.match(malformed, /Receipt Details/);
});

test('receipt directory prioritizes original numbers and preserves selection callbacks and distinct states', () => {
  const order = record({ payment: true, receiptNumber: 'OR-0000123', confirmedBy: 'staff@example.test', paymentCurrency: undefined });
  const viewed = [];
  const props = { v2: true, filter: 'Receipt Records', orders: [order], selectedId: order._id, onView: id => viewed.push(id) };
  const h = mount('List', props);
  const html = h.html();
  for (const value of ['Recorded Receipts', 'OR-0000123', 'selected-payment', 'currency unverified', 'staff@example.test']) assert(html.includes(value), value);
  find(h.tree, node => node.type === 'button').props.onClick();
  assert.deepEqual(viewed, [order._id]);
  for (const [extra, expected] of [[{}, 'No recorded receipts'], [{ query: 'none' }, 'No matching receipts'], [{ loading: true }, 'Loading receipts'], [{ error: 'Synthetic failure' }, 'Receipt records unavailable']]) {
    assert(mount('List', { ...props, orders: [], ...extra }).html().includes(expected));
  }
  assert.match(mount('Details', { v2: true, receiptRecord: true }).html(), /No receipt selected/);
});

test('Transaction Details is read-only even when supplied an otherwise payable order', () => {
  let confirmed = 0, closed = 0;
  const h = mount('Details', { v2: true, transaction: true, order: record(), pending: false, onConfirm: () => confirmed++, onClose: () => closed++ });
  assert.equal(all(h.tree, node => node.type === 'form' || node.type === 'input' || node.type === 'select').length, 0);
  assert.match(h.html(), /Transaction Details/);
  assert.match(h.html(), /Unconfirmed record/);
  find(h.tree, node => node.props['aria-label'] === 'Close transaction details').props.onClick();
  assert.equal(closed, 1); assert.equal(confirmed, 0);
});

test('transaction ledger retains original references, amount, receipt, paid time and staff attribution', () => {
  const order = record({ payment: true, paidAt: 2, confirmedBy: 'staff@example.test', receiptNumber: 'TEST-002', paymentCurrency: undefined });
  const viewed = [];
  const h = mount('List', { v2: true, filter: 'Transactions', orders: [order], selectedId: order._id, onView: id => viewed.push(id) });
  assert.match(h.html(), /Transaction History/);
  assert.match(h.html(), /selected-payment/);
  assert.match(h.html(), /currency unverified/);
  assert.match(h.html(), /TEST-002/); assert.match(h.html(), /staff@example.test/);
  find(h.tree, node => node.type === 'button').props.onClick();
  assert.deepEqual(viewed, [order._id]);
  const details = mount('Details', { v2: true, transaction: true, order, onClose() {} }).html();
  for (const value of [order._id, 'original.png', '235.00', '225.00', '10.00', 'TEST-002', 'staff@example.test', 'currency unverified']) assert(details.includes(value), value);
  assert(details.indexOf('Confirmed transaction') < details.indexOf('Order reference'));
  assert.doesNotMatch(details, /<form|Confirm Payment|Cancel Payment/);
});

test('transaction states distinguish no records, search misses, unavailable data and loading', () => {
  const props = { v2: true, orders: [], filter: 'Transactions' };
  assert.match(mount('List', props).html(), /No recorded transactions/);
  assert.match(mount('List', { ...props, query: 'none' }).html(), /No matching transactions/);
  assert.match(mount('List', { ...props, loading: true }).html(), /Loading transactions/);
  assert.match(mount('List', { ...props, error: 'Synthetic error' }).html(), /Transaction records unavailable/);
  assert.match(mount('Details', { v2: true, transaction: true }).html(), /No transaction selected/);
});

test('transaction content is keyboard-scrollable and remains within the existing focus loop', t => {
  const h = mount('Details', { v2: true, transaction: true, order: record({ payment: true }) });
  const content = find(h.tree, node => node.props['aria-label'] === 'Transaction record content');
  assert.equal(content.props.tabIndex, 0);
  assert.equal(content.props.role, 'region');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let focused = '', prevented = false;
  const first = { getClientRects: () => [1], focus: () => { focused = 'first'; } };
  const last = { getClientRects: () => [1], focus: () => { focused = 'content'; } };
  const doc = { activeElement: last };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  const target = { querySelectorAll: selector => { assert(selector.includes('[tabindex="0"]')); return [first, last]; } };
  compiled.exports.containDialogFocus({ key: 'Tab', currentTarget: target, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(focused, 'first');
  doc.activeElement = first;
  compiled.exports.containDialogFocus({ key: 'Tab', shiftKey: true, currentTarget: target, preventDefault() {} });
  assert.equal(focused, 'content');
});

for (const desktop of [false, true]) test(`inspector lifecycle: ${desktop ? 'desktop inline' : 'compact modal'}, resize, Escape and cleanup`, t => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls = [], media = { matches: desktop, listener: null, addEventListener(_name, callback) { this.listener = callback; }, removeEventListener(_name, callback) { assert.equal(callback, this.listener); this.listener = null; } };
  const opener = { isConnected: true, focus: () => calls.push('return-focus') };
  const body = { style: { overflow: 'auto' } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: opener, body } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => media } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
  });
  let closed = 0;
  const h = mount('Inspector', { pending: false, onClose: () => closed++, children: React.createElement('p', null, 'Synthetic details') });
  const dialog = { open: false, close() { this.open = false; }, showModal() { this.open = true; calls.push('modal'); } };
  h.tree.props.ref.current = dialog;
  const cleanup = h.effects[0]();
  assert.equal(dialog.open, true);
  assert.equal(body.style.overflow, desktop ? 'auto' : 'hidden');
  assert.equal(calls.includes('modal'), !desktop);
  media.matches = !desktop; media.listener();
  assert.equal(body.style.overflow, desktop ? 'hidden' : 'auto');
  h.tree.props.onCancel({ preventDefault() {} }); assert.equal(closed, 1);
  h.props.pending = true; h.render(); h.tree.props.onCancel({ preventDefault() {} }); assert.equal(closed, 1);
  cleanup();
  assert.equal(dialog.open, false); assert.equal(body.style.overflow, 'auto'); assert.equal(media.listener, null);
  assert.equal(calls.at(-1), 'return-focus');
});
