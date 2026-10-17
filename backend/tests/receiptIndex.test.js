import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import orderModel from '../models/orderModel.js';
import { confirmCashierPayment } from '../controllers/cashierController.js';
import { mockReceiptConnection } from './helpers/receiptConnection.js';
import { ensureReceiptIndex } from '../utils/receiptIndex.js';

const ids = ['1', '2', '3'].map(digit => digit.repeat(24));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((success, failure) => { resolve = success; reject = failure; });
    return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const failureMessage = 'Unable to confirm payment. Refresh and check the order before trying again.';

const fixture = (t, initialize = async () => 'cashier_receipt_unique') => {
    const indexCalls = [], writes = [];
    const rows = new Map(ids.map(_id => [_id, {
        _id, status: 'Sent to Cashier', payment: false,
        paymentMethod: 'COD', paymentCurrency: 'PHP', amount: 70.3
    }]));
    const context = mockReceiptConnection(t, orderModel, (...args) => {
        indexCalls.push(args);
        return initialize(...args);
    });
    t.mock.method(orderModel, 'findById', async id => ({ ...rows.get(id) }));
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update, options) => {
        writes.push({ filter, update, options });
        const current = rows.get(filter._id);
        if (Object.entries(filter).some(([key, value]) => current[key] !== value)) return null;
        Object.assign(current, update.$set);
        return { ...current };
    });
    const confirm = async (id = ids[0], receiptNumber = `OR-${id}`) => {
        const res = {
            code: 200,
            status(code) { this.code = code; return this; },
            json(body) { this.body = body; return this; }
        };
        await confirmCashierPayment({
            body: { orderId: id, receiptNumber, paymentMethod: 'COD' },
            staff: { identity: 'cashier@school.test' }
        }, res);
        return res;
    };
    return { ...context, indexCalls, writes, rows, confirm };
};

test('receipt readiness preserves the exact partial unique index and payment CAS', async t => {
    const f = fixture(t);
    assert.equal((await f.confirm()).code, 200);
    assert.deepEqual(f.indexCalls, [[{ receiptNumber: 1 }, {
        name: 'cashier_receipt_unique', unique: true,
        partialFilterExpression: { receiptNumber: { $type: 'string' } }
    }]]);
    assert.deepEqual(f.writes[0].filter, {
        _id: ids[0], status: 'Sent to Cashier', payment: false,
        paymentMethod: 'COD', amount: 70.3, paymentCurrency: 'PHP'
    });
    assert.deepEqual(f.writes[0].options, { new: true, runValidators: true });
    assert.deepEqual(Object.keys(f.writes[0].update.$set).sort(), [
        'confirmedBy', 'paidAt', 'payment', 'paymentMethod', 'receiptNumber', 'status'
    ]);
    // Historical records without receipt metadata remain valid; no index migration/backfill.
    assert.equal(orderModel.schema.path('receiptNumber').options.required, undefined);
    assert.equal(orderModel.schema.path('receiptNumber').options.default, undefined);
});

test('successful readiness is reused for subsequent eligible confirmations', async t => {
    const f = fixture(t);
    assert.equal((await f.confirm()).code, 200);
    assert.equal((await f.confirm(ids[1])).code, 200);
    assert.equal(f.indexCalls.length, 1);
    assert.equal(f.writes.length, 2);
});

test('concurrent confirmations share pending readiness and cannot write early', async t => {
    const pending = deferred(), f = fixture(t, () => pending.promise);
    const first = f.confirm(), second = f.confirm(ids[1]);
    await tick();
    assert.equal(f.indexCalls.length, 1);
    assert.equal(f.writes.length, 0);
    pending.resolve('cashier_receipt_unique');
    assert.deepEqual((await Promise.all([first, second])).map(res => res.code), [200, 200]);
    assert.equal(f.writes.length, 2);
});

test('initialization failure is sanitized, blocks writes, and permits a subsequent retry', async t => {
    let attempts = 0;
    const f = fixture(t, async () => {
        if (++attempts === 1) throw new Error('Synthetic internal index error');
    });
    const failed = await f.confirm();
    assert.equal(failed.code, 500);
    assert.equal(failed.body.message, failureMessage);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.confirm()).code, 200);
    assert.equal(f.indexCalls.length, 2);
});

test('index conflicts and duplicate receipt writes retain the existing 409 response', async t => {
    const f = fixture(t, async () => { throw Object.assign(new Error('Duplicate'), { code: 11000 }); });
    const conflict = await f.confirm();
    assert.equal(conflict.code, 409);
    assert.equal(conflict.body.message, 'This Official Receipt Number is already recorded.');
    assert.equal(f.writes.length, 0);
    f.collection.createIndex = async () => {};
    t.mock.method(orderModel, 'findOneAndUpdate', async () => { throw { code: 11000 }; });
    assert.equal((await f.confirm()).code, 409);
});

test('repeated and concurrent confirmations retain exactly-once payment behavior', async t => {
    const f = fixture(t);
    const responses = await Promise.all([f.confirm(), f.confirm()]);
    assert.deepEqual(responses.map(res => res.code).sort(), [200, 409]);
    assert.equal((await f.confirm()).code, 409);
    assert.equal(f.indexCalls.length, 1);
    assert.equal(f.rows.get(ids[0]).payment, true);
    assert.equal(f.rows.get(ids[0]).status, 'Packing');
});

