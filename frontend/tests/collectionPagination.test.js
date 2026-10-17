import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  stdin: { resolveDir: frontend, contents: `
    export { default as Collection } from './src/pages/Collection.jsx';
    export { default as ProductItem } from './src/components/ProductItem.jsx';
    export { ShopContext } from './src/context/shopContext.js';
  ` },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  resolveExtensions: ['.js', '.jsx', '.json'],
  loader: { '.css': 'empty' },
  write: false
});
const filename = path.join(frontend, 'collection-pagination-test.cjs');
const require = createRequire(filename);
const react = require('react');
const router = require('react-router-dom');
const { renderToStaticMarkup } = require('react-dom/server');
let activeSearchParams;
const compiled = new Module(filename);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(frontend);
compiled.require = name => name === 'react-router-dom'
  ? { ...router, useSearchParams: (...args) => (activeSearchParams || router.useSearchParams)(...args) }
  : require(name);
compiled._compile(output.outputFiles[0].text, filename);
const { Collection, ProductItem, ShopContext } = compiled.exports;

const products = count => Array.from({ length: count }, (_, index) => ({
  _id: String(index), name: `Uniform ${index}`, price: index,
  category: index % 2 ? 'Women' : 'Men',
  subCategory: index % 4 < 2 ? 'BSIT' : 'SHS',
  BestSeller: index % 3 === 0,
  image: [`https://example.test/uniform-${index}.png`]
}));
const context = overrides => ({
  products: products(50), search: '', showSearch: false,
  setSearch() {}, setShowSearch() {}, getProductsData() {},
  productsLoading: false, productError: '', ...overrides
});
const html = (items, url = '/collection', overrides = {}) => renderToStaticMarkup(
  react.createElement(router.MemoryRouter, { initialEntries: [url] },
    react.createElement(ShopContext.Provider, { value: context({ products: items, ...overrides }) },
      react.createElement(Collection)))
);
const cardIds = markup => [...markup.matchAll(/class="collection-product-card" href="\/product\/([^"?]+)"/g)].map(match => match[1]);
const findAll = (element, predicate) => {
  if (!react.isValidElement(element)) return [];
  return [
    ...(predicate(element) ? [element] : []),
    ...react.Children.toArray(element.props.children).flatMap(child => findAll(child, predicate))
  ];
};
const find = (element, predicate) => findAll(element, predicate)[0];

// Run the actual component's handlers/effects with persistent hook slots and
// React Router's real memory history. No DOM, API or database is contacted.
const harness = (t, entries = ['/collection'], overrides = {}) => {
  const memory = router.createMemoryRouter([
    { path: '/collection', element: null }, { path: '/product/:id', element: null }
  ], { initialEntries: entries });
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let tree;
  const value = context(overrides);
  value.setSearch = next => { value.search = next; dirty = true; };
  value.setShowSearch = next => { value.showSearch = next; dirty = true; };
  const unsubscribe = memory.subscribe(() => { dirty = true; });
  const setParams = (next, options) => {
    const current = new URLSearchParams(memory.state.location.search);
    const result = typeof next === 'function' ? next(current) : next;
    return memory.navigate({ pathname: '/collection', search: new URLSearchParams(result).toString() }, options);
  };
  activeSearchParams = () => [new URLSearchParams(memory.state.location.search), setParams];
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  t.mock.method(react, 'useContext', () => value);
  t.mock.method(react, 'useState', initial => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: initial };
    const slot = slots[index];
    slot.set ??= next => { slot.value = typeof next === 'function' ? next(slot.value) : next; dirty = true; };
    return [slot.value, slot.set];
  });
  t.mock.method(react, 'useRef', initial => {
    const index = cursor++;
    slots[index] ??= { current: initial };
    return slots[index];
  });
  t.mock.method(react, 'useMemo', (calculate, dependencies) => {
    const index = cursor++;
    if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { value: calculate(), dependencies };
    return slots[index].value;
  });
  t.mock.method(react, 'useCallback', (callback, dependencies) => {
    const index = cursor++;
    if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { value: callback, dependencies };
    return slots[index].value;
  });
  t.mock.method(react, 'useEffect', (callback, dependencies) => {
    const index = cursor++;
    if (!same(slots[index]?.dependencies, dependencies)) {
      slots[index]?.cleanup?.();
      slots[index] = { dependencies };
      effects.push(() => { slots[index].cleanup = callback(); });
    }
  });
  const render = () => {
    let passes = 0;
    do {
      assert.ok(passes++ < 15, 'URL/effect updates must settle without a navigation loop');
      dirty = false;
      cursor = 0;
      effects = [];
      tree = Collection();
      for (const effect of effects) effect();
    } while (dirty);
    return tree;
  };
  t.after(() => {
    for (const slot of slots) slot?.cleanup?.();
    unsubscribe();
    memory.dispose();
    activeSearchParams = undefined;
  });
  return {
    render, value, memory,
    params: () => new URLSearchParams(memory.state.location.search),
    cards: () => findAll(render(), element => element.type === ProductItem),
    click: label => {
      const button = find(render(), element => element.type === 'button' && element.props['aria-label'] === label);
      assert.ok(button, `Missing button: ${label}`);
      button.props.onClick();
      return render();
    }
  };
};

