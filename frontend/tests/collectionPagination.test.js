import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  getAcademicProgramName,
  getAcademicProgramOptions,
  getGenderOptions,
  getMerchandiseCategoryOptions,
  getProductCategoryName,
  getProductGenderName,
} from '../../shared/productTaxonomy.js';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const output = await build({
  stdin: { resolveDir: frontend, contents: `
    export { default as Collection } from './src/pages/Collection.jsx';
    export { default as ProductItem } from './src/components/ProductItem.jsx';
    export { default as LatestCollection } from './src/components/LatestCollection.jsx';
    export { default as ProgramRecommendations } from './src/components/ProgramRecommendations.jsx';
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
const { Collection, ProductItem, LatestCollection, ProgramRecommendations, ShopContext } = compiled.exports;

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
  productsLoading: false, productError: '', productCategories: [],
  categoriesLoading: false, categoryError: '', getProductCategories() {},
  ...overrides
});
const html = (items, url = '/collection', overrides = {}) => renderToStaticMarkup(
  react.createElement(router.MemoryRouter, { initialEntries: [url] },
    react.createElement(ShopContext.Provider, { value: context({ products: items, ...overrides }) },
      react.createElement(Collection)))
);
const cardIds = markup => [
  ...markup.matchAll(/class="[^"]*\bcollection-product-card\b[^"]*" href="\/product\/([^"?]+)"/g)
].map(match => match[1]);
const findAll = (element, predicate) => {
  if (!react.isValidElement(element)) return [];
  return [
    ...(predicate(element) ? [element] : []),
    ...react.Children.toArray(element.props.children).flatMap(child => findAll(child, predicate))
  ];
};
const find = (element, predicate) => findAll(element, predicate)[0];

test('Featured badge follows the authoritative BestSeller boolean in every shared card presentation', () => {
  for (const presentation of [{ home: true }, { collection: true }, { compact: true }, {}]) {
    for (const enabled of [true, false, undefined, 'true']) {
      const markup = renderToStaticMarkup(react.createElement(router.MemoryRouter, null,
        react.createElement(ProductItem, {
          id: 'badge-product', image: ['product.jpg'], name: 'Long product name for a school essential',
          price: 123456789789, BestSeller: enabled, ...presentation
        })));
      assert.equal((markup.match(/FEATURED/g) || []).length, enabled === true ? 1 : 0);
      assert.doesNotMatch(markup, /BEST SELLER/);
      assert.match(markup, /href="\/product\/badge-product"/);
      assert.match(markup, /123,456,789,789\.00/);
      if (enabled === true) {
        assert.match(markup, /bg-\[var\(--pamo-color-brand-yellow\)\]/);
        assert.match(markup, /text-slate-950/);
        assert.match(markup, /inline-flex max-w-full shrink-0/);
      }
    }
  }
});

test('Collection badge updates after refreshed flags and stays specific to the represented group item', () => {
  const anchor = { ...products(1)[0], _id: 'anchor', variantGroupId: 'anchor', optionLabel: 'Classic', groupTitle: 'Campus Shirts', BestSeller: false };
  const sibling = { ...anchor, _id: 'sibling', optionLabel: 'Department', BestSeller: true };
  assert.equal((html([anchor, sibling]).match(/FEATURED/g) || []).length, 0, 'Unflagged anchor does not inherit a sibling flag');
  const featured = html([anchor, sibling], '/collection?featured=true');
  assert.deepEqual(cardIds(featured), ['sibling']);
  assert.equal((featured.match(/FEATURED/g) || []).length, 1);
  const updated = html([{ ...anchor, BestSeller: true }, { ...sibling, BestSeller: false }]);
  assert.deepEqual(cardIds(updated), ['anchor']);
  assert.equal((updated.match(/FEATURED/g) || []).length, 1);
  assert.equal((html([{ ...anchor, BestSeller: false }, { ...sibling, BestSeller: false }]).match(/FEATURED/g) || []).length, 0);
});

test('Homepage cards receive representative flags without changing grouping or recommendations', () => {
  const anchor = { ...products(1)[0], _id: 'anchor', variantGroupId: 'anchor', optionLabel: 'Classic', groupTitle: 'Campus Shirts',
    BestSeller: false, academicPrograms: ['BSIT'], sizes: ['M'], inventory: { M: 10 } };
  const sibling = { ...anchor, _id: 'sibling', optionLabel: 'Department', BestSeller: true, inventory: { M: 20 } };
  const render = (Component, items, theme) => renderToStaticMarkup(
    react.createElement('div', { className: theme },
      react.createElement(router.MemoryRouter, null,
        react.createElement(ShopContext.Provider, { value: context({ products: items, token: 'student', studentProfile: { academicProgram: 'BSIT' } }) },
          react.createElement(Component))))
  );
  for (const theme of ['light', 'dark']) {
    const latest = render(LatestCollection, [anchor, sibling], theme);
    assert.match(latest, /href="\/product\/anchor"/);
    assert.doesNotMatch(latest, /FEATURED/);
    const recommended = render(ProgramRecommendations, [anchor, sibling], theme);
    assert.match(recommended, /href="\/product\/sibling"/);
    assert.equal((recommended.match(/FEATURED/g) || []).length, 1);
    assert.doesNotMatch(render(ProgramRecommendations, [anchor, { ...sibling, BestSeller: false }], theme), /FEATURED/);
    assert.equal((render(LatestCollection, [{ ...anchor, BestSeller: true }, sibling], theme).match(/FEATURED/g) || []).length, 1);
  }
});

test('managed labels override defaults while archived options remain unavailable for new assignments', () => {
  const categories = [
    { name: 'Information Technology', code: 'BSIT', scope: 'program' },
    { name: 'Hospitality Management', code: 'BSHM', scope: 'program', active: false },
    { name: 'Digital Arts', code: 'digital-arts', scope: 'program' },
    { name: 'School Supplies', code: 'school-supplies', scope: 'general' },
    { name: 'Uniform Tops', code: 'TOP', scope: 'general' },
    { name: 'Menswear', code: 'Men', scope: 'gender' },
    { name: 'Womenswear', code: 'Women', scope: 'gender', active: false },
    { name: 'Unisex', code: 'unisex', scope: 'gender' },
    { name: 'Retired Program', code: 'retired-program', scope: 'program', active: false },
    { name: 'Extras', code: 'EXTRA', scope: 'general' },
    { name: 'Tops', code: 'tops', scope: 'program' },
    { name: 'Tops', code: 'tops-general', scope: 'general' },
  ];
  const programValues = getAcademicProgramOptions(categories).map(option => option.value);
  const merchandiseValues = getMerchandiseCategoryOptions(categories).map(option => option.value);
  const genderOptions = getGenderOptions(categories);

  assert.equal(programValues.includes('digital-arts'), true);
  assert.equal(programValues.includes('BSHM'), false);
  assert.equal(programValues.includes('EXTRA'), false);
  assert.equal(programValues.includes('school-supplies'), false);
  assert.equal(programValues.includes('retired-program'), false);
  assert.equal(programValues.includes('tops'), false);
  assert.deepEqual(merchandiseValues, ['TOP', 'BOTTOM', 'EXTRA', 'school-supplies', 'tops-general']);
  assert.deepEqual(genderOptions, [
    { value: 'Men', label: 'Menswear' },
    { value: 'unisex', label: 'Unisex' },
  ]);
  assert.equal(getAcademicProgramName(categories, 'BSIT'), 'Information Technology');
  assert.equal(getAcademicProgramName(categories, 'BSHM'), 'Hospitality Management');
  assert.equal(getProductCategoryName(categories, 'TOP'), 'Uniform Tops');
  assert.equal(getProductGenderName(categories, 'Men'), 'Menswear');
});

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

test('color groups collapse after actual filters and before pagination/counts', t => {
  const catalog = products(26);
  for (const item of catalog.slice(0, 3)) {
    item.variantGroupId = '0';
    item.colorLabel = `Color ${item._id}`;
  }
  catalog[0].groupTitle = 'Color shirts';
  const h = harness(t, ['/collection?page=2'], { products: catalog });
  assert.equal(h.cards().length, 24);
  assert.equal(h.params().get('page'), null, '26 products become 24 listings on one page');
  assert.equal(h.cards().filter(card => card.props.name === 'Color shirts').length, 1);
});

test('group filters cannot combine gender/program matches from different colors', t => {
  const catalog = products(2);
  catalog[0] = { ...catalog[0], variantGroupId: '0', groupTitle: 'Shared listing', colorLabel: 'Yellow', category: 'Men', subCategory: 'BSIT' };
  catalog[1] = { ...catalog[1], variantGroupId: '0', colorLabel: 'Green', category: 'Women', subCategory: 'SHS' };
  const h = harness(t, ['/collection?gender=Women&program=BSIT'], { products: catalog });
  assert.equal(h.cards().length, 0);
});

for (const count of [0, 1, 23, 24, 25, 48, 49, 1000, 10000]) {
  test(`${count} products render at most 24 cards with full result counts`, () => {
    const markup = html(products(count));
    assert.equal(cardIds(markup).length, Math.min(count, 24));
    assert.match(markup, new RegExp(`<strong[^>]*>${count}</strong>`));
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
  assert.match(html(items, url), new RegExp(`<strong[^>]*>${expected.length}</strong>`));
  assert.deepEqual(cardIds(html(items, '/collection?gender=Men&program=SHS')),
    items.filter(item => item.category === 'Men' && item.subCategory === 'SHS').slice(0, 24).map(item => item._id));
});

test('Program and Merchandise filters use their authoritative fields and preserve legacy EXTRA', () => {
  const items = [
    { ...products(1)[0], _id: 'legacy', subCategory: 'BSIT' },
    { ...products(1)[0], _id: 'dynamic-program', subCategory: 'digital-arts' },
    { ...products(1)[0], _id: 'general', subCategory: 'SHS', productCategoryCode: 'school-supplies' },
    { ...products(1)[0], _id: 'legacy-extra', subCategory: 'EXTRA' },
    { ...products(1)[0], _id: 'classified-extra', subCategory: null, productCategoryCode: 'EXTRA' },
    { ...products(1)[0], _id: 'tops', subCategory: 'BSIT', productCategoryCode: 'TOP' },
    { ...products(1)[0], _id: 'bottoms', subCategory: 'BSHM', productCategoryCode: 'BOTTOM' },
  ];
  const productCategories = [
    { name: 'Information Technology', code: 'BSIT', scope: 'program' },
    { name: 'Digital Arts', code: 'digital-arts', scope: 'program' },
    { name: 'School Supplies', code: 'school-supplies', scope: 'general' },
    { name: 'Uniform Tops', code: 'TOP', scope: 'general' },
    { name: 'Menswear', code: 'Men', scope: 'gender' },
    { name: 'Extras', code: 'EXTRA', scope: 'general' },
    { name: 'Retired Program', code: 'retired-program', scope: 'program', active: false },
  ];

  assert.deepEqual(
    cardIds(html(items, '/collection?program=BSIT', { productCategories })),
    ['legacy', 'tops'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?program=digital-arts', { productCategories })),
    ['dynamic-program'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?merchandise=school-supplies', { productCategories })),
    ['general'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?merchandise=EXTRA', { productCategories })),
    ['legacy-extra', 'classified-extra'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?merchandise=TOP', { productCategories })),
    ['tops'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?merchandise=BOTTOM', { productCategories })),
    ['bottoms'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?gender=Men&program=SHS&merchandise=school-supplies', { productCategories })),
    ['general'],
  );
  const markup = html(items, '/collection', { productCategories });
  const academicFilters = markup.slice(
    markup.indexOf('Academic program'),
    markup.indexOf('Merchandise category'),
  );
  const merchandiseFilters = markup.slice(
    markup.indexOf('Merchandise category'),
    markup.indexOf('Need something specific?'),
  );
  assert.match(academicFilters, /Digital Arts/);
  assert.match(academicFilters, /Information Technology/);
  assert.doesNotMatch(academicFilters, /EXTRA|Retired Program/);
  assert.match(merchandiseFilters, /School Supplies/);
  assert.match(merchandiseFilters, />Uniform Tops</);
  assert.match(merchandiseFilters, />Bottoms</);
  assert.equal((merchandiseFilters.match(/>Extras</g) || []).length, 1);
  assert.doesNotMatch(merchandiseFilters, /value="extra"/);
  assert.match(markup, />Menswear</);
  assert.deepEqual(
    cardIds(html(items, '/collection?gender=Men&program=BSIT&merchandise=TOP', { productCategories })),
    ['tops'],
    'Renamed display labels must not change stable filter identities',
  );
});

test('multi-value classifications preserve OR within groups, AND across groups, and explicit clearing', () => {
  const base = products(1)[0];
  const multi = {
    ...base,
    _id: 'multi',
    category: 'Men',
    subCategory: 'BSIT',
    productCategoryCode: 'TOP',
    academicPrograms: ['BSIT', 'BSCpE', 'digital-arts'],
    genders: ['Men', 'Women'],
    merchandiseCategoryCodes: ['TOP', 'BOTTOM', 'school-supplies'],
  };
  const legacy = { ...base, _id: 'legacy-scalar', category: 'Women', subCategory: 'BSHM', productCategoryCode: 'BOTTOM' };
  const explicitlyCleared = {
    ...base,
    _id: 'cleared',
    category: 'Women',
    subCategory: 'BSCpE',
    productCategoryCode: 'BOTTOM',
    academicPrograms: [],
    genders: [],
    merchandiseCategoryCodes: [],
  };
  const items = [multi, multi, legacy, explicitlyCleared];
  const productCategories = [
    { name: 'Digital Arts', code: 'digital-arts', scope: 'program' },
    { name: 'School Supplies', code: 'school-supplies', scope: 'general' },
  ];

  assert.deepEqual(cardIds(html(items, '/collection?program=BSCpE', { productCategories })), ['multi']);
  assert.deepEqual(cardIds(html(items, '/collection?program=digital-arts', { productCategories })), ['multi']);
  assert.deepEqual(cardIds(html(items, '/collection?gender=Women', { productCategories })), ['multi', 'legacy-scalar']);
  assert.deepEqual(cardIds(html(items, '/collection?merchandise=BOTTOM', { productCategories })), ['multi', 'legacy-scalar']);
  assert.deepEqual(
    cardIds(html(items, '/collection?gender=Women&program=BSCpE&merchandise=BOTTOM', { productCategories })),
    ['multi'],
  );
  assert.deepEqual(
    cardIds(html(items, '/collection?program=BSIT&program=BSCpE', { productCategories })),
    ['multi'],
  );
  assert.deepEqual(cardIds(html(items, '/collection?program=BSHM', { productCategories })), ['legacy-scalar']);
});

test('active dynamic Programs remain filterable before any product is assigned', () => {
  const productCategories = [
    { name: 'Media Arts', code: 'media-arts', scope: 'program' },
  ];
  const markup = html(products(3), '/collection?program=media-arts', { productCategories });

  assert.match(markup, /Media Arts/);
  assert.match(markup, /No matching essentials/);
  assert.deepEqual(cardIds(markup), []);
});

test('product cards present resolved dynamic category names and tolerate unknown codes', () => {
  const resolved = renderToStaticMarkup(
    react.createElement(
      router.MemoryRouter,
      {},
      react.createElement(ProductItem, {
        id: 'dynamic',
        name: 'Dynamic Uniform',
        image: [],
        price: 500,
        category: 'Men',
        subCategory: 'BSIT',
        productCategoryName: 'Digital Arts',
        collection: true,
      }),
    ),
  );
  const unknown = renderToStaticMarkup(
    react.createElement(
      router.MemoryRouter,
      {},
      react.createElement(ProductItem, {
        id: 'unknown',
        name: 'Legacy Uniform',
        image: [],
        price: 500,
        category: 'Women',
        subCategory: 'SHS',
        productCategoryName: 'retired-category',
        collection: true,
      }),
    ),
  );

  assert.match(resolved, /Men.*BSIT.*Digital Arts/);
  assert.match(unknown, /Women.*retired-category/);
});

test('product cards summarize multiple classifications without losing the full accessible label', () => {
  const markup = renderToStaticMarkup(
    react.createElement(
      router.MemoryRouter,
      {},
      react.createElement(ProductItem, {
        id: 'multi-card',
        name: 'Multi Program Uniform',
        image: [],
        price: 500,
        genders: ['Men', 'Women'],
        academicPrograms: ['BSIT', 'BSCpE', 'BSBAOM'],
        merchandiseCategoryCodes: ['TOP', 'BOTTOM'],
        academicProgramNames: ['BSIT', 'BSCpE', 'BSBAOM'],
        productCategoryNames: ['Tops', 'Bottoms'],
        collection: true,
      }),
    ),
  );

  assert.match(markup, /Men, Women.*BSIT, BSCpE \+1.*Tops, Bottoms/);
  assert.match(markup, /title="Men · Women · BSIT · BSCpE · BSBAOM · Tops · Bottoms"/);
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
  await pageTwo();
  let clearButtons = findAll(h.render(), element => element.type === 'button' && element.props.children === 'Clear all');
  assert.equal(clearButtons.length >= 2, true);
  clearButtons[0].props.onClick();
  h.render();
  assert.equal(h.params().has('page'), false);
  assert.equal(h.params().get('keep'), 'yes');
  assert.equal(h.params().has('q'), true);

  await pageTwo();
  clearButtons = findAll(h.render(), element => element.type === 'button' && element.props.children === 'Clear all');
  clearButtons.at(-1).props.onClick();
  h.render();
  assert.equal(h.params().has('page'), false);
  assert.equal(h.params().get('keep'), 'yes');
  assert.equal(h.params().has('q'), false);
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
  assert.deepEqual(card.props, {
    id: '24',
    name: 'Uniform 24',
    image: [],
    price: 24,
    priceFrom: undefined,
    BestSeller: true,
    category: 'Men',
    subCategory: 'BSIT',
    academicPrograms: ['BSIT'],
    genders: ['Men'],
    genderNames: ['Men'],
    merchandiseCategoryCodes: [],
    academicProgramNames: ['BSIT'],
    productCategoryNames: [],
    collection: true
  });
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
    category: items[24].category, subCategory: items[24].subCategory, BestSeller: items[24].BestSeller, collection: true
  })));
  assert.ok(markup.includes(card));
  assert.match(markup, /alt="Uniform 24" loading="lazy"/);
  items[24].image = [];
  assert.match(html(items, '/collection?page=2'), /Image unavailable/);
  assert.match(html([], '/collection?page=2', { productsLoading: true }), /Loading your campus essentials/);
  assert.match(html([], '/collection', { productError: 'Synthetic failure' }), /Unable to load collection/);
  assert.match(html(items, '/collection?q=not-found'), /No matching essentials/);
});
