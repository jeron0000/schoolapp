import test from 'node:test'
import assert from 'node:assert/strict'
import productModel from '../models/productModel.js'
import productRouter from '../routes/productRoute.js'
import adminAuth from '../middleware/adminAuth.js'
import { adjustInventory, createReservedOrder } from '../utils/inventory.js'
import { mutateCart } from '../utils/cart.js'
import {
    cancelScheduledStockUpdate,
    createScheduledStockUpdate,
    executeScheduledStockUpdate,
    resolveDueScheduledStockUpdate
} from '../utils/scheduledStock.js'
import {
    cancelStockUpdate,
    getScheduledStockUpdate,
    scheduleStockUpdate
} from '../controllers/productController.js'

const productId = '0123456789abcdef01234567'
const scheduleId = '1123456789abcdef01234567'
const now = Date.parse('2099-01-01T00:00:00.000Z')
const product = overrides => ({
    _id: productId,
    name: 'Scheduled uniform',
    sizes: ['S', 'M'],
    inventory: { S: 2, M: 0 },
    ...overrides
})

const leanQuery = value => ({ lean: async () => value })

test('scheduled stock routes keep Admin management without a scheduler endpoint', () => {
    const routes = new Map(productRouter.stack.filter(layer => layer.route).map(layer => [
        `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`,
        layer.route.stack.map(entry => entry.handle)
    ]))
    assert.deepEqual(routes.get('post /stock/scheduled'), [adminAuth, scheduleStockUpdate])
    assert.deepEqual(routes.get('get /stock/scheduled/:id'), [adminAuth, getScheduledStockUpdate])
    assert.deepEqual(routes.get('delete /stock/scheduled/:id'), [adminAuth, cancelStockUpdate])
    assert.equal(routes.has('get /stock/scheduled/run'), false)
})

test('authoritative cart, checkout, and Admin stock paths resolve due schedules first', () => {
    assert.match(mutateCart.toString(), /resolveDueScheduledStockUpdate/)
    assert.match(createReservedOrder.toString(), /resolveDueScheduledStockUpdate/)
    assert.match(adjustInventory.toString(), /resolveDueScheduledStockUpdate/)
})

test('creating a future schedule persists additions without changing inventory', async t => {
    let savedUpdate
    t.mock.method(productModel, 'findOne', () => leanQuery(null))
    t.mock.method(productModel, 'findById', () => leanQuery(product()))
    t.mock.method(productModel, 'findOneAndUpdate', async (_filter, update) => {
        savedUpdate = update
        return product({ scheduledStockUpdate: update.$set.scheduledStockUpdate })
    })

    const result = await createScheduledStockUpdate({
        productId,
        adjustments: { S: 3, M: 0 },
        executeAt: '2099-01-02T01:00:00.000Z',
        now
    })
    assert.deepEqual(savedUpdate.$set.scheduledStockUpdate.adjustments, { S: 3 })
    assert.equal(Object.hasOwn(savedUpdate, '$inc'), false)
    assert.deepEqual(result.product.inventory, { S: 2, M: 0 })
    assert.equal(result.schedule.status, 'pending')
})

test('schedule validation rejects past times and non-positive or negative plans', async t => {
    t.mock.method(productModel, 'findOne', () => leanQuery(null))
    t.mock.method(productModel, 'findById', () => leanQuery(product()))
    await assert.rejects(createScheduledStockUpdate({
        productId,
        adjustments: { S: 2 },
        executeAt: '2098-12-31T23:59:00.000Z',
        now
    }), /future Asia\/Manila/)
    await assert.rejects(createScheduledStockUpdate({
        productId,
        adjustments: { S: -1 },
        executeAt: '2099-01-02T01:00:00.000Z',
        now
    }), /only add inventory/)
    await assert.rejects(createScheduledStockUpdate({
        productId,
        adjustments: { S: 0, M: 0 },
        executeAt: '2099-01-02T01:00:00.000Z',
        now
    }), /positive stock addition/)
})