for (const count of [0, 1, 23, 24, 25, 48, 49, 1000, 10000]) {
  test(`${count} products render at most 24 cards with full result counts`, () => {
    const markup = html(products(count));
    assert.equal(cardIds(markup).length, Math.min(count, 24));
    assert.match(markup, new RegExp(`<strong>${count}</strong>`));
    if (count) assert.match(markup, new RegExp(`Showing 1[–-]${Math.min(count, 24)} of ${count}`));
    else assert.match(markup, /No essentials available/);
    assert.equal(markup.includes('aria-label="Next product page"'), count > 24);
  });
}

test('all products are discoverable exactly once, including the last partial page', () => {
  const items = products(1000);
  const ids = [];
  for (let page = 1; page <= Math.ceil(items.length / 24); page++) {
    ids.push(...cardIds(html(items, `/collection?page=${page}`)));
  }
  assert.deepEqual(ids, items.map(item => item._id));
  assert.match(html(products(49), '/collection?page=3'), /Showing 49[–-]49 of 49/);
});

test('search, repeated OR filters, AND across groups and featured filtering precede pagination', () => {
  const items = products(500);
  const expected = items.filter(item => item.name.toLowerCase().includes('uniform') && item.BestSeller
    && ['Men', 'Women'].includes(item.category) && ['BSIT', 'SHS'].includes(item.subCategory));
  const url = '/collection?q=UNIFORM&gender=Men&gender=Women&gender=Men&gender=invalid&program=BSIT&program=SHS&featured=true&page=2';
  assert.deepEqual(cardIds(html(items, url)), expected.slice(24, 48).map(item => item._id));
  assert.match(html(items, url), new RegExp(`<strong>${expected.length}</strong>`));
  assert.deepEqual(cardIds(html(items, '/collection?gender=Men&program=SHS')),
    items.filter(item => item.category === 'Men' && item.subCategory === 'SHS').slice(0, 24).map(item => item._id));
});

test('sorting spans page boundaries, preserves relevant order and stable equal-price order', () => {
  const items = products(50).reverse();
  for (const sort of ['low-high', 'high-low', 'relevant', 'unknown']) {
    const expected = [...items];
    if (sort === 'low-high') expected.sort((a, b) => a.price - b.price);
    if (sort === 'high-low') expected.sort((a, b) => b.price - a.price);
    assert.deepEqual(cardIds(html(items, `/collection?sort=${sort}&page=2`)), expected.slice(24, 48).map(item => item._id));
  }
  const tied = products(50).map(item => ({ ...item, price: 10 }));
  assert.deepEqual(cardIds(html(tied, '/collection?sort=low-high&page=2')), tied.slice(24, 48).map(item => item._id));
});

test('invalid pages are safe, excessive numeric pages clamp, and normalization replaces history', async t => {
  const h = harness(t);
  for (const raw of ['', '-1', '0', 'abc', '1.5', 'Infinity', '9007199254740992']) {
    await h.memory.navigate(`/collection?page=${raw}&keep=yes`);
    assert.equal(h.cards()[0].props.id, '0');
    assert.equal(h.params().has('page'), false);
    assert.equal(h.params().get('keep'), 'yes');
    assert.equal(h.memory.state.historyAction, 'REPLACE');
  }
  await h.memory.navigate('/collection?page=999');
  assert.equal(h.cards()[0].props.id, '48');
  assert.equal(h.params().get('page'), '3');
  await h.memory.navigate('/collection?page=2&page=3');
  assert.equal(h.cards()[0].props.id, '24');
  assert.deepEqual(h.params().getAll('page'), ['2']);
});

