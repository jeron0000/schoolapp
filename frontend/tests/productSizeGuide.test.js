import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  stdin: { resolveDir: frontend, contents: `
    export { default as Product } from './src/pages/Product.jsx';
    export { default as SizeGuideDialog } from './src/components/SizeGuideDialog.jsx';
    export { getRestockPresentation } from './src/utils/productRestock.js';
    export { default as BestSellerBadge } from './src/components/BestSellerBadge.jsx';
  ` },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.css': 'empty' }, write: false,
});
const compiled = new Module(path.join(frontend, 'product-size-guide-test.cjs'));
compiled.filename = path.join(frontend, 'product-size-guide-test.cjs');
compiled.paths = Module._nodeModulePaths(frontend);
const require = createRequire(compiled.filename);
let productId = 'measured-product';
compiled.require = name => name === 'react-router-dom'
  ? { ...require(name), useParams: () => ({ productId }) }
  : require(name);
compiled._compile(output.outputFiles[0].text, compiled.filename);
const { Product, SizeGuideDialog, getRestockPresentation, BestSellerBadge } = compiled.exports;
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');

const guide = {
  fields: [
    { key: 'chest-circumference', label: 'Chest circumference' },
    { key: 'custom-rise', label: 'Custom rise' },
  ],
  measurements: [
    { size: 'M', values: { 'chest-circumference': 96, 'custom-rise': 24.5 } },
    { size: '4XL', values: { 'chest-circumference': 130 } },
  ],
};
const fixture = overrides => ({
  _id: 'measured-product', name: 'Measured garment', description: 'Existing product details',
  image: [], price: 225, sizes: ['M', '4XL', 'One Size'],
  inventory: { M: 5, '4XL': 0, 'One Size': 2 }, sizeGuide: structuredClone(guide),
  ...overrides,
});
const findAll = (tree, predicate) => {
  if (!React.isValidElement(tree)) return [];
  const matches = predicate(tree) ? [tree] : [];
  return matches.concat(React.Children.toArray(tree.props.children).flatMap(child => findAll(child, predicate)));
};
const find = (tree, predicate) => findAll(tree, predicate)[0];
const content = element => {
  if (!React.isValidElement(element)) return String(element ?? '');
  return React.Children.toArray(element.props.children).map(content).join('');
};

const mountProduct = (t, product = fixture()) => {
  const slots = [];
  let cursor = 0;
  productId = product._id;
  const context = {
    products: [product], cartItems: {}, getProductsData() {},
    addToCart: t.mock.fn(async () => {}), productsLoading: false,
  };
  t.mock.method(React, 'useContext', () => context);
  t.mock.method(React, 'useState', initial => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    const slot = slots[index];
    return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
  });
  t.mock.method(React, 'useRef', initial => {
    const index = cursor++;
    slots[index] ??= { current: initial };
    return slots[index];
  });
  t.mock.method(React, 'useEffect', () => {});
  t.mock.method(React, 'useLayoutEffect', () => {});
  return {
    context,
    render: () => { cursor = 0; return Product(); },
  };
};

test('Size Guide is hidden for legacy, empty, and field-only products', t => {
  const h = mountProduct(t);
  for (const sizeGuide of [undefined, { fields: [], measurements: [] }, { fields: guide.fields, measurements: [] }]) {
    h.context.products[0].sizeGuide = sizeGuide;
    assert.equal(find(h.render(), node => node.type === 'button' && content(node) === 'Size Guide'), undefined);
  }
});

