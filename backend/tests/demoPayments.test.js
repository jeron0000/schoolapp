import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import orderModel from '../models/orderModel.js'
import productModel from '../models/productModel.js'
import userModel from '../models/userModel.js'
import categoryModel from '../models/categoryModel.js'
import { demoPaymentsEnabled, getApplicationDatabaseName } from '../config/paymentDemo.js'
import { cancelReservedOrder } from '../utils/inventory.js'
import { placeDemoOrder, resolveDemoPayment, getDemoPayment, demoPaymentOptions } from '../controllers/orderController.js'
import { getAllowedOrderStatuses } from '../utils/orderStatus.js'
import { cancellationRefund } from '../utils/orderRefund.js'
import { refundPresentation } from '../../shared/refund.js'
import { isDemoOrder } from '../../shared/demoPayment.js'
import orderRouter from '../routes/orderRoute.js'
import authUser from '../middleware/auth.js'

const owner = '1123456789abcdef01234567'
const productId = '2123456789abcdef01234567'
const orderId = '3123456789abcdef01234567'
const clone = value => structuredClone(value)
const property = (t, object, key, value) => {
    const original = Object.getOwnPropertyDescriptor(object, key)
    Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value })
    t.after(() => {
        if (original) Object.defineProperty(object, key, original)
        else Reflect.deleteProperty(object, key)
    })
}
const valueAt = (object, path) => path.split('.').reduce((value, key) => value?.[key], object)
const matches = (object, filter) => Object.entries(filter).every(([path, expected]) => {
    if (path === '$and') return expected.every(item => matches(object, item))
    if (path === '$or') return expected.some(item => matches(object, item))
    const actual = valueAt(object, path)
    if (expected && typeof expected === 'object') {
        if ('$exists' in expected) return (actual !== undefined) === expected.$exists
        if ('$type' in expected) return actual && typeof actual === expected.$type && !Array.isArray(actual)
        if ('$ne' in expected) return actual !== expected.$ne
        if ('$gte' in expected) return actual >= expected.$gte
        if ('$lte' in expected) return actual <= expected.$lte
    }
    return actual === expected
})
const change = (object, update) => {
    for (const [operation, fields] of Object.entries(update)) {
        for (const [path, value] of Object.entries(fields)) {
            const keys = path.split('.'), last = keys.pop()
            let parent = object
            for (const key of keys) parent = parent[key] ||= {}
            if (operation === '$unset') delete parent[last]
            else if (operation === '$inc') parent[last] = (parent[last] || 0) + value
            else parent[last] = clone(value)
        }
    }
}
const document = data => data && ({ ...clone(data), toObject: () => clone(data) })
const query = data => ({
    select() { return this }, session() { return this },
    lean: async () => clone(data),
    then(resolve, reject) { return Promise.resolve(document(data)).then(resolve, reject) }
})
const response = () => ({ code: 200, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } })
const call = async (handler, body = {}, id = orderId) => {
    const res = response()
    await handler({ body: { userId: owner, ...body }, params: { orderId: id } }, res)
    return res
}
const harness = t => {
    property(t, process.env, 'PAMO_PAYMENT_MODE', 'demo')
    property(t, process.env, 'PAMO_DEMO_DATABASE', 'pamo_demo_thesis')
    property(t, mongoose.connection, 'readyState', 1)
    property(t, mongoose.connection, 'name', 'pamo_demo_thesis')
    const state = {
        order: null, creations: 0, stock: 10,
        user: { _id: owner, name: 'Demo Student', email: 'demo@example.test', role: 'customer', academicProgram: 'BSIT',
            cartData: { [productId]: { M: 1, L: 2 } }, cartVersions: { [productId]: { M: 4, L: 2 } } }
    }
    t.mock.method(categoryModel, 'findOne', () => query(null))
    t.mock.method(userModel, 'findById', () => query(state.user))
    t.mock.method(userModel, 'updateOne', async (filter, update) => {
        if (!matches(state.user, filter)) return { modifiedCount: 0 }
        change(state.user, update)
        return { modifiedCount: 1 }
    })
    t.mock.method(orderModel, 'init', async () => {})
    t.mock.method(orderModel, 'findOne', filter => query(matches(state.order || {}, filter) ? state.order : null))
    t.mock.method(orderModel, 'create', async ([data]) => {
        state.creations++
        state.order = { _id: orderId, status: 'Order Placed', ...clone(data) }
        return [document(state.order)]
    })
    t.mock.method(orderModel, 'findOneAndUpdate', async (filter, update) => {
        if (!state.order || !matches(state.order, filter)) return null
        change(state.order, update)
        return document(state.order)
    })
    t.mock.method(mongoose.connection, 'transaction', async work => work({}))
    t.mock.method(productModel, 'findOne', () => query(null))
    t.mock.method(productModel, 'findById', () => query({ _id: productId, name: 'Demo Shirt', price: 225,
        sizes: ['M', 'L'], image: [], inventory: { M: state.stock, L: 3 } }))
    t.mock.method(productModel, 'updateOne', async (filter, update) => {
        if (!matches({ _id: productId, sizes: filter.sizes, inventory: { M: state.stock } }, filter)) return { modifiedCount: 0, matchedCount: 0 }
        state.stock += update.$inc['inventory.M']
        return { modifiedCount: 1, matchedCount: 1 }
    })
    state.checkout = provider => ({
        demoProvider: provider, requestId: 'demo-checkout-request-123', amount: 1,
        items: [{ _id: productId, size: 'M', quantity: 1, price: 1 }],
        pricingQuote: [{ _id: productId, size: 'M', price: 225 }],
        checkoutCart: { cartData: clone(state.user.cartData), cartVersions: clone(state.user.cartVersions) }
    })
    return state
}

