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
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
};
const output = await build({
  stdin: { resolveDir: admin, contents: "export { default } from './src/components/StockManagementDrawer.jsx'; export { default as SizeMeasurementsEditor } from './src/components/SizeMeasurementsEditor.jsx';" },
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
  if (name === 'axios') {
    const request = (method, url, body, options) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      environment.requests.push({ method, url, body, options, resolve, reject });
    return promise;
    };
    return {
      post: (url, body, options) => request('post', url, body, options),
      patch: (url, body, options) => request('patch', url, body, options),
      get: (url, options) => request('get', url, undefined, options),
      delete: (url, options) => request('delete', url, undefined, options)
    };
  }
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);
const SizeMeasurementsEditor = compiled.exports.SizeMeasurementsEditor;

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
const mount = (t, product = fixture) => {
  const h = { slots: [], cursor: 0, effects: [], cleanups: [], requests: [], updated: [], dirty: [], busy: [], closed: 0, focus: [], modal: false };
  environment = h;
  h.props = {
    product: structuredClone(product), token: 'synthetic-token',
    onClose: () => { h.closed++; },
    onUpdated: updated => { h.updated.push(updated); h.props.product = updated; },
    onDirtyChange: value => h.dirty.push(value),
    onBusyChange: value => h.busy.push(value)
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
    const initialValue = typeof initial === 'function' ? initial() : initial;
    h.slots[index] ??= { value: initialValue };
    const slot = h.slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  };
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial };
  h.effect = (callback, dependencies) => {
    const index = h.cursor++;
    const previous = h.slots[index];
    const dependenciesChanged = !previous
      || !dependencies
      || dependencies.length !== previous.dependencies?.length
      || dependencies.some((value, dependencyIndex) => !Object.is(value, previous.dependencies?.[dependencyIndex]));
    h.slots[index] = { ...previous, dependencies };
    if (dependenciesChanged) h.effects.push({ callback, index });
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
    for (const effect of h.effects.splice(0)) {
      h.slots[effect.index].cleanup?.();
      const cleanup = effect.callback();
      h.slots[effect.index].cleanup = cleanup;
    }
    h.cleanup = () => {
      for (const slot of h.slots) slot?.cleanup?.();
    };
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

test('Manage Sizes adds one canonical size at zero while preserving existing stock', async t => {
  const product = { ...fixture, sizes: ['M'], inventory: { M: 5 } };
  const h = mount(t, product);
  find(h.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Sizes').props.onClick();
  h.commit();

  const large = find(h.tree, node => node.props['aria-label'] === 'Available size L');
  large.props.onChange();
  h.commit();
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Available size L').props.checked, true);
  assert.equal(h.dirty.at(-1), true);

  const saving = find(h.tree, node => node.type === 'button' && node.props.children === 'Save Size Changes').props.onClick();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0], {
    method: 'patch',
    url: 'https://api.example.test/api/product/sizes/synthetic-product',
    body: { sizes: ['M', 'L'] },
    options: { headers: { token: 'synthetic-token' } },
    resolve: h.requests[0].resolve,
    reject: h.requests[0].reject
  });
  const updated = { ...product, sizes: ['M', 'L'], inventory: { M: 5, L: 0 } };
  h.requests[0].resolve({ data: { success: true, message: 'Available sizes updated.', product: updated } });
  await saving;
  h.commit();

  assert.deepEqual(h.updated, [updated]);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Current stock for M: 5').props.children, 5);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Current stock for L: 0').props.children, 0);
  assert.equal(h.dirty.at(-1), false);
});