test('Product Details Featured badge follows refreshed data and the selected individual item', t => {
  const anchor = fixture({ BestSeller: true, variantGroupId: 'measured-product', optionLabel: 'Classic', groupTitle: 'Campus Shirts' });
  const sibling = fixture({ _id: 'sibling-product', BestSeller: false, variantGroupId: anchor._id, optionLabel: 'Department' });
  const h = mountProduct(t, anchor);
  h.context.products.push(sibling);
  const badge = () => find(h.render(), node => node.type === BestSellerBadge);
  const renderedBadge = () => renderToStaticMarkup(React.createElement(BestSellerBadge, badge().props));
  assert.match(renderedBadge(), /FEATURED/);
  h.context.products[0] = { ...anchor, BestSeller: false };
  assert.equal(renderedBadge(), '');
  h.context.products[0] = anchor;
  find(h.render(), node => node.props.to === '/product/sibling-product').props.onClick();
  productId = sibling._id;
  assert.equal(renderedBadge(), '', 'Sibling cannot inherit the anchor badge');
  h.context.products[1] = { ...sibling, BestSeller: true };
  assert.match(renderedBadge(), /FEATURED/);
  assert.equal(content(find(h.render(), node => node.type === 'h1')), sibling.name);
});

test('item deep links change actual product details and clear the previous size before Add to Cart', async t => {
  const anchor = fixture({ name: 'Classic Shirt', variantGroupId: 'measured-product', groupTitle: 'Campus Shirts', colorLabel: 'Yellow' });
  const green = fixture({ _id: 'green-product', name: 'Department Shirt', variantGroupId: anchor._id, optionLabel: 'Department Shirt',
    image: ['green.jpg'], sizes: ['4XL'], inventory: { '4XL': 23 }, price: 250 });
  const h = mountProduct(t, anchor);
  h.context.products.push(green);
  let tree = h.render();
  find(tree, node => node.props['aria-label'] === 'M, low stock, 5 available').props.onClick();
  tree = h.render();
  const colorLink = find(tree, node => node.props.to === '/product/green-product');
  assert.ok(colorLink);
  colorLink.props.onClick();
  productId = green._id;
  tree = h.render();
  assert.equal(content(find(tree, node => node.type === 'h1')), 'Department Shirt');
  assert.match(content(find(tree, node => node.type === 'legend' && content(node).startsWith('Select item'))), /Department Shirt/);
  assert.equal(find(tree, node => node.props['aria-label'] === 'M, low stock, 5 available'), undefined);
  assert.match(content(find(tree, node => node.props.role === 'status')), /Select a size/);
  assert.equal(find(tree, node => node.props.to === '/product/green-product').props['aria-current'], 'true');
  const add = () => find(tree, node => node.type === 'button' && content(node).startsWith('Add to Cart'));
  await add().props.onClick();
  assert.equal(h.context.addToCart.mock.callCount(), 0);
  find(tree, node => node.props.to === '/product/measured-product').props.onClick();
  productId = anchor._id;
  tree = h.render();
  assert.match(content(find(tree, node => node.props.role === 'status')), /Select a size/,
    'returning to an earlier color must not revive its old size');
  find(tree, node => node.props.to === '/product/green-product').props.onClick();
  productId = green._id;
  tree = h.render();
  find(tree, node => node.props['aria-label'] === '4XL, in stock, 23 available').props.onClick();
  tree = h.render();
  await add().props.onClick();
  assert.deepEqual(h.context.addToCart.mock.calls[0].arguments, [green._id, '4XL']);
});

test('size selection displays saved measurements and retains Add to Cart validation', async t => {
  const h = mountProduct(t);
  let tree = h.render();
  const addButton = () => find(tree, node => node.type === 'button' && content(node).startsWith('Add to Cart'));
  await addButton().props.onClick();
  assert.equal(h.context.addToCart.mock.callCount(), 0, 'missing size still blocks cart mutation');

  find(tree, node => node.props['aria-label'] === 'M, low stock, 5 available').props.onClick();
  tree = h.render();
  const summary = find(tree, node => node.props['aria-label'] === 'Measurements for size M');
  assert.match(content(summary), /Garment measurements \(cm\)/);
  assert.match(content(summary), /Chest circumference96/);
  assert.match(content(summary), /Custom rise24.5/);
  await addButton().props.onClick();
  assert.deepEqual(h.context.addToCart.mock.calls[0].arguments, ['measured-product', 'M']);
  assert.equal(find(tree, node => node.props['aria-label'] === '4XL, out of stock').props.disabled, true);
});

