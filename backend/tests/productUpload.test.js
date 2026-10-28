import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import productModel from '../models/productModel.js';
import categoryModel from '../models/categoryModel.js';
import mongoose from 'mongoose';
import productRouter from '../routes/productRoute.js';
import { addProduct, addProductListing } from '../controllers/productController.js';
import adminAuth from '../middleware/adminAuth.js';
import { apiErrorHandler } from '../middleware/apiErrorHandler.js';
import { ADMIN_SUBJECT } from '../../shared/authPolicy.js';
import { issueAuthToken } from '../utils/authTokens.js';
import { PRODUCT_IMAGE_MAX_BYTES, uploadProductImages, validateProductImage } from '../utils/productImages.js';

process.env.JWT_SECRET = 'product-upload-test-only-secret';
process.env.ADMIN_EMAIL = 'product-upload-admin-test';
process.env.ADMIN_PASSWORD = 'product-upload-password';

beforeEach(t => {
    t.mock.method(categoryModel, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ZsAAAAASUVORK5CYII=', 'base64');
const file = (overrides = {}) => ({ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'uniform.png', fieldname: 'image1', ...overrides });
const fields = {
    name: 'Synthetic uniform', description: 'Upload security fixture', price: '225', category: 'Men',
    subCategory: 'BSIT', BestSeller: 'false', NewArrival: 'false', sizes: '["M"]', inventory: '{"M":1}'
};

function provider(t, { failAt = 0, destroyError = false } = {}) {
    const calls = { uploads: [], deletes: [] };
    t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => {
        const index = calls.uploads.push(options);
        return new Writable({
            write(chunk, _encoding, next) { assert.deepEqual(chunk, png); next(); },
            final(next) {
                if (index === failAt) callback(new Error('private provider failure'));
                else callback(null, {
                    secure_url: `https://res.cloudinary.com/test/image/upload/${options.public_id}.png`,
                    public_id: options.public_id, resource_type: 'image', format: 'png', width: 1, height: 1
                });
                next();
            }
        });
    });
    t.mock.method(cloudinary.uploader, 'destroy', async (publicId, options) => {
        calls.deletes.push({ publicId, options });
        if (destroyError) throw new Error('private cleanup failure');
        return { result: 'ok' };
    });
    return calls;
}

async function server(t) {
    const app = express();
    app.use('/api/product', productRouter);
    app.use(apiErrorHandler);
    const listener = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve())));
    await new Promise(resolve => listener.once('listening', resolve));
    return { base: `http://127.0.0.1:${listener.address().port}/api/product`, port: listener.address().port };
}

const form = (images = [], extraFields = {}) => {
    const body = new FormData();
    for (const [name, value] of Object.entries({ ...fields, ...extraFields })) body.set(name, value);
    images.forEach(({ buffer = png, type = 'image/png', field = 'image1', name = 'uniform.png' }) => {
        body.set(field, new Blob([buffer], { type }), name);
    });
    return body;
};

test('product upload middleware is bounded, in-memory and remains behind Admin authorization', () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/add').route;
    assert.equal(route.stack[0].handle, adminAuth);
    assert.equal(route.stack.length, 3);
    assert.match(route.stack[1].name, /multer/i);
});

test('product image validation uses bytes rather than client names or MIME alone', () => {
    validateProductImage(file());
    validateProductImage(file({ mimetype: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 224]) }));
    validateProductImage(file({ mimetype: 'image/webp', buffer: Buffer.from('RIFFxxxxWEBPVP8 ') }));
    for (const invalid of [file({ buffer: Buffer.alloc(0) }), file({ buffer: Buffer.from('MZ'), mimetype: 'image/png' }),
        file({ mimetype: 'image/jpeg' }), file({ buffer: Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES + 1) })]) {
        assert.throws(() => validateProductImage(invalid));
    }
});

test('Cloudinary uploads use unique server IDs and compensate partial provider failures', async t => {
    const calls = provider(t);
    const first = await uploadProductImages([file(), file({ fieldname: 'image2' })]);
    assert.equal(first.length, 2);
    assert.equal(new Set(calls.uploads.map(call => call.public_id)).size, 2);
    assert(calls.uploads.every(call => /^pamo\/products\/[a-f\d-]{36}$/.test(call.public_id)));
    assert(calls.uploads.every(call => call.overwrite === false && call.resource_type === 'image'));

    const failing = provider(t, { failAt: 2 });
    await assert.rejects(uploadProductImages([file(), file({ fieldname: 'image2' })]), /No product was created/);
    assert.deepEqual(failing.deletes.map(call => call.publicId), failing.uploads.map(call => call.public_id));
});

