import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import adminAuth from '../middleware/adminAuth.js'
import announcementModel from '../models/announcementModel.js'
import productModel from '../models/productModel.js'
import orderModel from '../models/orderModel.js'
import productRouter from '../routes/productRoute.js'
import {
    cancelPendingProductPricing,
    getProductPricing,
    listScheduledProductPricing,
    listProducts,
    replacePendingProductPricing,
    scheduleBulkProductPricing,
    singleProduct,
    updateProductPricing
} from '../controllers/productController.js'
import {
    addProductPriceChange,
    cancelPendingProductPriceChange,
    getNextProductPriceChangeAt,
    getScheduledProductPriceChanges,
    parseBulkProductPriceSchedule,
    presentProductPricing,
    presentPublicProduct,
    publicAnnouncementPriceComparisons,
    replacePendingProductPriceChange,
    resolveEffectiveProductPrice,
    scheduleBulkProductPriceChanges
} from '../utils/productPricing.js'
import { createReservedOrder } from '../utils/inventory.js'

const firstId = '0123456789abcdef01234567'
const secondId = '1123456789abcdef01234567'
const pendingChangeId = '2123456789abcdef01234567'
const now = Date.parse('2026-10-25T04:00:00.000Z')

const productFixture = overrides => ({
    _id: firstId,
    name: 'Synthetic uniform',
    description: 'Pricing fixture',
    price: 100,
    image: [],
    category: 'Men',
    subCategory: 'BSIT',
    sizes: ['M'],
    inventory: { M: 5 },
    date: now - 1000,
    priceChanges: [],
    ...overrides
})

const response = () => ({
    code: 200,
    status(code) {
        this.code = code
        return this
    },
    json(body) {
        this.body = body
        return this
    }
})

test('Product validates PHP price changes while legacy products retain an empty history', async () => {
    const legacy = new productModel(productFixture({ _id: undefined, priceChanges: undefined }))
    await legacy.validate()
    assert.deepEqual(legacy.priceChanges, [])

    const valid = new productModel(productFixture({
        _id: undefined,
        priceChanges: [{ amount: 120.5, effectiveAt: new Date(now), createdAt: new Date(now - 1) }]
    }))
    await valid.validate()

    const invalid = new productModel(productFixture({
        _id: undefined,
        priceChanges: [{ amount: 120.001, effectiveAt: new Date(now), createdAt: new Date(now - 1) }]
    }))
    await assert.rejects(invalid.validate())
})

test('effective pricing uses server time, retains cancelled history, and hides internal changes publicly', () => {
    const product = productFixture({
        priceChanges: [
            { _id: 'past', amount: 120, effectiveAt: new Date(now - 1000), createdAt: new Date(now - 2000), cancelledAt: null },
            { _id: 'cancelled', amount: 130, effectiveAt: new Date(now + 500), createdAt: new Date(now - 500), cancelledAt: new Date(now - 100) },
            { _id: 'pending', amount: 140, effectiveAt: new Date(now + 1000), createdAt: new Date(now - 400), cancelledAt: null }
        ]
    })

    assert.equal(resolveEffectiveProductPrice(product, now), 120)
    assert.equal(resolveEffectiveProductPrice(product, now + 1000), 140)

    const publicProduct = presentPublicProduct(product, now)
    assert.equal(publicProduct.price, 120)
    assert.equal(Object.hasOwn(publicProduct, 'priceChanges'), false)
    assert.equal(product.price, 100)
    assert.equal(product.priceChanges.length, 3)
    assert.equal(getNextProductPriceChangeAt([product], now), new Date(now + 1000).toISOString())

    const pricing = presentProductPricing(product, now)
    assert.equal(pricing.basePrice, 100)
    assert.equal(pricing.currentPrice, 120)
    assert.equal(pricing.pendingChange.amount, 140)
    assert.deepEqual(pricing.history.map(change => change.status), ['effective', 'cancelled', 'pending'])
})

