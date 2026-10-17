import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'stock-drawer-test.cjs'));
const React = requireAdmin('react');
let runner;
const hooks = {
  ...React,
  useState: initial => runner.state(initial),
  useRef: initial => runner.ref(initial),
  useEffect: callback => runner.effect(callback)
};
const output = await build({
  stdin: { resolveDir: admin, contents: "export { default } from './src/components/StockManagementDrawer.jsx';" },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
let environment;
const compiled = new Module(path.join(admin, 'stock-drawer-test.cjs'));
compiled.filename = path.join(admin, 'stock-drawer-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return hooks;
  if (name === 'axios') return { post: (url, body, options) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    environment.requests.push({ url, body, options, resolve, reject });
    return promise;
  } };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);

const walk = (element, visit) => {
  if (!React.isValidElement(element)) return;
  visit(element);
  React.Children.toArray(element.props.children).forEach(child => walk(child, visit));
};
const find = (tree, predicate) => {
  let found;
  walk(tree, element => { if (!found && predicate(element)) found = element; });
  return found;
};
const fixture = { _id: 'synthetic-product', name: 'Synthetic uniform', sizes: ['S', 'M', 'One Size'], inventory: { S: 10, M: 5, 'One Size': 2 } };
const mount = t => {
  const h = { slots: [], cursor: 0, effects: [], requests: [], updated: [], closed: 0, focus: [], modal: false };
  environment = h;
  h.props = {
    product: structuredClone(fixture), token: 'synthetic-token',
    onClose: () => { h.closed++; },
    onUpdated: product => { h.updated.push(product); h.props.product = product; }
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = { style: { overflow: 'auto' } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body, activeElement: { focus: () => h.focus.push('opener') }
  } });
  t.after(() => {
    h.cleanup?.();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  h.state = initial => {
    const index = h.cursor++;
    h.slots[index] ??= { value: initial };
    const slot = h.slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  };
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial };
  h.effect = callback => {
    const index = h.cursor++;
    if (!h.slots[index]) {
      h.slots[index] = {};
      h.effects.push(callback);
    }
  };
  h.commit = () => {
    h.cursor = 0;
    runner = h;
    try { h.tree = compiled.exports.default(h.props); }
    finally { runner = null; }
    walk(h.tree, element => {
      const ref = element.props.ref;
      if (typeof ref === 'function') ref({ focus: () => h.focus.push(element.props['aria-label']) });
      else if (ref && !ref.current) ref.current = {
        showModal: () => { h.modal = true; }, close: () => { h.modal = false; }
      };
    });
    for (const effect of h.effects.splice(0)) h.cleanup = effect();
  };
  h.change = (size, value) => {
    find(h.tree, node => node.type === 'input' && node.props['aria-label'] === `Adjustment for ${size}`)
      .props.onChange({ target: { value } });
    h.commit();
  };
  h.button = type => find(h.tree, node => node.type === 'button' && node.props.type === type);
  h.total = () => find(h.tree, node => node.props['aria-label'] === 'Resulting total stock').props.children;
  h.submit = () => find(h.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  h.commit();
  return h;
};

test('drawer previews signed per-size changes and resulting total without changing inventory', t => {
  const h = mount(t);
  assert(h.modal);
  assert.equal(h.total(), 17);
  assert(h.button('submit').props.disabled, 'no-op submission disabled');
  h.change('S', '5');
  h.change('M', '-3');
  assert.equal(h.total(), 19);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'New stock for M').props.children, 2);
  assert(!h.button('submit').props.disabled);
  assert.deepEqual(h.props.product.inventory, fixture.inventory);
  assert.equal(h.requests.length, 0);
  const input = find(h.tree, node => node.props['aria-label'] === 'Adjustment for One Size');
  assert(!/\s/.test(input.props.id), 'label IDs support multiword sizes');
});

for (const value of ['-11', '1.5', 'invalid', String(Number.MAX_SAFE_INTEGER)]) {
  test(`invalid adjustment ${value} blocks requests and focuses the affected input`, async t => {
    const h = mount(t);
    h.change('S', value);
    assert(h.button('submit').props.disabled);
    assert.equal(h.total(), '—');
    await h.submit();
    assert.equal(h.requests.length, 0);
    assert.equal(h.focus.at(-1), 'Adjustment for S');
    h.change('S', '0');
    assert.equal(h.total(), 17);
  });
}

