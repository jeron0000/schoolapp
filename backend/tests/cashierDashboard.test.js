import { ADMIN_SUBJECT } from '../../shared/authPolicy.js';
import { issueAuthToken } from '../utils/authTokens.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { connectTestDatabase } from './helpers/database.js';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import userModel from '../models/userModel.js';
import cashierAuth from '../middleware/cashierAuth.js';
import { cashierDashboardOverview } from '../controllers/cashierController.js';
import { cashierDashboardRange, getCashierDashboardOverview } from '../utils/cashierDashboard.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_cashier_dashboard';
process.env.JWT_SECRET = 'cashier-dashboard-test-secret';
process.env.ADMIN_EMAIL = 'cashier-dashboard-admin@example.test';
process.env.ADMIN_PASSWORD = 'cashier-dashboard-test-password';
const { default: router } = await import('../routes/orderRoute.js');
const now = Date.parse('2026-10-07T15:45:00+08:00');
const id = value => value.toString(16).padStart(24, '0');
const order = (value, overrides = {}) => ({ _id: id(value), payment: true, status: 'Packing', amount: 235,
    paymentMethod: 'COD', paymentCurrency: 'PHP', paidAt: now - 1000, date: now - 86400000,
    items: [{ _id: id(99), price: 225, quantity: 1 }],
    address: { firstName: 'Student', lastName: 'Snapshot', email: 'private@example.test', phone: 'private' }, ...overrides });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const records = (t, entries) => {
    let reads = 0, closed = false;
    t.mock.method(orderModel, 'find', (filter, projection) => {
        reads++;
        assert.deepEqual(filter, { 'demoPayment.mode': { $ne: 'demo' }, $or: [{ payment: true }, { status: 'Sent to Cashier', payment: false }] });
        assert.equal(projection.amount, 1);
        assert.equal(projection['address.firstName'], 1);
        assert(!projection.userId && !projection.address && !projection.confirmedBy);
        const cursor = (async function* () { yield* entries; })();
        cursor.close = async () => { closed = true; };
        return { lean: () => ({ cursor: () => cursor }) };
    });
    for (const model of [productModel, userModel]) t.mock.method(model, 'find', () => assert.fail('Unexpected catalog/student lookup'));
    for (const method of ['updateOne', 'findOneAndUpdate', 'create', 'deleteMany']) t.mock.method(orderModel, method, () => assert.fail('Analytics must not mutate orders'));
    return () => { assert.equal(reads, 1); assert.equal(closed, true); };
};
const overview = (key = 'today') => getCashierDashboardOverview(cashierDashboardRange(key, now));

test('Cashier ranges default to Today and use Manila calendar boundaries across years and leap days', () => {
    const instant = Date.parse('2026-01-01T00:15:00+08:00');
    const expected = { today: '2025-12-31T16:00:00.000Z', last7days: '2025-12-25T16:00:00.000Z',
        last30days: '2025-12-02T16:00:00.000Z', thisyear: '2025-12-31T16:00:00.000Z' };
    assert.equal(cashierDashboardRange(undefined, instant).key, 'today');
    for (const [key, start] of Object.entries(expected)) {
        const range = cashierDashboardRange(key, instant);
        assert.equal(new Date(range.start).toISOString(), start);
        assert.equal(range.end, instant); assert.equal(range.timezone, 'Asia/Manila');
    }
    assert.equal(cashierDashboardRange('alltime', instant).start, null);
    assert.equal(new Date(cashierDashboardRange('last7days', Date.parse('2024-03-01T00:15:00+08:00')).start).toISOString(), '2024-02-23T16:00:00.000Z');
});