test('page navigation preserves repeated and unknown parameters, with Back/Forward restoration', async t => {
  const h = harness(t, ['/collection?q=Uniform&gender=Men&gender=Women&program=BSIT&program=SHS&sort=high-low&keep=a&keep=b']);
  h.click('Next product page');
  assert.equal(h.params().get('page'), '2');
  assert.deepEqual(h.params().getAll('keep'), ['a', 'b']);
  assert.deepEqual(h.params().getAll('gender'), ['Men', 'Women']);
  const pageTwo = h.cards().map(card => card.props.id);
  const sort = find(h.render(), element => element.type === 'select');
  sort.props.onChange({ target: { value: 'low-high' } });
  assert.equal(h.params().has('page'), false);
  h.render();
  await h.memory.navigate(-1);
  assert.equal(h.params().get('page'), '2');
  assert.deepEqual(h.cards().map(card => card.props.id), pageTwo);
  await h.memory.navigate(1);
  assert.equal(h.cards()[0].props.id, '0');
});

test('refresh/direct URLs and product-detail return restore the selected page', async t => {
  const h = harness(t, ['/collection?page=2']);
  assert.equal(h.cards()[0].props.id, '24');
  await h.memory.navigate('/product/24');
  await h.memory.navigate(-1);
  assert.equal(h.cards()[0].props.id, '24');
  assert.equal(cardIds(html(products(50), '/collection?page=2'))[0], '24');
});

test('Back/Forward restores different filter values together with their saved pages', async t => {
  const h = harness(t, ['/collection?gender=Women&page=2', '/collection?gender=Men&page=3'], { products: products(250) });
  assert.equal(h.cards()[0].props.id, '96');
  await h.memory.navigate(-1);
  assert.equal(h.cards()[0].props.id, '49');
  assert.equal(h.params().get('page'), '2');
  await h.memory.navigate(1);
  assert.equal(h.cards()[0].props.id, '96');
  assert.equal(h.params().get('page'), '3');
});

test('drawer retains full counts, reset/close callbacks and its existing fallback focus ref', t => {
  const h = harness(t, ['/collection?gender=Men&page=2'], { products: products(250) });
  const trigger = find(h.render(), element => element.props['aria-controls'] === 'collection-filter-drawer');
  trigger.props.onClick();
  const drawer = () => find(h.render(), element => element.type?.name === 'CollectionFilterDrawer');
  const focusRef = drawer().props.fallbackFocusRef;
  assert.equal(drawer().props.count, 125);
  drawer().props.onToggle('program', 'BSIT');
  assert.equal(drawer().props.count, 63);
  assert.equal(h.params().has('page'), false);
  drawer().props.onReset();
  assert.equal(drawer().props.count, 250);
  assert.equal(drawer().props.fallbackFocusRef, focusRef);
  drawer().props.onClose();
  assert.equal(drawer(), undefined);
});

test('all user criteria handlers reset the page while preserving their existing URL semantics', async t => {
  const h = harness(t, ['/collection?page=2&keep=yes'], { products: products(500) });
  const pageTwo = async () => { await h.memory.navigate('/collection?page=2&keep=yes&gender=Men&program=BSIT&featured=true&q=Uniform'); h.render(); };
  await pageTwo();
  find(h.render(), element => element.type?.name === 'SearchBar').props.onChange('Uniform 1');
  h.render();
  assert.equal(h.params().has('page'), false);
  assert.equal(h.params().get('q'), 'Uniform 1');
  assert.equal(h.memory.state.historyAction, 'REPLACE');
  await pageTwo();
  find(h.render(), element => element.type?.name === 'CollectionFilters').props.onToggle('gender', 'Women');
  h.render();
  assert.deepEqual(h.params().getAll('gender'), ['Men', 'Women']);
  assert.equal(h.params().has('page'), false);
  for (const label of ['Remove featured filter', 'Remove search filter']) {
    await pageTwo();
    h.click(label);
    assert.equal(h.params().has('page'), false);
  }
  for (const clearClass of ['collection-clear-action', undefined]) {
    await pageTwo();
    const clear = find(h.render(), element => element.type === 'button' && element.props.children === 'Clear all' && element.props.className === clearClass);
    clear.props.onClick();
    h.render();
    assert.equal(h.params().has('page'), false);
    assert.equal(h.params().get('keep'), 'yes');
    assert.equal(h.params().has('q'), clearClass === undefined);
  }
});

