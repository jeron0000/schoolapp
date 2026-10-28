import test from 'node:test'
import assert from 'node:assert/strict'
import {
    prepareDefaultClassificationOperations
} from '../utils/classificationDefaults.js'
import { defaultManagedClassifications } from '../../shared/productTaxonomy.js'

const storedDefaults = () => defaultManagedClassifications.map((classification, index) => ({
    _id: String(index + 1).padStart(24, '0'),
    ...classification,
    nameKey: classification.name.toLocaleLowerCase('en-US'),
    codeKey: classification.code.toLocaleLowerCase('en-US'),
    active: true
}))

test('default initialization creates every legacy Program, merchandise, and gender once', () => {
    const operations = prepareDefaultClassificationOperations([])
    const inserted = operations.map(operation => operation.insertOne.document)

    assert.deepEqual(
        inserted.map(({ code, scope }) => ({ code, scope })),
        defaultManagedClassifications.map(({ code, scope }) => ({ code, scope }))
    )
    assert.ok(inserted.some(item => item.code === 'BSIT' && item.scope === 'program'))
    assert.ok(inserted.some(item => item.code === 'TOP' && item.scope === 'general'))
    assert.ok(inserted.some(item => item.code === 'Men' && item.scope === 'gender'))
})

test('default initialization is idempotent and preserves renamed or archived records', () => {
    const existing = storedDefaults()
    const bsit = existing.find(item => item.code === 'BSIT')
    bsit.name = 'Information Technology'
    bsit.nameKey = 'information technology'
    bsit.active = false

    assert.deepEqual(prepareDefaultClassificationOperations(existing), [])
})

test('initialization backfills normalized keys without changing codes, names, or status', () => {
    const existing = [{
        _id: '0123456789abcdef01234567',
        code: 'custom-program',
        name: 'Custom Program',
        scope: 'program',
        active: false
    }]
    const operations = prepareDefaultClassificationOperations(existing)
    const update = operations.find(operation => operation.updateOne)

    assert.deepEqual(update, {
        updateOne: {
            filter: { _id: existing[0]._id },
            update: {
                $set: {
                    codeKey: 'custom-program',
                    nameKey: 'custom program'
                }
            }
        }
    })
    assert.equal('active' in update.updateOne.update.$set, false)
    assert.equal('name' in update.updateOne.update.$set, false)
    assert.equal('code' in update.updateOne.update.$set, false)
})

test('initialization rejects conflicting case-insensitive codes and scoped names', () => {
    assert.throws(
        () => prepareDefaultClassificationOperations([
            { _id: '1', code: 'new-program', name: 'New Program', scope: 'program' },
            { _id: '2', code: 'NEW-PROGRAM', name: 'Other Program', scope: 'program' }
        ]),
        /conflict case-insensitively/i
    )
    assert.throws(
        () => prepareDefaultClassificationOperations([
            { _id: '1', code: 'first-program', name: 'New Program', scope: 'program' },
            { _id: '2', code: 'second-program', name: 'new program', scope: 'program' }
        ]),
        /conflict case-insensitively/i
    )
})