test('invalid/structured/repeated ranges and extra parameters fail before reading the database', async t => {
    t.mock.method(orderModel, 'find', () => assert.fail('Unexpected read'));
    for (const range of ['', '7d', 'custom', null, true, 7, ['today', 'alltime'], { $ne: null }]) {
        const res = response(); await cashierDashboardOverview({ query: { range } }, res);
        assert.equal(res.code, 400); assert.equal(res.body.success, false);
    }
    const res = response(); await cashierDashboardOverview({ query: { start: '2026-01-01' } }, res);
    assert.equal(res.code, 400);
});

test('empty data is valid zero money, empty methods/lists and ordered hourly buckets through the current hour', async t => {
    const checked = records(t, []);
    const data = await overview(); checked();
    assert.deepEqual(data.summary, { totalCollected: 0, paidTransactions: 0, awaitingPayment: 0, averageTransaction: 0 });
    assert.deepEqual(data.paymentMethodBreakdown, []); assert.deepEqual(data.awaitingPayments, []); assert.deepEqual(data.recentPayments, []);
    assert.equal(data.collectionTrend.granularity, 'hour'); assert.equal(data.collectionTrend.points.length, 16);
    assert.equal(data.collectionTrend.points[0].key, '2026-10-07T00');
    assert.equal(data.collectionTrend.points.at(-1).key, '2026-10-07T15');
    assert(data.collectionTrend.points.every(point => point.amount === 0 && point.transactionCount === 0));
    assert.equal(data.dataQuality.collectionPeriodComplete, true);
});

test('payment time selects collections; stored total includes fees and survives catalog changes without an item-price calculation', async t => {
    const start = cashierDashboardRange('today', now).start;
    const checked = records(t, [order(1, { date: start - 86400000, items: [{ price: 999999, quantity: 100 }] }),
        order(2, { amount: 100, paidAt: start - 1, date: now }), order(3, { payment: false }),
        order(4, { payment: false, status: 'Cancelled' }), order(5, { paidAt: now }), order(6, { paidAt: now + 1 })]);
    const data = await overview(); checked();
    assert.deepEqual(data.summary, { totalCollected: 235, paidTransactions: 1, awaitingPayment: 0, averageTransaction: 235 });
    assert.equal(data.collectionTrend.points.at(-1).amount, 235);
    assert.equal(data.recentPayments[0].amount, 235);
});

test('paid cancellations retain canonical collected money because cancellation does not record a refund', async t => {
    records(t, [order(1, { status: 'Cancelled', cancellationSource: 'admin' }), order(2, { status: 'Cancelled', payment: false })]);
    const data = await overview();
    assert.equal(data.summary.totalCollected, 235); assert.equal(data.summary.paidTransactions, 1);
    assert.equal(data.dataQuality.paidCancelledOrders, 1);
});

test('legacy fractional cents are excluded without rounding; legitimate zero payments remain supported', async t => {
    records(t, [order(1, { amount: 0.1 + 0.2 }), order(2, { amount: 10.075 }), order(3, { amount: 1.005 }), order(4, { amount: 0 })]);
    const data = await overview();
    assert.equal(data.summary.totalCollected, 0); assert.equal(data.summary.paidTransactions, 1);
    assert.equal(data.summary.averageTransaction, 0);
    assert.equal(data.collectionTrend.points.at(-1).amount, 0);
    assert.equal(data.dataQuality.invalidPaidAmounts, 3);
    assert.equal(data.dataQuality.collectionPeriodComplete, false);
});

test('invalid monetary values are excluded explicitly rather than silently converted to zero', async t => {
    records(t, [order(1), ...[-1, NaN, Infinity, '235', null, Number.MAX_SAFE_INTEGER].map((amount, index) => order(index + 2, { amount }))]);
    const data = await overview(); assert.equal(data.summary.totalCollected, 235);
    assert.equal(data.dataQuality.invalidPaidAmounts, 6); assert.equal(data.dataQuality.collectionPeriodComplete, false);
});

test('unsafe sum fails rather than returning rounded inaccurate totals', async t => {
    records(t, [order(1, { amount: 80000000000000 }), order(2, { amount: 80000000000000 })]);
    await assert.rejects(overview(), /safe numeric precision/);
});

