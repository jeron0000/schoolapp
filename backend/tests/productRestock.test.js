import test from 'node:test'
import assert from 'node:assert/strict'
import productModel from '../models/productModel.js'
import announcementModel from '../models/announcementModel.js'
import productRouter from '../routes/productRoute.js'
import adminAuth from '../middleware/adminAuth.js'
import { updateProductRestock } from '../controllers/productController.js'

const productId = '0123456789abcdef01234567'
const fixture = overrides => ({
    _id: productId,
    name: 'Restock test product',
    description: 'Synthetic product',
    price: 225,
    image: [],
    sizes: ['M', 'L'],
    inventory: { M: 0, L: 4 },
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

test('restock route remains protected by Admin authorization', () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/restock/:id').route
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, updateProductRestock])
    assert.equal(route.methods.patch, true)
})

test('restock plans save, update, and clear without changing inventory', async t => {
    const updates = []
    t.mock.method(announcementModel, 'findOneAndUpdate', async () => ({}))
    t.mock.method(announcementModel, 'updateOne', async () => ({ matchedCount: 1 }))
    t.mock.method(productModel, 'findByIdAndUpdate', async (id, update, options) => {
        updates.push({ id, update, options })
        if (update.$unset) return fixture()
        return fixture({ restockPlan: update.$set.restockPlan })
    })

    const soonResponse = response()
    await updateProductRestock({ params: { id: productId }, body: { status: 'soon', estimatedDate: '2099-01-15' } }, soonResponse)
    assert.deepEqual(updates[0].update, {
        $set: {
            restockPlan: { status: 'soon', announce: false, publicationTiming: 'immediate' }
        }
    })
    assert.deepEqual(soonResponse.body.product.inventory, { M: 0, L: 4 })
    assert.deepEqual(soonResponse.body.product.restockPlan, {
        status: 'soon', announce: false, publicationTiming: 'immediate'
    })

    const scheduledResponse = response()
    await updateProductRestock({ params: { id: productId }, body: { status: 'scheduled', estimatedDate: '2099-01-15' } }, scheduledResponse)
    assert.equal(updates[1].update.$set.restockPlan.status, 'scheduled')
    assert.equal(updates[1].update.$set.restockPlan.estimatedDate.toISOString(), '2099-01-15T00:00:00.000Z')
    assert.equal(Object.hasOwn(updates[1].update.$set, 'inventory'), false)
    assert.equal(updates[1].options.returnDocument, 'after')
    assert.equal(updates[1].options.runValidators, true)

    const clearResponse = response()
    await updateProductRestock({ params: { id: productId }, body: { status: 'none' } }, clearResponse)
    assert.deepEqual(updates[2].update, { $unset: { restockPlan: 1 } })
    assert.equal(clearResponse.body.product.restockPlan, undefined)
    assert.equal(clearResponse.body.message, 'Restock plan cleared.')
})

test('scheduled restock requires a valid calendar date while soon requires none', async t => {
    const update = t.mock.method(productModel, 'findByIdAndUpdate', async () => fixture())
    for (const estimatedDate of [undefined, '', 'not-a-date', '2099-02-30']) {
        const res = response()
        await updateProductRestock({ params: { id: productId }, body: { status: 'scheduled', estimatedDate } }, res)
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.message, 'Choose a valid estimated restock date.')
    }
    assert.equal(update.mock.callCount(), 0)

    const res = response()
    await updateProductRestock({ params: { id: productId }, body: { status: 'invalid' } }, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.message, 'Choose a valid restock status.')
})

test('restock publication settings persist and reject arrival scheduling without a date', async t => {
    const announcementWrites = []
    t.mock.method(productModel, 'findByIdAndUpdate', async (_id, update) => {
        return fixture({ restockPlan: update.$set.restockPlan })
    })
    t.mock.method(announcementModel, 'findOneAndUpdate', async (...args) => {
        announcementWrites.push(args)
        return {}
    })

    const scheduled = response()
    await updateProductRestock({
        params: { id: productId },
        body: {
            status: 'scheduled',
            estimatedDate: '2099-01-15',
            announceRestock: true,
            publicationTiming: 'arrival'
        }
    }, scheduled)
    assert.equal(scheduled.statusCode, 200)
    assert.equal(scheduled.body.product.restockPlan.announce, true)
    assert.equal(scheduled.body.product.restockPlan.publicationTiming, 'arrival')
    assert.equal(announcementWrites.length, 1)

    const invalid = response()
    await updateProductRestock({
        params: { id: productId },
        body: { status: 'soon', announceRestock: true, publicationTiming: 'arrival' }
    }, invalid)
    assert.equal(invalid.statusCode, 400)
    assert.match(invalid.body.message, /expected arrival date/i)
})

test('existing products remain valid without restock data', async () => {
    const product = new productModel(fixture())
    await product.validate()
    assert.equal(product.restockPlan, undefined)
})