test('submit preserves signed API payload, token, pending guards, and server-authoritative updates', async t => {
  const h = mount(t);
  await h.submit();
  assert.equal(h.requests.length, 0);
  h.change('S', '5');
  h.change('M', '-3');
  const request = h.submit();
  await h.submit();
  h.commit();
  assert.equal(h.requests.length, 1);
  const { url, body, options } = h.requests[0];
  assert.equal(url, 'https://api.example.test/api/product/stock');
  assert.deepEqual(body, { id: fixture._id, adjustments: { S: 5, M: -3, 'One Size': 0 } });
  assert.equal(options.headers.token, 'synthetic-token');
  walk(h.tree, node => { if (node.type === 'input' || node.type === 'button') assert(node.props.disabled); });
  let prevented = false;
  h.tree.props.onCancel({ preventDefault: () => { prevented = true; } });
  assert(prevented);
  assert.equal(h.closed, 0, 'Escape does not close a pending update');
  const authoritative = { ...fixture, inventory: { S: 16, M: 2, 'One Size': 2 } };
  h.requests[0].resolve({ data: { success: true, product: authoritative } });
  await request;
  h.commit();
  assert.deepEqual(h.updated, [authoritative]);
  assert.equal(h.total(), 20, 'uses returned stock rather than the earlier preview');
  assert(h.button('submit').props.disabled);
  assert(find(h.tree, node => node.props.role === 'status' && node.props.children === 'Stock updated.'));
});

test('server rejection preserves edits and stock, exposes feedback, and permits a deliberate retry', async t => {
  const h = mount(t);
  h.change('S', '3');
  const request = h.submit();
  h.requests[0].reject({ response: { data: { message: 'Synthetic stock conflict. Refresh and review.' } } });
  await request;
  h.commit();
  assert.equal(h.updated.length, 0);
  assert.equal(h.total(), 20);
  assert(find(h.tree, node => node.props.role === 'alert' && node.props.children.includes('Synthetic stock conflict')));
  assert(!h.button('submit').props.disabled);
  h.tree.props.onCancel({ preventDefault() {} });
  assert.equal(h.closed, 1);
});

test('failure refresh reuses the parent loader, retains edits, and blocks saving during refresh', async t => {
  const h = mount(t);
  let refreshed = 0;
  h.props.onRefresh = () => { refreshed++; };
  h.change('S', '3');
  const request = h.submit();
  h.requests[0].resolve({ data: { success: false, message: 'Unable to update stock.' } });
  await request;
  h.commit();
  find(h.tree, node => node.type === 'button' && node.props.children === 'Refresh quantities').props.onClick();
  assert.equal(refreshed, 1);
  h.props.refreshing = true;
  h.commit();
  assert(h.button('submit').props.disabled);
  await h.submit();
  assert.equal(h.requests.length, 1);
  h.props = { ...h.props, refreshing: false, product: { ...fixture, inventory: { ...fixture.inventory, S: 7 } } };
  h.commit();
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Adjustment for S').props.value, '3');
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'New stock for S').props.children, 10);
  assert(!h.button('submit').props.disabled);
});

test('modal cleanup restores scrolling and opener focus', t => {
  const h = mount(t);
  assert.equal(document.body.style.overflow, 'hidden');
  h.cleanup();
  h.cleanup = null;
  assert(!h.modal);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(h.focus.at(-1), 'opener');
});

test('Tab wraps between enabled drawer controls and keeps focus contained while pending', t => {
  const h = mount(t);
  const first = { focus: () => h.focus.push('first') };
  const last = { focus: () => h.focus.push('last') };
  const dialog = {
    querySelectorAll: () => [first, last],
    focus: () => h.focus.push('dialog')
  };
  let prevented = 0;
  const press = shiftKey => h.tree.props.onKeyDown({
    key: 'Tab', shiftKey, currentTarget: dialog, preventDefault: () => { prevented++; }
  });
  document.activeElement = first;
  press(true);
  assert.equal(h.focus.at(-1), 'last');
  document.activeElement = last;
  press(false);
  assert.equal(h.focus.at(-1), 'first');
  dialog.querySelectorAll = () => [];
  press(false);
  assert.equal(h.focus.at(-1), 'dialog');
  assert.equal(prevented, 3);
});
