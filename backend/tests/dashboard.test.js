import { ADMIN_SUBJECT } from '../../shared/authPolicy.js';
import { issueAuthToken } from '../utils/authTokens.js';
import jwt from 'jsonwebtoken';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { connectTestDatabase } from './helpers/database.js';
import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import adminAuth from '../middleware/adminAuth.js';
import router from '../routes/dashboardRoute.js';
import { dashboardOverview } from '../controllers/dashboardController.js';
import { dashboardRange, getDashboardOverview } from '../utils/dashboard.js';
import { confirmCashierPayment } from '../controllers/cashierController.js';

const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const emptyProducts = t => t.mock.method(productModel, 'find', () => ({ select: () => ({ lean: async () => [] }), lean: () => ({ cursor: () => {
    const cursor = (async function* () {})();
    cursor.close = async () => {};
    return cursor;
} }) }));

test('ranges use Manila calendar days across month/year/leap-day boundaries', () => {
    const now = Date.parse('2026-01-01T00:15:00+08:00');
    const range = dashboardRange(undefined, now);
    assert.equal(range.key, '30d');
    assert.equal(range.timezone, 'Asia/Manila');
    assert.equal(new Date(range.start).toISOString(), '2025-12-02T16:00:00.000Z');
    assert.equal(range.end, now);
    assert.equal(new Date(dashboardRange('7d', now).start).toISOString(), '2025-12-25T16:00:00.000Z');
    assert.equal(new Date(dashboardRange('thisMonth', now).start).toISOString(), '2025-12-31T16:00:00.000Z');
    assert.equal(new Date(dashboardRange('thisMonth', Date.parse('2024-02-29T20:00:00+08:00')).start).toISOString(), '2024-01-31T16:00:00.000Z');
});

test('invalid ranges fail cleanly before any database query', async t => {
    t.mock.method(orderModel, 'aggregate', () => assert.fail('Unexpected order query'));
    t.mock.method(productModel, 'find', () => assert.fail('Unexpected product query'));
    for (const range of ['all', '', '31d', 7, true, ['30d', '7d'], { $ne: null }, null]) {
        const res = response();
        await dashboardOverview({ query: { range } }, res);
        assert.equal(res.code, 400);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /Supported dashboard ranges/);
    }
});

test('the zero series includes today even when requested exactly at Manila midnight', async t => {
    t.mock.method(orderModel, 'aggregate', async pipeline => {
        if (pipeline[0].$match) {
            assert.deepEqual(pipeline[0].$match['demoPayment.mode'], { $ne: 'demo' });
            return [{ summary: [], trend: [], topProducts: [], quality: [] }];
        }
        return [{ statuses: [], recentOrders: [], paidCancelledOrders: [] }];
    });
    emptyProducts(t);
    const range = dashboardRange('30d', Date.parse('2026-01-01T00:00:00+08:00'));
    const data = await getDashboardOverview(range);
    assert.equal(data.salesTrend.length, 30);
    assert.equal(data.salesTrend.at(-1).date, '2026-01-01');
    assert(data.salesTrend.every(row => row.sales === 0 && row.paidOrders === 0));
});