test('scheduling and cancellation use conditional atomic updates and retain cancelled records', async t => {
    let captured
    const update = t.mock.method(productModel, 'findOneAndUpdate', async (filter, operation, options) => {
        captured = { filter, operation, options }
        return productFixture({ priceChanges: [operation.$push?.priceChanges].filter(Boolean) })
    })
    const effectiveAt = new Date(now + 60_000).toISOString()

    await addProductPriceChange({ id: firstId, amount: '220.00', now })
    assert.deepEqual(captured.filter, { _id: firstId })
    assert.equal(captured.operation.$push.priceChanges.amount, 220)
    assert.equal(captured.operation.$push.priceChanges.effectiveAt.getTime(), now)

    await addProductPriceChange({ id: firstId, amount: '235.00', effectiveAt, now })
    assert.deepEqual(captured.filter.priceChanges, {
        $not: { $elemMatch: { effectiveAt: { $gt: new Date(now) }, cancelledAt: null } }
    })
    assert.equal(captured.operation.$push.priceChanges.amount, 235)
    assert.equal(captured.operation.$push.priceChanges.effectiveAt.toISOString(), effectiveAt)
    assert.deepEqual(captured.options, { returnDocument: 'after', runValidators: true })

    update.mock.mockImplementation(async () => null)
    t.mock.method(productModel, 'exists', async () => ({ _id: firstId }))
    await assert.rejects(
        addProductPriceChange({ id: firstId, amount: 250, effectiveAt, now }),
        error => error.status === 409
    )

    update.mock.mockImplementation(async (filter, operation, options) => {
        captured = { filter, operation, options }
        return productFixture({
            priceChanges: [{
                amount: 235,
                effectiveAt: new Date(effectiveAt),
                createdAt: new Date(now),
                cancelledAt: operation.$set['priceChanges.$.cancelledAt']
            }]
        })
    })
    const cancelled = await cancelPendingProductPriceChange({ id: firstId, now })
    assert.equal(captured.filter.priceChanges.$elemMatch.cancelledAt, null)
    assert.equal(captured.operation.$set['priceChanges.$.cancelledAt'].getTime(), now)
    assert.equal(cancelled.priceChanges[0].amount, 235)
    assert.equal(cancelled.priceChanges[0].cancelledAt.getTime(), now)
})

test('pending replacement cancels history and appends its replacement in one transaction', async t => {
    const session = { id: 'pricing-replacement-session' }
    const changes = [{
        _id: pendingChangeId,
        amount: 235,
        effectiveAt: new Date(now + 60_000),
        createdAt: new Date(now - 1000),
        cancelledAt: null
    }]
    t.mock.method(mongoose.connection, 'transaction', async work => work(session))
    const update = t.mock.method(productModel, 'findOneAndUpdate', async (filter, operation, options) => {
        assert.equal(options.session, session)
        assert.equal(options.returnDocument, 'after')
        assert.equal(options.runValidators, true)
        if (operation.$set) {
            assert.equal(filter.priceChanges.$elemMatch._id, pendingChangeId)
            changes[0].cancelledAt = operation.$set['priceChanges.$.cancelledAt']
        } else {
            assert.deepEqual(filter.priceChanges.$not.$elemMatch, {
                effectiveAt: { $gt: new Date(now) },
                cancelledAt: null
            })
            changes.push(operation.$push.priceChanges)
        }
        return productFixture({ priceChanges: structuredClone(changes) })
    })

    const product = await replacePendingProductPriceChange({
        id: firstId,
        pendingChangeId,
        amount: '250.00',
        effectiveAt: new Date(now + 120_000).toISOString(),
        now
    })

    assert.equal(update.mock.callCount(), 2)
    assert.equal(product.priceChanges[0].cancelledAt.getTime(), now)
    assert.equal(product.priceChanges[1].amount, 250)
    assert.equal(product.priceChanges[1].cancelledAt, null)
    assert.deepEqual(
        presentProductPricing(product, now).history.map(change => change.status),
        ['cancelled', 'pending']
    )
})

test('failed pending replacement rolls back cancellation and rejects invalid PHP or dates before writing', async t => {
    const original = [{
        _id: pendingChangeId,
        amount: 235,
        effectiveAt: new Date(now + 60_000),
        createdAt: new Date(now - 1000),
        cancelledAt: null
    }]
    let changes = structuredClone(original)
    const transaction = t.mock.method(mongoose.connection, 'transaction', async work => {
        const snapshot = structuredClone(changes)
        try {
            return await work({})
        } catch (error) {
            changes = snapshot
            throw error
        }
    })
    let writes = 0
    t.mock.method(productModel, 'findOneAndUpdate', async (_filter, operation) => {
        writes += 1
        if (operation.$set) {
            changes[0].cancelledAt = operation.$set['priceChanges.$.cancelledAt']
            return productFixture({ priceChanges: structuredClone(changes) })
        }
        return null
    })

    await assert.rejects(
        replacePendingProductPriceChange({
            id: firstId,
            pendingChangeId,
            amount: 250,
            effectiveAt: new Date(now + 120_000).toISOString(),
            now
        }),
        error => error.status === 409
    )
    assert.deepEqual(changes, original)
    assert.equal(writes, 2)

    await assert.rejects(
        replacePendingProductPriceChange({
            id: firstId,
            pendingChangeId,
            amount: 250.001,
            effectiveAt: new Date(now + 120_000).toISOString(),
            now
        }),
        error => error.status === 400
    )
    await assert.rejects(
        replacePendingProductPriceChange({
            id: firstId,
            pendingChangeId,
            amount: 250,
            effectiveAt: new Date(now).toISOString(),
            now
        }),
        error => error.status === 400
    )
    assert.equal(transaction.mock.callCount(), 1)
})