test('catalog shrink clamps with replace; pending or failed loads do not erase restoration URLs', t => {
  const h = harness(t, ['/collection?page=3&keep=yes']);
  assert.equal(h.cards()[0].props.id, '48');
  h.value.productsLoading = true;
  h.value.products = [];
  h.render();
  assert.equal(h.params().get('page'), '3');
  h.value.productsLoading = false;
  h.value.productError = 'Unable to refresh';
  h.render();
  assert.equal(h.params().get('page'), '3');
  h.value.productError = '';
  h.value.products = products(25);
  assert.equal(h.cards()[0].props.id, '24');
  assert.equal(h.params().get('page'), '2');
  assert.equal(h.memory.state.historyAction, 'REPLACE');
  h.value.products = [];
  h.render();
  assert.equal(h.params().has('page'), false);
});

test('legacy navbar search imports once, resets pagination and then respects URL history', t => {
  const h = harness(t, ['/collection?page=3&keep=yes'], { search: 'Uniform 1', showSearch: true, products: products(500) });
  h.render();
  assert.equal(h.params().get('q'), 'Uniform 1');
  assert.equal(h.params().has('page'), false);
  h.click('Next product page');
  assert.equal(h.params().get('page'), '2');
});

test('controls have bounded markup, current-page semantics and guarded focusable disabled states', t => {
  const h = harness(t, ['/collection'], { products: products(25) });
  let tree = h.render();
  const previous = find(tree, element => element.props['aria-label'] === 'Previous product page');
  assert.equal(previous.type, 'button');
  assert.equal(previous.props.type, 'button');
  assert.equal(previous.props['aria-disabled'], true);
  assert.notEqual(previous.props.tabIndex, -1);
  h.click('Previous product page');
  assert.equal(h.params().has('page'), false);
  tree = h.click('Next product page');
  const next = find(tree, element => element.props['aria-label'] === 'Next product page');
  assert.equal(next.props['aria-disabled'], true);
  assert.ok(find(tree, element => element.props['aria-current'] === 'page' && element.type === 'span' && String(element.props.children).includes('2')));
  h.click('Next product page');
  assert.equal(h.params().get('page'), '2');
  assert.equal(findAll(tree, element => element.type === 'button' && element.props['aria-controls'] === 'collection-product-grid').length, 2);
});

test('page-only navigation reuses filtering/sorting and leaves the catalog unchanged', t => {
  let copies = 0;
  let requests = 0;
  const items = products(1000);
  items.slice = (...args) => { copies++; return Array.prototype.slice.apply(items, args); };
  const h = harness(t, ['/collection'], { products: items, getProductsData: () => { requests++; } });
  h.render();
  const before = copies;
  h.click('Next product page');
  h.click('Next product page');
  assert.equal(copies, before, 'Page changes must not recalculate the full filter/sort memo');
  assert.equal(h.value.products, items);
  assert.equal(items.length, 1000);
  assert.equal(requests, 0, 'Page navigation must not issue product requests');
});

test('card props/keys, lazy images, missing-image fallback, messages and retry remain unchanged', t => {
  const items = products(25);
  items[24].image = [];
  let refreshes = 0;
  const h = harness(t, ['/collection?page=2'], { products: items, getProductsData: () => { refreshes++; } });
  const card = h.cards()[0];
  assert.deepEqual(card.props, { id: '24', name: 'Uniform 24', image: [], price: 24, category: 'Men', subCategory: 'BSIT', collection: true });
  assert.ok(card.key.endsWith('$24'));
  h.value.productError = 'Synthetic failure';
  find(h.render(), element => element.type === 'button' && element.props.children === 'Try again').props.onClick();
  assert.equal(refreshes, 1, 'Pagination must not introduce API requests');
});

test('rendered card markup, image behavior and loading/error/empty presentation are preserved', () => {
  const items = products(25);
  const markup = html(items, '/collection?page=2');
  const card = renderToStaticMarkup(react.createElement(router.MemoryRouter, {}, react.createElement(ProductItem, {
    id: items[24]._id, name: items[24].name, image: items[24].image, price: items[24].price,
    category: items[24].category, subCategory: items[24].subCategory, collection: true
  })));
  assert.ok(markup.includes(card));
  assert.match(markup, /alt="Uniform 24" loading="lazy"/);
  items[24].image = [];
  assert.match(html(items, '/collection?page=2'), /Image unavailable/);
  assert.match(html([], '/collection?page=2', { productsLoading: true }), /Loading your campus essentials/);
  assert.match(html([], '/collection', { productError: 'Synthetic failure' }), /Unable to load collection/);
  assert.match(html(items, '/collection?q=not-found'), /No matching essentials/);
});
