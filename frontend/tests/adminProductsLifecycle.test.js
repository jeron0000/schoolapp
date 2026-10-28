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
  useId: () => runner.id(),
  useCallback: (callback, dependencies) => runner.callback(callback, dependencies),
  useEffect: (callback, dependencies) => runner.effect(callback, dependencies)
};
const output = await build({
  stdin: { resolveDir: admin, contents: `
    export { default as Add } from './src/pages/Add.jsx';
    export { default as List } from './src/pages/List.jsx';
    export { default as CategoryManagementDrawer } from './src/components/CategoryManagementDrawer.jsx';
    export { default as ClassificationMultiSelect } from './src/components/ClassificationMultiSelect.jsx';
    export { default as PriceManagementDrawer } from './src/components/PriceManagementDrawer.jsx';
    export { default as ProductManagementDrawer } from './src/components/ProductManagementDrawer.jsx';
    export { default as StorefrontLabelsEditor } from './src/components/StorefrontLabelsEditor.jsx';
    export { default as SizeMeasurementsEditor } from './src/components/SizeMeasurementsEditor.jsx';
    export { default as StockManagementDrawer } from './src/components/StockManagementDrawer.jsx';
    export { default as ColorVariantsEditor } from './src/components/ColorVariantsEditor.jsx';
    export { default as ProductSelector } from './src/components/ProductSelector.jsx';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', write: false,
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
  define: { 'import.meta.env.VITE_BACKEND_URL': '"https://api.example.test"' }
});
let environment;
const managedCategories = [
  { _id: 'category-1', name: 'Uniforms', code: 'uniforms', scope: 'general', active: true },
  { _id: 'category-2', name: 'Legacy Items', code: 'legacy-items', scope: 'general', active: false },
  { _id: 'category-3', name: 'Information Technology', code: 'BSIT', scope: 'program', active: true },
  { _id: 'category-4', name: 'Men', code: 'Men', scope: 'gender', active: true },
  { _id: 'category-5', name: 'Digital Arts', code: 'digital-arts', scope: 'program', active: true }
];
const compiled = new Module(path.join(admin, 'product-lifecycle-test.cjs'));
compiled.filename = path.join(admin, 'product-lifecycle-test.cjs');
compiled.paths = Module._nodeModulePaths(admin);
compiled.require = name => {
  if (name === 'react') return hooks;
  if (name === 'react-toastify') return { toast: {
    error: (message, options) => {
      environment.errors.push(message);
      environment.errorNotices.push({ message, options });
    },
    success: message => environment.successes.push(message),
    dismiss: toastId => environment.dismissedNotices.push(toastId)
  } };
  if (name === 'axios') return {
    get: (url, options) => {
      if (url === 'https://api.example.test/api/category/admin') {
        environment.categoryReads.push({ url, options });
        return Promise.resolve({ data: { success: true, categories: managedCategories } });
      }
      assert.equal(url, 'https://api.example.test/api/product/list');
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      environment.requests.push({ resolve, reject });
      return promise;
    },
    post: (url, body, options) => {
      environment.mutations.push({ url, body, options });
      if (url === 'https://api.example.test/api/product/flags') {
        if (environment.labelsDeferred) return new Promise((resolve, reject) => { Object.assign(environment.labelsDeferred, { resolve, reject }); });
        if (environment.labelsFailure) return Promise.reject(environment.labelsFailure);
        return Promise.resolve(environment.labelsResponse);
      }
      if (url === 'https://api.example.test/api/category/admin') {
        if (environment.categoryCreateError) {
          return Promise.reject({ response: { data: { message: environment.categoryCreateError } } });
        }
        return Promise.resolve({
          data: {
            success: true,
            message: 'Category created.',
            category: { _id: 'category-3', ...body }
          }
        });
      }
      if (url === 'https://api.example.test/api/product/remove') {
        if (environment.deleteDeferred) {
          return new Promise((resolve, reject) => {
            environment.deleteDeferred.resolve = resolve;
            environment.deleteDeferred.reject = reject;
          });
        }
        if (environment.deleteFailure) return Promise.reject(environment.deleteFailure);
        if (environment.deleteResponse) return Promise.resolve(environment.deleteResponse);
      }
      return Promise.resolve({ data: { success: true, message: 'Removed' } });
    },
    put: (url, body, options) => {
      environment.mutations.push({ url, body, options, method: 'put' });
      if (environment.variantFailure) return Promise.reject(environment.variantFailure);
      return Promise.resolve({ data: { success: true, message: 'Color variants saved.' } });
    },
    patch: (url, body, options) => {
      environment.mutations.push({ url, body, options });
      if (url.includes('/api/category/admin/default/')) {
        const [, scope, code] = url.match(/\/default\/([^/]+)\/([^/]+)$/) || [];
        return Promise.resolve({
          data: {
            success: true,
            message: 'Classification updated.',
            category: {
              _id: `managed-${code}`,
              name: body.name,
              code,
              scope,
              active: true,
              removed: false
            }
          }
        });
      }
      if (url.startsWith('https://api.example.test/api/category/admin/')) {
        const current = managedCategories.find(category => url.endsWith(category._id));
        return Promise.resolve({
          data: {
            success: true,
            message: 'Category updated.',
            category: { ...current, ...body }
          }
        });
      }
      return Promise.resolve({
        data: {
          success: true,
          message: 'Product category updated.',
          product: { ...product('Uniform A'), ...body }
        }
      });
    },
    delete: (url, options) => {
      environment.mutations.push({ url, options, method: 'delete' });
      if (environment.categoryDeleteError) {
        return Promise.reject({ response: { data: { message: environment.categoryDeleteError } } });
      }
      if (environment.categoryDeleteResponse) {
        return Promise.resolve(environment.categoryDeleteResponse);
      }
      return Promise.resolve({ data: { success: true, action: 'deleted', message: 'Classification deleted.' } });
    }
  };
  return requireAdmin(name);
};
compiled._compile(output.outputFiles[0].text, compiled.filename);
const {
  Add,
  CategoryManagementDrawer,
  ClassificationMultiSelect,
  List,
  PriceManagementDrawer,
  ProductManagementDrawer,
  StorefrontLabelsEditor,
  SizeMeasurementsEditor,
  StockManagementDrawer,
  ColorVariantsEditor,
  ProductSelector
} = compiled.exports;
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
const findAll = (tree, predicate) => {
  const found = [];
  walk(tree, element => { if (predicate(element)) found.push(element); });
  return found;
};
const product = (name, overrides = {}) => ({
  _id: name, name, category: 'Men', subCategory: 'BSIT', price: 100, image: [], sizes: [], ...overrides
});
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

// Exercise the actual component with controlled hook commits, requests and DOM refs.
const mount = (component = List, props = { token: 'synthetic-session' }) => {
  const h = { slots: [], cursor: 0, pending: [], active: true, writesAfterUnmount: 0,
    component, props, requests: [], categoryReads: [], categoryCreateError: '', categoryDeleteError: '', categoryDeleteResponse: null, deleteDeferred: null,
    deleteFailure: null, deleteResponse: null, errors: [], errorNotices: [], dismissedNotices: [], successes: [], mutations: [] };
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
  h.id = () => {
    const index = h.cursor++;
    h.slots[index] ??= { value: `test-id-${index}` };
    return h.slots[index].value;
  };
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
    try { h.tree = h.component(h.props); }
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

test('color editor validates labels, preserves drafts on conflicts, and saves once with refresh', async () => {
  const anchor = product('yellow', { __v: 3 });
  const green = product('green');
  const otherGroup = product('other', { variantGroupId: 'another-anchor' });
  const dirty = [];
  const busy = [];
  let refreshed = 0;
  let reset = 0;
  const h = mount(ColorVariantsEditor, {
    product: anchor, products: [anchor, green, otherGroup], token: 'admin',
    onDirtyChange: value => dirty.push(value), onBusyChange: value => busy.push(value),
    onRefresh: async () => { refreshed++; }, onReset: () => { reset++; }
  });
  const selector = () => find(h.tree, node => node.type === ProductSelector);
  assert.deepEqual(selector().props.products.map(item => item._id), ['yellow', 'green']);
  assert.deepEqual(selector().props.requiredIds, ['yellow']);
  selector().props.onChange(['green']);
  h.commit();
  const colorInputs = () => findAll(h.tree, node => node.type === 'input' && node.props.placeholder === 'Use product name');
  colorInputs()[0].props.onChange({ target: { value: ' Yellow ' } });
  colorInputs()[1].props.onChange({ target: { value: 'yellow' } });
  h.commit();
  const save = () => find(h.tree, node => node.type === 'button' && node.props.children === 'Save Multiple Items');
  await save().props.onClick();
  h.commit();
  assert.equal(h.mutations.length, 0);
  assert.match(find(h.tree, node => node.props.role === 'alert').props.children, /unique/);
  colorInputs()[1].props.onChange({ target: { value: 'Green' } });
  h.commit();
  assert.equal(dirty.at(-1), true);
  h.variantFailure = { response: { data: { message: 'This group changed. Refresh before saving.' } } };
  await save().props.onClick();
  h.commit();
  assert.equal(colorInputs()[1].props.value, 'Green', 'A failed request retains the draft');
  assert.equal(refreshed, 0);
  assert.equal(reset, 0);
  assert.match(find(h.tree, node => node.props.role === 'alert').props.children, /group changed/);
  h.variantFailure = null;
  const click = save().props.onClick;
  await Promise.all([click(), click()]);
  assert.equal(h.mutations.length, 2, 'One failed request and one successful request, with no duplicate submission');
  assert.deepEqual(h.mutations.at(-1), {
    url: 'https://api.example.test/api/product/variants/yellow', method: 'put',
    options: { headers: { token: 'admin' } },
    body: { groupTitle: 'yellow', version: 3, members: [
      { productId: 'yellow', optionLabel: 'Yellow' }, { productId: 'green', optionLabel: 'Green' }
    ] }
  });
  assert.equal(refreshed, 1);
  assert.equal(reset, 1);
  assert.equal(dirty.at(-1), false);
  assert.equal(busy.at(-1), false);
  h.unmount();
});

test('color editor supports safe unlink/cancel and preserves the group anchor selection', async t => {
  const previousWindow = globalThis.window;
  let confirm = false;
  globalThis.window = { confirm: () => confirm };
  t.after(() => { globalThis.window = previousWindow; });
  const anchor = product('yellow', { variantGroupId: 'yellow', colorLabel: 'Yellow', groupTitle: 'Shirt' });
  const green = product('green', { variantGroupId: 'yellow', colorLabel: 'Green' });
  let resets = 0;
  const h = mount(ColorVariantsEditor, {
    product: green, products: [anchor, green], token: 'admin',
    onDirtyChange() {}, onBusyChange() {}, onRefresh: async () => {}, onReset: () => { resets++; }
  });
  const unlink = find(h.tree, node => node.type === 'button' && node.props.children === 'Unlink This Item');
  await unlink.props.onClick();
  assert.equal(h.mutations.length, 0, 'Cancelling unlink leaves membership untouched');
  confirm = true;
  await unlink.props.onClick();
  assert.equal(h.mutations[0].url, 'https://api.example.test/api/product/variants/green');
  assert.equal(h.mutations[0].method, 'delete');
  assert.equal(resets, 1);
  h.unmount();
  const selector = mount(ProductSelector, {
    products: [anchor, green], selectedIds: ['yellow', 'green'], requiredIds: ['yellow'], onChange() {}
  });
  assert.equal(find(selector.tree, node => node.props['aria-label'] === 'Remove yellow').props.disabled, true);
  assert.equal(find(selector.tree, node => node.props['aria-label'] === 'Remove green').props.disabled, false);
  selector.unmount();
});

test('Add Items loads existing groups and submits an original product with its chosen color', async () => {
  const h = mount(Add, { token: 'admin' });
  await settle();
  h.commit();
  const details = find(h.tree, node => node.type === 'details' && node.props.onToggle);
  details.props.onToggle({ currentTarget: { open: true } });
  const anchor = product('yellow', { variantGroupId: 'yellow', groupTitle: 'Washday Shirt' });
  h.requests[0].resolve({ data: { success: true, products: [anchor, product('standalone')] } });
  await settle();
  h.commit();
  const groups = find(h.tree, node => node.type === 'select');
  assert.deepEqual(findAll(groups, node => node.type === 'option').map(node => node.props.value), ['', 'yellow']);
  groups.props.onChange({ target: { value: 'yellow' } });
  find(h.tree, node => node.props.id === 'product-name').props.onChange({ target: { value: 'Green Shirt' } });
  find(h.tree, node => node.props.id === 'product-description').props.onChange({ target: { value: 'Existing product form' } });
  find(h.tree, node => node.props.id === 'product-price').props.onChange({ target: { value: '225' } });
  find(h.tree, node => node.props.id === 'product-size-S').props.onClick();
  h.commit();
  find(h.tree, node => node.props.id === 'product-stock-S').props.onChange({ target: { value: '0' } });
  find(h.tree, node => node.type === 'input' && node.props.placeholder === 'Use product name').props.onChange({ target: { value: '  Green  ' } });
  h.commit();
  await find(h.tree, node => node.type === 'form' && node.props.onSubmit).props.onSubmit({ preventDefault() {} });
  const submitted = Object.fromEntries(h.mutations.at(-1).body.entries());
  assert.equal(submitted.variantGroupId, 'yellow');
  assert.equal(submitted.optionLabel, 'Green');
  assert.equal(submitted.colorLabel, undefined);
  assert.equal(submitted.name, 'Green Shirt');
  assert.equal(submitted.price, '225');
  assert.equal(submitted.sizes, '["S"]');
  h.unmount();
});

test('Add Items reuses its form for multiple independent items and submits one atomic listing request', async () => {
  const h = mount(Add, { token: 'admin' });
  await settle();
  h.commit();
  const input = id => find(h.tree, node => node.props.id === id);
  const change = (id, value) => input(id).props.onChange({ target: { value } });
  const button = text => find(h.tree, node => node.type === 'button' && node.props.children === text);
  const fill = (name, price, size, quantity) => {
    change('product-name', name);
    change('product-description', `${name} description`);
    change('product-price', price);
    input(`product-size-${size}`).props.onClick();
    h.commit();
    change(`product-stock-${size}`, quantity);
    h.commit();
  };
  fill('Classic Shirt', '225', 'M', '2');
  const classicImage = new File(['classic'], 'classic.png', { type: 'image/png' });
  const washdayImage = new File(['washday'], 'washday.png', { type: 'image/png' });
  find(h.tree, node => node.type?.name === 'ImageUpload' && node.props.id === 'image1').props.onChange(classicImage);
  h.commit();
  button('Create Multi-Item Listing').props.onClick();
  h.commit();
  button('+ Add Item').props.onClick();
  h.commit();
  fill('Washday Shirt', '350.50', 'XL', '7');
  find(h.tree, node => node.type?.name === 'ImageUpload' && node.props.id === 'image2').props.onChange(washdayImage);
  find(h.tree, node => node.type === SizeMeasurementsEditor).props.onChange({
    fields: [{ key: 'chest', label: 'Chest circumference' }],
    measurements: [{ size: 'XL', values: { chest: '130' } }]
  });
  h.commit();
  const itemButtons = () => findAll(find(h.tree, node => node.props['aria-label'] === 'Edit listing item'), node => node.type === 'button');
  itemButtons()[0].props.onClick();
  h.commit();
  assert.equal(input('product-name').props.value, 'Classic Shirt');
  assert.equal(input('product-stock-M').props.value, '2');
  assert.equal(find(h.tree, node => node.type?.name === 'ImageUpload' && node.props.id === 'image1').props.file, classicImage);
  change('product-price', '250');
  h.commit();
  itemButtons()[1].props.onClick();
  h.commit();
  assert.equal(input('product-name').props.value, 'Washday Shirt');
  assert.equal(input('product-stock-XL').props.value, '7');
  const submit = find(h.tree, node => node.type === 'form' && node.props.onSubmit).props.onSubmit;
  await Promise.all([submit({ preventDefault() {} }), submit({ preventDefault() {} })]);
  assert.equal(h.mutations.length, 1);
  const request = h.mutations[0];
  assert.equal(request.url, 'https://api.example.test/api/product/add-listing');
  const items = JSON.parse(request.body.get('items'));
  assert.equal(request.body.get('groupTitle'), 'Classic Shirt');
  assert.deepEqual(items.map(item => [item.name, item.optionLabel, item.price]), [
    ['Classic Shirt', 'Classic Shirt', '250'], ['Washday Shirt', 'Washday Shirt', '350.50']
  ]);
  assert.equal(items[0].inventory, '{"M":2}');
  assert.equal(items[1].inventory, '{"XL":7}');
  assert.equal(JSON.parse(items[1].sizeGuide).measurements[0].values.chest, 130);
  assert.equal(request.body.get('item0image1').name, 'classic.png');
  assert.equal(request.body.get('item1image2').name, 'washday.png');
  h.unmount();
});

test('multi-item drafts remain intact when another item is incomplete', async () => {
  const h = mount(Add, { token: 'admin' });
  await settle();
  h.commit();
  const change = (id, value) => find(h.tree, node => node.props.id === id).props.onChange({ target: { value } });
  change('product-name', 'Classic Shirt');
  change('product-description', 'Classic description');
  change('product-price', '225');
  find(h.tree, node => node.props.id === 'product-size-M').props.onClick();
  h.commit();
  change('product-stock-M', '2');
  h.commit();
  find(h.tree, node => node.props.children === 'Create Multi-Item Listing').props.onClick();
  h.commit();
  find(h.tree, node => node.props.children === '+ Add Item').props.onClick();
  h.commit();
  change('product-name', 'Incomplete Shirt');
  h.commit();
  const controls = find(h.tree, node => node.props['aria-label'] === 'Edit listing item');
  findAll(controls, node => node.type === 'button')[0].props.onClick();
  h.commit();
  await find(h.tree, node => node.type === 'form' && node.props.onSubmit).props.onSubmit({ preventDefault() {} });
  h.commit();
  assert.equal(h.mutations.length, 0);
  assert.match(h.errors.at(-1), /Item 2/);
  assert.equal(find(h.tree, node => node.props.id === 'product-name').props.value, 'Incomplete Shirt');
  h.unmount();
});

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
  const manage = find(h.tree, node => node.type === 'button' && node.props['aria-label'] === 'Manage Uniform A');
  manage.props.onClick();
  h.commit();
  let drawer = find(h.tree, node => node.type === ProductManagementDrawer);
  assert.equal(drawer.props.product.name, 'Uniform A');
  drawer.props.onProductUpdated(product('Uniform A'));
  drawer.props.onPriceUpdated('Uniform A', 125);
  h.commit();
  drawer = find(h.tree, node => node.type === ProductManagementDrawer);
  drawer.props.onClose();
  h.commit();
  assert.equal(h.slots[0].value[0].price, 125);
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

test('product deletion rejects protected references with one accurate notice and blocks duplicate submissions', async () => {
  const h = mount();
  await h.success(0, 'Uniform A');
  h.deleteDeferred = {};

  find(h.tree, node => node.props['aria-label'] === 'Delete Uniform A').props.onClick();
  h.commit();
  const confirmation = find(h.tree, node => node.type === 'button' && node.props.children === 'Delete Item');
  const firstSubmission = confirmation.props.onClick();
  const duplicateSubmission = confirmation.props.onClick();
  h.commit();

  assert.equal(h.mutations.filter(item => item.url.endsWith('/api/product/remove')).length, 1);
  await duplicateSubmission;
  assert.equal(find(h.tree, node => node.type === 'button' && node.props.children === 'Deleting...').props.disabled, true);

  const message = 'This product is linked to an active order and cannot be deleted until that order is completed or cancelled.';
  h.deleteDeferred.reject({ response: { status: 409, data: { code: 'PRODUCT_HAS_ACTIVE_ORDERS', message } } });
  await firstSubmission;
  await settle();
  h.commit();

  assert(h.has(message));
  assert.deepEqual(h.errors, [message]);
  assert.equal(h.errorNotices[0].options.toastId, 'product-delete-error');
  assert.ok(find(h.tree, node => node.type === 'button' && node.props.children === 'Delete Item'));
  h.unmount();
});

test('product deletion distinguishes missing, authorization, and network failures', async () => {
  const scenarios = [
    {
      failure: { response: { status: 404, data: { code: 'PRODUCT_NOT_FOUND', message: 'This product no longer exists. Refresh the product list.' } } },
      message: 'This product no longer exists. Refresh the product list.',
      toastCount: 1
    },
    {
      failure: { response: { status: 403, data: { message: 'Administrator access required.' } } },
      message: 'Administrator access required.',
      toastCount: 1
    },
    {
      failure: new Error('Network Error'),
      message: 'Unable to reach the server. Check your connection and try again.',
      toastCount: 1
    }
  ];

  for (const scenario of scenarios) {
    const h = mount();
    await h.success(0, 'Uniform A');
    h.deleteFailure = scenario.failure;
    find(h.tree, node => node.props['aria-label'] === 'Delete Uniform A').props.onClick();
    h.commit();
    await find(h.tree, node => node.type === 'button' && node.props.children === 'Delete Item').props.onClick();
    await settle();
    h.commit();
    assert(h.has(scenario.message));
    assert.equal(h.errors.length, scenario.toastCount);
    h.unmount();
  }
});

test('classification multi-select keeps merchandise option interactions open and synchronized', t => {
  const previousDocument = globalThis.document;
  const listeners = new Map();
  globalThis.document = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const changes = [];
  const options = [
    { value: 'TOP', label: 'Tops' },
    { value: 'BOTTOM', label: 'Bottoms' },
    { value: 'EXTRA', label: 'Extras' }
  ];
  const h = mount(ClassificationMultiSelect, {
    id: 'merchandise-test',
    label: 'Merchandise Categories',
    options,
    selectedValues: [],
    onChange: values => changes.push(values)
  });
  const panel = () => find(h.tree, node => node.props.role === 'dialog');
  const checkbox = value => find(h.tree, node => node.type === 'input' && node.props.value === value);
  const sync = () => {
    h.props.selectedValues = changes.at(-1);
    h.commit();
    assert.ok(panel(), 'Dropdown must remain open after changing a selection');
  };
  const toggle = value => {
    checkbox(value).props.onChange();
    sync();
  };

  find(h.tree, node => node.props.id === 'merchandise-test').props.onClick();
  h.commit();
  assert.equal(h.tree.props.onBlur, undefined, 'Blur must not dismiss before checkbox change');

  toggle('TOP');
  assert.deepEqual(changes.at(-1), ['TOP']);
  toggle('BOTTOM');
  assert.deepEqual(changes.at(-1), ['TOP', 'BOTTOM']);
  toggle('EXTRA');
  assert.deepEqual(changes.at(-1), ['TOP', 'BOTTOM', 'EXTRA']);
  toggle('BOTTOM');
  assert.deepEqual(changes.at(-1), ['TOP', 'EXTRA']);
  toggle('TOP');
  assert.deepEqual(changes.at(-1), ['EXTRA']);
  toggle('EXTRA');
  assert.deepEqual(changes.at(-1), []);

  const selectAll = find(h.tree, node => {
    return node.type === 'button' && React.Children.toArray(node.props.children).join('') === 'Select All Available (3)';
  });
  selectAll.props.onClick();
  sync();
  assert.deepEqual(changes.at(-1), ['TOP', 'BOTTOM', 'EXTRA']);
  toggle('BOTTOM');
  assert.deepEqual(changes.at(-1), ['TOP', 'EXTRA']);

  find(h.tree, node => node.type === 'button' && node.props.children === 'Clear All').props.onClick();
  sync();
  assert.deepEqual(changes.at(-1), []);
  toggle('BOTTOM');
  assert.deepEqual(changes.at(-1), ['BOTTOM']);

  const search = find(h.tree, node => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({ target: { value: 'top' } });
  h.commit();
  assert.deepEqual(findAll(h.tree, node => node.type === 'input' && node.props.type === 'checkbox').map(node => node.props.value), ['TOP']);
  toggle('TOP');
  assert.deepEqual(changes.at(-1), ['TOP', 'BOTTOM']);

  search.props.onChange({ target: { value: '' } });
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Remove Tops').props.onClick();
  sync();
  assert.deepEqual(changes.at(-1), ['BOTTOM']);

  const extrasLabel = find(h.tree, node => {
    if (node.type !== 'label') return false;
    return Boolean(find(node, child => child.type === 'input' && child.props.value === 'EXTRA'));
  });
  find(extrasLabel, node => node.type === 'input' && node.props.value === 'EXTRA').props.onChange();
  sync();
  assert.deepEqual(changes.at(-1), ['BOTTOM', 'EXTRA']);

  const insideTarget = {};
  h.tree.props.ref.current.contains = target => target === insideTarget;
  listeners.get('pointerdown')({ target: insideTarget });
  h.commit();
  assert.ok(panel(), 'Clicking inside the dropdown must not dismiss it');

  listeners.get('pointerdown')({ target: {} });
  h.commit();
  assert.equal(panel(), undefined, 'Clicking outside must dismiss the dropdown');

  find(h.tree, node => node.props.id === 'merchandise-test').props.onClick();
  h.commit();
  let prevented = false;
  h.tree.props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true; } });
  h.commit();
  assert.equal(prevented, true);
  assert.equal(panel(), undefined, 'Escape must dismiss the dropdown');
  h.unmount();
});

test('program, gender, and merchandise controls independently toggle individual options', () => {
  const groups = [
    { id: 'program', options: ['BSIT', 'BSCpE', 'BSBAOM'] },
    { id: 'gender', options: ['Men', 'Women', 'Not Applicable'], exclusiveValues: ['Not Applicable'] },
    { id: 'merchandise', options: ['TOP', 'BOTTOM', 'EXTRA'] }
  ];

  for (const group of groups) {
    const changes = [];
    const h = mount(ClassificationMultiSelect, {
      id: group.id,
      label: group.id,
      options: group.options.map(value => ({ value, label: value })),
      selectedValues: [],
      exclusiveValues: group.exclusiveValues || [],
      onChange: values => changes.push(values)
    });
    find(h.tree, node => node.props.id === group.id).props.onClick();
    h.commit();
    const toggle = value => {
      find(h.tree, node => node.type === 'input' && node.props.value === value).props.onChange();
      h.props.selectedValues = changes.at(-1);
      h.commit();
    };

    toggle(group.options[0]);
    toggle(group.options[1]);
    assert.deepEqual(changes.at(-1), group.options.slice(0, 2));
    toggle(group.options[0]);
    assert.deepEqual(changes.at(-1), [group.options[1]]);

    if (group.exclusiveValues) {
      toggle('Not Applicable');
      assert.deepEqual(changes.at(-1), ['Not Applicable']);
      toggle('Men');
      assert.deepEqual(changes.at(-1), ['Men']);
    }
    h.unmount();
  }
});

test('product management drawer switches tabs, reuses workflows, and protects unsaved changes', t => {
  const previousDocument = globalThis.document;
  let openerFocusCount = 0;
  globalThis.document = {
    activeElement: { isConnected: true, focus: () => { openerFocusCount++; } },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  let closed = 0;
  const priceUpdates = [];
  const stockUpdates = [];
  const classification = {
    programOptions: [{ value: 'BSIT', label: 'BSIT' }],
    genderOptions: [{ value: 'Men', label: 'Men' }],
    merchandiseOptions: [{ value: 'TOP', label: 'Tops' }],
    selectedPrograms: ['BSIT'],
    selectedGenders: ['Men'],
    selectedMerchandise: ['TOP'],
    currentLabels: { programs: 'BSIT', genders: 'Men', merchandise: 'Tops' },
    onProgramsChange() {},
    onGendersChange() {},
    onMerchandiseChange() {},
    onSave() {},
    onRefresh() {},
    changed: false,
    saving: false,
    loading: false,
    loadError: '',
    error: '',
    success: ''
  };
  const h = mount(ProductManagementDrawer, {
    product: product('Managed Product', { image: ['product.jpg'] }),
    token: 'synthetic-session',
    classification,
    onClose: () => { closed++; },
    onProductUpdated: updated => stockUpdates.push(updated),
    onPriceUpdated: (...values) => priceUpdates.push(values),
    onRefresh() {}
  });

  assert.equal(findAll(h.tree, node => node.type === 'dialog').length, 1, 'Only the parent drawer owns a modal overlay');
  const pricePanel = () => find(h.tree, node => node.props.id === 'product-management-price-panel');
  const stockPanel = () => find(h.tree, node => node.props.id === 'product-management-stock-panel');
  const classificationPanel = () => find(h.tree, node => node.props.id === 'product-management-classification-panel');
  assert.equal(pricePanel().props.hidden, false);
  assert.equal(stockPanel().props.hidden, true);

  find(h.tree, node => node.props.id === 'product-management-stock-tab').props.onClick();
  h.commit();
  assert.equal(pricePanel().props.hidden, true);
  assert.equal(stockPanel().props.hidden, false);

  const priceWorkflow = find(h.tree, node => node.type === PriceManagementDrawer);
  const stockWorkflow = find(h.tree, node => node.type === StockManagementDrawer);
  assert.equal(priceWorkflow.props.embedded, true);
  assert.equal(stockWorkflow.props.embedded, true);
  priceWorkflow.props.onUpdated('Managed Product', 125);
  stockWorkflow.props.onUpdated(product('Managed Product', { inventory: { S: 3 } }));
  assert.deepEqual(priceUpdates, [['Managed Product', 125]]);
  assert.equal(stockUpdates.length, 1);

  const variants = find(h.tree, node => node.type === ColorVariantsEditor);
  const labels = find(h.tree, node => node.type === StorefrontLabelsEditor);
  labels.props.onDirtyChange(true);
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Close product management').props.onClick();
  h.commit();
  assert.equal(closed, 0, 'Label drafts are included in unsaved-change confirmation');
  find(h.tree, node => node.type === 'button' && node.props.children === 'Keep Editing').props.onClick();
  labels.props.onDirtyChange(false);
  labels.props.onBusyChange(true);
  h.commit();
  assert.equal(find(h.tree, node => node.props.id === 'product-management-stock-tab').props.disabled, true);
  labels.props.onBusyChange(false);
  h.commit();
  variants.props.onDirtyChange(true);
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Close product management').props.onClick();
  h.commit();
  assert.equal(closed, 0, 'Color drafts participate in the existing unsaved-change guard');
  find(h.tree, node => node.type === 'button' && node.props.children === 'Keep Editing').props.onClick();
  variants.props.onDirtyChange(false);
  h.commit();

  stockWorkflow.props.onDirtyChange(true);
  h.commit();
  find(h.tree, node => node.props.id === 'product-management-classification-tab').props.onClick();
  h.commit();
  assert.equal(classificationPanel().props.hidden, false);
  find(h.tree, node => node.props['aria-label'] === 'Close product management').props.onClick();
  h.commit();
  assert.equal(closed, 0);
  assert.ok(find(h.tree, node => node.props.role === 'alertdialog'));

  find(h.tree, node => node.type === 'button' && node.props.children === 'Keep Editing').props.onClick();
  h.commit();
  find(h.tree, node => node.type === StockManagementDrawer).props.onDirtyChange(false);
  h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Close product management').props.onClick();
  assert.equal(closed, 1);

  h.unmount();
  assert.equal(openerFocusCount, 1);
});

test('Storefront Labels enables, renews, disables and cancels independently without renewing other edits', async () => {
  const markedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  let h;
  const dirty = [], busy = [], updates = [];
  h = mount(StorefrontLabelsEditor, {
    product: product('Labels', { NewArrival: true, BestSeller: false, newArrivalMarkedAt: markedAt }),
    token: 'synthetic-session',
    onDirtyChange: value => dirty.push(value), onBusyChange: value => busy.push(value),
    onUpdated: updated => { updates.push(updated); h.props.product = updated; }
  });
  const checkboxes = () => findAll(h.tree, node => node.type === 'input' && node.props.type === 'checkbox');
  const button = text => find(h.tree, node => node.type === 'button' && node.props.children === text);
  const submit = () => find(h.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert(find(h.tree, node => node.type === 'label' && React.Children.toArray(node.props.children).includes('Feature Product')));
  assert(h.has('New Arrival: Expired'));
  assert(button('Renew for 30 days'));
  checkboxes()[0].props.onChange({ target: { checked: true } }); h.commit();
  h.labelsResponse = { data: { success: true, product: { ...h.props.product, BestSeller: true } } };
  await submit(); h.commit();
  assert.deepEqual(h.mutations[0].body, { id: 'Labels', BestSeller: true });
  assert.equal(h.mutations[0].options.headers.token, 'synthetic-session');
  assert.equal(h.props.product.newArrivalMarkedAt, markedAt, 'Featured-only saving cannot renew New Arrival');
  button('Renew for 30 days').props.onClick(); h.commit();
  assert.equal(dirty.at(-1), true);
  const renewedAt = new Date().toISOString();
  h.labelsDeferred = {};
  const renewal = submit();
  await submit();
  assert.equal(h.mutations.length, 2, 'Duplicate submission is blocked synchronously');
  assert.deepEqual(h.mutations[1].body, { id: 'Labels', NewArrival: true });
  h.commit(); assert.equal(busy.at(-1), true);
  h.labelsDeferred.resolve({ data: { success: true, product: { ...h.props.product, newArrivalMarkedAt: renewedAt } } });
  await renewal; h.labelsDeferred = null; h.commit();
  assert(h.has('New Arrival: Active'));
  assert.equal(dirty.at(-1), false); assert.equal(busy.at(-1), false);
  assert.equal(updates.length, 2);
  checkboxes()[1].props.onChange({ target: { checked: false } }); h.commit();
  button('Cancel Label Changes').props.onClick(); h.commit();
  assert.equal(checkboxes()[1].props.checked, true);
  assert.equal(h.mutations.length, 2, 'Cancel performs no persistence');
  checkboxes()[1].props.onChange({ target: { checked: false } }); h.commit();
  h.labelsResponse = { data: { success: true, product: { ...h.props.product, NewArrival: false } } };
  await submit(); h.commit();
  assert(h.has('New Arrival: Off'));
  assert.equal(h.props.product.newArrivalMarkedAt, renewedAt);
  checkboxes()[1].props.onChange({ target: { checked: true } }); h.commit();
  h.labelsResponse = { data: { success: true, product: { ...h.props.product, NewArrival: true, newArrivalMarkedAt: new Date().toISOString() } } };
  await submit(); h.commit();
  assert.deepEqual(h.mutations.at(-1).body, { id: 'Labels', NewArrival: true });
  assert(h.has('New Arrival: Active'));
  h.unmount();
});

test('Storefront Labels preserves drafts after failure and ignores responses after unmount', async () => {
  const h = mount(StorefrontLabelsEditor, { product: product('Labels'), token: 'synthetic-session' });
  const checkbox = () => findAll(h.tree, node => node.type === 'input')[0];
  const submit = () => find(h.tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  checkbox().props.onChange({ target: { checked: true } }); h.commit();
  h.labelsFailure = { response: { data: { message: 'Administrator session expired.' } } };
  await submit(); h.commit();
  assert.equal(checkbox().props.checked, true);
  assert(h.has('Administrator session expired.'));
  h.labelsFailure = null; h.labelsDeferred = {};
  const saving = submit(); h.unmount();
  h.labelsDeferred.resolve({ data: { success: true, product: { ...h.props.product, BestSeller: true } } });
  await saving;
  assert.equal(h.writesAfterUnmount, 0);
});

test('saved label updates merge into Product List without overwriting prices, stock or sibling items', async () => {
  const h = mount();
  const sibling = product('Sibling', { variantGroupId: 'Labels', optionLabel: 'Shared listing item', BestSeller: false, NewArrival: false });
  h.requests[0].resolve({ data: { success: true, products: [product('Labels'), sibling] } });
  await settle(); h.commit();
  find(h.tree, node => node.props['aria-label'] === 'Manage Labels').props.onClick();
  await settle(); h.commit();
  let manager = find(h.tree, node => node.type === ProductManagementDrawer);
  const before = manager.props.product;
  manager.props.onLabelsUpdated({ ...before, price: 1, inventory: { M: 0 }, BestSeller: true, NewArrival: true, newArrivalMarkedAt: new Date().toISOString() });
  h.commit(); manager = find(h.tree, node => node.type === ProductManagementDrawer);
  assert.equal(manager.props.product.price, before.price);
  assert.deepEqual(manager.props.product.inventory, before.inventory);
  assert.equal(manager.props.product.BestSeller, true);
  assert.equal(manager.props.product.NewArrival, true);
  assert.deepEqual(manager.props.products.find(item => item._id === sibling._id), sibling);
  assert.equal(h.requests.length, 1, 'Existing list is reconciled without another catalog request');
  h.unmount();
});

test('Admin New Arrival tags and filtering exclude expired legacy flags without rewriting records', async () => {
  const h = mount();
  const current = product('Current', { NewArrival: true, date: Date.now() });
  const expired = product('Expired', { NewArrival: true, date: Date.now() - 31 * 24 * 60 * 60 * 1000 });
  h.requests[0].resolve({ data: { success: true, products: [current, expired] } });
  await settle(); h.commit();
  const currentRow = find(h.tree, node => node.type === 'tr' && find(node, child => child.type === 'span' && child.props.children === 'Current'));
  const expiredRow = find(h.tree, node => node.type === 'tr' && find(node, child => child.type === 'span' && child.props.children === 'Expired'));
  assert(find(currentRow, node => node.type === 'span' && node.props.children === 'NEW'));
  assert.equal(find(expiredRow, node => node.type === 'span' && node.props.children === 'NEW'), undefined);
  find(h.tree, node => node.props['aria-label'] === 'Filter by tag').props.onChange({ target: { value: 'NewArrival' } });
  h.commit();
  assert(h.has('Current')); assert(!h.has('Expired'));
  assert.equal(expired.NewArrival, true);
  assert.equal(h.mutations.length, 0);
  h.unmount();
});

test('product manager saves multiple Programs, Genders, and Merchandise Categories in one request', async () => {
  const h = mount();
  await h.success(0, 'Uniform A');

  find(h.tree, node => node.props['aria-label'] === 'Manage Uniform A').props.onClick();
  await settle();
  h.commit();

  let manager = find(h.tree, node => node.type === ProductManagementDrawer);
  let classification = manager.props.classification;
  assert.deepEqual(classification.selectedPrograms, ['BSIT']);
  const programValues = classification.programOptions.map(option => option.value);
  assert.equal(programValues.includes('BSIT'), true);
  assert.equal(programValues.includes('BSHM'), true);
  assert.equal(programValues.includes('digital-arts'), true);
  assert.equal(programValues.includes('EXTRA'), false);
  assert.equal(programValues.includes('uniforms'), false);
  assert.deepEqual(classification.genderOptions.map(option => option.value), ['Men', 'Women', 'Not Applicable']);
  assert.deepEqual(classification.merchandiseOptions.map(option => option.value), ['TOP', 'BOTTOM', 'EXTRA', 'uniforms']);
  classification.onProgramsChange(['BSIT', 'BSHM']);
  classification.onGendersChange(['Men', 'Women']);
  classification.onMerchandiseChange(['TOP', 'uniforms']);
  h.commit();
  manager = find(h.tree, node => node.type === ProductManagementDrawer);
  classification = manager.props.classification;
  assert.equal(manager.props.product.name, 'Uniform A', 'Classification changes must not close the product manager');
  await classification.onSave({ preventDefault() {} });
  await settle();
  h.commit();

  assert.equal(h.mutations.length, 1);
  assert.equal(h.mutations[0].url, 'https://api.example.test/api/product/category/Uniform A');
  assert.deepEqual(h.mutations[0].body, {
    academicPrograms: ['BSIT', 'BSHM'],
    genders: ['Men', 'Women'],
    merchandiseCategoryCodes: ['TOP', 'uniforms']
  });
  assert.equal(h.mutations[0].options.headers.token, 'synthetic-session');
  assert.deepEqual(h.slots[0].value[0].academicPrograms, ['BSIT', 'BSHM']);
  assert.deepEqual(h.slots[0].value[0].genders, ['Men', 'Women']);
  assert.deepEqual(h.slots[0].value[0].merchandiseCategoryCodes, ['TOP', 'uniforms']);
  assert.equal(h.categoryReads.length, 1);
  assert.deepEqual(h.successes, ['Product category updated.']);
  h.unmount();
});

test('product manager loads authoritative arrays, explicitly clears one group, and blocks duplicate submissions', async () => {
  const h = mount();
  h.requests[0].resolve({
    data: {
      success: true,
      products: [product('Multi Product', {
        academicPrograms: ['BSIT', 'BSHM'],
        genders: ['Men', 'Women'],
        merchandiseCategoryCodes: ['TOP', 'legacy-items']
      })]
    }
  });
  await settle();
  h.commit();

  find(h.tree, node => node.props['aria-label'] === 'Manage Multi Product').props.onClick();
  h.commit();
  let classification = find(h.tree, node => node.type === ProductManagementDrawer).props.classification;
  assert.deepEqual(classification.selectedPrograms, ['BSIT', 'BSHM']);
  assert.deepEqual(classification.selectedGenders, ['Men', 'Women']);
  assert.deepEqual(classification.selectedMerchandise, ['TOP', 'legacy-items']);
  assert.deepEqual(
    classification.merchandiseOptions.find(option => option.value === 'legacy-items'),
    { value: 'legacy-items', label: 'Legacy Items · Inactive', active: false, selectable: false }
  );

  classification.onProgramsChange([]);
  h.commit();
  classification = find(h.tree, node => node.type === ProductManagementDrawer).props.classification;
  const first = classification.onSave({ preventDefault() {} });
  const duplicate = classification.onSave({ preventDefault() {} });
  await Promise.all([first, duplicate]);
  await settle();

  assert.equal(h.mutations.length, 1);
  assert.deepEqual(h.mutations[0].body, { academicPrograms: [] });
  h.unmount();
});

test('Add Items submits authoritative classification arrays independently', async () => {
  const h = mount(Add);
  await settle();
  h.commit();

  const program = find(h.tree, node => node.props.id === 'product-program');
  const programValues = program.props.options.map(option => option.value);
  assert.deepEqual(program.props.selectedValues, []);
  assert.equal(programValues.includes('BSIT'), true);
  assert.equal(programValues.includes('digital-arts'), true);
  assert.equal(programValues.includes('EXTRA'), false);
  assert.equal(programValues.includes('uniforms'), false);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Add academic program'), undefined);
  assert.equal(find(h.tree, node => node.type === CategoryManagementDrawer), undefined);
  program.props.onChange(['BSIT', 'digital-arts']);

  const merchandise = find(h.tree, node => node.props.id === 'product-merchandise-category');
  assert.deepEqual(
    merchandise.props.options.map(option => option.value),
    ['TOP', 'BOTTOM', 'EXTRA', 'uniforms']
  );
  merchandise.props.onChange(['TOP', 'BOTTOM']);
  find(h.tree, node => node.props.id === 'product-gender').props.onChange(['Men', 'Women']);
  find(h.tree, node => node.props.id === 'product-name').props.onChange({ target: { value: 'Notebook' } });
  find(h.tree, node => node.props.id === 'product-description').props.onChange({ target: { value: 'Campus notebook' } });
  find(h.tree, node => node.props.id === 'product-price').props.onChange({ target: { value: '75' } });
  find(h.tree, node => node.props.id === 'product-size-S').props.onClick();
  h.commit();
  find(h.tree, node => node.type?.name === 'CustomSizeInput').props.onAdd('4XL');
  h.commit();
  find(h.tree, node => node.props.id === 'product-stock-S').props.onChange({ target: { value: '4' } });
  find(h.tree, node => node.props.id === 'product-stock-4XL').props.onChange({ target: { value: '2' } });
  h.commit();
  find(h.tree, node => node.type === SizeMeasurementsEditor).props.onChange({
    fields: [{ key: 'chest-circumference', label: 'Chest circumference' }],
    measurements: [
      { size: 'S', values: { 'chest-circumference': '92' } },
      { size: '4XL', values: { 'chest-circumference': '128.5' } }
    ]
  });
  h.commit();

  const form = find(h.tree, node => node.type === 'form' && typeof node.props.onSubmit === 'function');
  await form.props.onSubmit({ preventDefault() {} });
  await settle();

  const request = h.mutations.at(-1);
  assert.equal(request.url, 'https://api.example.test/api/product/add');
  const submitted = Object.fromEntries(request.body.entries());
  assert.equal(submitted.academicPrograms, '["BSIT","digital-arts"]');
  assert.equal(submitted.genders, '["Men","Women"]');
  assert.equal(submitted.merchandiseCategoryCodes, '["TOP","BOTTOM"]');
  assert.equal(submitted.productCategoryCode, undefined);
  assert.equal(submitted.subCategory, undefined);
  assert.equal(submitted.category, undefined);
  assert.equal(submitted.sizes, '["S","4XL"]');
  assert.equal(submitted.inventory, '{"S":4,"4XL":2}');
  assert.equal(submitted.sizeGuide, '{"fields":[{"key":"chest-circumference","label":"Chest circumference"}],"measurements":[{"size":"S","values":{"chest-circumference":92}},{"size":"4XL","values":{"chest-circumference":128.5}}]}');
  h.unmount();
});

test('measurement inputs accept whole numbers and decimals without step mismatch and retain numeric bounds', () => {
  const changes = [];
  const original = {
    fields: [{ key: 'chest', label: 'Chest circumference' }],
    measurements: [
      { size: 'M', values: { chest: 96 } },
      { size: '4XL', values: { chest: 130 } }
    ]
  };
  const h = mount(SizeMeasurementsEditor, {
    idPrefix: 'measurement-input-test', sizes: ['M', '4XL'], value: original,
    onChange: value => changes.push(value)
  });
  const input = () => find(h.tree, node => node.props.id === 'measurement-input-test-M-chest');
  assert.equal(input().props.value, 96, 'Saved measurements remain unchanged on load');
  assert.equal(input().props.type, 'number');
  assert.equal(input().props.step, 'any');
  assert.equal(input().props.min, '0.01');
  assert.equal(input().props.max, '500');
  assert.equal(input().props.required, undefined);
  assert.match(input().props.className, /\[appearance:textfield\]/);
  assert.match(input().props.className, /\[&::\-webkit-inner-spin-button\]:appearance-none/);
  assert.match(input().props.className, /\[&::\-webkit-outer-spin-button\]:appearance-none/);
  assert.equal(input().props.onKeyDown, undefined, 'Native keyboard input is not intercepted');
  const change = value => {
    input().props.onChange({ target: { value } });
    h.props.value = changes.at(-1);
    h.commit();
  };
  for (const value of ['23', '23.5', '30.21', '100', '500']) {
    change(value);
    assert.equal(input().props.value, value);
    assert.equal(input().props['aria-invalid'], false, `${value} must be accepted`);
  }
  for (const value of ['0', '-1', 'Infinity', '-Infinity', 'NaN', '500.01']) {
    change(value);
    assert.equal(input().props['aria-invalid'], true, `${value} must be rejected`);
  }
  change('');
  assert.equal(input().props['aria-invalid'], false);
  assert.deepEqual(h.props.value.measurements, [{ size: '4XL', values: { chest: 130 } }]);
  assert.deepEqual(original.measurements[0].values, { chest: 96 }, 'Draft editing never mutates saved values');
  h.unmount();
});

test('measurement preset menus add missing fields without changing entered values and close accessibly', t => {
  const previousDocument = globalThis.document;
  const listeners = {};
  globalThis.document = {
    addEventListener(type, listener) { listeners[type] = listener; },
    removeEventListener(type, listener) {
      if (listeners[type] === listener) delete listeners[type];
    }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const changes = [];
  const originalValues = { 'chest-circumference': 96, rise: 28 };
  const h = mount(SizeMeasurementsEditor, {
    idPrefix: 'preset-add-test',
    sizes: ['M'],
    value: {
      fields: [
        { key: 'chest-circumference', label: 'Chest circumference' },
        { key: 'rise', label: 'Rise' }
      ],
      measurements: [{ size: 'M', values: originalValues }]
    },
    onChange: value => changes.push(value)
  });
  const trigger = label => find(h.tree, node => node.type === 'button'
    && React.Children.toArray(node.props.children).includes(label));
  const menuAction = label => find(h.tree, node => node.props.role === 'menuitem'
    && node.props.children === label);

  trigger('Tops fields').props.onClick();
  h.commit();
  assert.equal(trigger('Tops fields').props['aria-expanded'], true);
  menuAction('Add all fields').props.onClick();
  assert.deepEqual(changes[0].fields.map(field => field.key), [
    'chest-circumference',
    'rise',
    'shoulder-width',
    'garment-length',
    'sleeve-length'
  ]);
  assert.deepEqual(changes[0].measurements[0].values, originalValues);
  h.props = { ...h.props, value: changes[0] };
  h.commit();
  assert.equal(trigger('Tops fields').props['aria-expanded'], false);

  trigger('Bottoms fields').props.onClick();
  h.commit();
  let prevented = false;
  listeners.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  h.commit();
  assert.equal(prevented, true);
  assert.equal(trigger('Bottoms fields').props['aria-expanded'], false);

  trigger('Bottoms fields').props.onClick();
  h.commit();
  listeners.pointerdown({ target: {} });
  h.commit();
  assert.equal(trigger('Bottoms fields').props['aria-expanded'], false);
  h.unmount();
});

test('measurement preset bulk removal confirms entered values and preserves shared and custom fields', t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { isConnected: true, focus() {} },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const changes = [];
  const h = mount(SizeMeasurementsEditor, {
    idPrefix: 'preset-remove-test',
    sizes: ['S', 'M', 'L'],
    value: {
      fields: [
        { key: 'chest-circumference', label: 'Chest circumference' },
        { key: 'shoulder-width', label: 'Shoulder width' },
        { key: 'garment-length', label: 'Garment length' },
        { key: 'sleeve-length', label: 'Sleeve length' },
        { key: 'waist-circumference', label: 'Waist circumference' },
        { key: 'hip-circumference', label: 'Hip circumference' },
        { key: 'inseam', label: 'Inseam' },
        { key: 'rise', label: 'Rise' }
      ],
      measurements: [
        {
          size: 'S',
          values: {
            'chest-circumference': 96,
            'garment-length': 70
          }
        },
        {
          size: 'M',
          values: {
            'sleeve-length': 24,
            'waist-circumference': 80,
            rise: 28
          }
        },
        {
          size: 'L',
          values: {
            'shoulder-width': 44
          }
        }
      ]
    },
    onChange: value => changes.push(value)
  });
  const openTopsMenu = () => {
    find(h.tree, node => node.type === 'button'
      && React.Children.toArray(node.props.children).includes('Tops fields')).props.onClick();
    h.commit();
  };
  const removeAll = () => find(h.tree, node => node.props.role === 'menuitem'
    && node.props.children === 'Remove all fields');

  openTopsMenu();
  removeAll().props.onClick();
  h.commit();

  const dialog = () => find(h.tree, node => node.type === 'dialog'
    && node.props['aria-labelledby'] === 'preset-remove-test-preset-removal-heading');
  assert.ok(dialog());
  assert.ok(find(dialog(), node => node.type === 'h3'
    && React.Children.toArray(node.props.children).join('') === 'Remove Tops Measurements?'));
  const removedFields = find(dialog(), node => node.props['aria-label'] === 'Measurement fields being removed');
  assert.deepEqual(
    findAll(removedFields, node => node.type === 'li').map(node => node.props.children),
    ['Chest circumference', 'Shoulder width', 'Sleeve length']
  );
  assert.deepEqual(
    findAll(dialog(), node => node.type === 'li' && String(node.props.children).startsWith('Size '))
      .map(node => React.Children.toArray(node.props.children).join('')),
    ['Size S', 'Size M', 'Size L']
  );

  let escapePrevented = false;
  dialog().props.onCancel({ preventDefault() { escapePrevented = true; } });
  h.commit();
  assert.equal(escapePrevented, true);
  assert.equal(dialog(), undefined);
  assert.equal(changes.length, 0, 'Cancelling keeps all fields and measurements');

  openTopsMenu();
  removeAll().props.onClick();
  h.commit();
  find(h.tree, node => node.type === 'button'
    && React.Children.toArray(node.props.children).join('') === 'Remove Tops Fields').props.onClick();
  assert.deepEqual(changes[0].fields.map(field => field.key), [
    'garment-length',
    'waist-circumference',
    'hip-circumference',
    'inseam',
    'rise'
  ]);
  assert.deepEqual(changes[0].measurements, [
    {
      size: 'S',
      values: { 'garment-length': 70 }
    },
    {
      size: 'M',
      values: {
        'waist-circumference': 80,
        rise: 28
      }
    }
  ]);
  assert.deepEqual(h.props.sizes, ['S', 'M', 'L']);
  h.unmount();
});

test('Add Items Storefront Labels keep independent selected states', () => {
  const h = mount(Add);
  assert(h.has('Feature Product'));
  assert(!h.has('Feature in Best Sellers'));
  const bestSeller = () => find(h.tree, node => node.props.id === 'BestSeller');
  const newArrival = () => find(h.tree, node => node.props.id === 'NewArrival');
  const bestSellerCard = () => find(h.tree, node => node.type === 'label' && node.props.htmlFor === 'BestSeller');
  const newArrivalCard = () => find(h.tree, node => node.type === 'label' && node.props.htmlFor === 'NewArrival');
  const cardContainer = find(h.tree, node => {
    if (node.type !== 'div') return false;
    const directLabelCount = React.Children.toArray(node.props.children)
      .filter(child => React.isValidElement(child) && child.type === 'label' && ['BestSeller', 'NewArrival'].includes(child.props.htmlFor))
      .length;
    return directLabelCount === 2;
  });

  assert.match(bestSellerCard().props.className, /data-\[selected=true\]:border/);
  assert.match(bestSellerCard().props.className, /focus-within:outline/);
  assert.equal(bestSellerCard().props.className, newArrivalCard().props.className);
  assert.doesNotMatch(cardContainer.props.className, /\[&>label\]:(data-|focus-within)/);

  assert.equal(bestSellerCard().props['data-selected'], false);
  assert.equal(newArrivalCard().props['data-selected'], false);

  bestSeller().props.onChange();
  h.commit();
  assert.equal(bestSellerCard().props['data-selected'], true);
  assert.equal(newArrivalCard().props['data-selected'], false);

  newArrival().props.onChange();
  h.commit();
  assert.equal(bestSellerCard().props['data-selected'], true);
  assert.equal(newArrivalCard().props['data-selected'], true);

  bestSeller().props.onChange();
  h.commit();
  assert.equal(bestSellerCard().props['data-selected'], false);
  assert.equal(newArrivalCard().props['data-selected'], true);

  newArrival().props.onChange();
  h.commit();
  assert.equal(bestSellerCard().props['data-selected'], false);
  assert.equal(newArrivalCard().props['data-selected'], false);
  h.unmount();
});

test('product manager supports previously unassigned products', async () => {
  const h = mount();
  h.requests[0].resolve({
    data: {
      success: true,
      products: [product('Unassigned Product', {
        category: null,
        subCategory: null,
        productCategoryCode: null
      })]
    }
  });
  await settle();
  h.commit();

  find(h.tree, node => node.props['aria-label'] === 'Manage Unassigned Product').props.onClick();
  h.commit();
  let classification = find(h.tree, node => node.type === ProductManagementDrawer).props.classification;
  assert.deepEqual(classification.selectedPrograms, []);
  assert.deepEqual(classification.selectedGenders, []);
  assert.deepEqual(classification.selectedMerchandise, []);

  classification.onProgramsChange(['digital-arts']);
  classification.onGendersChange(['Women']);
  classification.onMerchandiseChange(['uniforms']);
  h.commit();
  classification = find(h.tree, node => node.type === ProductManagementDrawer).props.classification;
  await classification.onSave({ preventDefault() {} });
  await settle();

  assert.deepEqual(h.mutations[0].body, {
    academicPrograms: ['digital-arts'],
    genders: ['Women'],
    merchandiseCategoryCodes: ['uniforms']
  });
  h.unmount();
});

test('Product List exposes classification management without adding another row action', async () => {
  const h = mount();
  await h.success(0, 'Uniform A');

  const manage = find(h.tree, node => node.type === 'button' && node.props.children?.[1] === 'Manage Classifications');
  assert.ok(manage);
  manage.props.onClick();
  await settle();
  h.commit();

  const drawer = find(h.tree, node => node.type === CategoryManagementDrawer);
  assert.ok(drawer);
  assert.deepEqual(drawer.props.categories.map(category => category.code), ['digital-arts', 'BSIT', 'legacy-items', 'Men', 'uniforms']);
  assert.equal(h.categoryReads.length, 1);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Manage Uniform A') !== undefined, true);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Manage price for Uniform A'), undefined);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Manage stock for Uniform A'), undefined);
  h.unmount();
});

test('classification management provides three tabs and protected create, rename, and remove actions', async t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { isConnected: false, focus() {} },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const created = [];
  const updated = [];
  const h = mount(CategoryManagementDrawer, {
    categories: managedCategories,
    loading: false,
    loadError: '',
    token: 'synthetic-session',
    onClose() {},
    onRefresh() {},
    onCreated: category => created.push(category),
    onUpdated: category => updated.push(category)
  });

  assert(h.has('Manage Classifications'));
  assert(h.has('Academic Programs'));
  assert(h.has('Merchandise Categories'));
  assert(h.has('Gender'));
  assert.equal(h.has('Initialization required'), false);
  assert(h.has('Information Technology'));
  assert.equal(h.has('Tops'), false);
  assert.equal(findAll(h.tree, node => node.type === 'form').length, 0, 'Creation form stays hidden initially');
  const addProgram = find(h.tree, node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Add Program'));
  assert.ok(addProgram);
  addProgram.props.onClick();
  h.commit();

  find(h.tree, node => node.props.placeholder === 'e.g. Digital Arts').props.onChange({ target: { value: 'BSIT' } });
  h.commit();
  await findAll(h.tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  h.commit();
  assert(h.has('This default classification is already available.'));
  assert.equal(h.mutations.length, 0);

  find(h.tree, node => node.props.placeholder === 'e.g. Digital Arts').props.onChange({ target: { value: 'Accessories' } });
  h.commit();
  assert.equal(find(h.tree, node => node.props.placeholder === 'digital-arts').props.value, 'accessories');
  await findAll(h.tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await settle();
  h.commit();

  assert.equal(created.length, 1);
  assert.equal(created[0].code, 'accessories');
  assert.deepEqual(h.mutations[0].body, {
    name: 'Accessories', code: 'accessories', scope: 'program', active: true
  });
  assert.equal(h.mutations[0].options.headers.token, 'synthetic-session');

  const edit = find(h.tree, node => node.props['aria-label'] === 'Edit Information Technology');
  edit.props.onClick();
  h.commit();
  find(h.tree, node => node.type === 'input' && node.props.value === 'Information Technology').props.onChange({ target: { value: 'Information Systems' } });
  h.commit();
  await findAll(h.tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await settle();
  h.commit();

  assert.equal(updated[0].name, 'Information Systems');
  assert.deepEqual(h.mutations[1].body, { name: 'Information Systems' });
  assert.equal('code' in h.mutations[1].body, false);

  h.categoryDeleteResponse = {
    data: {
      success: true,
      action: 'archived',
      message: 'Classification archived because it is still used by a product.',
      category: { ...managedCategories[0], active: false }
    }
  };
  const remove = find(h.tree, node => node.props['aria-label'] === 'Remove Information Technology');
  remove.props.onClick();
  h.commit();
  const confirmation = find(h.tree, node => node.props['aria-label'] === 'Confirm remove Information Technology');
  assert.ok(confirmation, 'Removal requires confirmation');
  await confirmation.props.onClick();
  await settle();
  h.commit();

  assert.equal(h.mutations[2].method, 'delete');
  assert.equal(updated[1].active, false);

  const merchandiseTab = find(h.tree, node => node.props.role === 'tab' && node.props.children === 'Merchandise Categories');
  merchandiseTab.props.onClick();
  h.commit();
  assert(h.has('Tops'));
  assert(h.has('Bottoms'));
  assert(h.has('Extras'));
  assert.equal(h.has('BSIT'), false);

  const genderTab = find(h.tree, node => node.props.role === 'tab' && node.props.children === 'Gender');
  genderTab.props.onClick();
  h.commit();
  assert(h.has('Men'));
  assert(h.has('Women'));
  assert.equal(h.has('Not Applicable'), false);
  find(h.tree, node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Add Gender')).props.onClick();
  h.commit();
  find(h.tree, node => node.props.placeholder === 'e.g. Unisex').props.onChange({ target: { value: 'Unisex' } });
  h.commit();
  await findAll(h.tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await settle();
  h.commit();
  assert.deepEqual(h.mutations[3].body, {
    name: 'Unisex', code: 'unisex', scope: 'gender', active: true
  });
  h.unmount();
});

test('built-in classifications rename on demand without initialization', async t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { isConnected: false, focus() {} },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const updated = [];
  const h = mount(CategoryManagementDrawer, {
    categories: [],
    loading: false,
    loadError: '',
    token: 'synthetic-session',
    onClose() {},
    onRefresh() {},
    onCreated() {},
    onUpdated: category => updated.push(category),
    onDeleted() {}
  });

  assert.equal(h.has('Initialization required'), false);
  find(h.tree, node => node.props['aria-label'] === 'Edit BSIT').props.onClick();
  h.commit();
  find(h.tree, node => node.type === 'input' && node.props.value === 'BSIT')
    .props.onChange({ target: { value: 'Information Technology' } });
  h.commit();
  await findAll(h.tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await settle();
  h.commit();

  assert.equal(h.mutations[0].url, 'https://api.example.test/api/category/admin/default/program/BSIT');
  assert.deepEqual(h.mutations[0].body, { name: 'Information Technology' });
  assert.equal(updated[0].code, 'BSIT');
  assert.equal(updated[0].name, 'Information Technology');
  h.unmount();
});

test('removed built-in tombstones suppress fallback classifications', async t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { isConnected: false, focus() {} },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const h = mount(CategoryManagementDrawer, {
    categories: [{
      _id: 'removed-bsit',
      name: 'Information Technology',
      code: 'BSIT',
      scope: 'program',
      active: false,
      removed: true
    }],
    loading: false,
    loadError: '',
    token: 'synthetic-session',
    onClose() {},
    onRefresh() {},
    onCreated() {},
    onUpdated() {},
    onDeleted() {}
  });

  assert.equal(h.has('Information Technology'), false);
  assert.equal(find(h.tree, node => node.props['aria-label'] === 'Edit BSIT'), undefined);
  h.unmount();
});

test('category creation reports local duplicates and server validation errors', async t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { isConnected: false, focus() {} },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const h = mount(CategoryManagementDrawer, {
    categories: managedCategories,
    loading: false,
    loadError: '',
    token: 'synthetic-session',
    onClose() {},
    onRefresh() {},
    onCreated() {},
    onUpdated() {},
    initialScope: 'general'
  });
  const nameInput = () => find(h.tree, node => node.props.placeholder === 'e.g. School Supplies');
  const codeInput = () => find(h.tree, node => node.props.placeholder === 'school-supplies');
  const createForm = () => findAll(h.tree, node => node.type === 'form')[0];

  assert.equal(createForm(), undefined);
  find(h.tree, node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Add Category')).props.onClick();
  h.commit();

  nameInput().props.onChange({ target: { value: 'EXTRA' } });
  h.commit();
  assert.equal(codeInput().props.value, 'extra');
  codeInput().props.onChange({ target: { value: 'other-extra' } });
  h.commit();
  await createForm().props.onSubmit({ preventDefault() {} });
  h.commit();
  assert(h.has('This default classification is already available.'));
  assert.equal(h.mutations.length, 0);

  nameInput().props.onChange({ target: { value: 'Uniforms' } });
  codeInput().props.onChange({ target: { value: 'new-uniforms' } });
  h.commit();
  await createForm().props.onSubmit({ preventDefault() {} });
  h.commit();
  assert(h.has('A classification with this name or code already exists.'));
  assert.equal(h.mutations.length, 0);

  nameInput().props.onChange({ target: { value: 'New Category' } });
  codeInput().props.onChange({ target: { value: 'new-category' } });
  h.categoryCreateError = 'The category changed. Refresh and try again.';
  h.commit();
  await createForm().props.onSubmit({ preventDefault() {} });
  await settle();
  h.commit();
  assert(h.has('The category changed. Refresh and try again.'));

  find(h.tree, node => node.props['aria-label'] === 'Edit Uniforms').props.onClick();
  h.commit();
  find(h.tree, node => node.type === 'input' && node.props.value === 'Uniforms').props.onChange({ target: { value: 'Legacy Items' } });
  h.commit();
  await findAll(h.tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  h.commit();
  assert(h.has('A classification with this name already exists.'));
  assert.equal(h.mutations.length, 1, 'Local duplicate rename must not call the API');
  h.unmount();
});

test('archived classifications restore and removal errors remain actionable', async t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: { isConnected: false, focus() {} },
    body: { style: { overflow: '' } }
  };
  t.after(() => { globalThis.document = previousDocument; });

  const updated = [];
  const deleted = [];
  const props = {
    categories: managedCategories,
    loading: false,
    loadError: '',
    token: 'synthetic-session',
    onClose() {},
    onRefresh() {},
    onCreated() {},
    onUpdated: category => updated.push(category),
    onDeleted: categoryId => deleted.push(categoryId),
    initialScope: 'general'
  };

  const restoreHarness = mount(CategoryManagementDrawer, props);
  find(restoreHarness.tree, node => node.props['aria-label'] === 'Restore Legacy Items').props.onClick();
  restoreHarness.commit();
  await find(restoreHarness.tree, node => node.props['aria-label'] === 'Confirm restore Legacy Items').props.onClick();
  await settle();
  restoreHarness.commit();
  assert.deepEqual(restoreHarness.mutations[0].body, { active: true });
  assert.equal(updated[0].active, true);
  restoreHarness.unmount();

  const deleteHarness = mount(CategoryManagementDrawer, props);
  deleteHarness.categoryDeleteError = 'This classification is still used by a product. Reassign those records before deleting it.';
  find(deleteHarness.tree, node => node.props['aria-label'] === 'Remove Legacy Items').props.onClick();
  deleteHarness.commit();
  await find(deleteHarness.tree, node => node.props['aria-label'] === 'Confirm remove Legacy Items').props.onClick();
  await settle();
  deleteHarness.commit();
  assert(deleteHarness.has('This classification is still used by a product. Reassign those records before deleting it.'));
  assert.deepEqual(deleted, []);

  deleteHarness.categoryDeleteError = '';
  find(deleteHarness.tree, node => node.props['aria-label'] === 'Remove Legacy Items').props.onClick();
  deleteHarness.commit();
  await find(deleteHarness.tree, node => node.props['aria-label'] === 'Confirm remove Legacy Items').props.onClick();
  await settle();
  deleteHarness.commit();
  assert.deepEqual(deleted, ['category-2']);
  assert.equal(deleteHarness.mutations[1].method, 'delete');
  assert.equal(deleteHarness.mutations[1].options.headers.token, 'synthetic-session');
  deleteHarness.unmount();
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
  select('Filter by gender').props.onChange({ target: { value: 'Uniform' } });
  h.commit();
  assert(h.has('Item 0'));
  assert(!h.has('Item 1'));
  select('Filter by tag').props.onChange({ target: { value: 'BestSeller' } });
  h.commit();
  assert.equal(find(select('Filter by tag'), node => node.type === 'option' && node.props.value === 'BestSeller').props.children, 'Featured');
  assert(h.has('FEATURED'));
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
