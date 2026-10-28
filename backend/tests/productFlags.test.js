import test from 'node:test';
import assert from 'node:assert/strict';
import productModel from '../models/productModel.js';
import categoryModel from '../models/categoryModel.js';
import adminAuth from '../middleware/adminAuth.js';
import productRouter from '../routes/productRoute.js';
import { addProduct, listProducts, updateProductFlags, updateProductCategory } from '../controllers/productController.js';
import { getNewArrivalStatus, NEW_ARRIVAL_DURATION_MS } from '../../shared/productLabels.js';

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
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
    const now = Date.parse('2026-10-28T04:00:00.000Z');
    t.mock.method(Date, 'now', () => now);
    const saved = [];
    t.mock.method(productModel.prototype, 'save', async function () {
        await this.validate();
        saved.push(this.toObject());
    });
    for (const value of ['true', 'false', true, false, undefined]) {
        const res = response();
        await addProduct({ files: {}, body: { name: 'Flag test', description: 'Fixture', price: '225', category: 'Men', subCategory: 'BSIT', sizes: '["L"]', inventory: '{"L":0}', BestSeller: value, NewArrival: value, newArrivalMarkedAt: '2099-01-01' } }, res);
        assert.equal(res.body.success, true);
        assert.equal(saved.at(-1).BestSeller, value === true || value === 'true');
        assert.equal(saved.at(-1).NewArrival, value === true || value === 'true');
        const stored = saved.at(-1);
        assert.equal(stored.date, now);
        if (stored.NewArrival) assert.equal(stored.newArrivalMarkedAt.getTime(), now);
        else assert.equal(stored.newArrivalMarkedAt, undefined);
    }
});

test('flag updates support both directions, partial updates, and normal product-list responses', async t => {
    const stored = { _id: id, name: 'Keep this name', price: 225, NewArrival: false, BestSeller: false,
        academicPrograms: [], genders: [], merchandiseCategoryCodes: [] };
    t.mock.method(productModel, 'findByIdAndUpdate', async (productId, update, options) => {
        assert.equal(productId, id);
        assert.deepEqual(options, { returnDocument: 'after', runValidators: true });
        assert.deepEqual(Object.keys(update), ['$set']);
        assert.ok(Object.keys(update.$set).every(field => ['NewArrival', 'BestSeller', 'newArrivalMarkedAt'].includes(field)));
        assert.equal(Object.hasOwn(update.$set, 'newArrivalMarkedAt'), update.$set.NewArrival === true);
        Object.assign(stored, update.$set);
        return { ...stored };
    });
    t.mock.method(productModel, 'find', query => {
        if (Object.keys(query).length) return { select() { return this; }, lean: async () => [] };
        return Promise.resolve([{ ...stored }]);
    });
    for (const flags of [{ NewArrival: true, BestSeller: true }, { NewArrival: false }, { BestSeller: false }, { BestSeller: true }, { NewArrival: true }]) {
        const res = response();
        await updateProductFlags({ body: { id, ...flags, name: 'Must be ignored', price: 0 } }, res);
        assert.equal(res.body.success, true);
        for (const [field, value] of Object.entries(flags)) assert.equal(res.body.product[field], value);
        assert.equal(stored.name, 'Keep this name');
        assert.equal(stored.price, 225);
        const list = response();
        await listProducts({}, list);
        assert.deepEqual(list.body.products, [stored]);
    }
});

