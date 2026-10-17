import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductLookup } from '../../shared/productLookup.js';
import { cartPhpTotal, phpItemsTotal, sumPhp, ORDER_FEE_PHP } from '../../shared/money.js';

const legacyTotal = (products, cart) => {
  const items = [];
  for (const [id, sizes] of Object.entries(cart)) {
    const product = products.find(item => item._id === id);
    if (!product) continue;
    for (const quantity of Object.values(sizes)) if (quantity > 0) items.push({ price: product.price, quantity });
  }
  return phpItemsTotal(items);
};
const outcome = operation => {
  try { return { value: operation() }; }
  catch (error) { return { error: error.name, message: error.message }; }
};

test('lookup retains strict equality, first matches, missing values and object identity', () => {
  const objectId = {}, symbolId = Symbol('id');
  const ids = ['1', 1, undefined, null, NaN, 0, -0, false, '', 1n, objectId, symbolId, '__proto__'];
  const products = ids.flatMap(_id => [{ _id, marker: 'first' }, { _id, marker: 'second' }]);
  const findProduct = createProductLookup(products);
  for (const id of [...ids, {}, Symbol('id'), 'missing', 'undefined', 'NaN']) {
    assert.equal(findProduct(id), products.find(product => product._id === id));
  }
  assert.equal(findProduct('1'), products[0]);
  assert.equal(findProduct(1), products[2]);
  assert.equal(findProduct(NaN), undefined);
});

test('historical primitives, null records and holes retain Array.find results and lazy failures', () => {
  const product = { _id: 'a', price: 20.1 };
  const sparse = [product];
  sparse[2] = product;
  for (const products of [[], [false, 0, '', {}, product], [product, null], [null, product], [product, undefined], sparse]) {
    const findProduct = createProductLookup(products);
    for (const id of ['a', 'missing', undefined, null]) {
      assert.deepEqual(outcome(() => findProduct(id)), outcome(() => products.find(item => item._id === id)));
    }
  }
});

test('lookup retains original objects without modifying frozen catalog entries or ordering', () => {
  const products = Object.freeze([Object.freeze({ _id: 'a', price: 0 }), Object.freeze({ _id: 'b', price: 20.1 })]);
  const findProduct = createProductLookup(products);
  assert.equal(findProduct('b'), products[1]);
  assert.equal(findProduct('a'), products[0]);
  assert.deepEqual(products.map(product => product._id), ['a', 'b']);
});

const catalog = [{ _id: 'a', price: 20.1 }, { _id: 'b', price: 0 }, { _id: 'a', price: 99 }, { _id: 1, price: 99 }];
for (const [name, products, cart] of [
  ['empty', catalog, {}],
  ['empty with missing catalog', undefined, {}],
  ['single', catalog, { a: { M: 1 } }],
  ['multiple sizes and free product', catalog, { a: { M: 2, L: 1 }, b: { S: 3 } }],
  ['deleted product', catalog, { deleted: { M: 2 }, a: { L: 1 } }],
  ['strict numeric mismatch', catalog, { 1: { M: 1 } }],
  ['negative and zero quantities skipped', catalog, { a: { M: -1, L: 0 }, b: { S: 1 } }],
  ['quantity change', catalog, { a: { M: 3 } }],
  ['fractional quantity rejected', catalog, { a: { M: 1.5 } }],
  ['string quantity rejected', catalog, { a: { M: '2' } }],
  ['fractional cent rejected', [{ _id: 'a', price: 1.001 }], { a: { M: 1 } }],
  ['null after first match', [...catalog, null], { a: { M: 1 } }],
  ['null before match', [null, ...catalog], { a: { M: 1 } }],
  ['missing size record', catalog, { a: null }]
]) {
  test(`cart arithmetic is identical: ${name}`, () => {
    const before = outcome(() => legacyTotal(products, cart));
    assert.deepEqual(outcome(() => cartPhpTotal(products, cart)), before);
    assert.deepEqual(outcome(() => sumPhp(cartPhpTotal(products, cart), ORDER_FEE_PHP)), outcome(() => sumPhp(legacyTotal(products, cart), 10)));
  });
}

test('fresh catalogs, deleted products and price changes are never globally cached', () => {
  const original = { _id: 'a', price: 20.1 };
  const products = [original], cart = { a: { M: 2 } };
  assert.equal(cartPhpTotal(products, cart), 40.2);
  original.price = 30.1;
  assert.equal(cartPhpTotal(products, cart), 60.2);
  products.splice(0, 1);
  assert.equal(cartPhpTotal(products, cart), 0);
  const refreshed = [{ _id: 'a', price: 10.1 }];
  assert.equal(createProductLookup(refreshed)('a'), refreshed[0]);
  assert.equal(cartPhpTotal(refreshed, cart), 20.2);
});

test('normal repeated lookup work reads each product ID once per calculation', () => {
  let reads = 0;
  const products = Array.from({ length: 1000 }, (_, index) => ({
    get _id() { reads++; return String(index); }, price: 20.1
  }));
  const cart = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(950 + i), { M: 1, L: 2 }]));
  assert.equal(cartPhpTotal(products, cart), 3015);
  assert.equal(reads, 1000);
});
