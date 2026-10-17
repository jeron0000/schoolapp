import { issueAuthToken } from '../utils/authTokens.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { connectTestDatabase } from './helpers/database.js';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import userModel from '../models/userModel.js';
import productRouter from '../routes/productRoute.js';
import adminAuth from '../middleware/adminAuth.js';
import { addProduct, updateStock, listProducts, removeProduct } from '../controllers/productController.js';
import { addToCart } from '../controllers/cartController.js';
import { confirmCashierPayment } from '../controllers/cashierController.js';
import { validateInitialInventory, aggregateOrderItems, createReservedOrder, cancelReservedOrder, adjustInventory } from '../utils/inventory.js';
import { getSizeStock, getTotalStock, getStockLabel } from '../../shared/inventory.js';

const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const id = '0123456789abcdef01234567';

test('initial stock accepts zero and rejects invalid numbers, sizes and extra entries', () => {
    assert.deepEqual(validateInitialInventory(['M'], { M: 0 }), { M: 0 });
    for (const quantity of [-1, 0.5, NaN, Infinity, '3', null, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => validateInitialInventory(['M'], { M: quantity }));
    for (const [sizes, stock] of [[[], {}], [['M', 'M'], { M: 1 }], [['M'], {}], [['M'], { M: 1, L: 1 }], [['x.y'], { 'x.y': 1 }]]) assert.throws(() => validateInitialInventory(sizes, stock));
});

test('duplicate product/size requests aggregate before reservation and malformed quantities fail', () => {
    assert.deepEqual(aggregateOrderItems([{ _id: id, size: 'M', quantity: 1 }, { _id: id, size: 'M', quantity: 2 }]), [{ _id: id, size: 'M', quantity: 3 }]);
    for (const quantity of [0, -1, 1.5, '2', NaN, Infinity]) assert.throws(() => aggregateOrderItems([{ _id: id, size: 'M', quantity }]));
    assert.throws(() => aggregateOrderItems([]));
    assert.throws(() => aggregateOrderItems([{ _id: id, size: '$invalid', quantity: 1 }]));
});

test('legacy stock is zero and totals/status derive only from per-size inventory', () => {
    assert.equal(getSizeStock({ sizes: ['M'] }, 'M'), 0);
    assert.equal(getTotalStock({ sizes: ['S', 'M'], inventory: { S: 2, M: 3, invalid: 100 } }), 5);
    assert.deepEqual([0, 1, 5, 6].map(getStockLabel), ['Out of Stock', 'Low Stock', 'Low Stock', 'In Stock']);
});

test('stock mutation uses existing admin authorization and rejects student credentials', async () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/stock').route;
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, updateStock]);
    process.env.JWT_SECRET = 'inventory-test-only-secret';
    const token = issueAuthToken(id, 'customer');
    const res = response();
    await adminAuth({ headers: { token } }, res, () => assert.fail('Student must not mutate stock'));
    assert.equal(res.body.success, false);
});