test('New Arrival lasts exactly 30 days and legacy dates are read without mutation', () => {
    const markedAt = Date.parse('2026-10-01T04:00:00.000Z');
    const current = { NewArrival: true, date: markedAt - NEW_ARRIVAL_DURATION_MS, newArrivalMarkedAt: new Date(markedAt) };
    const before = structuredClone(current);
    assert.equal(getNewArrivalStatus(current, markedAt).active, true);
    assert.equal(getNewArrivalStatus(current, markedAt + NEW_ARRIVAL_DURATION_MS - 1).active, true);
    assert.equal(getNewArrivalStatus(current, markedAt + NEW_ARRIVAL_DURATION_MS).expired, true);
    assert.equal(getNewArrivalStatus(current, markedAt + NEW_ARRIVAL_DURATION_MS).expiresAt, markedAt + NEW_ARRIVAL_DURATION_MS);
    assert.deepEqual(current, before);
    const legacy = { NewArrival: true, date: markedAt };
    assert.equal(getNewArrivalStatus(legacy, markedAt + 1).active, true);
    assert.equal(getNewArrivalStatus(legacy, markedAt + NEW_ARRIVAL_DURATION_MS).active, false);
    for (const date of [undefined, null, '', 'invalid', Infinity, true]) {
        assert.equal(getNewArrivalStatus({ NewArrival: true, date }, markedAt).expired, true);
    }
    assert.equal(getNewArrivalStatus({}, markedAt).enabled, false);
    assert.equal(getNewArrivalStatus({ NewArrival: false, newArrivalMarkedAt: markedAt }, markedAt).active, false);
});

test('explicit renewal uses server time, while disabling and Best Seller changes preserve the marking date', async t => {
    let now = Date.parse('2026-10-28T04:00:00.000Z');
    t.mock.method(Date, 'now', () => now);
    const creationDate = now - 3 * NEW_ARRIVAL_DURATION_MS;
    const stored = { _id: id, NewArrival: true, BestSeller: true, date: creationDate, newArrivalMarkedAt: new Date(creationDate) };
    t.mock.method(productModel, 'findByIdAndUpdate', async (productId, update) => {
        assert.equal(productId, id);
        Object.assign(stored, update.$set);
        return { ...stored };
    });
    assert.equal(getNewArrivalStatus(stored, now).expired, true);
    let res = response();
    await updateProductFlags({ body: { id, NewArrival: true, newArrivalMarkedAt: '2099-01-01' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(stored.newArrivalMarkedAt.getTime(), now);
    assert.equal(stored.date, creationDate);
    assert.equal(getNewArrivalStatus(stored, now).active, true);
    const renewedAt = stored.newArrivalMarkedAt.getTime();
    now += 1000;
    for (const flags of [{ BestSeller: false }, { BestSeller: true }, { NewArrival: false }]) {
        res = response(); await updateProductFlags({ body: { id, ...flags } }, res);
        assert.equal(res.body.success, true);
        assert.equal(stored.newArrivalMarkedAt.getTime(), renewedAt);
    }
    assert.equal(getNewArrivalStatus(stored, now).active, false);
    assert.equal(stored.BestSeller, true);
    res = response(); await updateProductFlags({ body: { id, NewArrival: true } }, res);
    assert.equal(stored.newArrivalMarkedAt.getTime(), now, 'Re-enabling explicitly starts another period');
});

test('ordinary classification editing preserves labels, inventory and the original marking date', async t => {
    const markedAt = new Date('2026-09-01T00:00:00Z');
    const stored = { _id: id, price: 225, NewArrival: true, BestSeller: true, newArrivalMarkedAt: markedAt,
        date: markedAt.getTime(), inventory: { L: 4 }, sizes: ['L'] };
    t.mock.method(productModel, 'findByIdAndUpdate', async (productId, update) => {
        assert.equal(productId, id);
        assert.deepEqual(update.$set, { genders: [], category: null });
        return { ...stored, ...update.$set };
    });
    const res = response();
    await updateProductCategory({ params: { id }, body: { genders: [] } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.product.newArrivalMarkedAt.getTime(), markedAt.getTime());
    assert.equal(res.body.product.NewArrival, true);
    assert.deepEqual(res.body.product.inventory, { L: 4 });
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
    assert.deepEqual(failed.body, { success: false, message: 'Unable to update product flags. Please try again.' });
});