test('real product route accepts valid and image-free products and rejects unsafe multipart input', async t => {
    const calls = provider(t);
    const saved = [];
    t.mock.method(productModel.prototype, 'save', async function () {
        await this.validate();
        saved.push(this.toObject());
    });
    const { base } = await server(t);
    const token = issueAuthToken(ADMIN_SUBJECT, 'admin');
    const send = body => fetch(base + '/add', { method: 'POST', headers: { token }, body });

    let response = await send(form([{ buffer: png, name: '../same-name.png' }]));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(saved[0].image.length, 1);
    assert.equal(calls.uploads.length, 1);

    response = await send(form([], {
        sizes: '["XL","S","L","M"]', inventory: '{"XL":4,"S":1,"L":3,"M":2}'
    }));
    assert.equal((await response.json()).success, true);
    assert.deepEqual(saved[1].image, []);
    assert.deepEqual(saved[1].sizes, ['S', 'M', 'L', 'XL']);
    assert.deepEqual(Object.fromEntries(saved[1].inventory), { XL: 4, S: 1, L: 3, M: 2 });

    response = await send(form([], { genders: '["Men"]', academicPrograms: '["BSIT"]', merchandiseCategoryCodes: '["TOP"]' }));
    assert.equal((await response.json()).success, true, 'The current Add Items fields must fit the multipart limits');

    for (const [body, status] of [
        [form([{ type: 'image/svg+xml', buffer: Buffer.from('<svg/>') }]), 400],
        [form([{ type: 'image/png', buffer: Buffer.from('not an image') }]), 400],
        [form([{ type: 'image/png', buffer: Buffer.alloc(PRODUCT_IMAGE_MAX_BYTES + 1) }]), 413],
        [form([{ field: 'unexpected' }]), 400]
    ]) {
        response = await send(body);
        assert.equal(response.status, status);
        assert.equal((await response.json()).success, false);
    }
    response = await fetch(base + '/add', { method: 'POST', headers: { token, 'Content-Type': 'multipart/form-data' }, body: 'broken' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
    assert.equal(calls.uploads.length, 1);
});

test('unauthorized malformed uploads are rejected before multipart parsing', async t => {
    t.mock.method(cloudinary.uploader, 'upload_stream', () => assert.fail('Unauthorized request must not upload'));
    t.mock.method(productModel.prototype, 'save', () => assert.fail('Unauthorized request must not persist'));
    const { base } = await server(t);
    const response = await fetch(base + '/add', {
        method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'deliberately malformed'
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).success, false);
});

test('concurrent same-name uploads cannot share provider identifiers', async t => {
    const calls = provider(t);
    t.mock.method(productModel.prototype, 'save', async function () { await this.validate(); });
    const { base } = await server(t);
    const token = issueAuthToken(ADMIN_SUBJECT, 'admin');
    const responses = await Promise.all(Array.from({ length: 4 }, () => fetch(base + '/add', {
        method: 'POST', headers: { token }, body: form([{ name: 'same.png' }])
    })));
    assert(responses.every(response => response.status === 200));
    assert.equal(new Set(calls.uploads.map(call => call.public_id)).size, 4);
});

test('persistence failure removes uploaded images and an aborted body reaches neither provider nor database', async t => {
    const calls = provider(t);
    t.mock.method(productModel.prototype, 'save', async () => { throw new Error('private database failure'); });
    const { base, port } = await server(t);
    const token = issueAuthToken(ADMIN_SUBJECT, 'admin');
    const response = await fetch(base + '/add', { method: 'POST', headers: { token }, body: form([{ buffer: png }]) });
    assert.equal((await response.json()).success, false);
    assert.equal(calls.deletes.length, 1);

    const beforeUploads = calls.uploads.length;
    const request = http.request({
        host: '127.0.0.1', port, path: '/api/product/add', method: 'POST',
        headers: { token, 'Content-Type': 'multipart/form-data; boundary=abort-boundary' }
    });
    request.on('error', () => {});
    request.write('--abort-boundary\r\nContent-Disposition: form-data; name="image1"; filename="same.png"\r\nContent-Type: image/png\r\n\r\n');
    request.write(png.subarray(0, 12));
    request.destroy();
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(calls.uploads.length, beforeUploads);
});

test('a response failure after persistence never deletes images owned by the saved product', async t => {
    const calls = provider(t);
    t.mock.method(productModel.prototype, 'save', async function () { await this.validate(); });
    let attempts = 0;
    const response = {
        headersSent: false,
        status(code) { this.code = code; return this; },
        json(body) {
            attempts++;
            if (attempts === 1) throw new Error('response unavailable');
            this.body = body;
            return this;
        }
    };
    await addProduct({ body: fields, files: { image1: [file()] } }, response);
    assert.equal(calls.uploads.length, 1);
    assert.equal(calls.deletes.length, 0);
    assert.equal(response.code, 500);
    assert.match(response.body.message, /saved/i);
});

const listingItems = () => [
    { ...fields, name: 'Classic Shirt', optionLabel: 'Classic Shirt' },
    { ...fields, name: 'Washday Shirt', optionLabel: 'Washday Shirt', price: '350.50', sizes: '["4XL"]', inventory: '{"4XL":7}',
        sizeGuide: JSON.stringify({ fields: [{ key: 'chest', label: 'Chest circumference' }], measurements: [{ size: '4XL', values: { chest: 130 } }] }) }
];

const listingForm = (items = listingItems(), images = []) => {
    const body = new FormData();
    body.set('groupTitle', 'Campus Shirts');
    body.set('items', JSON.stringify(items));
    for (const field of images) body.set(field, new Blob([png], { type: 'image/png' }), 'shirt.png');
    return body;
};

test('multi-item route creates independent products and images atomically behind Admin auth', async t => {
    const calls = provider(t);
    let products;
    const session = { isolated: true };
    t.mock.method(mongoose.connection, 'transaction', async work => work(session));
    t.mock.method(productModel, 'create', async (records, options) => {
        assert.equal(options.session, session);
        assert.equal(options.ordered, true, 'Transaction writes must run sequentially');
        products = records;
        for (const record of records) await new productModel(record).validate();
        return records;
    });
    const { base } = await server(t);
    const token = issueAuthToken(ADMIN_SUBJECT, 'admin');
    const response = await fetch(base + '/add-listing', { method: 'POST', headers: { token }, body: listingForm(undefined, ['item0image1', 'item1image2']) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(products.length, 2);
    assert.notEqual(String(products[0]._id), String(products[1]._id));
    assert.ok(products.every(item => String(item.variantGroupId) === String(products[0]._id)));
    assert.equal(products[0].groupTitle, 'Campus Shirts');
    assert.equal(products[1].groupTitle, undefined);
    assert.equal(products[0].optionLabel, 'Classic Shirt');
    assert.equal(products[1].colorLabel, undefined);
    assert.equal(products[1].price, 350.5);
    assert.deepEqual(products[0].inventory, { M: 1 });
    assert.deepEqual(products[1].inventory, { '4XL': 7 });
    assert.equal(products[1].sizeGuide.measurements[0].values.chest, 130);
    assert.equal(products[0].image[0], `https://res.cloudinary.com/test/image/upload/${calls.uploads[0].public_id}.png`);
    assert.equal(products[1].image[0], `https://res.cloudinary.com/test/image/upload/${calls.uploads[1].public_id}.png`);
    assert.equal(calls.deletes.length, 0);
});

test('multi-item validation rejects duplicates, invalid items, and unrelated files before uploading', async t => {
    const calls = provider(t);
    t.mock.method(productModel, 'create', () => assert.fail('Invalid listing cannot persist'));
    const { base } = await server(t);
    const token = issueAuthToken(ADMIN_SUBJECT, 'admin');
    const duplicate = listingItems();
    duplicate[1].optionLabel = ' classic  shirt ';
    const invalid = listingItems();
    invalid[1].price = '12.001';
    const invalidStock = listingItems();
    invalidStock[1].inventory = '{"4XL":-1}';
    for (const body of [listingForm(duplicate), listingForm(invalid), listingForm(invalidStock), listingForm([listingItems()[0]]), listingForm(undefined, ['item7image1'])]) {
        const response = await fetch(base + '/add-listing', { method: 'POST', headers: { token }, body });
        assert.equal(response.status, 400);
        assert.equal((await response.json()).success, false);
    }
    const unauthorized = await fetch(base + '/add-listing', { method: 'POST', body: listingForm() });
    assert.equal(unauthorized.status, 401);
    assert.equal(calls.uploads.length, 0);
});

test('failed listing transactions compensate all item images; uncertain commits preserve them', async t => {
    const calls = provider(t);
    let stored = [];
    t.mock.method(productModel, 'create', async products => {
        stored.push(products[0]);
        throw new Error('isolated transaction failure');
    });
    t.mock.method(mongoose.connection, 'transaction', async work => {
        try { await work({ isolated: true }); } catch (error) { stored = []; throw error; }
    });
    const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
    const req = { body: { groupTitle: 'Campus Shirts', items: JSON.stringify(listingItems()) }, files: { item0image1: [file()], item1image1: [file()] } };
    let res = response();
    await addProductListing(req, res);
    assert.equal(res.body.success, false);
    assert.equal(stored.length, 0);
    assert.equal(calls.deletes.length, 2);
    t.mock.method(mongoose.connection, 'transaction', async () => {
        const error = new Error('uncertain commit');
        error.hasErrorLabel = label => label === 'UnknownTransactionCommitResult';
        throw error;
    });
    res = response();
    await addProductListing(req, res);
    assert.equal(res.code, 503);
    assert.match(res.body.message, /Refresh/);
    assert.equal(calls.deletes.length, 2, 'Uncertain commits must not delete potentially owned images');
});