test('overview requires existing PAMO Admin credentials and denies student/cashier/forged roles', async () => {
    const route = router.stack.find(layer => layer.route?.path === '/overview').route;
    assert.equal(route.methods.get, true);
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, dashboardOverview]);
    process.env.JWT_SECRET = 'dashboard-test-only-secret';
    process.env.ADMIN_EMAIL = 'dashboard-admin@example.test';
    process.env.ADMIN_PASSWORD = 'dashboard-admin-fixture';
    for (const token of [undefined, issueAuthToken('0123456789abcdef01234567', 'customer'), jwt.sign({ sub: '0123456789abcdef01234567', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' })]) {
        const res = response();
        await adminAuth({ headers: { token }, query: { role: 'admin' } }, res, () => assert.fail('Unexpected dashboard access'));
        assert.equal(res.body.success, false);
    }
    let allowed = false;
    await adminAuth({ headers: { token: issueAuthToken(ADMIN_SUBJECT, 'admin') } }, response(), () => { allowed = true; });
    assert.equal(allowed, true);
});

test('database failures are not exposed to dashboard clients', async t => {
    t.mock.method(orderModel, 'aggregate', async () => { throw new Error('private connection details and stack'); });
    emptyProducts(t);
    const res = response();
    await dashboardOverview({ query: {} }, res);
    assert.equal(res.code, 500);
    assert.deepEqual(res.body, { success: false, message: 'Unable to load dashboard analytics. Please try again.' });
});

test('real database dashboard analytics on an isolated database', { skip: process.env.PAMO_DASHBOARD_INTEGRATION !== '1', timeout: 180000 }, async t => {
    await connectTestDatabase(t, mongoose, 'dashboard');
    const now = Date.parse('2026-10-06T15:00:00+08:00');
    const range = dashboardRange('30d', now);
    const productId = String(new mongoose.Types.ObjectId());
    const item = (price = 500, quantity = 2, id = productId) => ({ _id: id, name: 'Historical uniform', price, quantity, size: 'M' });
    const order = (overrides = {}) => orderModel.create({ userId: String(new mongoose.Types.ObjectId()), items: [item()], amount: 1040,
        address: { firstName: 'Student', lastName: 'Snapshot', phone: 'private', email: 'private@example.test' },
        date: now - 5000, paymentMethod: 'COD', paymentCurrency: 'PHP', payment: false, status: 'Order Placed', ...overrides });
    const overview = () => getDashboardOverview(range);

    await t.test('empty data returns zeros, empty lists and a genuine zero daily series', async () => {
        const data = await overview();
        assert.deepEqual(data.summary, { totalSales: 0, paidOrders: 0, awaitingApproval: 0, lowStockProducts: 0 });
        assert.equal(data.salesTrend.length, 30);
        assert(data.salesTrend.every(row => row.sales === 0 && row.paidOrders === 0));
        assert.deepEqual(data.topProducts, []);
        assert.deepEqual(data.recentOrders, []);
        assert.deepEqual(data.lowStockProducts, []);
    });
    let first;
    await t.test('unpaid creation is not a sale, then confirmation counts historical merchandise exactly once', async paymentTest => {
        first = await order();
        let data = await overview();
        assert.equal(data.summary.totalSales, 0);
        assert.equal(data.summary.paidOrders, 0);
        assert.equal(data.summary.awaitingApproval, 1);
        await orderModel.updateOne({ _id: first._id }, { $set: { status: 'Sent to Cashier' } });
        paymentTest.mock.method(Date, 'now', () => now - 1000);
        const res = response();
        await confirmCashierPayment({ body: { orderId: String(first._id), paymentMethod: 'COD', receiptNumber: 'dashboard-fixture-receipt' }, staff: { identity: 'dashboard-test' } }, res);
        assert.equal(res.body.success, true);
        assert.equal(res.body.order.paidAt, now - 1000);
        data = await overview();
        assert.equal(data.summary.totalSales, 1000);
        assert.equal(data.summary.paidOrders, 1);
        assert.equal(data.summary.awaitingApproval, 0);
        assert.equal(data.topProducts[0].sales, 1000);
        assert.equal(data.topProducts[0].quantitySold, 2);
    });
    await t.test('progression and repeat overview reads do not multiply revenue or mutate documents', async () => {
        for (const status of ['Ready To Claim', 'Claimed']) {
            await orderModel.updateOne({ _id: first._id }, { $set: { status } });
            const before = await orderModel.findById(first._id).lean();
            const data = await overview();
            assert.equal(data.summary.totalSales, 1000);
            assert.equal(data.summary.paidOrders, 1);
            assert.deepEqual(await overview(), data);
            assert.deepEqual(await orderModel.findById(first._id).lean(), before);
        }
    });
    await t.test('two paid orders sum merchandise, omit fees, use payment date and preserve cancelled source counts', async () => {
        await order({ payment: true, paidAt: now - 2000, date: range.start - 86400000, items: [item(500, 1)], amount: 540 });
        await order({ payment: false, status: 'Cancelled', cancellationSource: 'customer' });
        await order({ payment: true, paidAt: now - 3000, status: 'Cancelled', cancellationSource: 'admin' });
        const data = await overview();
        assert.equal(data.summary.totalSales, 1500);
        assert.equal(data.summary.paidOrders, 2);
        assert.equal(data.orderStatusCounts.Cancelled, 2);
        assert.equal(data.dataQuality.paidCancelledOrders, 1);
        assert.equal(data.salesTrend.at(-1).sales, 1500);
        assert.equal(data.salesTrend.at(-1).paidOrders, 2);
    });
    await t.test('changed/deleted current products and merchandising flags do not alter historical analytics', async () => {
        const product = await productModel.create({ _id: productId, name: 'Renamed current uniform', description: 'Test', price: 600,
            image: [], category: 'Men', subCategory: 'BSIT', sizes: ['M'], inventory: { M: 10 }, BestSeller: true, NewArrival: true, date: now });
        assert.equal((await overview()).summary.totalSales, 1500);
        await productModel.deleteOne({ _id: product._id });
        const data = await overview();
        assert.equal(data.summary.totalSales, 1500);
        assert.equal(data.topProducts[0].productId, productId);
        assert.equal(data.topProducts[0].name, 'Historical uniform');
        assert.equal(data.topProducts[0].quantitySold, 3);
    });
    await t.test('missing payment times and invalid snapshots are excluded with explicit coverage counts', async () => {
        await order({ payment: true, paymentMethod: 'Stripe' });
        await order({ payment: true, paymentMethod: 'PayPal' });
        await order({ payment: true, paidAt: now - 4000, items: [{ ...item(), price: 'untrustworthy' }] });
        await order({ payment: true, paidAt: now - 4000, items: [] });
        const data = await overview();
        assert.equal(data.summary.totalSales, 1500);
        assert.equal(data.summary.paidOrders, 2);
        assert.equal(data.dataQuality.undatedPaidOrders, 2);
        assert.equal(data.dataQuality.invalidPaidOrderSnapshots, 2);
        assert.equal(data.dataQuality.salesPeriodComplete, false);
    });
    await t.test('range endpoints and Philippines midnight boundaries use paidAt and real zero days', async () => {
        await order({ payment: true, paidAt: range.start - 1, items: [item(100, 1)] });
        await order({ payment: true, paidAt: range.start, items: [item(100, 1)] });
        await order({ payment: true, paidAt: now, items: [item(100, 1)] });
        await order({ payment: true, paidAt: Date.parse('2026-10-05T15:59:59.999Z'), items: [item(20, 1)] });
        const data = await overview();
        assert.equal(data.summary.totalSales, 1620);
        assert.equal(data.salesTrend[0].date, '2026-09-07');
        assert.equal(data.salesTrend[0].sales, 100);
        assert.equal(data.salesTrend.at(-2).date, '2026-10-05');
        assert.equal(data.salesTrend.at(-2).sales, 20);
        assert.equal(data.salesTrend.at(-1).sales, 1500);
        assert.equal(data.salesTrend.reduce((sum, row) => sum + row.paidOrders, 0), data.summary.paidOrders);
    });
    await t.test('decimal money and real quantity ranking are independent of current product tags', async () => {
        const smallId = String(new mongoose.Types.ObjectId());
        await order({ payment: true, paidAt: now - 50, items: [item(0.1, 3, smallId), item(0.2, 1, smallId)], amount: 10.5 });
        const data = await overview();
        assert.equal(data.summary.totalSales, 1620.5);
        const ranked = data.topProducts.find(row => row.productId === smallId);
        assert.equal(ranked.quantitySold, 4);
        assert.equal(ranked.sales, 0.5);
        assert.equal(data.topProducts[0].productId, productId);
    });
    await t.test('applicable low sizes count each product once; legacy zero and most urgent bounded details reuse inventory rules', async () => {
        const make = (name, sizes, inventory) => productModel.create({ name, description: 'Test', price: 1, image: [], category: 'Men', subCategory: 'BSIT', sizes, inventory, date: now });
        await make('Mixed sizes', ['S', 'M', 'L'], { S: 10, M: 3, L: 8 });
        await make('Several low sizes', ['S', 'M', 'L'], { S: 2, M: 1, L: 0 });
        await make('Legacy size', ['M'], {});
        await make('Legacy one size', [], {});
        await make('Unselected low size ignored', ['S'], { S: 6, M: 0 });
        let data = await overview();
        assert.equal(data.summary.lowStockProducts, 4);
        assert.deepEqual(data.lowStockProducts.find(row => row.name === 'Mixed sizes').affectedSizes, [{ size: 'M', stock: 3 }]);
        assert.deepEqual(data.lowStockProducts.find(row => row.name === 'Legacy one size').affectedSizes, [{ size: 'One Size', stock: 0 }]);
        assert.equal(data.lowStockProducts[0].name, 'Several low sizes');
        await make('Extra low 1', ['XXL'], { XXL: 5 });
        await make('Extra low 2', ['XS'], { XS: 4 });
        data = await overview();
        assert.equal(data.summary.lowStockProducts, 6);
        assert.equal(data.lowStockProducts.length, 5);
        const before = await productModel.find({}).sort({ _id: 1 }).lean();
        await overview();
        assert.deepEqual(await productModel.find({}).sort({ _id: 1 }).lean(), before);
    });
    await t.test('bounded recent/top collections expose only useful data and current canonical statuses', async () => {
        for (let i = 0; i < 8; i++) await order({ items: [item(1, i + 1, String(new mongoose.Types.ObjectId()))],
            payment: true, paidAt: now - 1, date: now - i, status: 'Approved' });
        const data = await overview();
        assert.equal(data.recentOrders.length, 6);
        assert.equal(data.topProducts.length, 5);
        assert(data.topProducts.every((row, i, rows) => !i || rows[i - 1].quantitySold >= row.quantitySold));
        assert(data.recentOrders.every(row => row.customerName === 'Student Snapshot'));
        assert(data.recentOrders.every(row => Object.keys(row).every(key => ['_id', 'amount', 'date', 'status', 'payment', 'cancellationSource', 'customerName', 'itemCount'].includes(key))));
        assert.equal(data.orderStatusCounts.Approved, 8);
        assert.equal(data.orderStatusCounts.Claimed, 1);
        assert.equal(data.orderStatusCounts.Paid, undefined);
        assert(!JSON.stringify(data.recentOrders).includes('private'));
    });
    await t.test('malformed legacy money, quantities and timestamps do not invent sales or crash the overview', async () => {
        const before = await overview();
        const malformed = [
            { items: [item(NaN)] }, { items: [item(Infinity)] },
            { items: [item(1, 0)] }, { items: [item(1, 1.5)] },
            { items: [item(1, '2')] }, { items: [item(1, Infinity)] },
            { items: [item(1e14, 2)] }, { items: 'not-an-array' },
            { paidAt: NaN }, { paidAt: Infinity }, { paidAt: String(now - 1) }
        ];
        const records = malformed.map(fields => ({ _id: new mongoose.Types.ObjectId(), userId: productId, items: [item()],
            amount: 1040, address: {}, date: now, payment: true, paymentMethod: 'COD', status: 'Approved', paidAt: now - 1, ...fields }));
        await orderModel.collection.insertMany(records);
        try {
            const data = await overview();
            assert.equal(data.summary.totalSales, before.summary.totalSales);
            assert.equal(data.summary.paidOrders, before.summary.paidOrders);
            assert.equal(data.dataQuality.invalidPaidOrderSnapshots, before.dataQuality.invalidPaidOrderSnapshots + 8);
            assert.equal(data.dataQuality.undatedPaidOrders, before.dataQuality.undatedPaidOrders + 3);
        } finally { await orderModel.deleteMany({ _id: { $in: records.map(record => record._id) } }); }
    });
    await t.test('HTTP endpoint authorizes Admin only, validates actual query parsing and is read-only', async httpTest => {
        const app = express();
        app.use('/api/dashboard', router);
        const server = app.listen(0, '127.0.0.1');
        httpTest.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
        await new Promise(resolve => server.once('listening', resolve));
        const url = `http://127.0.0.1:${server.address().port}/api/dashboard/overview`;
        const admin = issueAuthToken(ADMIN_SUBJECT, 'admin');
        const beforeOrders = await orderModel.find({}).sort({ _id: 1 }).lean();
        const beforeProducts = await productModel.find({}).sort({ _id: 1 }).lean();
        for (const token of [undefined, issueAuthToken(productId, 'customer'), issueAuthToken(productId, 'cashier'), jwt.sign({ sub: productId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' })]) {
            const res = await fetch(url, { headers: token ? { token } : {} });
            assert.equal((await res.json()).success, false);
        }
        for (const query of ['?range=all', '?range=30d&range=7d', '?range[x]=30d']) {
            const res = await fetch(url + query, { headers: { token: admin } });
            assert.equal(res.status, 400);
            assert.equal((await res.json()).success, false);
        }
        for (const query of ['', '?range=7d', '?range=thisMonth']) {
            const res = await fetch(url + query, { headers: { token: admin } });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.success, true);
            assert.equal(data.range.key, query ? query.split('=')[1] : '30d');
            assert.equal(data.range.timezone, 'Asia/Manila');
            assert.equal(data.currency, 'PHP');
        }
        assert.deepEqual(await orderModel.find({}).sort({ _id: 1 }).lean(), beforeOrders);
        assert.deepEqual(await productModel.find({}).sort({ _id: 1 }).lean(), beforeProducts);
    });
});