test('demo mode requires explicit configuration and the actual isolated database; live mode is disabled', async t => {
    const demoEnv = { PAMO_PAYMENT_MODE: 'demo', PAMO_DEMO_DATABASE: 'pamo_demo_thesis' }
    assert.equal(getApplicationDatabaseName({}), 'e-commerce')
    assert.equal(getApplicationDatabaseName(demoEnv), 'pamo_demo_thesis')
    assert.throws(() => getApplicationDatabaseName({ ...demoEnv, PAMO_DEMO_DATABASE: 'e-commerce' }), /dedicated/)
    assert.equal(demoPaymentsEnabled(demoEnv, { readyState: 1, name: 'e-commerce' }), false)
    assert.equal(demoPaymentsEnabled({ ...demoEnv, PAMO_PAYMENT_MODE: 'live' }, { readyState: 1, name: 'pamo_demo_thesis' }), false)
    harness(t)
    mongoose.connection.name = 'e-commerce'
    assert.equal((await call(placeDemoOrder)).code, 403)
    mongoose.connection.name = 'pamo_demo_thesis'
    process.env.PAMO_PAYMENT_MODE = 'live'
    t.mock.method(orderModel, 'findOne', () => assert.fail('Disabled demo must not read orders'))
    assert.equal((await call(placeDemoOrder)).code, 403)
    assert.equal((await call(resolveDemoPayment, { outcome: 'succeeded' })).code, 403)
    assert.equal((await call(getDemoPayment)).code, 403)
    assert.equal((await call(demoPaymentOptions)).body.enabled, false)
})

for (const provider of ['stripe', 'paypal']) {
    test(`${provider} demo reserves once, uses server prices and automatically accepts simulated success`, async t => {
        const h = harness(t)
        const request = h.checkout(provider)
        request.payment = true
        request.receiptNumber = 'FORGED-OFFICIAL-RECEIPT'
        request.stripePayment = { verifiedAt: 1 }
        assert.equal((await call(placeDemoOrder, request)).body.success, true)
        assert.equal((await call(placeDemoOrder, request)).body.orderId, orderId)
        assert.equal(h.creations, 1)
        assert.equal(h.stock, 9)
        assert.equal(h.order.amount, 235)
        assert.deepEqual(getAllowedOrderStatuses(h.order), [])
        assert.equal(h.user.cartData[productId].M, 1)
        const responses = await Promise.all([call(resolveDemoPayment, { outcome: 'succeeded' }), call(resolveDemoPayment, { outcome: 'succeeded' })])
        assert(responses.every(res => res.body.success))
        assert.equal(responses[0].body.order.demoPayment.transactionId, responses[1].body.order.demoPayment.transactionId)
        assert.match(h.order.demoPayment.transactionId, /^DEMO-(STRIPE|PAYPAL)-/)
        assert.equal(h.order.payment, true)
        assert.equal(h.order.status, 'Approved')
        assert.deepEqual(h.user.cartData[productId], { L: 2 })
        assert.equal(h.stock, 9)
        assert.equal(h.order.receiptNumber, undefined)
        assert.equal(h.order.stripePayment, undefined)
        assert.equal(h.order.paypalPayment, undefined)
        assert.equal(h.order.refund, undefined)
        await new orderModel(h.order).validate()
        assert.equal((await call(getDemoPayment)).body.order.demoPayment.transactionId, h.order.demoPayment.transactionId)
    })
}

