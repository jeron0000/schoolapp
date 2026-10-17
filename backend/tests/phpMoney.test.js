import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import { v2 as cloudinary } from 'cloudinary';
import { addProduct } from '../controllers/productController.js';
import { confirmCashierPayment } from '../controllers/cashierController.js';
import { mockReceiptConnection } from './helpers/receiptConnection.js';
import { createReservedOrder } from '../utils/inventory.js';
import { stripeMinorUnits } from '../utils/stripePayment.js';
import { paypalMinorUnits } from '../utils/paypalPayment.js';
import { cartPhpTotal, formatOrderMoney, formatPhp, orderPhpTotals, phpFromMinorUnits, phpItemsTotal, phpLineTotal, phpMinorUnits, sumPhp } from '../../shared/money.js';

const id = '0123456789abcdef01234567';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('decimal PHP parsing and arithmetic stay exact without rounding, FX or repeated scaling', () => {
    assert.equal(phpMinorUnits(20.10), 2010);
    assert.equal(phpMinorUnits('20.10'), 2010);
    assert.equal(phpFromMinorUnits(2010), 20.1);
    assert.equal(phpLineTotal(20.10, 3), 60.3);
    assert.equal(sumPhp(phpLineTotal(20.10, 3), 10), 70.3);
    assert.equal(sumPhp(0.1, 0.2), 0.3);
    assert.equal(phpItemsTotal([{ price: 0.1, quantity: 3 }, { price: 0.2, quantity: 1 }]), 0.5);
    assert.equal(phpItemsTotal([{ price: 0, quantity: 3 }]), 0);
    assert.equal(phpMinorUnits(500), 50000);
    assert.equal(phpFromMinorUnits(50000), 500);
});

test('fractional cents, malformed and unsafe amounts never silently become valid money', () => {
    for (const value of [0.1 + 0.2, 1.005, '1.001', -1, '-1', NaN, Infinity, '', null, {}, [], true, '1e9999', Number.MAX_SAFE_INTEGER]) {
        assert.throws(() => phpMinorUnits(value), String(value));
    }
    assert.throws(() => phpLineTotal(1, 0.5));
    assert.throws(() => phpLineTotal(80000000000000, 2));
    assert.throws(() => sumPhp(80000000000000, 80000000000000));
    assert.throws(() => phpFromMinorUnits(Number.MAX_SAFE_INTEGER));
});

test('PHP formatting and historical order display do not relabel foreign or unknown money', () => {
    assert.equal(formatPhp(500), '₱500.00');
    assert.equal(formatPhp(0), '₱0.00');
    assert.equal(formatPhp(null), 'Unavailable');
    assert.equal(formatOrderMoney(500, { paymentCurrency: 'PHP' }), '₱500.00');
    assert.equal(formatOrderMoney(500, { paymentCurrency: 'USD' }), '500.00 USD');
    assert.equal(formatOrderMoney(500, {}), '500.00 (currency unverified)');
    assert.equal(formatOrderMoney(1.005, { paymentCurrency: 'PHP' }), '1.005 PHP (precision needs review)');
    const order = { amount: 70.3, paymentCurrency: 'PHP', items: [{ price: 20.1, quantity: 3 }] };
    const before = structuredClone(order);
    assert.deepEqual(orderPhpTotals(order), { subtotal: 60.3, fee: 10 });
    assert.deepEqual(order, before);
    assert.deepEqual(orderPhpTotals({ ...order, amount: 70.301 }), { subtotal: null, fee: null });
});

test('cart arithmetic rejects ambiguous existing product prices and skips deleted product entries', () => {
    const cart = { [id]: { M: 3 }, deleted: { L: 2 } };
    assert.equal(cartPhpTotal([{ _id: id, price: 20.1 }], cart), 60.3);
    assert.throws(() => cartPhpTotal([{ _id: id, price: 1.001 }], cart));
});

test('new product prices are validated before Cloudinary or persistence, including legitimate zero', async t => {
    t.mock.method(cloudinary.uploader, 'upload_stream', () => assert.fail('No provider call'));
    let saves = 0;
    t.mock.method(productModel.prototype, 'save', async function () { await this.validate(); saves++; });
    const body = { name: 'Synthetic', description: 'PHP fixture', category: 'Men', subCategory: 'BSIT', sizes: '["M"]', inventory: '{"M":1}' };
    for (const price of ['1.001', '-1', '', null, {}, Infinity, '90071992547410']) {
        const res = response();
        await addProduct({ body: { ...body, price }, files: {} }, res);
        assert.equal(res.code, 400);
        assert.equal(res.body.success, false);
    }
    assert.equal(saves, 0);
    for (const price of ['0', '20.10']) {
        const res = response();
        await addProduct({ body: { ...body, price }, files: {} }, res);
        assert.equal(res.body.success, true);
    }
    assert.equal(saves, 2);
    for (const price of [-1, 1.001, Infinity]) await assert.rejects(new productModel({ ...body, price }).validate());
});

