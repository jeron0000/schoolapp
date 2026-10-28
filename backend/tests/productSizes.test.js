import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import productModel from '../models/productModel.js'
import orderModel from '../models/orderModel.js'
import productRouter from '../routes/productRoute.js'
import adminAuth from '../middleware/adminAuth.js'
import { updateProductSizes } from '../controllers/productController.js'
import {
    adjustInventory,
    aggregateOrderItems,
    replaceProductSizes,
    validateInitialInventory
} from '../utils/inventory.js'
import { hasSizeLabel, isValidSizeLabel, normalizeSizeLabel } from '../../shared/inventory.js'

const productId = '0123456789abcdef01234567'
const session = { id: 'size-management-session' }

const fixture = overrides => ({
    _id: productId,
    name: 'Managed uniform',
    description: 'Synthetic product',
    price: 225,
    image: [],
    sizes: ['M'],
    inventory: { M: 5 },
    date: Date.now(),
    ...overrides
})

const response = () => ({
    statusCode: 200,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    }
})

const productQuery = value => ({
    session(receivedSession) {
        assert.equal(receivedSession, session)
        return { lean: async () => structuredClone(value) }
    }
})

const sessionQuery = value => ({
    session(receivedSession) {
        assert.equal(receivedSession, session)
        return Promise.resolve(value)
    }
})

const mockTransaction = t => {
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }))
    return t.mock.method(mongoose.connection, 'transaction', async callback => callback(session))
}

test('size management route preserves Admin authorization', () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/sizes/:id').route
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, updateProductSizes])
    assert.equal(route.methods.patch, true)
})

test('custom size labels normalize safely and compare case-insensitively', () => {
    assert.equal(normalizeSizeLabel(' 4xl '), '4XL')
    assert.equal(normalizeSizeLabel(' one   size '), 'One Size')
    assert.equal(isValidSizeLabel('5XL'), true)
    assert.equal(isValidSizeLabel('4XL.'), false)
    assert.equal(isValidSizeLabel(''), false)
    assert.equal(hasSizeLabel(['M', '4XL'], ' 4xl '), true)
})

test('adding a supported size initializes zero stock and preserves existing quantities', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => productQuery(fixture()))
    const orderLookup = t.mock.method(orderModel, 'exists', () => assert.fail('Additions need no order lookup'))
    const update = t.mock.method(productModel, 'findOneAndUpdate', async (filter, changes, options) => {
        assert.deepEqual(filter, { _id: productId, sizes: ['M'] })
        assert.deepEqual(changes, { $set: { sizes: ['S', 'M'], 'inventory.S': 0 } })
        assert.equal(options.session, session)
        assert.equal(options.returnDocument, 'after')
        assert.equal(options.runValidators, true)
        return fixture({ sizes: ['S', 'M'], inventory: { S: 0, M: 5 } })
    })

    const updated = await replaceProductSizes(productId, ['M', 'S'])

    assert.deepEqual(updated.inventory, { S: 0, M: 5 })
    assert.equal(orderLookup.mock.callCount(), 0)
    assert.equal(update.mock.callCount(), 1)
})

test('custom sizes are normalized, initialized at zero, and keep existing quantities', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => productQuery(fixture()))
    t.mock.method(productModel, 'findOneAndUpdate', async (filter, changes) => {
        assert.deepEqual(filter, { _id: productId, sizes: ['M'] })
        assert.deepEqual(changes, {
            $set: {
                sizes: ['M', '3XL', '4XL'],
                'inventory.3XL': 0,
                'inventory.4XL': 0
            }
        })
        return fixture({
            sizes: ['M', '3XL', '4XL'],
            inventory: { M: 5, '3XL': 0, '4XL': 0 }
        })
    })

    const updated = await replaceProductSizes(productId, ['M', ' 3xl ', '4xl'])

    assert.deepEqual(updated.sizes, ['M', '3XL', '4XL'])
    assert.deepEqual(updated.inventory, { M: 5, '3XL': 0, '4XL': 0 })
})

test('removing an unused zero-stock size preserves remaining stock and historical orders', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => productQuery(fixture({
        sizes: ['S', 'M'],
        inventory: { S: 0, M: 5 }
    })))
    const orderLookup = t.mock.method(orderModel, 'exists', query => {
        assert.deepEqual(query, {
            items: { $elemMatch: { _id: productId, size: { $in: ['S'] } } },
            inventoryStatus: 'reserved',
            status: { $nin: ['Claimed', 'Completed', 'Cancelled'] }
        })
        return sessionQuery(null)
    })
    t.mock.method(productModel, 'findOneAndUpdate', async (filter, changes) => {
        assert.deepEqual(filter, {
            _id: productId,
            sizes: ['S', 'M'],
            'inventory.S': { $in: [0, null] }
        })
        assert.deepEqual(changes, {
            $set: { sizes: ['M'] },
            $unset: { 'inventory.S': '' }
        })
        return fixture()
    })

    const updated = await replaceProductSizes(productId, ['M'])

    assert.deepEqual(updated.inventory, { M: 5 })
    assert.equal(orderLookup.mock.callCount(), 1)
})