test('a disconnected connection fails closed without initializing or paying', async t => {
    const f = fixture(t);
    f.connection.readyState = 0;
    const res = await f.confirm();
    assert.equal(res.code, 500);
    assert.equal(res.body.message, failureMessage);
    assert.equal(f.indexCalls.length, 0);
    assert.equal(f.writes.length, 0);
});

test('disconnect and reconnect invalidate successful readiness without accumulating listeners', async t => {
    const f = fixture(t);
    await f.confirm();
    const listeners = f.connection.eventNames().map(event => [event, f.connection.listenerCount(event)]);
    f.connection.readyState = 0;
    f.connection.emit('disconnected');
    assert.equal((await f.confirm(ids[1])).code, 500);
    f.connection.readyState = 1;
    f.connection.emit('connected');
    assert.equal((await f.confirm(ids[1])).code, 200);
    assert.equal(f.indexCalls.length, 2);
    assert.deepEqual(f.connection.eventNames().map(event => [event, f.connection.listenerCount(event)]), listeners);
});

for (const target of ['database', 'client', 'database name', 'native collection', 'model collection', 'model connection']) {
    test(`replacement of ${target} invalidates successful readiness`, async t => {
        const f = fixture(t);
        await f.confirm();
        if (target === 'database') f.connection.db = {};
        if (target === 'client') f.connection.client = {};
        if (target === 'database name') f.connection.name = 'pamo_test_receipts_replacement';
        if (target === 'native collection') f.collection.collection = {};
        if (target === 'model collection') orderModel.collection = { ...f.collection, collection: {} };
        if (target === 'model connection') {
            orderModel.db = Object.assign(new EventEmitter(), {
                readyState: 1, name: f.connection.name, db: {}, client: {}
            });
            orderModel.collection = { ...f.collection, conn: orderModel.db, collection: {} };
        }
        assert.equal((await f.confirm(ids[1])).code, 200);
        assert.equal(f.indexCalls.length, 2);
    });
}

for (const rejectOld of [false, true]) {
    test(`stale pending ${rejectOld ? 'failure' : 'success'} cannot authorize payment or clear newer readiness`, async t => {
        const old = deferred(), newer = deferred();
        let calls = 0;
        const f = fixture(t, () => ++calls === 1 ? old.promise : newer.promise);
        const first = f.confirm();
        await tick();
        f.connection.emit('disconnected');
        f.connection.emit('connected');
        const second = f.confirm(ids[1]);
        await tick();
        assert.equal(f.indexCalls.length, 2);
        if (rejectOld) old.reject(new Error('Old failure'));
        else old.resolve('cashier_receipt_unique');
        assert.equal((await first).code, 500);
        assert.equal(f.writes.length, 0);
        const third = f.confirm(ids[2]);
        await tick();
        assert.equal(f.indexCalls.length, 2);
        newer.resolve('cashier_receipt_unique');
        assert.deepEqual((await Promise.all([second, third])).map(res => res.code), [200, 200]);
        assert.equal(f.rows.get(ids[0]).payment, false);
    });
}

test('database replacement while initialization is pending prevents a stale payment', async t => {
    const pending = deferred(), f = fixture(t, () => pending.promise);
    const confirmation = f.confirm();
    await tick();
    f.connection.db = {};
    pending.resolve('cashier_receipt_unique');
    assert.equal((await confirmation).code, 500);
    assert.equal(f.writes.length, 0);
});

for (const event of ['connecting', 'connected', 'disconnecting', 'disconnected', 'close']) {
    test(`${event} invalidates readiness even when connection objects are reused`, async t => {
        const f = fixture(t);
        const assertReady = await ensureReceiptIndex(orderModel);
        assert.doesNotThrow(assertReady);
        f.connection.emit(event);
        assert.throws(assertReady, /Receipt uniqueness is not ready/);
        assert.equal((await f.confirm()).code, 200);
        assert.equal(f.indexCalls.length, 2);
        for (let i = 0; i < 3; i++) f.connection.emit(event);
        for (const name of f.connection.eventNames()) assert.equal(f.connection.listenerCount(name), 1);
    });
}

test('invalidation before initialization dispatch prevents even the index command', async t => {
    const f = fixture(t);
    const readiness = ensureReceiptIndex(orderModel);
    f.connection.emit('disconnected');
    await assert.rejects(readiness, /Receipt uniqueness is not ready/);
    assert.equal(f.indexCalls.length, 0);
    assert.equal(f.writes.length, 0);
});

test('invalidation at readiness resolution before controller continuation prevents payment', async t => {
    const f = fixture(t);
    // Invalidate as the first waiter resumes, before the payment continuation.
    const first = ensureReceiptIndex(orderModel);
    const payment = f.confirm();
    const invalidation = first.then(() => f.connection.emit('disconnected'));
    await invalidation;
    assert.equal((await payment).code, 500);
    assert.equal(f.writes.length, 0);
});

test('missing connection, client, database or native collection fails closed', async t => {
    const f = fixture(t);
    for (const [target, key] of [[f.connection, 'client'], [f.connection, 'db'], [f.collection, 'collection']]) {
        const saved = target[key];
        target[key] = undefined;
        assert.equal((await f.confirm()).code, 500);
        target[key] = saved;
    }
    orderModel.db = undefined;
    assert.equal((await f.confirm()).code, 500);
    assert.equal(f.indexCalls.length, 0);
    assert.equal(f.writes.length, 0);
});