test('canonical order amounts use server product prices and the existing fee, with rollback on invalid pricing', async t => {
    let stock = 4, price = 20.1, saved;
    t.mock.method(orderModel, 'init', async () => {});
    t.mock.method(orderModel, 'findOne', () => ({ session() { return this; }, then(resolve, reject) { return Promise.resolve(null).then(resolve, reject); } }));
    t.mock.method(mongoose.connection, 'transaction', async callback => {
        const before = stock;
        try { return await callback({}); } catch (error) { stock = before; throw error; }
    });
    t.mock.method(productModel, 'findById', () => ({ session() { return this; }, lean: async () => ({ name: 'Synthetic', price, sizes: ['M'], image: [] }) }));
    t.mock.method(productModel, 'updateOne', async (_filter, update) => { stock += update.$inc['inventory.M']; return { modifiedCount: 1 }; });
    t.mock.method(orderModel, 'create', async ([data]) => { saved = data; return [{ _id: id, ...data }]; });
    const request = { userId: id, requestId: 'php-synthetic-request-123', paymentMethod: 'COD', paymentCurrency: 'PHP', amount: 1, items: [{ _id: id, size: 'M', quantity: 3, price: 0.01 }] };
    await createReservedOrder(request);
    assert.equal(saved.amount, 70.3);
    assert.equal(saved.items[0].price, 20.1);
    assert.equal(stock, 1);
    const historical = structuredClone(saved);
    for (const invalid of [1.001, NaN, -1, 80000000000000]) {
        price = invalid;
        await assert.rejects(createReservedOrder(request));
        assert.equal(stock, 1);
        assert.deepEqual(saved, historical);
    }
});

test('Cashier refuses currency/precision anomalies without changing records or creating receipts', async t => {
    t.mock.method(orderModel.collection, 'createIndex', () => assert.fail('No receipt index for invalid payment'));
    t.mock.method(orderModel, 'findOneAndUpdate', () => assert.fail('No invalid confirmation'));
    for (const fields of [{ amount: 1.001, paymentCurrency: 'PHP' }, { amount: 20.1 }, { amount: 20.1, paymentCurrency: 'USD' }]) {
        const record = { _id: id, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', ...fields };
        t.mock.method(orderModel, 'findById', async () => record);
        const before = structuredClone(record), res = response();
        await confirmCashierPayment({ body: { orderId: id, paymentMethod: 'COD', receiptNumber: 'OR-test' } }, res);
        assert.equal(res.code, 409);
        assert.deepEqual(record, before);
    }
});

test('Cashier confirms the stored decimal PHP total without trusting submitted amounts', async t => {
    mockReceiptConnection(t, orderModel);
    const current = { _id: id, status: 'Sent to Cashier', payment: false, paymentMethod: 'COD', paymentCurrency: 'PHP', amount: 70.3 };
    t.mock.method(orderModel, 'findById', async () => current);
    t.mock.method(orderModel.collection, 'createIndex', async () => {});
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update) => {
        assert.equal(filter.amount, 70.3);
        assert.equal(filter.paymentCurrency, 'PHP');
        assert.equal(update.$set.amount, undefined);
        return { ...current, ...update.$set };
    });
    const res = response();
    await confirmCashierPayment({ body: { orderId: id, paymentMethod: 'COD', receiptNumber: 'OR-test', amount: 1 }, staff: { identity: 'synthetic' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.order.amount, 70.3);
});

test('dormant provider converters agree with the approved PHP centavo contract', () => {
    for (const amount of [0, 20.1, 70.3, 500]) {
        assert.equal(stripeMinorUnits(amount), phpMinorUnits(amount));
        assert.equal(paypalMinorUnits(amount), phpMinorUnits(amount));
    }
    for (const invalid of [1.001, 0.1 + 0.2, -1, Infinity]) {
        assert.throws(() => stripeMinorUnits(invalid));
        assert.throws(() => paypalMinorUnits(invalid));
    }
});