test('stale concurrent replacement is rejected before another pending change is written', async t => {
    t.mock.method(mongoose.connection, 'transaction', async work => work({}))
    const update = t.mock.method(productModel, 'findOneAndUpdate', async () => null)
    t.mock.method(productModel, 'exists', () => ({
        session: async () => ({ _id: firstId })
    }))

    await assert.rejects(
        replacePendingProductPriceChange({
            id: firstId,
            pendingChangeId,
            amount: 250,
            effectiveAt: new Date(now + 120_000).toISOString(),
            now
        }),
        error => error.status === 409 && /changed/.test(error.message)
    )
    assert.equal(update.mock.callCount(), 1)
})

test('bulk scheduling validates every price before opening a transaction', async t => {
    const transaction = t.mock.method(mongoose.connection, 'transaction', async () => {})
    const effectiveAt = new Date(now + 60_000).toISOString()

    assert.throws(
        () => parseBulkProductPriceSchedule({
            changes: [
                { productId: firstId, price: 200 },
                { productId: firstId, price: 210 }
            ],
            effectiveAt
        }, now),
        /only once/
    )
    await assert.rejects(
        scheduleBulkProductPriceChanges({
            body: {
                changes: [{ productId: firstId, price: 200.001 }],
                effectiveAt
            },
            now
        }),
        error => error.status === 400
    )
    await assert.rejects(
        scheduleBulkProductPriceChanges({
            body: {
                changes: [{ productId: firstId, price: 200 }],
                effectiveAt: new Date(now).toISOString()
            },
            now
        }),
        error => error.status === 400
    )
    assert.equal(transaction.mock.callCount(), 0)
})

test('bulk scheduling atomically writes every product and one requested announcement', async t => {
    const session = { id: 'bulk-pricing-session' }
    const products = [
        productFixture({ image: ['first.jpg'] }),
        productFixture({ _id: secondId, name: 'Second uniform', price: 150 })
    ]
    t.mock.method(mongoose.connection, 'transaction', async work => work(session))
    t.mock.method(productModel, 'find', filter => ({
        session(receivedSession) {
            assert.equal(receivedSession, session)
            return this
        },
        lean: async () => products.filter(product => {
            return filter._id.$in.map(String).includes(String(product._id))
        })
    }))
    let operations
    const bulkWrite = t.mock.method(productModel, 'bulkWrite', async (writes, options) => {
        operations = writes
        assert.deepEqual(options, { session, ordered: true })
        return { matchedCount: writes.length }
    })
    let createdAnnouncement
    const create = t.mock.method(announcementModel, 'create', async ([values], options) => {
        createdAnnouncement = values
        assert.deepEqual(options, { session })
        return [{ _id: pendingChangeId, ...values }]
    })

    const effectiveAt = new Date(now + 60_000).toISOString()
    const result = await scheduleBulkProductPriceChanges({
        body: {
            changes: [
                { productId: firstId, price: '200.00' },
                { productId: secondId, price: 250 }
            ],
            effectiveAt,
            announceToStudents: true
        },
        now
    })

    assert.equal(bulkWrite.mock.callCount(), 1)
    assert.equal(operations.length, 2)
    assert.equal(operations[0].updateOne.update.$push.priceChanges.amount, 200)
    assert.equal(operations[1].updateOne.update.$push.priceChanges.amount, 250)
    assert.equal(create.mock.callCount(), 1)
    assert.equal(createdAnnouncement.type, 'price-change')
    assert.equal(createdAnnouncement.enabled, true)
    assert.equal(createdAnnouncement.expiresAt.toISOString(), effectiveAt)
    assert.deepEqual(
        createdAnnouncement.priceChangeLinks.map(link => String(link.productId)),
        [firstId, secondId]
    )
    assert.equal(result.announcementId, pendingChangeId)
    assert.deepEqual(result.changes.map(change => change.previousPrice), [100, 150])

    await scheduleBulkProductPriceChanges({
        body: {
            changes: [{ productId: firstId, price: 205 }],
            effectiveAt: new Date(now + 120_000).toISOString(),
            announceToStudents: false
        },
        now
    })
    assert.equal(create.mock.callCount(), 1)
})

