import test from 'node:test'
import assert from 'node:assert/strict'
import adminAuth from '../middleware/adminAuth.js'
import announcementModel from '../models/announcementModel.js'
import productModel from '../models/productModel.js'
import announcementRouter from '../routes/announcementRoute.js'
import {
    createAnnouncement,
    deleteAnnouncement,
    deleteAnnouncementById,
    getManagedAnnouncement,
    getManagedAnnouncements,
    getPublicAnnouncement,
    getPublicAnnouncements,
    updateAnnouncement,
    updateAnnouncementById
} from '../controllers/announcementController.js'
import {
    announcementIsActive,
    nextAnnouncementsChangeAt,
    parseAnnouncementInput,
    presentPublicAnnouncement,
    presentPublicAnnouncements
} from '../utils/announcements.js'

const firstId = '0123456789abcdef01234567'
const secondId = '1123456789abcdef01234567'
const firstProductId = '2123456789abcdef01234567'
const secondProductId = '3123456789abcdef01234567'
const priceChangeId = '4123456789abcdef01234567'
const now = Date.parse('2026-10-25T04:00:00.000Z')

const fixture = (overrides = {}) => ({
    _id: firstId,
    key: 'site-wide',
    type: 'general',
    message: 'Campus store schedule updated.',
    link: '/collection',
    linkedProductIds: [firstProductId],
    enabled: true,
    publishAt: new Date(now - 1000),
    expiresAt: new Date(now + 1000),
    createdAt: new Date(now - 2000),
    updatedAt: new Date(now - 1000),
    __v: 0,
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

const leanQuery = value => ({ lean: async () => value })
const sortedLeanQuery = value => ({
    sort() {
        return this
    },
    lean: async () => value
})

test('schema supports multiple keys and validates plain text, dates, and links', async () => {
    const first = new announcementModel(fixture({ _id: undefined, key: undefined }))
    const second = new announcementModel(fixture({ _id: undefined, key: undefined }))
    await first.validate()
    await second.validate()
    assert.notEqual(first.key, second.key)

    const invalidLink = new announcementModel(fixture({ _id: undefined, link: 'https://example.test' }))
    await assert.rejects(invalidLink.validate())

    const invalidDates = new announcementModel(fixture({
        _id: undefined,
        publishAt: new Date(now + 1000),
        expiresAt: new Date(now)
    }))
    await assert.rejects(invalidDates.validate())

    assert.throws(
        () => parseAnnouncementInput({ type: 'general', message: 'Notice', link: '//example.test' }),
        /internal Storefront link/
    )
    assert.throws(
        () => parseAnnouncementInput({ type: 'general', message: 'Notice', unexpected: true }),
        /supported announcement details/
    )
})

test('input accepts one or multiple unique linked product IDs', () => {
    const single = parseAnnouncementInput({
        type: 'general',
        message: 'Single product notice',
        linkedProductIds: firstProductId
    })
    assert.deepEqual(single.linkedProductIds.map(String), [firstProductId])

    const multiple = parseAnnouncementInput({
        type: 'price-change',
        message: 'Multiple product notice',
        linkedProductIds: [firstProductId, secondProductId, firstProductId]
    })
    assert.deepEqual(multiple.linkedProductIds.map(String), [firstProductId, secondProductId])
    assert.throws(
        () => parseAnnouncementInput({
            type: 'general',
            message: 'Invalid product notice',
            linkedProductIds: ['not-an-id']
        }),
        /valid linked products/
    )
})

test('public presentation includes only active announcements and no management fields', () => {
    const active = fixture()
    const future = fixture({ _id: secondId, publishAt: new Date(now + 2000) })
    assert.equal(announcementIsActive(active, now), true)
    assert.deepEqual(presentPublicAnnouncement(active, now), {
        _id: firstId,
        type: 'general',
        message: active.message,
        link: '/collection',
        linkedProductIds: [firstProductId],
        publishAt: active.publishAt,
        expiresAt: active.expiresAt
    })
    assert.equal(Object.hasOwn(presentPublicAnnouncement(active, now), 'enabled'), false)
    assert.equal(Object.hasOwn(presentPublicAnnouncement(active, now), 'key'), false)
    assert.deepEqual(presentPublicAnnouncements([future, active], now).map(item => item._id), [firstId])
    assert.equal(nextAnnouncementsChangeAt([active, future], now), new Date(now + 1000).toISOString())
    assert.equal(presentPublicAnnouncement(fixture({ enabled: false }), now), null)
    assert.equal(presentPublicAnnouncement(fixture({ expiresAt: new Date(now) }), now), null)
})

test('public list returns all visible announcements while the legacy endpoint returns one', async t => {
    const announcements = [
        fixture(),
        fixture({
            _id: secondId,
            key: `announcement:${secondId}`,
            message: 'A second active notice.',
            publishAt: new Date(now - 500),
            expiresAt: new Date(now + 2000)
        })
    ]
    t.mock.method(Date, 'now', () => now)
    t.mock.method(announcementModel, 'find', () => sortedLeanQuery(announcements))

    const listResult = response()
    await getPublicAnnouncements({}, listResult)
    assert.equal(listResult.body.announcements.length, 2)
    assert.equal(listResult.body.nextChangeAt, new Date(now + 1000).toISOString())

    const legacyResult = response()
    await getPublicAnnouncement({}, legacyResult)
    assert.equal(legacyResult.body.announcement.message, 'A second active notice.')
    assert.equal(Array.isArray(legacyResult.body.announcement), false)
})

test('public list resolves safe comparisons and hides cancelled generated notices', async t => {
    const generated = fixture({
        type: 'price-change',
        linkedProductIds: [firstProductId],
        priceChangeLinks: [{
            productId: firstProductId,
            priceChangeId
        }],
        publishAt: new Date(now - 1000),
        expiresAt: new Date(now + 60_000)
    })
    const priceChange = {
        _id: priceChangeId,
        amount: 150,
        effectiveAt: new Date(now + 60_000),
        createdAt: new Date(now - 1000),
        cancelledAt: null
    }
    const product = {
        _id: firstProductId,
        name: 'Linked uniform',
        price: 100,
        image: ['uniform.jpg'],
        priceChanges: [priceChange]
    }
    t.mock.method(Date, 'now', () => now)
    t.mock.method(announcementModel, 'find', () => sortedLeanQuery([generated]))
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }))
    t.mock.method(productModel, 'find', () => ({ lean: async () => [product] }))

    const visible = response()
    await getPublicAnnouncements({}, visible)
    assert.deepEqual(visible.body.announcements[0].priceComparisons, [{
        productId: firstProductId,
        name: 'Linked uniform',
        image: 'uniform.jpg',
        previousPrice: 100,
        newPrice: 150,
        effectiveAt: new Date(now + 60_000).toISOString()
    }])
    assert.equal(
        Object.hasOwn(visible.body.announcements[0].priceComparisons[0], 'priceChangeId'),
        false
    )

    priceChange.cancelledAt = new Date(now)
    const cancelled = response()
    await getPublicAnnouncements({}, cancelled)
    assert.deepEqual(cancelled.body.announcements, [])
})

