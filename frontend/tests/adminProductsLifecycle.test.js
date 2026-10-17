import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const admin = fileURLToPath(new URL('../../admin/', import.meta.url));
const requireAdmin = createRequire(path.join(admin, 'product-lifecycle-test.cjs'));
const React = requireAdmin('react');
let runner;
const same = (a, b) => a && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const hooks = {
  ...React,
  useState: initial => runner.state(initial),
  useRef: initial => runner.ref(initial),
  useCallback: (callback, dependencies) => runner.callback(callback, dependencies),
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
};
const output = await build({
  stdin: { resolveDir: admin, contents: "export { default } from './src/pages/List.jsx';" },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
let environment;
const compiled = new Module(path.join(admin, 'product-lifecycle-test.cjs'));
compiled.filename = path.join(admin, 'product-lifecycle-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return hooks;
  if (name === 'react-toastify') return { toast: {
    error: message => environment.errors.push(message),
    success: message => environment.successes.push(message)
  } };
  if (name === 'axios') return {
    get: url => {
      assert.equal(url, 'https://api.example.test/api/product/list');
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      environment.requests.push({ resolve, reject });
      return promise;
    },
    post: (url, body, options) => {
      environment.mutations.push({ url, body, options });
      return Promise.resolve({ data: { success: true, message: 'Removed' } });
    }
  };
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
const product = name => ({ _id: name, name, category: 'Uniform', price: 100, image: [], sizes: [] });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Exercise the actual component with controlled hook commits, requests and DOM refs.
const mount = () => {
  const h = { slots: [], cursor: 0, pending: [], active: true, writesAfterUnmount: 0,
    props: { token: 'synthetic-session' }, requests: [], errors: [], successes: [], mutations: [] };
  environment = h;
  h.state = initial => {
    const index = h.cursor++;
    h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    const slot = h.slots[index];
    return [slot.value, value => {
      if (!h.active) h.writesAfterUnmount++;
      slot.value = typeof value === 'function' ? value(slot.value) : value;
    }];
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
      const slot = { callback, dependencies, cleanup: previous?.cleanup };
      h.slots[index] = slot;
      h.pending.push(slot);
    }
  };
  h.commit = () => {
    h.cursor = 0;
    h.pending = [];
    runner = h;
    try { h.tree = compiled.exports.default(h.props); }
    finally { runner = null; }
    walk(h.tree, element => {
      const ref = element.props.ref;
      if (ref && typeof ref === 'object' && !ref.current) ref.current = {
        open: false, showModal() { this.open = true; }, close() { this.open = false; }, focus() {}
      };
    });
    for (const slot of h.pending) { slot.cleanup?.(); slot.cleanup = slot.callback(); }
    return h.tree;
  };
  h.unmount = () => {
    h.active = false;
    for (const slot of h.slots) slot.cleanup?.();
  };
  h.replay = () => {
    const effects = h.slots.filter(slot => slot.callback && slot.dependencies && 'cleanup' in slot);
    effects.forEach(slot => slot.cleanup?.());
    effects.forEach(slot => { slot.cleanup = slot.callback(); });
  };
  h.success = async (index, name) => {
    h.requests[index].resolve({ data: { success: true, products: [product(name)] } });
    await settle();
    if (h.active) h.commit();
  };
  h.fail = async (index, message = 'Unavailable') => {
    h.requests[index].reject(new Error(message));
    await settle();
    if (h.active) h.commit();
  };
  h.loading = () => !!find(h.tree, element => element.props.role === 'status' && element.props.children === 'Loading products…');
  h.has = name => !!find(h.tree, element => element.props.children === name);
  h.retry = () => find(h.tree, element => element.type === 'button' && element.props.children === 'Try again').props.onClick;
  h.commit();
  return h;
};
const retries = async () => {
  const h = mount();
  await h.fail(0);
  const retry = h.retry();
  h.errors = [];
  const first = retry();
  const second = retry();
  h.commit();
  return { h, first, second, retry };
};

test('normal success, filters, stock callback and deletion refresh retain their contracts', async () => {
  const h = mount();
  assert(h.loading());
  await h.success(0, 'Uniform A');
  assert(h.has('Uniform A'));
  assert(!h.loading());
  const search = find(h.tree, node => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({ target: { value: 'missing' } });
  h.commit();
  assert(!h.has('Uniform A'));
  search.props.onChange({ target: { value: '' } });
  h.commit();
  const stock = find(h.tree, node => node.type === 'button' && node.props['aria-label'] === 'Manage stock for Uniform A');
  stock.props.onClick();
  h.commit();
  const drawer = find(h.tree, node => typeof node.props.onUpdated === 'function');
  drawer.props.onUpdated(product('Uniform A'));
  drawer.props.onClose();
  h.commit();
  find(h.tree, node => node.type === 'button' && node.props['aria-label'] === 'Delete Uniform A').props.onClick();
  h.commit();
  const confirmation = find(h.tree, node => node.type === 'button' && node.props.children === 'Delete Item');
  const removing = confirmation.props.onClick();
  await settle();
  assert.equal(h.mutations.length, 1);
  assert.deepEqual(h.mutations[0].body, { id: 'Uniform A' });
  assert.equal(h.mutations[0].options.headers.token, 'synthetic-session');
  assert.equal(h.requests.length, 2);
  await h.success(1, 'Uniform B');
  await removing;
  h.commit();
  assert(h.has('Uniform B'));
  h.unmount();
});

test('normal transport and API failures retain retry and fulfilled return behavior', async () => {
  const h = mount();
  await h.fail(0);
  assert(h.has('Unavailable'));
  assert(!h.loading());
  const pending = h.retry()();
  h.requests[1].resolve({ data: { success: false, message: 'Try later' } });
  assert.equal(await pending, undefined);
  h.commit();
  assert(h.has('Try later'));
  assert.deepEqual(h.errors, ['Unavailable', 'Try later']);
  h.unmount();
});

for (const [older, newer] of [['success', 'success'], ['success', 'fail'], ['fail', 'success']]) {
  test(`older ${older} cannot overwrite newer ${newer}`, async () => {
    const { h, first, second } = await retries();
    await h[newer](2, newer === 'success' ? 'Latest' : 'Latest error');
    await h[older](1, older === 'success' ? 'Obsolete' : 'Obsolete error');
    assert.equal(await first, undefined);
    assert.equal(await second, undefined);
    assert(h.has(newer === 'success' ? 'Latest' : 'Latest error'));
    assert(!h.has('Obsolete'));
    assert(!h.slots[0].value.some(item => item.name === 'Obsolete'));
    assert.deepEqual(h.errors, newer === 'fail' ? ['Latest error'] : []);
    h.unmount();
  });
}

test('older failure does not end loading or report an error while latest is pending', async () => {
  const { h } = await retries();
  await h.fail(1, 'Obsolete');
  assert(h.loading());
  assert.deepEqual(h.errors, []);
  await h.success(2, 'Latest');
  assert(h.has('Latest'));
  h.unmount();
});

test('rapid refreshes only commit the last result', async () => {
  const { h, retry } = await retries();
  const pending = Array.from({ length: 6 }, () => retry());
  await h.success(8, 'Latest');
  for (let i = 1; i < 8; i++) await h.success(i, 'Obsolete');
  await Promise.all(pending);
  assert(h.has('Latest'));
  h.unmount();
});

for (const completion of ['success', 'fail']) {
  test(`navigation/logout unmount ignores late ${completion} and retained retry`, async () => {
    const { h, retry } = await retries();
    h.unmount();
    await h[completion](1, 'Obsolete');
    await h[completion](2, 'Obsolete');
    assert.equal(h.writesAfterUnmount, 0);
    assert.deepEqual(h.errors, []);
    const count = h.requests.length;
    await retry();
    assert.equal(h.requests.length, count);
  });
}

test('session replacement invalidates old reads and permits a fresh load', async () => {
  const h = mount();
  h.props = { token: 'replacement-session' };
  h.commit();
  assert.equal(h.requests.length, 2);
  await h.success(1, 'Latest');
  await h.success(0, 'Obsolete');
  assert(h.has('Latest'));
  h.unmount();
});

test('Strict Mode effect replay invalidates first read without blocking later refreshes', async () => {
  const h = mount();
  h.replay();
  assert.equal(h.requests.length, 2);
  await h.fail(0, 'Obsolete');
  assert(h.loading());
  assert.deepEqual(h.errors, []);
  await h.fail(1, 'Current error');
  const pending = h.retry()();
  await h.success(2, 'Latest');
  await pending;
  assert(h.has('Latest'));
  h.unmount();
});

test('remount has an independent request lifetime', async () => {
  const old = mount();
  old.unmount();
  const fresh = mount();
  await old.success(0, 'Obsolete');
  assert.equal(old.writesAfterUnmount, 0);
  await fresh.success(0, 'Latest');
  assert(fresh.has('Latest'));
  fresh.unmount();
});

test('V2 pagination, category/tag filtering and reset preserve API order and real product values', async () => {
  const h = mount();
  const products = Array.from({ length: 13 }, (_, index) => ({
    ...product('Item ' + index), price: 225 + index,
    category: index % 2 ? 'Accessories' : 'Uniform',
    NewArrival: index < 3, BestSeller: index === 12,
    sizes: ['M'], inventory: { M: index }, image: ['https://images.example.test/' + index + '.png']
  }));
  h.requests[0].resolve({ data: { success: true, products } });
  await settle();
  h.commit();
  assert(h.has('Item 0'));
  assert(h.has('Item 8'));
  assert(!h.has('Item 9'));
  find(h.tree, node => node.props['aria-label'] === 'Next page').props.onClick();
  h.commit();
  assert(h.has('Item 9'));
  assert(h.has('Item 12'));
  assert(!h.has('Item 0'));
  const select = label => find(h.tree, node => node.props['aria-label'] === label);
  select('Filter by category').props.onChange({ target: { value: 'Uniform' } });
  h.commit();
  assert(h.has('Item 0'));
  assert(!h.has('Item 1'));
  select('Filter by tag').props.onChange({ target: { value: 'BestSeller' } });
  h.commit();
  assert(h.has('Item 12'));
  assert(!h.has('Item 0'));
  find(h.tree, node => node.type === 'input').props.onChange({ target: { value: 'missing' } });
  h.commit();
  assert(h.has('No matching products'));
  find(h.tree, node => node.type === 'button' && node.props.children === 'Clear filters').props.onClick();
  h.commit();
  assert(h.has('Item 0'));
  const image = find(h.tree, node => node.type === 'img');
  assert.equal(image.props.src, products[0].image[0]);
  assert.equal(image.props.loading, 'lazy');
  const target = { hidden: false };
  image.props.onError({ currentTarget: target });
  assert(target.hidden);
  assert.equal(h.requests.length, 1, 'client-side filtering makes no new API requests');
  assert.equal(h.mutations.length, 0);
  h.unmount();
});

test('empty product list retains its helpful state and disabled pagination', async () => {
  const h = mount();
  h.requests[0].resolve({ data: { success: true, products: [] } });
  await settle();
  h.commit();
  assert(h.has('No products yet'));
  for (const name of ['Previous page', 'Next page']) {
    assert(find(h.tree, node => node.props['aria-label'] === name).props.disabled);
  }
  h.unmount();
});