test('Manage Sizes adds multiple custom sizes and persists them at zero stock', async t => {
  const product = { ...fixture, sizes: ['M'], inventory: { M: 5 } };
  const h = mount(t, product);
  find(h.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Sizes').props.onClick();
  h.commit();

  const addCustomSize = value => {
    find(h.tree, node => node.type?.name === 'CustomSizeInput').props.onAdd(value);
    h.commit();
  };

  addCustomSize('3XL');
  addCustomSize('4XL');
  assert(find(h.tree, node => node.props['aria-label'] === 'Remove custom size 3XL'));
  assert(find(h.tree, node => node.props['aria-label'] === 'Remove custom size 4XL'));
  const saving = find(h.tree, node => node.type === 'button' && node.props.children === 'Save Size Changes').props.onClick();
  assert.deepEqual(h.requests[0].body, { sizes: ['M', '3XL', '4XL'] });
  const updated = {
    ...product,
    sizes: ['M', '3XL', '4XL'],
    inventory: { M: 5, '3XL': 0, '4XL': 0 }
  };
  h.requests[0].resolve({ data: { success: true, product: updated } });
  await saving;
  h.commit();

  assert.deepEqual(h.updated, [updated]);
});

test('Manage Sizes removes an eligible zero-stock size and Cancel restores edits', async t => {
  const product = { ...fixture, sizes: ['S', 'M'], inventory: { S: 0, M: 5 } };
  const h = mount(t, product);
  const openEditor = () => {
    find(h.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Sizes').props.onClick();
    h.commit();
  };
  openEditor();

  find(h.tree, node => node.props['aria-label'] === 'Available size S').props.onChange();
  h.commit();
  find(h.tree, node => node.type === 'button' && node.props.children === 'Cancel').props.onClick();
  h.commit();
  openEditor();
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Available size S').props.checked, true);

  find(h.tree, node => node.props['aria-label'] === 'Available size S').props.onChange();
  h.commit();
  const saving = find(h.tree, node => node.type === 'button' && node.props.children === 'Save Size Changes').props.onClick();
  assert.deepEqual(h.requests[0].body, { sizes: ['M'] });
  const updated = { ...product, sizes: ['M'], inventory: { M: 5 } };
  h.requests[0].resolve({ data: { success: true, product: updated } });
  await saving;
  h.commit();
  assert.deepEqual(h.updated, [updated]);
});

test('Manage Sizes disables removal while a size still has stock', t => {
  const stocked = { ...fixture, sizes: ['S', 'M'], inventory: { S: 2, M: 0 } };
  const stockedHarness = mount(t, stocked);
  find(stockedHarness.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Sizes').props.onClick();
  stockedHarness.commit();
  const stockedSize = find(stockedHarness.tree, node => node.props['aria-label'] === 'Available size S');
  assert.equal(stockedSize.props.disabled, true);
  assert.match(find(stockedHarness.tree, node => node.type === 'label' && node.props.title?.includes('in stock')).props.title, /set stock to 0/);
});

test('Manage Sizes preserves the selection after a reservation rejection', async t => {
  const reserved = { ...fixture, sizes: ['S', 'M'], inventory: { S: 0, M: 5 } };
  const h = mount(t, reserved);
  find(h.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Sizes').props.onClick();
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Available size S').props.onChange();
  h.commit();
  const saving = find(h.tree, node => node.type === 'button' && node.props.children === 'Save Size Changes').props.onClick();
  h.requests[0].reject({ response: { data: { message: 'A selected size is reserved by an active order and cannot be removed.' } } });
  await saving;
  h.commit();

  assert.equal(h.updated.length, 0);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Available size S').props.checked, false);
  assert(find(h.tree, node => node.props.role === 'alert' && node.props.children.includes('reserved by an active order')));
});

test('Manage Sizes saves and cancels measurements independently without changing stock', async t => {
  const originalGuide = {
    fields: [{ key: 'garment-length', label: 'Garment length' }],
    measurements: [{ size: 'M', values: { 'garment-length': 68 } }]
  };
  const product = { ...fixture, sizes: ['M', '4XL'], inventory: { M: 5, '4XL': 0 }, sizeGuide: originalGuide };
  const h = mount(t, product);
  find(h.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Sizes').props.onClick();
  h.commit();

  const measurementEditor = () => find(h.tree, node => node.type === SizeMeasurementsEditor);
  const editedGuide = {
    fields: originalGuide.fields,
    measurements: [
      { size: 'M', values: { 'garment-length': '70' } },
      { size: '4XL', values: { 'garment-length': '82.5' } }
    ]
  };
  measurementEditor().props.onChange(editedGuide);
  h.commit();
  assert.equal(h.dirty.at(-1), true);

  find(h.tree, node => node.type === 'button' && node.props.children === 'Cancel Measurement Changes').props.onClick();
  h.commit();
  assert.deepEqual(measurementEditor().props.value, originalGuide);

  measurementEditor().props.onChange(editedGuide);
  h.commit();
  const saving = find(h.tree, node => node.type === 'button' && node.props.children === 'Save Measurements').props.onClick();
  assert.deepEqual(h.requests[0].body, {
    sizeGuide: {
      fields: originalGuide.fields,
      measurements: [
        { size: 'M', values: { 'garment-length': 70 } },
        { size: '4XL', values: { 'garment-length': 82.5 } }
      ]
    }
  });
  assert.equal(Object.hasOwn(h.requests[0].body, 'inventory'), false);
  const updated = { ...product, sizeGuide: h.requests[0].body.sizeGuide };
  h.requests[0].resolve({ data: { success: true, message: 'Measurements updated.', product: updated } });
  await saving;
  h.commit();

  assert.deepEqual(h.updated, [updated]);
  assert.deepEqual(h.props.product.inventory, { M: 5, '4XL': 0 });
  assert.equal(h.dirty.at(-1), false);
});

test('Restock Management validates, saves, updates, and clears independently from stock', async t => {
  const product = { ...fixture, sizes: ['M', 'L'], inventory: { M: 0, L: 5 } };
  const h = mount(t, product);
  const status = () => find(h.tree, node => node.props['aria-label'] === 'Restock status');
  const action = label => find(h.tree, node => node.type === 'button' && node.props.children === label);

  status().props.onChange({ target: { value: 'scheduled' } });
  h.commit();
  await action('Save Restock Plan').props.onClick();
  h.commit();
  assert.equal(h.requests.length, 0);
  assert(find(h.tree, node => node.props.role === 'alert' && node.props.children === 'Choose a valid estimated arrival date.'));

  find(h.tree, node => node.props['aria-label'] === 'Estimated Arrival Date')
    .props.onChange({ target: { value: '2099-01-15' } });
  h.commit();
  const scheduledSave = action('Save Restock Plan').props.onClick();
  assert.deepEqual(h.requests[0].body, {
    status: 'scheduled',
    announceRestock: false,
    estimatedDate: '2099-01-15'
  });
  assert.equal(h.requests[0].url, 'https://api.example.test/api/product/restock/synthetic-product');
  const scheduledProduct = {
    ...product,
    restockPlan: {
      status: 'scheduled',
      estimatedDate: '2099-01-15T00:00:00.000Z',
      announce: false,
      publicationTiming: 'immediate'
    }
  };
  h.requests[0].resolve({ data: { success: true, message: 'Restock plan updated.', product: scheduledProduct } });
  await scheduledSave;
  h.commit();
  assert.deepEqual(h.updated[0].inventory, product.inventory);

  status().props.onChange({ target: { value: 'soon' } });
  h.commit();
  const soonSave = action('Save Restock Plan').props.onClick();
  assert.deepEqual(h.requests[1].body, { status: 'soon', announceRestock: false });
  const soonProduct = {
    ...product,
    restockPlan: { status: 'soon', announce: false, publicationTiming: 'immediate' }
  };
  h.requests[1].resolve({ data: { success: true, product: soonProduct } });
  await soonSave;
  h.commit();

  status().props.onChange({ target: { value: 'none' } });
  h.commit();
  const clear = action('Clear Restock Plan').props.onClick();
  assert.deepEqual(h.requests[2].body, { status: 'none', announceRestock: false });
  h.requests[2].resolve({ data: { success: true, message: 'Restock plan cleared.', product } });
  await clear;
  h.commit();

  assert.equal(h.updated.length, 3);
  assert.deepEqual(h.props.product.inventory, product.inventory);
  assert.equal(h.dirty.at(-1), false);
});

test('Restock Management announces immediately or on a valid expected date', async t => {
  const product = { ...fixture, inventory: { S: 0, M: 5, 'One Size': 2 } };
  const h = mount(t, product);
  const findControl = label => find(h.tree, node => node.props['aria-label'] === label);
  const save = () => find(h.tree, node => node.type === 'button' && node.props.children === 'Save Restock Plan');

  findControl('Restock status').props.onChange({ target: { value: 'soon' } });
  h.commit();
  findControl('Announce this restock').props.onChange({ target: { checked: true } });
  h.commit();
  const immediate = save().props.onClick();
  assert.deepEqual(h.requests[0].body, {
    status: 'soon', announceRestock: true, publicationTiming: 'immediate'
  });
  const soon = {
    ...product,
    restockPlan: { status: 'soon', announce: true, publicationTiming: 'immediate' }
  };
  h.requests[0].resolve({ data: { success: true, product: soon } });
  await immediate;
  h.commit();

  findControl('Restock status').props.onChange({ target: { value: 'scheduled' } });
  h.commit();
  findControl('Estimated Arrival Date').props.onChange({ target: { value: '2099-02-15' } });
  h.commit();
  findControl('Restock announcement publication').props.onChange({ target: { value: 'arrival' } });
  h.commit();
  const scheduled = save().props.onClick();
  assert.deepEqual(h.requests[1].body, {
    status: 'scheduled',
    announceRestock: true,
    publicationTiming: 'arrival',
    estimatedDate: '2099-02-15'
  });
  h.requests[1].resolve({ data: { success: true, product: {
    ...product,
    restockPlan: {
      status: 'scheduled', estimatedDate: '2099-02-15T00:00:00.000Z',
      announce: true, publicationTiming: 'arrival'
    }
  } } });
  await scheduled;
  h.commit();
  assert.equal(h.dirty.at(-1), false);
});

test('Scheduled Restock exposes a calendar and prevents invalid arrival publication combinations', t => {
  const h = mount(t);
  const findControl = label => find(h.tree, node => node.props['aria-label'] === label);

  assert.equal(findControl('Estimated Arrival Date'), undefined);
  findControl('Restock status').props.onChange({ target: { value: 'scheduled' } });
  h.commit();

  const calendar = findControl('Estimated Arrival Date');
  assert.equal(calendar.props.type, 'date');
  assert.equal(calendar.props.value, '');
  assert(find(h.tree, node => node.props['data-testid'] === 'restock-calendar-icon' && node.props['aria-hidden'] === 'true'));

  calendar.props.onChange({ target: { value: '2099-02-30' } });
  h.commit();
  find(h.tree, node => node.type === 'button' && node.props.children === 'Save Restock Plan').props.onClick();
  h.commit();
  assert.equal(h.requests.length, 0);
  assert(find(h.tree, node => node.props.role === 'alert' && node.props.children === 'Choose a valid estimated arrival date.'));

  findControl('Announce this restock').props.onChange({ target: { checked: true } });
  h.commit();
  const publication = findControl('Restock announcement publication');
  assert.deepEqual(publication.props.children.filter(Boolean).map(option => option.props.value), ['immediate']);

  calendar.props.onChange({ target: { value: '2099-02-15' } });
  h.commit();
  assert.deepEqual(
    findControl('Restock announcement publication').props.children.filter(Boolean).map(option => option.props.value),
    ['immediate', 'arrival']
  );

  findControl('Restock announcement publication').props.onChange({ target: { value: 'arrival' } });
  h.commit();
  findControl('Estimated Arrival Date').props.onChange({ target: { value: '' } });
  h.commit();
  assert.equal(findControl('Restock announcement publication').props.value, 'immediate');

  findControl('Restock status').props.onChange({ target: { value: 'soon' } });
  h.commit();
  assert.equal(findControl('Estimated Arrival Date'), undefined);
});

test('Scheduled Restock preserves an existing estimated arrival date', t => {
  const h = mount(t, {
    ...fixture,
    restockPlan: {
      status: 'scheduled',
      estimatedDate: '2099-06-30T00:00:00.000Z',
      announce: true,
      publicationTiming: 'arrival'
    }
  });
  const calendar = find(h.tree, node => node.props['aria-label'] === 'Estimated Arrival Date');
  assert.equal(calendar.props.value, '2099-06-30');
  assert.equal(
    find(h.tree, node => node.props['aria-label'] === 'Restock announcement publication').props.value,
    'arrival'
  );
});

test('Stock Update Method schedules positive additions without changing current inventory', async t => {
  const h = mount(t);
  const scheduleMode = find(h.tree, node => node.type === 'button' && node.props.children === 'Schedule Stock Update');
  const loading = scheduleMode.props.onClick();
  assert.equal(h.requests[0].method, 'get');
  assert.equal(h.requests[0].url, 'https://api.example.test/api/product/stock/scheduled/synthetic-product');
  h.requests[0].resolve({ data: { success: true, scheduledStockUpdate: null } });
  await loading;
  h.commit();

  h.change('S', '4');
  find(h.tree, node => node.props['aria-label'] === 'Scheduled stock execution date')
    .props.onChange({ target: { value: '2099-01-02' } });
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Scheduled stock execution time')
    .props.onChange({ target: { value: '09:30' } });
  h.commit();
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Current stock for S: 10').props.children, 10);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'New stock for S').props.children, 14);

  const scheduling = h.submit();
  assert.deepEqual(h.requests[1].body, {
    id: 'synthetic-product',
    adjustments: { S: 4, M: 0, 'One Size': 0 },
    executeAt: '2099-01-02T01:30:00.000Z'
  });
  const scheduledStockUpdate = {
    _id: 'scheduled-update',
    adjustments: { S: 4 },
    executeAt: '2099-01-02T01:30:00.000Z',
    status: 'pending'
  };
  h.requests[1].resolve({ data: {
    success: true,
    message: 'Stock update scheduled.',
    product: fixture,
    scheduledStockUpdate
  } });
  await scheduling;
  h.commit();

  assert.deepEqual(h.props.product.inventory, fixture.inventory);
  assert(find(h.tree, node => node.type === 'span' && node.props.children === 'pending'));
  assert.equal(h.dirty.at(-1), false);
});

test('scheduled stock UI rejects past times and negative adjustments', async t => {
  const h = mount(t);
  const opening = find(h.tree, node => node.type === 'button' && node.props.children === 'Schedule Stock Update').props.onClick();
  h.requests[0].resolve({ data: { success: true, scheduledStockUpdate: null } });
  await opening;
  h.commit();

  h.change('S', '-1');
  find(h.tree, node => node.props['aria-label'] === 'Scheduled stock execution date').props.onChange({ target: { value: '2099-01-02' } });
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Scheduled stock execution time').props.onChange({ target: { value: '09:30' } });
  h.commit();
  await h.submit();
  h.commit();
  assert.equal(h.requests.length, 1);
  assert(find(h.tree, node => node.props.role === 'alert' && /only contain positive/.test(node.props.children)));
});

test('pending scheduled stock update can be cancelled and completed status remains visible', async t => {
  const h = mount(t);
  const pendingSchedule = {
    _id: 'scheduled-update',
    adjustments: { M: 5 },
    executeAt: '2099-01-02T01:30:00.000Z',
    status: 'pending'
  };
  const opening = find(h.tree, node => node.type === 'button' && node.props.children === 'Schedule Stock Update').props.onClick();
  h.requests[0].resolve({ data: { success: true, scheduledStockUpdate: pendingSchedule } });
  await opening;
  h.commit();

  const cancelling = find(h.tree, node => node.type === 'button' && node.props.children === 'Cancel Scheduled Update').props.onClick();
  assert.equal(h.requests[1].method, 'delete');
  h.requests[1].resolve({ data: {
    success: true,
    message: 'Scheduled stock update cancelled.',
    product: fixture,
    scheduledStockUpdate: { ...pendingSchedule, status: 'cancelled' }
  } });
  await cancelling;
  h.commit();
  assert(find(h.tree, node => node.type === 'span' && node.props.children === 'cancelled'));
  assert.equal(find(h.tree, node => node.type === 'button' && node.props.children === 'Cancel Scheduled Update'), undefined);
});