test('Admin routes protect list and individual operations while public routes remain open', () => {
    const routes = new Map(
        announcementRouter.stack
            .filter(layer => layer.route)
            .map(layer => [`${Object.keys(layer.route.methods)[0]} ${layer.route.path}`, layer.route])
    )

    assert.deepEqual(routes.get('get /public').stack.map(layer => layer.handle), [getPublicAnnouncement])
    assert.deepEqual(routes.get('get /public/list').stack.map(layer => layer.handle), [getPublicAnnouncements])
    assert.deepEqual(routes.get('get /admin').stack.map(layer => layer.handle), [adminAuth, getManagedAnnouncement])
    assert.deepEqual(routes.get('get /admin/list').stack.map(layer => layer.handle), [adminAuth, getManagedAnnouncements])
    assert.deepEqual(routes.get('post /admin').stack.map(layer => layer.handle), [adminAuth, createAnnouncement])
    assert.deepEqual(routes.get('patch /admin').stack.map(layer => layer.handle), [adminAuth, updateAnnouncement])
    assert.deepEqual(routes.get('delete /admin').stack.map(layer => layer.handle), [adminAuth, deleteAnnouncement])
    assert.deepEqual(routes.get('patch /admin/:id').stack.map(layer => layer.handle), [adminAuth, updateAnnouncementById])
    assert.deepEqual(routes.get('delete /admin/:id').stack.map(layer => layer.handle), [adminAuth, deleteAnnouncementById])
})

