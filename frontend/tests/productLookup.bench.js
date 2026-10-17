// Run with: node --expose-gc frontend/tests/productLookup.bench.js
import process from 'node:process';
import assert from 'node:assert/strict';
import { createProductLookup } from '../../shared/productLookup.js';
import { cartPhpTotal, phpItemsTotal } from '../../shared/money.js';

const legacyTotal = (products, cart) => {
  const items = [];
  for (const [id, sizes] of Object.entries(cart)) {
    const product = products.find(item => item._id === id);
    if (!product) continue;
    for (const quantity of Object.values(sizes)) if (quantity > 0) items.push({ price: product.price, quantity });
  }
  return phpItemsTotal(items);
};
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const measure = operation => {
  const samples = [];
  for (let i = 0; i < 36; i++) {
    const start = performance.now();
    operation();
    if (i >= 5) samples.push(performance.now() - start);
  }
  return Number(median(samples).toFixed(4));
};

const results = [];
for (const [count, entries] of [[100, 10], [1000, 50], [10000, 100]]) {
  const products = Array.from({ length: count }, (_, i) => ({ _id: String(i), price: 20.1 }));
  const ids = products.slice(-entries).map(product => product._id);
  const cart = Object.fromEntries(ids.map(id => [id, { M: 1 }]));
  assert.equal(cartPhpTotal(products, cart), legacyTotal(products, cart));
  let reads = 0;
  const counted = products.map(product => ({ get _id() { reads++; return product._id; }, price: product.price }));
  legacyTotal(counted, cart);
  const oldReads = reads;
  reads = 0;
  cartPhpTotal(counted, cart);
  const newReads = reads;
  const findProduct = createProductLookup(products);
  const legacyMs = measure(() => legacyTotal(products, cart));
  const completeIndexedMs = measure(() => cartPhpTotal(products, cart));
  const indexBuildMs = measure(() => createProductLookup(products));
  const reusedLookupMs = measure(() => ids.map(id => findProduct(id)));
  let retainedHeapBytes = null;
  if (globalThis.gc) {
    globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    const retained = Array.from({ length: 32 }, () => createProductLookup(products));
    globalThis.gc();
    retainedHeapBytes = Math.round((process.memoryUsage().heapUsed - before) / retained.length);
    for (const lookup of retained) assert.equal(lookup(ids[0]), products[count - entries]);
  }
  results.push({ products: count, cartEntries: entries, oldReads, newReads, legacyMs, completeIndexedMs, indexBuildMs, reusedLookupMs, retainedHeapBytes });
}
console.log(JSON.stringify({ note: 'Synthetic Node medians: 5 warmups, 31 samples; heap deltas are approximate. No browser speed claim.', results }, null, 2));