test('bulk scheduling aborts missing, conflicting, and concurrent requests without an announcement', async t => {
    const session = { id: 'bulk-pricing-failure-session' }
    let products = [productFixture()]
    t.mock.method(mongoose.connection, 'transaction', async work => work(session))
    t.mock.method(productModel, 'find', () => ({
        session() {
            return this
        },
        lean: async () => products
    }))
    let bulkResult = { matchedCount: 1 }
    const bulkWrite = t.mock.method(productModel, 'bulkWrite', async () => bulkResult)
    const create = t.mock.method(announcementModel, 'create', async () => {
        throw new Error('Announcement must not be created.')
    })
    const request = {
        changes: [
            { productId: firstId, price: 200 },
            { productId: secondId, price: 250 }
        ],
        effectiveAt: new Date(now + 60_000).toISOString(),
        announceToStudents: true
    }

    await assert.rejects(
        scheduleBulkProductPriceChanges({ body: request, now }),
        error => error.status === 404
    )
    assert.equal(bulkWrite.mock.callCount(), 0)

    products = [
        productFixture(),
        productFixture({ _id: secondId, price: 150 })
    ]
    await assert.rejects(
        scheduleBulkProductPriceChanges({ body: request, now }),
        error => error.status === 409
    )
    assert.equal(create.mock.callCount(), 0)

    bulkWrite.mock.mockImplementation(async () => {
        const error = new Error('write conflict')
        error.code = 112
        throw error
    })
    await assert.rejects(
        scheduleBulkProductPriceChanges({ body: request, now }),
        error => error.status === 409 && /concurrently/.test(error.message)
    )
    assert.equal(create.mock.callCount(), 0)
})

test('public comparisons resolve exact authoritative changes and omit cancelled replacements', () => {
    const activeChange = {
        _id: pendingChangeId,
        amount: 200,
        effectiveAt: new Date(now + 60_000),
        createdAt: new Date(now),
        cancelledAt: null
    }
    const product = productFixture({
        name: 'Authoritative uniform',
        image: ['uniform.jpg'],
        priceChanges: [activeChange]
    })
    const announcement = {
        priceChangeLinks: [{ productId: firstId, priceChangeId: pendingChangeId }]
    }

    assert.deepEqual(publicAnnouncementPriceComparisons(announcement, [product]), [{
        productId: firstId,
        name: 'Authoritative uniform',
        image: 'uniform.jpg',
        previousPrice: 100,
        newPrice: 200,
        effectiveAt: new Date(now + 60_000).toISOString()
    }])

    activeChange.cancelledAt = new Date(now + 1000)
    product.priceChanges.push({
        _id: new mongoose.Types.ObjectId(),
        amount: 210,
        effectiveAt: new Date(now + 120_000),
        createdAt: new Date(now + 1000),
        cancelledAt: null
    })
    assert.deepEqual(publicAnnouncementPriceComparisons(announcement, [product]), [])
})

test('scheduled pricing list derives current prices and exact announcement status', async t => {
    const effectiveAt = new Date(now + 60_000)
    const products = [
        productFixture({
            image: ['uniform.jpg'],
            priceChanges: [{
                _id: pendingChangeId,
                amount: 200,
                effectiveAt,
                createdAt: new Date(now),
                cancelledAt: null
            }]
        })
    ]
    t.mock.method(productModel, 'find', () => ({ lean: async () => products }))
    t.mock.method(announcementModel, 'find', () => ({
        lean: async () => [{
            _id: secondId,
            enabled: true,
            publishAt: new Date(now),
            expiresAt: effectiveAt,
            priceChangeLinks: [{
                productId: firstId,
                priceChangeId: pendingChangeId
            }]
        }]
    }))

    assert.deepEqual(await getScheduledProductPriceChanges(now), [{
        productId: firstId,
        name: 'Synthetic uniform',
        image: 'uniform.jpg',
        currentPrice: 100,
        scheduledPrice: 200,
        effectiveAt: effectiveAt.toISOString(),
        pendingChangeId,
        announcementId: secondId,
        announcementStatus: 'active'
    }])
})