for (const outcome of ['failed', 'cancelled']) {
    test(`${outcome} demo restores once and preserves all cart entries without a refund`, async t => {
        const h = harness(t)
        await call(placeDemoOrder, h.checkout('paypal'))
        const cart = clone(h.user.cartData)
        assert.equal((await call(resolveDemoPayment, { outcome })).body.success, true)
        assert.equal((await call(resolveDemoPayment, { outcome })).body.success, true)
        assert.equal(h.order.demoPayment.status, outcome)
        assert.equal(h.order.status, 'Cancelled')
        assert.equal(h.order.inventoryStatus, 'released')
        assert.equal(h.order.payment, false)
        assert.equal(h.stock, 10)
        assert.deepEqual(h.user.cartData, cart)
        assert.equal(h.order.refund, undefined)
        assert.equal((await call(resolveDemoPayment, { outcome: 'succeeded' })).code, 409)
    })
}

test('conflicting demo results cannot overwrite success or release its stock', async t => {
    const h = harness(t)
    await call(placeDemoOrder, h.checkout('stripe'))
    await Promise.all([call(resolveDemoPayment, { outcome: 'succeeded' }), call(resolveDemoPayment, { outcome: 'failed' })])
    assert.equal(h.order.demoPayment.status, 'succeeded')
    assert.equal(h.stock, 9)
    assert.equal(h.order.inventoryStatus, 'reserved')
    assert.equal((await call(resolveDemoPayment, { outcome: 'cancelled' })).code, 409)
})

test('demo checkout rejects stale carts and prices, insufficient stock, invalid providers and other owners', async t => {
    const h = harness(t)
    const request = h.checkout('stripe')
    h.user.cartVersions[productId].M++
    assert.equal((await call(placeDemoOrder, request)).code, 409)
    assert.equal((await call(placeDemoOrder, h.checkout('__proto__'))).code, 400)
    const stalePrice = h.checkout('stripe')
    stalePrice.pricingQuote[0].price = 1
    assert.equal((await call(placeDemoOrder, stalePrice)).body.code, 'STALE_PRODUCT_PRICE')
    h.stock = 0
    assert.equal((await call(placeDemoOrder, h.checkout('stripe'))).body.success, false)
    assert.equal(h.creations, 0)
    h.stock = 10
    await call(placeDemoOrder, h.checkout('stripe'))
    assert.equal((await call(resolveDemoPayment, { userId: productId, outcome: 'succeeded' })).code, 404)
    assert.equal(h.order.payment, false)
})

test('successful demo cleanup preserves concurrent quantities and genuine payments cannot become demo money', async t => {
    const h = harness(t)
    await call(placeDemoOrder, h.checkout('stripe'))
    h.user.cartData[productId].M = 3
    h.user.cartVersions[productId].M++
    await call(resolveDemoPayment, { outcome: 'succeeded' })
    assert.equal(h.user.cartData[productId].M, 3)
    assert.equal(cancellationRefund(h.order), undefined)
    const cancelled = { ...h.order, status: 'Cancelled' }
    assert.match(refundPresentation(cancelled).message, /No money was charged/)
    const real = { ...cancelled, paymentMethod: 'Stripe', stripePayment: { verifiedAt: 1 } }
    assert.equal(isDemoOrder(real), false)
    assert.equal(cancellationRefund({ ...real, status: 'Approved' }).status, 'Refund Required')
    assert.equal((await call(getDemoPayment)).body.order.payment, true)
})

test('reviewed cancellation of an accepted demo restores stock without a genuine refund obligation', async t => {
    const h = harness(t)
    await call(placeDemoOrder, h.checkout('paypal'))
    await call(resolveDemoPayment, { outcome: 'succeeded' })
    const transactionId = h.order.demoPayment.transactionId
    const requestId = '4123456789abcdef01234567'
    h.order.cancellationRequest = { _id: requestId, status: 'pending', reason: 'Demo review', requestedAt: 1 }
    await cancelReservedOrder(orderId, { source: 'admin', cancellationRequestId: requestId })
    await cancelReservedOrder(orderId, { source: 'admin', cancellationRequestId: requestId })
    assert.equal(h.stock, 10)
    assert.equal(h.order.refund, undefined)
    assert.equal(h.order.demoPayment.transactionId, transactionId)
    assert.equal(h.order.cancellationRequest.status, 'approved')
})

test('all demo order routes retain student authentication and demo IDs are never official receipts', () => {
    for (const path of ['/demo/options', '/demo/place', '/demo/:orderId', '/demo/:orderId/result']) {
        const route = orderRouter.stack.find(layer => layer.route?.path === path).route
        assert.equal(route.stack[0].handle, authUser)
    }
    assert.equal(isDemoOrder({ demoPayment: { mode: 'demo' } }), false)
})
