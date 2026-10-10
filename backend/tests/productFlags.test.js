import test from 'node:test';
import assert from 'node:assert/strict';
import productModel from '../models/productModel.js';
import adminAuth from '../middleware/adminAuth.js';
import productRouter from '../routes/productRoute.js';
import { addProduct, listProducts, updateProductFlags } from '../controllers/productController.js';

const id = '0123456789abcdef01234567';
const response = () => ({ json(body) { this.body = body; return this; } });

test('product flags route resolves its named controller and retains admin authorization', () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/flags').route;
    assert.equal(route.methods.post, true);
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, updateProductFlags]);
    assert.equal(productModel.schema.path('NewArrival').instance, 'Boolean');
    assert.equal(productModel.schema.path('BestSeller').instance, 'Boolean');
});

test('product creation retains both merchandising flags from multipart and JSON values', async t => {
    t.mock.method(console, 'log', () => {});
    const saved = [];
    t.mock.method(productModel.prototype, 'save', async function () {
        await this.validate();
        saved.push(this.toObject());
    });
    for (const value of ['true', 'false', true, false, undefined]) {
        const res = response();
        await addProduct({ files: {}, body: { name: 'Flag test', description: 'Fixture', price: '225', category: 'Men', subCategory: 'Topwear', sizes: '["L"]', inventory: '{"L":0}', BestSeller: value, NewArrival: value } }, res);
        assert.equal(res.body.success, true);
        assert.equal(saved.at(-1).BestSeller, value === true || value === 'true');
        assert.equal(saved.at(-1).NewArrival, value === true || value === 'true');
    }
});

test('flag updates support both directions, partial updates, and normal product-list responses', async t => {
    const stored = { _id: id, name: 'Keep this name', NewArrival: false, BestSeller: false };
    t.mock.method(productModel, 'findByIdAndUpdate', async (productId, update, options) => {
        assert.equal(productId, id);
        assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
        assert.deepEqual(Object.keys(update), ['$set']);
        assert.ok(Object.keys(update.$set).every(field => ['NewArrival', 'BestSeller'].includes(field)));
        Object.assign(stored, update.$set);
        return { ...stored };
    });
    t.mock.method(productModel, 'find', async query => { assert.deepEqual(query, {}); return [{ ...stored }]; });
    for (const flags of [{ NewArrival: true, BestSeller: true }, { NewArrival: false }, { BestSeller: false }, { BestSeller: true }, { NewArrival: true }]) {
        const res = response();
        await updateProductFlags({ body: { id, ...flags, name: 'Must be ignored', price: 0 } }, res);
        assert.equal(res.body.success, true);
        for (const [field, value] of Object.entries(flags)) assert.equal(res.body.product[field], value);
        assert.equal(stored.name, 'Keep this name');
        assert.equal(stored.price, undefined);
        const list = response();
        await listProducts({}, list);
        assert.deepEqual(list.body.products, [stored]);
    }
});

test('invalid IDs, invalid booleans, and empty flag updates never reach the database', async t => {
    t.mock.method(productModel, 'findByIdAndUpdate', () => assert.fail('Unexpected database update'));
    for (const body of [{ id: 'invalid', BestSeller: true }, { id: { $ne: null }, NewArrival: true }, { id }, { id, price: 0 }, { id, NewArrival: 'false' }, { id, BestSeller: null }, { id, BestSeller: true, NewArrival: [] }]) {
        const res = response();
        await updateProductFlags({ body }, res);
        assert.equal(res.body.success, false);
    }
});

test('missing products and database failures return the existing error response shape', async t => {
    t.mock.method(console, 'log', () => {});
    const update = t.mock.method(productModel, 'findByIdAndUpdate', async () => null);
    const missing = response();
    await updateProductFlags({ body: { id, BestSeller: true } }, missing);
    assert.deepEqual(missing.body, { success: false, message: 'Product not found' });
    update.mock.mockImplementation(async () => { throw new Error('Database unavailable'); });
    const failed = response();
    await updateProductFlags({ body: { id, NewArrival: true } }, failed);
    assert.deepEqual(failed.body, { success: false, message: 'Database unavailable' });
});