test('awaiting queue is current, actionable, range-independent and bounded oldest-first', async t => {
    const queue = Array.from({ length: 8 }, (_, index) => order(index + 10, { payment: false, paidAt: undefined,
        status: 'Sent to Cashier', sentToCashierAt: now - (index + 1) * 86400000 }));
    queue.push(order(99, { payment: false, status: 'Sent to Cashier', paymentMethod: 'Stripe' }),
        order(100, { payment: false, status: 'Sent to Cashier', amount: 0 }), order(101, { payment: false, status: 'Approved' }));
    records(t, queue);
    for (const key of ['today', 'last7days', 'last30days', 'thisyear', 'alltime']) {
        const data = await overview(key);
        assert.equal(data.summary.awaitingPayment, 8); assert.equal(data.awaitingPayments.length, 5);
        assert.deepEqual(data.awaitingPayments.map(row => row._id), [17, 16, 15, 14, 13].map(id));
        assert.equal(data.dataQuality.nonActionableAwaitingOrders, 2);
    }
});

test('missing queue-entry time has a truthful creation-time fallback; truly unknown times sort last', async t => {
    records(t, [order(2, { payment: false, status: 'Sent to Cashier', sentToCashierAt: now - 100 }),
        order(1, { payment: false, status: 'Sent to Cashier', sentToCashierAt: undefined, date: now - 200 }),
        order(3, { payment: false, status: 'Sent to Cashier', sentToCashierAt: undefined, date: undefined })]);
    const data = await overview();
    assert.deepEqual(data.awaitingPayments.map(row => row._id), [1, 2, 3].map(id));
    assert.equal(data.awaitingPayments[0].sentToCashierAt, null);
    assert.equal(data.awaitingPayments[0].waitingSince, now - 200);
    assert.equal(data.awaitingPayments[0].waitingTimeSource, 'orderCreated');
    assert.equal(data.awaitingPayments[2].waitingSince, null);
});

test('recent payments are bounded, newest-paid-first, respect range and disclose only necessary snapshot fields', async t => {
    const entries = Array.from({ length: 8 }, (_, index) => order(index + 1, { paidAt: now - index * 1000 - 1, receiptNumber: index ? undefined : 'OR-TEST' }));
    entries.push(order(50, { paidAt: cashierDashboardRange('today', now).start - 1 }));
    const before = structuredClone(entries); records(t, entries);
    const data = await overview(); assert.deepEqual(entries, before);
    assert.equal(data.recentPayments.length, 5); assert.deepEqual(data.recentPayments.map(row => row._id), [1, 2, 3, 4, 5].map(id));
    assert.equal(data.recentPayments[0].receiptNumber, 'OR-TEST'); assert.equal(data.recentPayments[1].receiptNumber, null);
    assert.equal(data.recentPayments[0].studentName, 'Student Snapshot');
    assert(data.recentPayments.every(row => Object.keys(row).every(key => ['_id', 'studentName', 'amount', 'paymentMethod', 'receiptNumber', 'paidAt', 'status'].includes(key))));
    assert(!JSON.stringify(data).includes('private@example.test'));
});

test('real payment-method labels, including legacy/missing labels, use an amount denominator rather than transaction counts', async t => {
    records(t, [order(1, { amount: 60 }), order(2, { amount: 30, paymentMethod: 'Stripe' }),
        order(3, { amount: 10, paymentMethod: 'Legacy voucher' }), order(4, { amount: 0, paymentMethod: undefined })]);
    const data = await overview();
    assert.deepEqual(data.paymentMethodBreakdown, [
        { method: 'COD', transactionCount: 1, amount: 60, percentage: 60 },
        { method: 'Stripe', transactionCount: 1, amount: 30, percentage: 30 },
        { method: 'Legacy voucher', transactionCount: 1, amount: 10, percentage: 10 },
        { method: null, transactionCount: 1, amount: 0, percentage: 0 }
    ]);
});