test('due execution atomically applies deltas once against latest inventory', async t => {
    const schedule = {
        _id: scheduleId,
        adjustments: { S: 3, M: 4 },
        executeAt: new Date(now - 1000),
        status: 'pending'
    }
    let atomicCalls = 0
    const completedProduct = product({
        inventory: { S: 8, M: 5 },
        scheduledStockUpdate: { ...schedule, status: 'completed' }
    })
    t.mock.method(productModel, 'findOneAndUpdate', async (_filter, update) => {
        atomicCalls += 1
        assert.deepEqual(update.$inc, {
            'inventory.S': 3,
            'inventory.M': 4,
            'scheduledStockUpdate.attempts': 1
        })
        return atomicCalls === 1 ? completedProduct : null
    })
    t.mock.method(productModel, 'findById', () => leanQuery(completedProduct))

    const [first, second] = await Promise.all([
        executeScheduledStockUpdate(productId, schedule, new Date(now)),
        executeScheduledStockUpdate(productId, schedule, new Date(now))
    ])
    assert.deepEqual([first.status, second.status].sort(), ['completed', 'skipped'])
    assert.equal(atomicCalls, 2)
})

test('request-driven resolution applies only due schedules using the request timestamp', async t => {
    const dueSchedule = {
        _id: scheduleId,
        adjustments: { S: 3 },
        executeAt: new Date(now),
        status: 'pending'
    }
    let due = false
    let atomicCalls = 0
    t.mock.method(productModel, 'findOne', (_filter, _projection, options) => {
        assert.equal(options.session, 'request-session')
        return leanQuery(due ? product({ scheduledStockUpdate: dueSchedule }) : null)
    })
    t.mock.method(productModel, 'findOneAndUpdate', async (_filter, _update, options) => {
        atomicCalls += 1
        assert.equal(options.session, 'request-session')
        return product({ scheduledStockUpdate: { ...dueSchedule, status: 'completed' } })
    })

    const early = await resolveDueScheduledStockUpdate(
        productId,
        new Date(now - 1),
        { session: 'request-session' }
    )
    assert.equal(early.status, 'not-due')
    assert.equal(atomicCalls, 0)

    due = true
    const completed = await resolveDueScheduledStockUpdate(
        productId,
        new Date(now),
        { session: 'request-session' }
    )
    assert.equal(completed.status, 'completed')
    assert.equal(atomicCalls, 1)
})

test('failed execution remains visible and retry can complete without double applying', async t => {
    const schedule = {
        _id: scheduleId,
        adjustments: { S: 3 },
        executeAt: new Date(now - 1000),
        status: 'pending'
    }
    let canComplete = false
    t.mock.method(productModel, 'findOneAndUpdate', async () => {
        return canComplete ? product({ scheduledStockUpdate: { ...schedule, status: 'completed' } }) : null
    })
    t.mock.method(productModel, 'findById', () => leanQuery(product({ scheduledStockUpdate: schedule })))
    const failures = []
    t.mock.method(productModel, 'updateOne', async (filter, update) => {
        failures.push({ filter, update })
        return { modifiedCount: 1 }
    })

    const failed = await executeScheduledStockUpdate(productId, schedule, new Date(now))
    assert.equal(failed.status, 'failed')
    assert.equal(failures[0].update.$set['scheduledStockUpdate.status'], 'failed')

    canComplete = true
    const retried = await executeScheduledStockUpdate(productId, { ...schedule, status: 'failed' }, new Date(now))
    assert.equal(retried.status, 'completed')
})

test('cancellation prevents pending execution and preserves inventory', async t => {
    const pending = product({
        scheduledStockUpdate: {
            _id: scheduleId,
            adjustments: { S: 3 },
            executeAt: new Date(now + 1000),
            status: 'cancelled'
        }
    })
    t.mock.method(productModel, 'findOne', () => leanQuery(null))
    t.mock.method(productModel, 'findOneAndUpdate', async () => pending)
    const result = await cancelScheduledStockUpdate(productId, now)
    assert.equal(result.schedule.status, 'cancelled')
    assert.deepEqual(result.product.inventory, { S: 2, M: 0 })
})
