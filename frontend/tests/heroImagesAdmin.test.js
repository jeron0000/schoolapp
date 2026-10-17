import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'hero-v2-test.cjs'));
const React = requireAdmin('react');
let runner, environment;
const same = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const hooks = {
  ...React,
  useState: initial => runner.state(initial),
  useRef: initial => runner.ref(initial),
  useCallback: (callback, dependencies) => runner.callback(callback, dependencies),
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
};
const output = await build({
  stdin: { resolveDir: admin, contents: `
    export { default as Page } from './src/pages/HeroImages.jsx';
    export { default as Form } from './src/components/HeroImageForm.jsx';
    export { default as Item } from './src/components/HeroImageItem.jsx';
    export { default as Delete } from './src/components/HeroDeleteConfirmation.jsx';
    export { containDialogFocus } from './src/utils/dialogFocus.js';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  loader: { '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
const compiled = new Module(path.join(admin, 'hero-v2-test.cjs'));
compiled.filename = path.join(admin, 'hero-v2-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return hooks;
  if (name === 'axios') return config => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    environment.requests.push({ ...config, resolve, reject });
    return promise;
  };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);
const walk = (node, visit) => {
  if (!React.isValidElement(node)) return;
  visit(node);
  React.Children.toArray(node.props.children).forEach(child => walk(child, visit));
};
const find = (tree, predicate) => {
  let found;
  walk(tree, node => { if (!found && predicate(node)) found = node; });
  return found;
};
const all = (tree, predicate) => {
  const found = [];
  walk(tree, node => { if (predicate(node)) found.push(node); });
  return found;
};
const slide = (id = 'a', extra = {}) => ({ _id: id, altText: 'Synthetic campus photo ' + id, imageUrl: 'https://images.example.test/' + id + '.png', isActive: false, ...extra });
const file = (extra = {}) => ({ name: 'synthetic.png', type: 'image/png', size: 100, ...extra });
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const mount = (t, kind, props = {}) => {
  const h = { slots: [], cursor: 0, effects: [], requests: [], saves: [], deleted: [], focus: [], urls: [], revoked: [], closed: 0 };
  environment = h;
  h.props = {
    token: 'synthetic-token', busy: false, unavailable: false,
    image: kind === 'Delete' ? slide() : null,
    onSave: async values => { h.saves.push(values); return { ok: false, message: 'Synthetic recoverable failure.' }; },
    onConfirm: async id => { h.deleted.push(id); return { ok: false, message: 'Synthetic cleanup failure.' }; },
    onClose: () => { h.closed++; }, ...props
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const opener = { id: 'synthetic-opener', isConnected: true, focus: () => h.focus.push('opener') };
  h.opener = opener;
  const fallback = { focus: () => h.focus.push('fallback') };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    activeElement: opener, body: { style: { overflow: 'auto' } }, getElementById: () => fallback
  } });
  t.mock.method(URL, 'createObjectURL', () => { const url = 'blob:synthetic-' + (h.urls.length + 1); h.urls.push(url); return url; });
  t.mock.method(URL, 'revokeObjectURL', url => h.revoked.push(url));
  h.state = initial => {
    const index = h.cursor++;
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    const slot = h.slots[index];
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  };
  h.ref = initial => h.slots[h.cursor++] ??= { current: initial };
  h.callback = (callback, dependencies) => {
    const index = h.cursor++;
    if (!same(h.slots[index]?.dependencies, dependencies)) h.slots[index] = { callback, dependencies };
    return h.slots[index].callback;
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
  h.commit = () => {
    h.cursor = 0;
    h.effects = [];
    runner = h;
    try { h.tree = compiled.exports[kind](h.props); }
    finally { runner = null; }
    walk(h.tree, node => {
      const ref = node.props.ref;
      if (ref && !ref.current) ref.current = {
        open: false, src: '', showModal() { this.open = true; }, close() { this.open = false; },
        focus: () => h.focus.push(node.props.id || 'dialog')
      };
    });
    for (const effect of h.effects) effect();
  };
  h.unmount = () => { for (const slot of h.slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined; } };
  t.after(() => { h.unmount(); if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document; });
  h.input = id => find(h.tree, node => node.props.id === id);
  h.change = (id, value) => { h.input(id).props.onChange({ target: { value } }); h.commit(); };
  h.select = selected => { h.input('hero-file').props.onChange({ target: { files: selected ? [selected] : [], value: 'selected' } }); h.commit(); };
  h.submit = () => find(h.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  h.card = id => find(h.tree, node => node.props.image?._id === id && typeof node.props.onMove === 'function');
  h.commit();
  return h;
};

test('Add previews locally, reports real dimensions, preserves fields after failure and revokes object URLs', async t => {
  const h = mount(t, 'Form');
  assert.equal(document.body.style.overflow, 'hidden');
  const chosen = file();
  h.select(chosen);
  assert.equal(h.urls.length, 1);
  assert.equal(h.saves.length, 0);
  const preview = find(h.tree, node => node.type === 'img');
  assert.equal(preview.props.ref.current.src, h.urls[0]);
  preview.props.onLoad({ currentTarget: { naturalWidth: 1920, naturalHeight: 1080 } });
  h.change('hero-alt', 'Campus students in uniform');
  assert.match(find(h.tree, node => node.type === 'figcaption').props.children.join(''), /1920 × 1080px/);
  find(h.tree, node => node.props.role === 'switch').props.onChange({ target: { checked: true } });
  h.commit();
  await h.submit();
  h.commit();
  assert.deepEqual(h.saves[0], { image: chosen, altText: 'Campus students in uniform', isActive: true });
  assert.equal(h.input('hero-alt').props.value, 'Campus students in uniform');
  assert(find(h.tree, node => node.props.role === 'alert'));
  assert(find(h.tree, node => node.type === 'img'));
  assert.equal(h.closed, 0);
  h.select(file({ name: 'another.webp', type: 'image/webp' }));
  assert.deepEqual(h.revoked, [h.urls[0]]);
  h.unmount();
  assert.deepEqual(h.revoked, h.urls);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(h.focus.at(-1), 'opener');
});

for (const selected of [undefined, file({ type: 'image/svg+xml' }), file({ size: 5 * 1024 * 1024 + 1 })]) {
  test('invalid or missing selected file is rejected without saving: ' + (selected?.type || 'missing'), async t => {
    const h = mount(t, 'Form');
    h.select(selected);
    await h.submit();
    h.commit();
    assert.equal(h.saves.length, 0);
    assert.equal(h.urls.length, 0);
    assert(find(h.tree, node => node.props.role === 'alert'));
  });
}

for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
  test(type + ' remains supported at the 5 MiB boundary', async t => {
    const h = mount(t, 'Form');
    h.select(file({ type, size: 5 * 1024 * 1024 }));
    h.change('hero-alt', 'x'.repeat(250));
    await h.submit();
    assert.equal(h.saves.length, 1);
  });
}

test('alt text remains required, single-line and limited to 250 characters', async t => {
  const h = mount(t, 'Form');
  h.select(file());
  for (const text of ['', '   ', 'x'.repeat(251), 'line\nbreak', 'control\u007f', 'line\u2028separator']) {
    h.change('hero-alt', text);
    await h.submit();
    assert.equal(h.saves.length, 0);
  }
});

test('Edit retains the existing file, submits metadata, and respects busy/unavailable states', async t => {
  const image = slide();
  const h = mount(t, 'Form', { image });
  assert.equal(h.input('hero-file'), undefined);
  assert.equal(find(h.tree, node => node.type === 'img').props.src, image.imageUrl);
  h.change('hero-alt', 'New description');
  await h.submit();
  assert.deepEqual(h.saves[0], { image: null, altText: 'New description', isActive: false });
  h.props.busy = true;
  h.commit();
  await h.submit();
  h.tree.props.onCancel({ preventDefault() {} });
  assert.equal(h.closed, 0);
  assert.equal(h.saves.length, 1);
  h.props = { ...h.props, busy: false, unavailable: true };
  h.commit();
  await h.submit();
  assert(find(h.tree, node => node.type === 'button' && node.props.type === 'submit').props.disabled);
  assert.equal(h.saves.length, 1);
});

test('item controls preserve endpoints, boundary disabling, visibility and deletion-pending safety', () => {
  const calls = [], image = slide();
  const props = { image, index: 0, total: 2, disabled: false,
    onMove: (...args) => calls.push(args), onEdit: value => calls.push(value),
    onActiveChange: (...args) => calls.push(args), onDelete: value => calls.push(value) };
  let tree = compiled.exports.Item(props);
  assert.equal(find(tree, node => node.type === 'img').props.src, image.imageUrl);
  assert(find(tree, node => node.props['aria-label'] === 'Move up: ' + image.altText).props.disabled);
  find(tree, node => node.props['aria-label'] === 'Move down: ' + image.altText).props.onClick();
  find(tree, node => node.props.role === 'switch').props.onChange({ target: { checked: true } });
  assert.deepEqual(calls, [['a', 1], ['a', true]]);
  tree = compiled.exports.Item({ ...props, index: 1, image: { ...image, deletionPending: true } });
  assert(find(tree, node => node.props['aria-label'] === 'Move down: ' + image.altText).props.disabled);
  assert(find(tree, node => node.props.role === 'switch').props.disabled);
  assert(find(tree, node => node.props['aria-label'] === 'Edit details: ' + image.altText).props.disabled);
  assert(!find(tree, node => node.props['aria-label'] === 'Retry deletion: ' + image.altText).props.disabled);
});

test('Page preserves create, server reconciliation, ordering and metadata-only Edit contracts', async t => {
  const h = mount(t, 'Page');
  assert.equal(h.requests[0].method, 'get');
  assert(h.requests[0].url.endsWith('/api/hero/admin/list'));
  h.requests[0].resolve({ data: { success: true, slides: [slide('a'), slide('b')] } });
  await settle(); h.commit();
  h.input('hero-manager-add').props.onClick(); h.commit();
  const values = { image: new File(['synthetic'], 'fixture.png', { type: 'image/png' }), altText: 'New photo', isActive: false };
  const adding = find(h.tree, node => typeof node.props.onSave === 'function').props.onSave(values);
  assert(h.requests[1].url.endsWith('/api/hero/add'));
  assert.equal(h.requests[1].headers.token, 'synthetic-token');
  assert.equal(h.requests[1].data.get('altText'), 'New photo');
  assert.equal(h.requests[1].data.get('isActive'), 'false');
  h.requests[1].resolve({ data: { success: true } });
  await settle();
  h.requests[2].resolve({ data: { success: true, slides: [slide('a'), slide('b')] } });
  await adding; h.commit();
  assert(!find(h.tree, node => typeof node.props.onSave === 'function'));
  h.card('a').props.onEdit(slide('a')); h.commit();
  const editing = find(h.tree, node => typeof node.props.onSave === 'function').props.onSave({ image: values.image, altText: 'Edited', isActive: true });
  assert.equal(h.requests[3].method, 'patch');
  assert.deepEqual(h.requests[3].data, { altText: 'Edited', isActive: true });
  h.requests[3].resolve({ data: { success: true } }); await settle();
  h.requests[4].resolve({ data: { success: true, slides: [slide('a', { altText: 'Edited', isActive: true }), slide('b')] } });
  await editing; h.commit();
  assert.equal(h.card('a').props.image.altText, 'Edited');
  const moving = h.card('b').props.onMove('b', -1);
  assert.deepEqual(h.requests[5].data, { orderedIds: ['b', 'a'] });
  await h.card('b').props.onMove('b', -1);
  assert.equal(h.requests.length, 6, 'synchronous duplicate guard remains effective');
  h.requests[5].reject(new Error('Synthetic reorder failure')); await settle();
  h.requests[6].resolve({ data: { success: true, slides: [slide('a'), slide('b')] } });
  await moving; h.commit();
  assert.equal(h.card('a').props.index, 0, 'failed reorder reconciles from server');
  const activating = h.card('a').props.onActiveChange('a', true);
  assert.deepEqual(h.requests[7].data, { isActive: true });
  h.commit();
  assert.equal(h.card('a').props.image.isActive, false, 'pending activation does not change server-authoritative state');
  assert(h.card('a').props.disabled);
  h.requests[7].resolve({ data: { success: true } }); await settle();
  h.requests[8].resolve({ data: { success: true, slides: [slide('a', { isActive: true }), slide('b')] } });
  await activating; h.commit();
  assert.equal(h.card('a').props.image.isActive, true);
});

test('Delete confirms only the selected record and retains recoverable cleanup errors', async t => {
  const h = mount(t, 'Delete');
  const confirm = () => find(h.tree, node => node.props.className === 'hero-manager-delete');
  await confirm().props.onClick(); h.commit();
  assert.deepEqual(h.deleted, ['a']);
  assert(find(h.tree, node => node.props.role === 'alert'));
  h.props.busy = true; h.commit();
  await confirm().props.onClick();
  h.tree.props.onCancel({ preventDefault() {} });
  assert.equal(h.closed, 0);
  assert.equal(h.deleted.length, 1);
  h.props = { ...h.props, busy: false, unavailable: true }; h.commit();
  assert(confirm().props.disabled);
});

test('modal focus wraps visible controls and restores a logical target after list reconciliation', t => {
  const h = mount(t, 'Form');
  const first = { getClientRects: () => [1], focus: () => h.focus.push('first') };
  const last = { getClientRects: () => [1], focus: () => h.focus.push('last') };
  const hidden = { getClientRects: () => [], focus: () => assert.fail('hidden control focused') };
  const dialog = { querySelectorAll: () => [hidden, first, last] };
  document.activeElement = first;
  compiled.exports.containDialogFocus({ key: 'Tab', shiftKey: true, currentTarget: dialog, preventDefault() {} });
  assert.equal(h.focus.at(-1), 'last');
  document.activeElement = last;
  compiled.exports.containDialogFocus({ key: 'Tab', shiftKey: false, currentTarget: dialog, preventDefault() {} });
  assert.equal(h.focus.at(-1), 'first');
  // The captured opener was replaced when the list reconciled.
  // Cleanup uses the matching ID (or the persistent Add control).
  h.opener.isConnected = false;
  h.unmount();
  assert.equal(h.focus.at(-1), 'fallback');
});