test('public product endpoints resolve one effective price and omit price history', async t => {
    const product = productFixture({
        priceChanges: [
            { amount: 125, effectiveAt: new Date(now - 1), createdAt: new Date(now - 2) },
            { amount: 150, effectiveAt: new Date(now + 1000), createdAt: new Date(now - 1) }
        ]
    })
    t.mock.method(Date, 'now', () => now)
    t.mock.method(productModel, 'find', () => ({
        select() { return { lean: async () => [] } },
        then(resolve, reject) { return Promise.resolve([product]).then(resolve, reject) }
    }))
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }))
    t.mock.method(productModel, 'findById', () => ({
        lean: async () => product,
        then(resolve, reject) { return Promise.resolve(product).then(resolve, reject) }
    }))

    const listed = response()
    await listProducts({}, listed)
    assert.equal(listed.body.products[0].price, 125)
    assert.equal(Object.hasOwn(listed.body.products[0], 'priceChanges'), false)
    assert.equal(listed.body.nextPriceChangeAt, new Date(now + 1000).toISOString())

    const single = response()
    await singleProduct({ body: { productId: firstId } }, single)
    assert.equal(single.body.product.price, 125)
    assert.equal(Object.hasOwn(single.body.product, 'priceChanges'), false)
})

test('all pricing management routes require Admin authorization', () => {
    const routes = productRouter.stack.filter(layer => layer.route?.path?.startsWith('/pricing/'))
    const getRoute = routes.find(layer => {
        return layer.route.path === '/pricing/:id' && layer.route.methods.get
    }).route
    const patchRoute = routes.find(layer => layer.route.path === '/pricing/:id' && layer.route.methods.patch).route
    const replaceRoute = routes.find(layer => layer.route.path === '/pricing/:id/pending' && layer.route.methods.patch).route
    const deleteRoute = routes.find(layer => layer.route.methods.delete).route
    const bulkRoute = routes.find(layer => layer.route.path === '/pricing/bulk').route
    const scheduledRoute = routes.find(layer => layer.route.path === '/pricing/scheduled').route

    assert.deepEqual(getRoute.stack.map(layer => layer.handle), [adminAuth, getProductPricing])
    assert.deepEqual(patchRoute.stack.map(layer => layer.handle), [adminAuth, updateProductPricing])
    assert.deepEqual(replaceRoute.stack.map(layer => layer.handle), [adminAuth, replacePendingProductPricing])
    assert.deepEqual(deleteRoute.stack.map(layer => layer.handle), [adminAuth, cancelPendingProductPricing])
    assert.deepEqual(bulkRoute.stack.map(layer => layer.handle), [adminAuth, scheduleBulkProductPricing])
    assert.deepEqual(scheduledRoute.stack.map(layer => layer.handle), [adminAuth, listScheduledProductPricing])
})

test('checkout resolves every item against one server pricing timestamp', async t => {
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }))
    let savedOrder
    let dateReads = 0
    const futureTime = now + 3
    const products = new Map([
        [firstId, productFixture({
            price: 100,
            priceChanges: [{ amount: 150, effectiveAt: new Date(futureTime), createdAt: new Date(now) }]
        })],
        [secondId, productFixture({
            _id: secondId,
            price: 200,
            priceChanges: [{ amount: 250, effectiveAt: new Date(futureTime), createdAt: new Date(now) }]
        })]
    ])

    t.mock.method(Date, 'now', () => {
        dateReads += 1
        return now + dateReads * 2
    })
    t.mock.method(orderModel, 'init', async () => {})
    t.mock.method(orderModel, 'findOne', () => ({
        session() {
            return this
        },
        then(resolve, reject) {
            return Promise.resolve(null).then(resolve, reject)
        }
    }))
    t.mock.method(mongoose.connection, 'transaction', async callback => callback({}))
    t.mock.method(productModel, 'findById', productId => ({
        session() {
            return this
        },
        lean: async () => products.get(String(productId))
    }))
    t.mock.method(productModel, 'updateOne', async () => ({ modifiedCount: 1 }))
    t.mock.method(orderModel, 'create', async ([order]) => {
        savedOrder = order
        return [{ _id: firstId, ...order }]
    })

    await createReservedOrder({
        userId: firstId,
        requestId: 'pricing-timestamp-fixture',
        paymentMethod: 'COD',
        paymentCurrency: 'PHP',
        items: [
            { _id: firstId, size: 'M', quantity: 1 },
            { _id: secondId, size: 'M', quantity: 1 }
        ],
        pricingQuote: [
            { _id: firstId, size: 'M', price: 100 },
            { _id: secondId, size: 'M', price: 200 }
        ]
    })

    assert.equal(dateReads, 1)
    assert.deepEqual(savedOrder.items.map(item => item.price), [100, 200])
    assert.equal(savedOrder.amount, 310)
    assert.equal(Object.hasOwn(savedOrder, 'pricingQuote'), false)
})
