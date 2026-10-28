import test from 'node:test'
import assert from 'node:assert/strict'
import announcementModel from '../models/announcementModel.js'
import productModel from '../models/productModel.js'
import { getPublicAnnouncement, getPublicAnnouncements } from '../controllers/announcementController.js'
import {
    presentRestockAnnouncement,
    restockAnnouncementMessage,
    syncRestockAnnouncement
} from '../utils/restockAnnouncements.js'

const productId = '0123456789abcdef01234567'
const announcementId = '1123456789abcdef01234567'
const now = Date.parse('2099-01-10T00:00:00.000Z')

const product = overrides => ({
    _id: productId,
    name: 'College Uniform',
    sizes: ['M', 'L'],
    inventory: { M: 0, L: 5 },
    restockPlan: { status: 'soon', announce: true, publicationTiming: 'immediate' },
    ...overrides
})

const announcement = overrides => ({
    _id: announcementId,
    key: `restock:${productId}`,
    type: 'general',
    message: 'Stored restock message',
    link: `/product/${productId}`,
    linkedProductIds: [productId],
    priceChangeLinks: [],
    enabled: true,
    publishAt: new Date(now - 1000),
    expiresAt: null,
    createdAt: new Date(now - 2000),
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

const announcementQuery = records => ({
    sort() { return this },
    lean: async () => records
})

test('restock announcement sync upserts one stable linked notice and updates its date', async t => {
    const writes = []
    t.mock.method(announcementModel, 'findOneAndUpdate', async (...args) => {
        writes.push(args)
        return {}
    })

    await syncRestockAnnouncement(product())
    await syncRestockAnnouncement(product({
        restockPlan: {
            status: 'scheduled',
            estimatedDate: new Date('2099-02-15T00:00:00.000Z'),
            announce: true,
            publicationTiming: 'arrival'
        }
    }))

    assert.equal(writes.length, 2)
    assert.deepEqual(writes.map(call => call[0]), [
        { key: `restock:${productId}` },
        { key: `restock:${productId}` }
    ])
    assert.equal(writes[0][1].$set.enabled, true)
    assert.match(writes[0][1].$set.message, /Restocking Soon — College Uniform/)
    assert.equal(writes[1][1].$set.publishAt.toISOString(), '2099-02-14T16:00:00.000Z')
    assert.match(writes[1][1].$set.message, /February 15, 2099/)
    assert.equal(writes[1][2].upsert, true)
})

test('cleared and disabled restock plans hide the linked announcement without deleting it', async t => {
    const updates = []
    t.mock.method(announcementModel, 'updateOne', async (...args) => {
        updates.push(args)
        return { matchedCount: 1 }
    })

    await syncRestockAnnouncement(product({ restockPlan: undefined }))
    await syncRestockAnnouncement(product({
        restockPlan: { status: 'soon', announce: false, publicationTiming: 'immediate' }
    }))

    assert.deepEqual(updates, [
        [{ key: `restock:${productId}` }, { $set: { enabled: false } }],
        [{ key: `restock:${productId}` }, { $set: { enabled: false } }]
    ])
})

test('public restock presentation follows authoritative plan and stock availability', () => {
    const stored = {
        _id: announcementId,
        type: 'general',
        message: 'Stale message',
        link: '/stale',
        linkedProductIds: [productId]
    }
    const source = announcement()
    const updated = product({
        restockPlan: {
            status: 'scheduled',
            estimatedDate: new Date('2099-03-20T00:00:00.000Z'),
            announce: true,
            publicationTiming: 'immediate'
        }
    })
    const visible = presentRestockAnnouncement(stored, source, updated)
    assert.match(visible.message, /March 20, 2099/)
    assert.equal(visible.link, `/product/${productId}`)
    assert.equal(presentRestockAnnouncement(stored, source, product({
        inventory: { M: 2, L: 5 }
    })), null)
    assert.equal(presentRestockAnnouncement(stored, source, product({
        restockPlan: undefined
    })), null)
})

test('public endpoints enforce scheduled visibility and leave manual announcements unaffected', async t => {
    const manual = {
        ...announcement({
            _id: '2123456789abcdef01234567',
            key: 'announcement:manual',
            message: 'Manual campus notice.',
            linkedProductIds: []
        })
    }
    const scheduled = announcement({ publishAt: new Date(now + 1000) })
    t.mock.method(Date, 'now', () => now)
    t.mock.method(announcementModel, 'find', () => announcementQuery([manual, scheduled]))

    const beforePublication = response()
    await getPublicAnnouncements({}, beforePublication)
    assert.deepEqual(beforePublication.body.announcements.map(item => item.message), [
        'Manual campus notice.'
    ])

    scheduled.publishAt = new Date(now - 500)
    t.mock.method(productModel, 'findOne', () => ({ lean: async () => null }))
    t.mock.method(productModel, 'find', () => ({ lean: async () => [product()] }))
    const afterPublication = response()
    await getPublicAnnouncement({}, afterPublication)
    assert.match(afterPublication.body.announcement.message, /Restocking Soon — College Uniform/)
    assert.equal(restockAnnouncementMessage(product()).includes('estimated arrival may change'), true)
})