test('transactional inventory lifecycle on isolated MongoDB database', { skip: process.env.PAMO_INVENTORY_INTEGRATION !== '1', timeout: 180000 }, async t => {
    const { database, cleanup } = await connectTestDatabase(t, mongoose, 'inventory');
    const controllers = await import('../controllers/orderController.js');
    const fixture = (stock = 5, sizes = ['M', 'L']) => productModel.create({ name: 'Inventory fixture', description: 'Isolated inventory test', price: 225, image: [], category: 'Men', subCategory: 'BSIT', sizes, inventory: Object.fromEntries(sizes.map(size => [size, size === 'M' ? stock : 0])), date: Date.now() });
    const stock = async (product, size = 'M') => (await productModel.findById(product._id).lean()).inventory?.[size] || 0;
    let user;
    const data = (product, quantity = 2, method = 'COD') => ({ userId: String(user._id), requestId: randomUUID(), items: [{ _id: String(product._id), size: 'M', quantity, price: 1 }], address: { firstName: 'Inventory', lastName: 'Test', email: 'inventory@example.test', phone: '09171234567', street: '123 Campus Road', city: 'Carmona', state: 'Cavite', zipcode: '4116', country: 'Philippines' }, amount: 1, paymentMethod: method, payment: false, date: Date.now() });
    const call = async (handler, body) => { const res = response(); await handler({ body, headers: { origin: 'http://localhost:5173' }, staff: { identity: 'inventory-test' } }, res); return res; };
    try {
        user = await userModel.create({ name: 'Inventory test', email: database + '@example.test', password: 'test-only' });
        await t.test('Add Item persists selected-size inventory; public list exposes it', async () => {
            const res = await call((req, res) => addProduct({ ...req, files: {} }, res), { name: 'Initial stock fixture', description: 'Test', price: '225', category: 'Men', subCategory: 'BSIT', sizes: '["M","L"]', inventory: '{"M":5,"L":0}' });
            assert.equal(res.body.success, true);
            const product = await productModel.findOne({ name: 'Initial stock fixture' }).lean();
            assert.deepEqual(product.inventory, { M: 5, L: 0 });
            const listed = await call(listProducts, {});
            assert.equal(listed.body.products.find(p => String(p._id) === String(product._id)).inventory.get('M'), 5);
        });
        await t.test('legacy stock, One Size initialization, concurrent adjustments and negative corrections', async () => {
            const product = await fixture();
            await productModel.updateOne({ _id: product._id }, { $unset: { inventory: '' } });
            assert.equal(await stock(product), 0);
            await adjustInventory(String(product._id), { M: 5 });
            await Promise.all(Array.from({ length: 5 }, () => adjustInventory(String(product._id), { M: 1 })));
            assert.equal(await stock(product), 10);
            await assert.rejects(adjustInventory(String(product._id), { M: -11 }));
            await assert.rejects(adjustInventory(String(product._id), { M: -1, L: -1 }));
            assert.equal(await stock(product), 10);
            await assert.rejects(adjustInventory(String(product._id), { M: 0.5 }));
            const accessory = await fixture(0, []);
            const updated = await adjustInventory(String(accessory._id), { 'One Size': 3 });
            assert.deepEqual(updated.sizes, ['One Size']);
            assert.equal(await stock(accessory, 'One Size'), 3);
        });
        await t.test('cart does not reserve; canonical creation aggregates and reserves exactly once on retries', async () => {
            const product = await fixture();
            await call(addToCart, { userId: String(user._id), itemId: String(product._id), size: 'M' });
            assert.equal(await stock(product), 5);
            const request = data(product);
            request.items = [{ ...request.items[0], quantity: 1 }, { ...request.items[0], quantity: 1 }];
            const results = await Promise.all(Array.from({ length: 5 }, () => createReservedOrder(request)));
            assert.equal(new Set(results.map(order => String(order._id))).size, 1);
            assert.equal(await stock(product), 3);
            assert.equal(results[0].items.length, 1);
            assert.equal(results[0].amount, 460);
        });
        await t.test('concurrent buyers cannot oversell the last unit', async () => {
            const product = await fixture(1);
            const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => createReservedOrder(data(product, 1))));
            assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
            assert.equal(await stock(product), 0);
        });
        await t.test('multi-product failure and failed order validation roll back all deductions', async () => {
            const first = await fixture(5), second = await fixture(0);
            const request = data(first);
            request.items.push({ _id: String(second._id), size: 'M', quantity: 1 });
            await assert.rejects(createReservedOrder(request), /Insufficient stock/);
            assert.equal(await stock(first), 5);
            assert.equal(await orderModel.countDocuments({ requestId: request.requestId }), 0);
            const invalid = data(first); delete invalid.address;
            await assert.rejects(createReservedOrder(invalid));
            assert.equal(await stock(first), 5);
        });
        await t.test('admin cancellation and concurrent retries release once; active products cannot be deleted', async () => {
            const product = await fixture();
            const order = await createReservedOrder(data(product));
            const removal = await call(removeProduct, { id: String(product._id) });
            assert.equal(removal.body.success, false);
            const res = await call(controllers.updateStatus, { orderId: String(order._id), status: 'Cancelled' });
            assert.equal(res.body.success, true);
            await Promise.all(Array.from({ length: 5 }, () => cancelReservedOrder(String(order._id))));
            assert.equal(await stock(product), 5);
            assert.equal((await orderModel.findById(order._id)).inventoryStatus, 'released');
            assert.equal((await orderModel.findById(order._id)).cancellationSource, 'admin');
        });
        await t.test('authenticated customer cancellation retains history, restores all sizes once, and ignores supplied owner/status/source', async t => {
            const { default: express } = await import('express');
            const { default: router } = await import('../routes/orderRoute.js');
            const app = express(); app.use(express.json()); app.use('/api/order', router);
            const server = app.listen(0, '127.0.0.1');
            await new Promise(resolve => server.once('listening', resolve));
            t.after(() => new Promise(resolve => server.close(resolve)));
            const url = `http://127.0.0.1:${server.address().port}/api/order/cancel`;
            const token = issueAuthToken(String(user._id), 'customer');
            const post = async (body, credential = token) => {
                const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(credential ? { token: credential } : {}) }, body: JSON.stringify(body) });
                return { code: res.status, body: await res.json() };
            };
            const first = await fixture(10), second = await fixture(6);
            await adjustInventory(String(first._id), { L: 5 });
            const request = data(first);
            request.items = [{ ...request.items[0], quantity: 1 }, { ...request.items[0], quantity: 1 }, { _id: String(first._id), size: 'L', quantity: 1 }, { _id: String(second._id), size: 'M', quantity: 3 }];
            const order = await createReservedOrder(request);
            assert.equal(await stock(first), 8);
            const foreignToken = issueAuthToken(new mongoose.Types.ObjectId().toString(), 'customer');
            const foreign = await post({ orderId: String(order._id), userId: String(user._id) }, foreignToken);
            assert.equal(foreign.code, 404);
            assert.equal((await post({ orderId: String(order._id) }, null)).body.success, false);
            assert.equal(await stock(first), 8);
            const attempts = await Promise.all(Array.from({ length: 5 }, () => post({ orderId: String(order._id), userId: 'another-owner', status: 'Approved', cancellationSource: 'admin' })));
            assert(attempts.every(result => result.body.success));
            assert(attempts.every(result => result.body.order.cancellationSource === 'customer'));
            assert.equal(await stock(first), 10);
            assert.equal(await stock(first, 'L'), 5);
            assert.equal(await stock(second), 6);
            const retained = await orderModel.findById(order._id);
            assert.equal(retained.status, 'Cancelled');
            assert.equal(retained.inventoryStatus, 'released');
            assert.equal(retained.payment, false);
            assert.equal(retained.items.length, 3);
            const rejectedAgain = await call(controllers.updateStatus, { orderId: String(order._id), status: 'Cancelled' });
            assert.equal(rejectedAgain.body.order.cancellationSource, 'customer');
            assert.equal(await stock(first), 10);
            const customer = await call(controllers.userOrders, { userId: String(user._id) });
            assert.equal(customer.body.orders.find(item => String(item._id) === String(order._id)).cancellationSource, 'customer');
            const admin = await call(controllers.allOrders, {});
            assert.equal(admin.body.orders.find(item => String(item._id) === String(order._id)).cancellationSource, 'customer');
        });
        await t.test('customer cancellation after approval or later is rejected without restoring stock', async () => {
            for (const status of ['Approved', 'Sent to Cashier', 'Packing', 'Ready To Claim', 'Claimed']) {
                const product = await fixture(10), order = await createReservedOrder(data(product));
                await orderModel.updateOne({ _id: order._id }, { status });
                const cancelled = await call(controllers.cancelCustomerOrder, { orderId: String(order._id), userId: String(user._id) });
                assert.equal(cancelled.code, 409);
                assert.equal(cancelled.body.success, false);
                assert.equal(await stock(product), 8);
                assert.equal((await orderModel.findById(order._id)).status, status);
            }
        });
        await t.test('customer cancellation racing admin approval allows only one transition', async () => {
            for (let i = 0; i < 6; i++) {
                const product = await fixture(10), order = await createReservedOrder(data(product));
                const orderId = String(order._id);
                const [cancelled, approved] = await Promise.all([
                    call(controllers.cancelCustomerOrder, { orderId, userId: String(user._id) }),
                    call(controllers.updateStatus, { orderId, status: 'Approved' })
                ]);
                assert.equal(Number(cancelled.body.success) + Number(approved.body.success), 1);
                const stored = await orderModel.findById(orderId);
                assert.equal(stored.status, cancelled.body.success ? 'Cancelled' : 'Approved');
                assert.equal(await stock(product), cancelled.body.success ? 10 : 8);
                assert.equal(stored.inventoryStatus, cancelled.body.success ? 'released' : 'reserved');
            }
            const product = await fixture(10), order = await createReservedOrder(data(product));
            assert.equal((await call(controllers.cancelCustomerOrder, { orderId: String(order._id), userId: String(user._id) })).body.success, true);
            assert.equal((await call(controllers.updateStatus, { orderId: String(order._id), status: 'Approved' })).code, 409);
            assert.equal(await stock(product), 10);
        });
        await t.test('paid pre-approval cancellation preserves payment records; legacy cancellation does not invent stock', async () => {
            const product = await fixture(10);
            const paid = await createReservedOrder({ ...data(product, 2, 'Stripe'), payment: true, paidAt: 123456, receiptNumber: 'paid-cancel-' + randomUUID() });
            const res = await call(controllers.cancelCustomerOrder, { orderId: String(paid._id), userId: String(user._id) });
            assert.equal(res.body.success, true);
            const stored = await orderModel.findById(paid._id);
            assert.equal(stored.payment, true);
            assert.equal(stored.paidAt, paid.paidAt);
            assert.equal(stored.receiptNumber, paid.receiptNumber);
            assert.equal(await stock(product), 10);
            for (const source of ['customer', 'admin']) {
                const legacy = await orderModel.create(data(product));
                const res = await call(source === 'customer' ? controllers.cancelCustomerOrder : controllers.updateStatus, { orderId: String(legacy._id), userId: String(user._id), status: 'Cancelled' });
                assert.equal(res.body.success, true);
                assert.equal((await orderModel.findById(legacy._id)).cancellationSource, source);
                assert.equal(await stock(product), 10);
            }
        });
        await t.test('restoration failure rolls back both cancelled state and every inventory increment', async () => {
            const first = await fixture(10), second = await fixture(5);
            const request = data(first);
            request.items.push({ _id: String(second._id), size: 'M', quantity: 1 });
            const order = await createReservedOrder(request);
            await productModel.deleteOne({ _id: second._id });
            const res = await call(controllers.cancelCustomerOrder, { orderId: String(order._id), userId: String(user._id) });
            assert.equal(res.code, 500);
            assert.equal(await stock(first), 8);
            const stored = await orderModel.findById(order._id);
            assert.equal(stored.status, 'Order Placed');
            assert.equal(stored.inventoryStatus, 'reserved');
            assert.equal(stored.cancellationSource, undefined);
        });
        await t.test('COD approval, cashier and completion consume stock once; completed orders cannot release', async () => {
            const product = await fixture();
            const placed = await call(controllers.placeOrder, data(product));
            assert.equal(placed.body.success, true);
            const orderId = String(placed.body.orderId);
            assert.equal((await orderModel.findById(orderId)).paymentCurrency, 'PHP');
            for (const status of ['Approved', 'Sent to Cashier']) assert.equal((await call(controllers.updateStatus, { orderId, status })).body.success, true);
            assert.equal((await call(confirmCashierPayment, { orderId, paymentMethod: 'COD', receiptNumber: randomUUID() })).body.success, true);
            for (const status of ['Ready To Claim', 'Claimed']) assert.equal((await call(controllers.updateStatus, { orderId, status })).body.success, true);
            assert.equal(await stock(product), 3);
            await assert.rejects(cancelReservedOrder(orderId));
            assert.equal(await stock(product), 3);
        });
        for (const [method, place, verify] of [['Stripe', controllers.placeOrderStripe, controllers.verifyStripe], ['PayPal', controllers.placeOrderPaypal, controllers.verifyPaypal]]) {
            await t.test(`${method} creation and retries are contained before reservation`, async () => {
                const product = await fixture();
                const request = data(product, 2, method);
                const beforeCart = (await userModel.findById(user._id)).cartData;
                for (let attempt = 0; attempt < 2; attempt++) {
                    const res = await call(place, request);
                    assert.equal(res.code, 503); assert.equal(res.body.success, false);
                }
                assert.equal(await orderModel.countDocuments({ requestId: request.requestId }), 0);
                assert.equal(await stock(product), 5);
                assert.deepEqual((await userModel.findById(user._id)).cartData, beforeCart);
            });
            await t.test(`${method} rejected callbacks preserve pending and paid history exactly`, async () => {
                const product = await fixture(10);
                for (const metadata of [{ payment: false }, { payment: true }, { payment: true, paidAt: 123456 }]) {
                    const order = await createReservedOrder({ ...data(product, 1, method), ...metadata });
                    const before = await orderModel.findById(order._id).lean();
                    const beforeStock = await stock(product);
                    const beforeCart = (await userModel.findById(user._id)).cartData;
                    for (const success of ['true', 'false', 'true']) {
                        const res = await call(verify, { orderId: String(order._id), userId: String(user._id), success });
                        assert.equal(res.code, 503); assert.equal(res.body.success, false);
                    }
                    assert.deepEqual(await orderModel.findById(order._id).lean(), before);
                    assert.equal(await stock(product), beforeStock);
                    assert.deepEqual((await userModel.findById(user._id)).cartData, beforeCart);
                }
            });
            await t.test(`${method} callback cannot cancel; explicit customer cancellation still releases once`, async () => {
                const product = await fixture();
                const order = await createReservedOrder(data(product, 2, method));
                const request = { orderId: String(order._id), userId: String(user._id), success: 'false' };
                assert.equal((await call(verify, request)).code, 503);
                assert.equal(await stock(product), 3);
                assert.equal((await orderModel.findById(order._id)).status, 'Order Placed');
                for (let attempt = 0; attempt < 2; attempt++) {
                    assert.equal((await call(controllers.cancelCustomerOrder, request)).body.success, true);
                }
                assert.equal(await stock(product), 5);
                const before = await orderModel.findById(order._id).lean();
                assert.equal((await call(verify, { ...request, success: 'true' })).code, 503);
                assert.deepEqual(await orderModel.findById(order._id).lean(), before);
                assert.equal(await stock(product), 5);
            });
        }
    } finally {
        await cleanup();
    }
});