test('partial and missing selected-size values stay missing without hiding custom sizes', t => {
  const h = mountProduct(t, fixture({ inventory: { M: 5, '4XL': 3, 'One Size': 2 } }));
  let tree = h.render();
  find(tree, node => node.props['aria-label'] === '4XL, low stock, 3 available').props.onClick();
  tree = h.render();
  assert.match(content(find(tree, node => node.props['aria-label'] === 'Measurements for size 4XL')), /130Custom rise—/);

  find(tree, node => node.props['aria-label'] === 'One Size, low stock, 2 available').props.onClick();
  tree = h.render();
  const values = findAll(find(tree, node => node.props['aria-label'] === 'Measurements for size One Size'), node => node.type === 'dd');
  assert.deepEqual(values.map(content), ['—', '—']);
});

test('guide opens for the correct product and includes out-of-stock sizes', t => {
  const h = mountProduct(t);
  let tree = h.render();
  find(tree, node => node.type === 'button' && content(node) === 'Size Guide').props.onClick();
  tree = h.render();
  const dialog = find(tree, node => node.type === SizeGuideDialog);
  assert.deepEqual(dialog.props.rows.map(row => row.size), ['M', 'One Size', '4XL']);
  assert.deepEqual(dialog.props.fields, guide.fields);
  dialog.props.onClose();
  assert.equal(find(h.render(), node => node.type === SizeGuideDialog), undefined);

  h.context.products = [fixture({ _id: 'another-product' })];
  productId = 'another-product';
  assert.equal(find(h.render(), node => node.type === SizeGuideDialog), undefined);
});

test('size availability uses out, low, and in-stock thresholds with selected status details', t => {
  const h = mountProduct(t, fixture({
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    inventory: { S: 0, M: 1, L: 9, XL: 10, XXL: 23 },
    sizeGuide: undefined,
  }));
  let tree = h.render();
  const expectedButtons = [
    ['S, out of stock', 'SOUT OF STOCK'],
    ['M, low stock, 1 available', 'MLOW STOCK · 1'],
    ['L, low stock, 9 available', 'LLOW STOCK · 9'],
    ['XL, in stock, 10 available', 'XLIN STOCK · 10'],
    ['XXL, in stock, 23 available', 'XXLIN STOCK · 23'],
  ];

  for (const [label, expectedContent] of expectedButtons) {
    const button = find(tree, node => node.props['aria-label'] === label);
    assert.equal(content(button), expectedContent);
  }

  const lowStockButton = find(tree, node => node.props['aria-label'] === 'M, low stock, 1 available');
  const lowStockLabel = find(lowStockButton, node => node.type === 'span');
  assert.match(lowStockLabel.props.className, /text-amber-700/);
  lowStockButton.props.onClick();
  tree = h.render();
  const selectedLowStockButton = find(tree, node => node.props['aria-label'] === 'M, low stock, 1 available');
  assert.equal(selectedLowStockButton.props['aria-pressed'], true);
  assert.match(selectedLowStockButton.props.className, /aria-pressed:!bg-\[var\(--pamo-color-brand-yellow\)\]/);
  assert.match(find(selectedLowStockButton, node => node.type === 'span').props.className, /text-amber-900/);
  assert.match(content(find(tree, node => node.props.role === 'status')), /SIZE M · LOW STOCKOnly 1 left for this size/);

  const unavailableButton = find(tree, node => node.props['aria-label'] === 'S, out of stock');
  assert.equal(unavailableButton.props.disabled, true);
  unavailableButton.props.onClick();
  tree = h.render();
  assert.match(content(find(tree, node => node.props.role === 'status')), /SIZE S · OUT OF STOCKCurrently unavailable/);
});

