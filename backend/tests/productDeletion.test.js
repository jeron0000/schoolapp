import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import orderModel from '../models/orderModel.js'
import productModel from '../models/productModel.js'
import { removeProduct } from '../controllers/productController.js'

const productId = '0123456789abcdef01234567'
const session = { id: 'synthetic-session' }

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

const sessionQuery = value => ({
    session(receivedSession) {
        assert.equal(receivedSession, session)
        return { lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }
    }
})

const callRemoveProduct = async id => {
    const res = response()
    await removeProduct({ body: { id } }, res)
    return res
}

const mockTransaction = t => {
    return t.mock.method(mongoose.connection, 'transaction', async callback => callback(session))
}

test('eligible products delete once inside the protected transaction', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', id => {
        assert.equal(id, productId)
        return sessionQuery({ _id: productId })
    })
    t.mock.method(orderModel, 'exists', query => {
        assert.deepEqual(query, {
            'items._id': productId,
            inventoryStatus: 'reserved',
            status: { $nin: ['Claimed', 'Completed', 'Cancelled'] }
        })
        return sessionQuery(null)
    })
    const deletion = t.mock.method(productModel, 'deleteOne', async (query, options) => {
        assert.deepEqual(query, { _id: productId })
        assert.equal(options.session, session)
        return { deletedCount: 1 }
    })

    const res = await callRemoveProduct(productId)

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { success: true, message: 'Product removed.' })
    assert.equal(deletion.mock.callCount(), 1)
})

test('active reserved order references block deletion without touching the product', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => sessionQuery({ _id: productId }))
    t.mock.method(orderModel, 'exists', () => sessionQuery({ _id: 'order-id' }))
    const deletion = t.mock.method(productModel, 'deleteOne', () => assert.fail('Protected products must not be deleted'))

    const res = await callRemoveProduct(productId)

    assert.equal(res.statusCode, 409)
    assert.equal(res.body.code, 'PRODUCT_HAS_ACTIVE_ORDERS')
    assert.match(res.body.message, /active order/)
    assert.equal(deletion.mock.callCount(), 0)
})

test('missing and malformed products return distinct errors without deletion', async t => {
    const transaction = mockTransaction(t)
    t.mock.method(productModel, 'findById', () => sessionQuery(null))
    const orderLookup = t.mock.method(orderModel, 'exists', () => assert.fail('Missing products have no dependency lookup'))
    const deletion = t.mock.method(productModel, 'deleteOne', () => assert.fail('Missing products must not be deleted'))

    const missing = await callRemoveProduct(productId)
    assert.equal(missing.statusCode, 404)
    assert.equal(missing.body.code, 'PRODUCT_NOT_FOUND')
    assert.equal(orderLookup.mock.callCount(), 0)
    assert.equal(deletion.mock.callCount(), 0)

    const invalid = await callRemoveProduct('not-an-object-id')
    assert.equal(invalid.statusCode, 400)
    assert.equal(invalid.body.code, 'INVALID_PRODUCT_ID')
    assert.equal(transaction.mock.callCount(), 1)
})

test('unexpected database failures are not mislabeled as order conflicts', async t => {
    mockTransaction(t)
    t.mock.method(productModel, 'findById', () => sessionQuery({ _id: productId }))
    t.mock.method(orderModel, 'exists', () => ({
        session() {
            throw new Error('private database failure')
        }
    }))

    const res = await callRemoveProduct(productId)

    assert.equal(res.statusCode, 500)
    assert.equal(res.body.code, 'PRODUCT_DELETE_FAILED')
    assert.equal(res.body.message, 'Unable to remove this product right now. Please try again.')
    assert.doesNotMatch(JSON.stringify(res.body), /private database failure/)
})