test('Admin can create multiple announcements linked to existing catalog products', async t => {
    const createdValues = []
    t.mock.method(announcementModel, 'init', async () => {})
    t.mock.method(productModel, 'countDocuments', async query => query._id.$in.length)
    t.mock.method(announcementModel, 'create', async values => {
        createdValues.push(values)
        return fixture({
            _id: createdValues.length === 1 ? firstId : secondId,
            key: `announcement:${createdValues.length}`,
            ...values
        })
    })

    for (const message of ['First notice', 'Second notice']) {
        const result = response()
        await createAnnouncement({ body: {
            type: 'general',
            message,
            linkedProductIds: [firstProductId, secondProductId],
            enabled: true,
            publishAt: null,
            expiresAt: null
        } }, result)
        assert.equal(result.code, 201)
    }
    assert.equal(createdValues.length, 2)
    assert.deepEqual(createdValues[0].linkedProductIds.map(String), [firstProductId, secondProductId])
})

test('create rejects missing linked products without writing an announcement', async t => {
    let createCalled = false
    t.mock.method(announcementModel, 'init', async () => {})
    t.mock.method(productModel, 'countDocuments', async () => 1)
    t.mock.method(announcementModel, 'create', async () => {
        createCalled = true
    })

    const result = response()
    await createAnnouncement({ body: {
        type: 'general',
        message: 'Product-specific notice',
        linkedProductIds: [firstProductId, secondProductId],
        enabled: true
    } }, result)
    assert.equal(result.code, 400)
    assert.match(result.body.message, /linked products are unavailable/)
    assert.equal(createCalled, false)
})

test('individual announcements can be scheduled, deactivated, and deleted', async t => {
    let stored = fixture({ _id: secondId, key: `announcement:${secondId}` })
    t.mock.method(productModel, 'countDocuments', async query => query._id.$in.length)
    t.mock.method(announcementModel, 'findById', () => leanQuery(stored))
    t.mock.method(announcementModel, 'findOneAndUpdate', async (_filter, update) => {
        stored = fixture({ ...stored, ...update.$set, updatedAt: new Date(now) })
        return stored
    })
    t.mock.method(announcementModel, 'findByIdAndDelete', async () => {
        const deleted = stored
        stored = null
        return deleted
    })

    const scheduled = response()
    await updateAnnouncementById({
        params: { id: secondId },
        body: {
            enabled: true,
            publishAt: new Date(now + 5000).toISOString(),
            expiresAt: new Date(now + 10000).toISOString(),
            linkedProductIds: secondProductId
        }
    }, scheduled)
    assert.equal(scheduled.body.announcement.linkedProductIds[0], secondProductId)
    assert.equal(new Date(scheduled.body.announcement.publishAt).getTime(), now + 5000)

    const deactivated = response()
    await updateAnnouncementById({ params: { id: secondId }, body: { enabled: false } }, deactivated)
    assert.equal(deactivated.body.announcement.enabled, false)

    const deleted = response()
    await deleteAnnouncementById({ params: { id: secondId } }, deleted)
    assert.equal(deleted.body.success, true)
    assert.equal(stored, null)
})

test('legacy Admin read, update, and delete target the original site-wide record', async t => {
    let stored = fixture()
    t.mock.method(announcementModel, 'findOne', () => leanQuery(stored))
    t.mock.method(announcementModel, 'findOneAndUpdate', async (_filter, update) => {
        stored = fixture({ ...stored, ...update.$set })
        return stored
    })
    t.mock.method(announcementModel, 'findByIdAndDelete', async () => {
        const deleted = stored
        stored = null
        return deleted
    })

    const read = response()
    await getManagedAnnouncement({}, read)
    assert.equal(read.body.announcement._id, firstId)

    const updated = response()
    await updateAnnouncement({ body: { message: 'Updated legacy notice.' } }, updated)
    assert.equal(updated.body.announcement.message, 'Updated legacy notice.')

    const deleted = response()
    await deleteAnnouncement({}, deleted)
    assert.equal(deleted.body.success, true)
})
