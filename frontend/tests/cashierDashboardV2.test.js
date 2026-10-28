import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'cashier-dashboard-v2-test.cjs'));
const React = requireAdmin('react');
const { renderToStaticMarkup } = requireAdmin('react-dom/server');
let runner;
const hooks = {
  ...React,
  useState: initial => runner.state(initial),
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
};
const output = await build({
  stdin: { resolveDir: admin, contents: `
    export { default as Page } from './src/pages/CashierDashboard.jsx';
    export { default as Methods } from './src/components/PaymentMethodBreakdown.jsx';
    export { default as Chart } from './src/components/CollectionOverviewChart.jsx';
    export { AwaitingPaymentSummary as Awaiting, RecentPaymentsSummary as Recent } from './src/components/CashierPaymentSummaries.jsx';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' },
  plugins: [{ name: 'isolated-theme', setup(builder) {
    builder.onLoad({ filter: /hooks[\\/]useTheme\.js$/ }, () => ({ contents: "export const useTheme = () => ({ theme: 'dark' });", loader: 'js' }));
  } }]
});
const compiled = new Module(path.join(admin, 'cashier-dashboard-v2-test.cjs'));
compiled.filename = path.join(admin, 'cashier-dashboard-v2-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return hooks;
  if (name === 'react-router-dom') return { Link: ({ to, ...props }) => React.createElement('a', { href: to, ...props, state: undefined }) };
  if (name === 'axios') return { get: (url, options) => new Promise((resolve, reject) => runner.requests.push({ url, options, resolve, reject })) };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);
const same = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const walk = (node, predicate, matches = []) => {
  if (!React.isValidElement(node)) return matches;
  if (predicate(node)) matches.push(node);
  React.Children.forEach(node.props.children, child => walk(child, predicate, matches));
  return matches;
};
const mount = t => {
  const h = { slots: [], cursor: 0, effects: [], requests: [], props: { token: 'synthetic-staff', paymentsPath: '/cashier/payments', transactionsPath: '/cashier/transactions' } };
  h.state = initial => {
    const index = h.cursor++;
    const slot = h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  };
  h.effect = (callback, dependencies) => {
    const index = h.cursor++;
    const previous = h.slots[index];
    if (!same(previous?.dependencies, dependencies)) {
      const slot = { dependencies, cleanup: previous?.cleanup };
      h.slots[index] = slot;
      h.effects.push(() => { slot.cleanup?.(); slot.cleanup = callback(); });
    }
  };
  h.render = () => {
    runner = h; h.cursor = 0; h.effects = [];
    h.tree = compiled.exports.Page(h.props);
    h.html = renderToStaticMarkup(h.tree);
    h.effects.forEach(effect => effect());
    return h.html;
  };
  h.select = label => {
    walk(h.tree, node => node.type === 'button' && node.props.children === label)[0].props.onClick();
    h.render();
  };
  h.unmount = () => h.slots.forEach(slot => slot.cleanup?.());
  t.after(h.unmount);
  h.render();
  return h;
};
const response = (range = 'today', overrides = {}) => ({
  success: true, currency: 'PHP', range: { key: range, timezone: 'Asia/Manila' },
  summary: { totalCollected: 1250.5, paidTransactions: 2, awaitingPayment: 3, averageTransaction: 625.25 },
  dataQuality: { collectionPeriodComplete: true, trendComplete: true },
  collectionTrend: { granularity: 'day', points: [{ key: '2026-10-16', label: 'Oct 16', amount: 1250.5, transactionCount: 2 }], undatedAmount: 0, undatedTransactions: 0 },
  paymentMethodBreakdown: [{ method: 'COD', amount: 1250.5, percentage: 100, transactionCount: 2 }],
  awaitingPayments: [{ _id: 'synthetic-queue', studentName: 'Synthetic Student', amountDue: 50.25, itemCount: 2, waitingSince: null, waitingTimeSource: null }],
  recentPayments: [{ _id: 'synthetic-recent', studentName: 'Synthetic Student', amount: 625.25, paidAt: Date.UTC(2026, 9, 16), paymentMethod: 'COD', receiptNumber: 'TEST-001' }],
  ...overrides
});

test('five periods retain their exact API keys, token header and navigation destinations', async t => {
  const h = mount(t);
  assert.match(h.html, /Loading/);
  assert.doesNotMatch(h.html, /₱0\.00/);
  for (const [index, label] of ['Today', 'Last 7 Days', 'Last 30 Days', 'This Year', 'All Time'].entries()) {
    if (index) h.select(label);
    const key = ['today', 'last7days', 'last30days', 'thisyear', 'alltime'][index];
    const request = h.requests.at(-1);
    assert.equal(request.options.params.range, key);
    assert.equal(request.options.headers.token, 'synthetic-staff');
    assert.match(request.url, /\/api\/order\/cashier\/dashboard\/overview$/);
    request.resolve({ data: response(key) }); await settle(); h.render();
    assert.match(h.html, /₱1,250\.50/);
    assert.match(h.html, /₱625\.25/);
    assert.match(h.html, /Current queue · not date-filtered/);
    assert.match(h.html, /cashier-dashboard-metric-pending/);
    assert.match(h.html, /href="\/cashier\/payments"/);
    assert.match(h.html, /href="\/cashier\/transactions"/);
    assert.match(h.html, /TEST-001/);
  }
  assert.equal(h.requests.length, 5);
  h.select('All Time'); assert.equal(h.requests.length, 5);
});

test('All Time preserves incomplete coverage and never claims verified lifetime totals', async t => {
  const h = mount(t); h.select('All Time');
  h.requests[1].resolve({ data: response('alltime', {
    dataQuality: { collectionPeriodComplete: false, trendComplete: false },
    summary: { totalCollected: 0, paidTransactions: 0, awaitingPayment: 0, averageTransaction: 0 },
    awaitingPayments: [], recentPayments: [], paymentMethodBreakdown: []
  }) });
  await settle(); h.render();
  assert.match(h.html, /Historical collection data is incomplete/);
  assert.match(h.html, /do not treat these figures as verified lifetime collections/);
  assert.match(h.html, /All Time · incomplete/);
  assert.match(h.html, /Nothing needs confirmation/);
  assert.doesNotMatch(h.html, /cashier-dashboard-metric-pending/);
  assert.match(h.html, /No dated confirmed payments in the available data/);
});

for (const [name, payload] of [
  ['foreign currency', { currency: 'USD' }], ['wrong timezone', { range: { key: 'today', timezone: 'UTC' } }],
  ['negative amount', { summary: { ...response().summary, totalCollected: -1 } }],
  ['fractional count', { summary: { ...response().summary, paidTransactions: 0.5 } }]
]) test('malformed overview fails closed: ' + name, async t => {
  const h = mount(t); h.requests[0].resolve({ data: response('today', payload) }); await settle(); h.render();
  assert.match(h.html, /Payment summary unavailable/);
  assert.doesNotMatch(h.html, /₱0\.00|₱1,250\.50/);
});

test('failed requests and superseded/unmounted responses retain the existing lifecycle safeguards', async t => {
  const h = mount(t);
  h.select('Last 7 Days'); assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[1].reject(new Error('synthetic private failure')); await settle(); h.render();
  h.requests[0].resolve({ data: response() }); await settle(); h.render();
  assert.match(h.html, /Payment summary unavailable/);
  assert.doesNotMatch(h.html, /synthetic private failure|₱1,250\.50/);
  h.select('This Year'); h.unmount();
  assert.equal(h.requests[2].options.signal.aborted, true);
  const previous = h.slots[1].value;
  h.requests[2].resolve({ data: response('thisyear') }); await settle();
  assert.equal(h.slots[1].value, previous);
});

const markup = (kind, props) => {
  runner = { state: initial => [initial, () => {}] };
  return renderToStaticMarkup(compiled.exports[kind](props));
};
const peso = amount => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
test('populated chart and method reporting preserve real values, dates, shares and undated warning', () => {
  const data = response();
  const chart = markup('Chart', { status: 'success', data: { ...data.collectionTrend, undatedTransactions: 1, undatedAmount: 50 }, complete: false, formatCurrency: peso });
  assert.match(chart, /₱1,250\.50/); assert.match(chart, /Oct 16/);
  assert.match(chart, /Payments without a recorded date \(₱50\.00\) are not plotted/);
  const methods = markup('Methods', { status: 'success', data: data.paymentMethodBreakdown, complete: false, formatCurrency: peso });
  assert.match(methods, /100%/); assert.match(methods, /₱1,250\.50/); assert.match(methods, /COD/);
  assert.match(methods, /Payment-method data for this period is incomplete/);
});

test('honest empty panels differ from loading, error and malformed records', () => {
  const props = { status: 'success', complete: true, formatCurrency: peso, rangeLabel: 'Today' };
  assert.match(markup('Methods', { ...props, data: [] }), /No confirmed payments for Today/);
  assert.match(markup('Chart', { ...props, data: { ...response().collectionTrend, points: [] } }), /No collections for Today/);
  assert.match(markup('Awaiting', { ...props, payments: [] }), /Nothing needs confirmation/);
  assert.match(markup('Recent', { ...props, payments: [] }), /No confirmed payments for Today/);
  for (const kind of ['Methods', 'Chart']) {
    const invalid = markup(kind, { ...props, data: [{}] });
    assert.match(invalid, /unavailable/); assert.doesNotMatch(invalid, /data-empty/);
  }
  for (const kind of ['Awaiting', 'Recent']) {
    const invalid = markup(kind, { ...props, payments: [{ _id: 'bad', studentName: {} }] });
    assert.match(invalid, /Unable to load/); assert.doesNotMatch(invalid, /data-empty/);
    assert.match(markup(kind, { ...props, status: 'loading' }), /Loading/);
  }
});