test('size removal preserves measurement fields and measurements for remaining sizes', async t => {
    mockTransaction(t)
    const sizeGuide = {
        fields: [{ key: 'garment-length', label: 'Garment length' }],
        measurements: [
            { size: 'S', values: { 'garment-length': 65 } },
            { size: 'M', values: { 'garment-length': 68 } }
        ]
    }
    t.mock.method(productModel, 'findById', () => productQuery(fixture({
        sizes: ['S', 'M'],
        inventory: { S: 0, M: 5 },
        sizeGuide
    })))
    t.mock.method(orderModel, 'exists', () => sessionQuery(null))
    t.mock.method(productModel, 'findOneAndUpdate', async (_filter, changes) => {
        assert.deepEqual(changes, {
            $set: {
                sizes: ['M'],
                sizeGuide: {
                    fields: sizeGuide.fields,
                    measurements: [sizeGuide.measurements[1]]
                }
            },
            $unset: { 'inventory.S': '' }
        })
        return fixture({
            sizes: ['M'],
            inventory: { M: 5 },
            sizeGuide: changes.$set.sizeGuide
        })
    })

    const updated = await replaceProductSizes(productId, ['M'])
    assert.deepEqual(updated.sizeGuide.measurements, [sizeGuide.measurements[1]])
})

test('remaining stock and active reservations independently block unsafe removal', async t => {
    mockTransaction(t)
    const update = t.mock.method(productModel, 'findOneAndUpdate', () => {
        assert.fail('Unsafe removals must not update the product')
    })

    t.mock.method(productModel, 'findById', () => productQuery(fixture({
        sizes: ['S', 'M'],
        inventory: { S: 2, M: 5 }
    })))
    await assert.rejects(
        replaceProductSizes(productId, ['M']),
        error => error.code === 'SIZE_HAS_STOCK' && error.status === 409
    )

    productModel.findById.mock.mockImplementation(() => productQuery(fixture({
        sizes: ['S', 'M'],
        inventory: { S: 0, M: 5 }
    })))
    t.mock.method(orderModel, 'exists', () => sessionQuery({ _id: 'active-order' }))
    await assert.rejects(
        replaceProductSizes(productId, ['M']),
        error => error.code === 'SIZE_HAS_ACTIVE_RESERVATION' && error.status === 409
    )
    assert.equal(update.mock.callCount(), 0)
})

test('case-insensitive duplicates and invalid labels fail before any product mutation', async t => {
    const transaction = mockTransaction(t)
    await assert.rejects(
        replaceProductSizes(productId, ['M', '4XL', ' 4xl ']),
        error => error.code === 'DUPLICATE_PRODUCT_SIZE'
    )

    t.mock.method(productModel, 'findById', () => productQuery(fixture()))
    await assert.rejects(
        replaceProductSizes(productId, ['M', '4XL.']),
        error => error.code === 'INVALID_PRODUCT_SIZES'
    )
    assert.equal(transaction.mock.callCount(), 1)
})

test('custom sizes support initial inventory and later stock adjustments', async t => {
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }))
    assert.deepEqual(
        validateInitialInventory(['4XL'], { '4XL': 0 }),
        { '4XL': 0 }
    )

    t.mock.method(productModel, 'findById', () => ({
        lean: async () => fixture({ sizes: ['4XL'], inventory: { '4XL': 0 } })
    }))
    t.mock.method(productModel, 'findOneAndUpdate', async (filter, update, options) => {
        assert.equal(filter._id, productId)
        assert.deepEqual(update, { $inc: { 'inventory.4XL': 3 } })
        assert.equal(options.returnDocument, 'after')
        return fixture({ sizes: ['4XL'], inventory: { '4XL': 3 } })
    })

    const updated = await adjustInventory(productId, { '4XL': 3 })
    assert.deepEqual(updated.inventory, { '4XL': 3 })
})

test('custom sizes remain valid order snapshot and reservation inputs', () => {
    assert.deepEqual(
        aggregateOrderItems([
            { _id: productId, size: '4XL', quantity: 1 },
            { _id: productId, size: '4XL', quantity: 2 }
        ]),
        [{ _id: productId, size: '4XL', quantity: 3 }]
    )
})

test('a concurrent size or inventory change returns a retryable conflict without partial updates', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => productQuery(fixture()))
    t.mock.method(productModel, 'findOneAndUpdate', async () => null)

    await assert.rejects(
        replaceProductSizes(productId, ['M', 'L']),
        error => error.code === 'PRODUCT_SIZES_CHANGED' && error.status === 409
    )
})

test('controller returns safe conflict details for rejected size changes', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => productQuery(fixture({
        sizes: ['S', 'M'],
        inventory: { S: 1, M: 5 }
    })))
    const res = response()

    await updateProductSizes({ params: { id: productId }, body: { sizes: ['M'] } }, res)

    assert.equal(res.statusCode, 409)
    assert.equal(res.body.success, false)
    assert.equal(res.body.code, 'SIZE_HAS_STOCK')
    assert.match(res.body.message, /stock to 0/)
})