test('zero-amount methods return finite zero percentages', async t => {
    records(t, [order(1, { amount: 0 })]);
    const data = await overview(); assert.equal(data.paymentMethodBreakdown[0].percentage, 0);
    assert.equal(data.summary.averageTransaction, 0);
});

test('undated successful payments never borrow creation time; alltime includes eligible stored amounts in explicit undated totals', async t => {
    records(t, [order(1, { paidAt: undefined }), order(2, { paidAt: '2026-10-07' }), order(3, { paidAt: NaN })]);
    const today = await overview();
    assert.equal(today.summary.totalCollected, 0); assert.equal(today.dataQuality.undatedPaidOrders, 3);
    assert.equal(today.dataQuality.collectionPeriodComplete, false); assert.deepEqual(today.recentPayments, []);
    const all = await overview('alltime');
    assert.equal(all.summary.totalCollected, 705); assert.equal(all.summary.paidTransactions, 3);
    assert.equal(all.collectionTrend.undatedAmount, 705); assert.equal(all.collectionTrend.undatedTransactions, 3);
    assert.deepEqual(all.collectionTrend.points, []); assert.equal(all.dataQuality.trendComplete, false);
    assert.equal(all.dataQuality.collectionPeriodComplete, true);
});

test('PayPal currency gap is exposed without mixing USD amounts into PHP totals or fabricating conversions', async t => {
    records(t, [order(1), order(2, { paymentMethod: 'PayPal', paymentCurrency: undefined, amount: 100 }),
        order(3, { paymentMethod: 'PayPal', paymentCurrency: undefined, paidAt: undefined })]);
    const data = await overview('alltime');
    assert.equal(data.currency, 'PHP'); assert.equal(data.summary.totalCollected, 235);
    assert.equal(data.summary.paidTransactions, 1); assert.equal(data.dataQuality.currencyUnresolvedPaidOrders, 2);
    assert.equal(data.dataQuality.collectionPeriodComplete, false);
    assert(!data.paymentMethodBreakdown.some(row => row.method === 'PayPal'));
});

test('only explicit PHP currency contributes; unknown history and known foreign currency have distinct exclusions', async t => {
    records(t, [order(1, { paymentMethod: 'Stripe', amount: 100 }), order(2, { paymentMethod: 'PayPal', amount: 50 }),
        order(3, { paymentMethod: 'PayPal', paymentCurrency: 'USD', amount: 900 }),
        ...['COD', 'Stripe', 'PayPal', 'Legacy voucher'].map((paymentMethod, index) => order(index + 4, { paymentMethod, paymentCurrency: undefined })),
        order(8, { paymentCurrency: 'php' }), order(9, { paymentCurrency: '' }), order(10, { paymentCurrency: null }),
        order(11, { paymentCurrency: 'USD', paidAt: undefined }), order(12, { paymentCurrency: 'EUR', paidAt: now })]);
    for (const key of ['today', 'last7days', 'last30days', 'thisyear', 'alltime']) {
        const data = await overview(key);
        assert.equal(data.summary.totalCollected, 150); assert.equal(data.summary.paidTransactions, 2);
        assert.equal(data.summary.averageTransaction, 75);
        assert.equal(data.dataQuality.currencyUnresolvedPaidOrders, 7);
        assert.equal(data.dataQuality.nonPhpPaidOrders, 2);
        assert.equal(data.dataQuality.collectionPeriodComplete, false); assert.equal(data.dataQuality.trendComplete, false);
        assert.equal(data.collectionTrend.points.reduce((sum, row) => sum + row.amount, 0), 150);
        assert.equal(data.paymentMethodBreakdown.reduce((sum, row) => sum + row.amount, 0), 150);
        assert.deepEqual(data.recentPayments.map(row => row._id), [2, 1].map(id));
    }
});