test('restock presentation reflects unavailable variants, dates, and legacy products', () => {
  const sizes = ['M', 'L', '4XL'];
  const partial = fixture({
    sizes,
    inventory: { M: 4, L: 0, '4XL': 0 },
    restockPlan: { status: 'scheduled', estimatedDate: '2099-01-15T00:00:00.000Z' },
  });
  const future = getRestockPresentation(partial, sizes, Date.parse('2099-01-01T00:00:00.000Z'));
  assert.equal(future.title, 'Expected Restock: January 15, 2099');
  assert.match(future.detail, /Currently unavailable: Size L, Size 4XL/);
  assert.match(future.detail, /not guaranteed/);

  const past = getRestockPresentation(partial, sizes, Date.parse('2099-01-20T00:00:00.000Z'));
  assert.equal(past.title, 'Restock Update Pending');
  assert.match(past.detail, /estimated restock date was January 15, 2099/);

  const unavailable = fixture({
    sizes,
    inventory: { M: 0, L: 0, '4XL': 0 },
    restockPlan: { status: 'soon' },
  });
  const soon = getRestockPresentation(unavailable, sizes);
  assert.equal(soon.title, 'Restocking Soon');
  assert.match(soon.detail, /All product sizes are currently out of stock/);

  assert.equal(getRestockPresentation({ ...partial, inventory: { M: 1, L: 2, '4XL': 3 } }, sizes), null);
  assert.equal(getRestockPresentation(fixture({ restockPlan: undefined }), fixture().sizes), null);
});

test('Product renders restock notices without changing size selection behavior', t => {
  const h = mountProduct(t, fixture({
    inventory: { M: 5, '4XL': 0, 'One Size': 2 },
    restockPlan: { status: 'soon' },
  }));
  const tree = h.render();
  const notice = find(tree, node => node.props['aria-label'] === 'Restock information');
  assert.match(content(notice), /Restocking Soon/);
  assert.match(content(notice), /Currently unavailable: Size 4XL/);
  assert.equal(find(tree, node => node.props['aria-label'] === 'M, low stock, 5 available').props.disabled, false);
  assert.equal(find(tree, node => node.props['aria-label'] === '4XL, out of stock').props.disabled, true);
});

const dialogProps = overrides => ({
  productName: 'Measured garment', fields: guide.fields,
  rows: [
    { size: 'M', values: guide.measurements[0].values },
    { size: '4XL', values: guide.measurements[1].values },
    { size: 'One Size', values: {} },
  ],
  selectedSize: '4XL', onClose() {}, ...overrides,
});

test('comparison chart renders custom fields, missing values, and selected-size highlighting in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement('div', { className: theme }, React.createElement(SizeGuideDialog, dialogProps()))));
    assert.match(html, /Custom rise \(cm\)/);
    assert.match(html, /aria-current="true"[^>]*>[\s\S]*?4XL/);
    assert.match(html, /130<\/td><td[^>]*>—/);
    assert.match(html, /overflow-x-auto/);
    assert.match(html, /mt-auto[\s\S]*sm:m-auto/);
    assert.match(html, /font-body/);
    assert.match(html, /var\(--pamo-color-surface-default\)/);
  }
});

test('native dialog opens, focuses Close, handles Escape, and restores focus and scroll on cleanup', t => {
  let setup;
  let nextRef = 0;
  let closed = 0;
  const focus = [];
  const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const close = { focus: () => focus.push('close') };
  const opener = { isConnected: true, getClientRects: () => [{}], focus: () => focus.push('opener') };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    activeElement: opener, body: { style: { overflow: 'auto' } },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  t.mock.method(React, 'useRef', () => ({ current: nextRef++ === 0 ? dialog : close }));
  t.mock.method(React, 'useEffect', effect => { setup = effect; });
  const tree = SizeGuideDialog(dialogProps({ onClose: () => { closed++; } }));
  const cleanup = setup();
  assert.equal(dialog.open, true);
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(focus.at(-1), 'close');
  let prevented = false;
  tree.props.onCancel({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(closed, 1);
  cleanup();
  assert.equal(dialog.open, false);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(focus.at(-1), 'opener');
});