test('missing payment time never borrows creation, updatedAt or a provider session creation time', async t => {
    records(t, [order(1, { paidAt: undefined, updatedAt: now - 1, providerCreatedAt: now - 2 })]);
    assert.equal((await overview()).summary.paidTransactions, 0);
    const all = await overview('alltime');
    assert.equal(all.collectionTrend.undatedTransactions, 1); assert.deepEqual(all.recentPayments, []);
});

test('daily/monthly trends zero-fill exactly the calendar range and alltime uses stable monthly/yearly grouping', async t => {
    records(t, [order(1, { paidAt: Date.parse('2026-10-01T00:00:00+08:00') }), order(2)]);
    for (const [key, granularity, count] of [['last7days', 'day', 7], ['last30days', 'day', 30], ['thisyear', 'month', 10]]) {
        const data = await overview(key);
        assert.equal(data.collectionTrend.granularity, granularity); assert.equal(data.collectionTrend.points.length, count);
        assert.equal(data.collectionTrend.points.reduce((sum, point) => sum + point.amount, 0), 470);
        assert(data.collectionTrend.points.every((point, index, points) => !index || point.key > points[index - 1].key));
    }
    const all = await overview('alltime'); assert.equal(all.collectionTrend.granularity, 'month'); assert.equal(all.collectionTrend.points.length, 1);
});

test('long alltime history groups by year and fills missing years without an unbounded monthly response', async t => {
    records(t, [order(1, { paidAt: Date.parse('2010-01-01T00:00:00+08:00') }), order(2)]);
    const data = await overview('alltime'); assert.equal(data.collectionTrend.granularity, 'year');
    assert.equal(data.collectionTrend.points.length, 17); assert.equal(data.collectionTrend.points[1].amount, 0);
});

test('inclusive start/exclusive end and Manila midnight place successful payments into the right hourly bucket', async t => {
    const start = cashierDashboardRange('today', now).start;
    records(t, [order(1, { paidAt: start }), order(2, { paidAt: start - 1 }), order(3, { paidAt: now }),
        order(4, { paidAt: start + 3600000 })]);
    const data = await overview(); assert.equal(data.summary.paidTransactions, 2);
    assert.equal(data.collectionTrend.points[0].amount, 235); assert.equal(data.collectionTrend.points[1].amount, 235);
});

test('one canonical Order counts once through repeated reads and actual order progression', async t => {
    const payment = order(1, { requestId: randomUUID() }); records(t, [payment]);
    for (const status of ['Packing', 'Ready To Claim', 'Claimed']) {
        payment.status = status;
        assert.equal((await overview()).summary.paidTransactions, 1);
        assert.equal((await overview()).summary.totalCollected, 235);
    }
});

test('equal payment/waiting timestamps use stable order-ID ties, independent of database cursor order', async t => {
    const ids = [3, 7, 1, 4, 6, 2, 5];
    const entries = ids.map(value => order(value));
    entries.push(...ids.map(value => order(value + 20, { payment: false, status: 'Sent to Cashier', sentToCashierAt: now - 10000 })));
    records(t, entries); const data = await overview();
    assert.deepEqual(data.recentPayments.map(row => row._id), [7, 6, 5, 4, 3].map(id));
    assert.deepEqual(data.awaitingPayments.map(row => row._id), [21, 22, 23, 24, 25].map(id));
});

test('recent payments do not substitute older out-of-range records when the selected range is empty', async t => {
    records(t, [order(1, { paidAt: cashierDashboardRange('today', now).start - 1 })]);
    const data = await overview(); assert.deepEqual(data.recentPayments, []); assert.equal(data.summary.paidTransactions, 0);
});

test('a mid-stream database error closes the cursor and fails the request instead of returning partial totals', async t => {
    let closed = false;
    const cursor = (async function* () { yield order(1); throw new Error('private database error'); })();
    cursor.close = async () => { closed = true; };
    t.mock.method(orderModel, 'find', () => ({ lean: () => ({ cursor: () => cursor }) }));
    const res = response(); await cashierDashboardOverview({ query: {} }, res);
    assert.equal(res.code, 500); assert.equal(res.body.success, false); assert.equal(closed, true);
    assert(!res.body.summary && !res.body.message.includes('private'));
});

test('database failures return generic 500 rather than fake zero analytics or private connection details', async t => {
    t.mock.method(orderModel, 'find', () => { throw new Error('private credentials'); });
    const res = response(); await cashierDashboardOverview({ query: {} }, res);
    assert.equal(res.code, 500); assert.deepEqual(res.body, { success: false, message: 'Unable to load cashier dashboard analytics. Please try again.' });
});

test('actual HTTP route uses Cashier authorization for admin/cashier; rejects missing, customer, revoked and forged sessions and parsed invalid ranges', async t => {
    const route = router.stack.find(layer => layer.route?.path === '/cashier/dashboard/overview').route;
    assert.equal(route.methods.get, true); assert.deepEqual(route.stack.map(layer => layer.handle), [cashierAuth, cashierDashboardOverview]);
    records(t, []);
    t.mock.method(userModel, 'findOne', async query => {
        assert.equal(query.role, 'cashier');
        return query._id === id(1) ? { email: 'cashier@example.test', role: 'cashier' } : null;
    });
    const app = express(); app.use('/api/order', router);
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/order/cashier/dashboard/overview`;
    const admin = issueAuthToken(ADMIN_SUBJECT, 'admin');
    const cashier = issueAuthToken(id(1), 'cashier');
    for (const token of [undefined, 'invalid', issueAuthToken(id(2), 'customer'), issueAuthToken(id(2), 'cashier')]) {
        const res = await fetch(url, { headers: token ? { token } : {} });
        assert([401, 403].includes(res.status)); assert.equal((await res.json()).success, false);
    }
    for (const token of [admin, cashier]) {
        const res = await fetch(url, { headers: { token } }); assert.equal(res.status, 200);
        const data = await res.json(); assert.equal(data.success, true); assert.equal(data.range.key, 'today');
    }
    for (const query of ['?range=bad', '?range=', '?range=today&range=alltime', '?range[x]=today', '?start=2026-01-01']) {
        const res = await fetch(url + query, { headers: { token: admin } }); assert.equal(res.status, 400);
    }
});

test('real MongoDB projection and reconciliation on a fresh isolated database', { skip: process.env.PAMO_CASHIER_DASHBOARD_INTEGRATION !== '1', timeout: 60000 }, async t => {
    await connectTestDatabase(t, mongoose, 'cashierDashboard');
    const fixtures = [order(1), order(2, { amount: 125.5, paymentMethod: 'Stripe', receiptNumber: undefined }),
        order(3, { payment: false, paidAt: undefined, status: 'Sent to Cashier', sentToCashierAt: now - 50000 }),
        order(4, { payment: false, status: 'Cancelled' }), order(5, { paidAt: undefined })];
    await orderModel.create(fixtures.map(fixture => ({ ...fixture, userId: id(100) })));
    const before = await orderModel.find({}).sort({ _id: 1 }).lean();
    const data = await overview();
    assert.deepEqual(data.summary, { totalCollected: 360.5, paidTransactions: 2, awaitingPayment: 1, averageTransaction: 180.25 });
    assert.equal(data.awaitingPayments[0].itemCount, 1);
    assert.equal(data.awaitingPayments[0].studentName, 'Student Snapshot');
    assert.equal(data.collectionTrend.points.reduce((sum, point) => sum + point.amount, 0), 360.5);
    assert.equal(data.paymentMethodBreakdown.reduce((sum, row) => sum + row.amount, 0), 360.5);
    assert.deepEqual(await orderModel.find({}).sort({ _id: 1 }).lean(), before);
    assert.equal((await overview('alltime')).summary.totalCollected, 595.5);
});
