import test from 'node:test'
import assert from 'node:assert/strict'
import productModel from '../models/productModel.js'
import productRouter from '../routes/productRoute.js'
import adminAuth from '../middleware/adminAuth.js'
import { addProduct, updateProductMeasurements } from '../controllers/productController.js'
import {
    editableSizeGuide,
    normalizeSizeGuide,
    restrictSizeGuideToSizes
} from '../../shared/productMeasurements.js'

const productId = '0123456789abcdef01234567'
const fixture = overrides => ({
    _id: productId,
    name: 'Measured uniform',
    description: 'Synthetic product',
    price: 225,
    image: [],
    sizes: ['M', '4XL'],
    inventory: { M: 5, '4XL': 0 },
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

const sampleGuide = {
    fields: [
        { key: 'chest-circumference', label: 'Chest circumference' },
        { key: 'garment-length', label: 'Garment length' }
    ],
    measurements: [
        { size: 'M', values: { 'chest-circumference': 96, 'garment-length': 68.5 } },
        { size: '4XL', values: { 'chest-circumference': 132 } }
    ]
}

test('measurement route remains protected by Admin authorization', () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/measurements/:id').route
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, updateProductMeasurements])
    assert.equal(route.methods.patch, true)
})

test('normalization preserves partial measurements and custom product sizes', () => {
    assert.deepEqual(normalizeSizeGuide(sampleGuide, ['M', '4XL']), sampleGuide)
    assert.deepEqual(
        normalizeSizeGuide({
            fields: sampleGuide.fields,
            measurements: [{ size: '4XL', values: { 'chest-circumference': '', 'garment-length': 79 } }]
        }, ['M', '4XL']),
        {
            fields: sampleGuide.fields,
            measurements: [{ size: '4XL', values: { 'garment-length': 79 } }]
        }
    )
})

test('product creation stores optional measurements with initial stock', async t => {
    let saved
    t.mock.method(productModel.prototype, 'save', async function () {
        await this.validate()
        saved = this.toObject()
    })
    const res = response()
    await addProduct({
        body: {
            name: 'Measured uniform',
            description: 'Synthetic product',
            price: '225',
            academicPrograms: '[]',
            genders: '[]',
            merchandiseCategoryCodes: '[]',
            sizes: '["M","4XL"]',
            inventory: '{"M":5,"4XL":0}',
            sizeGuide: JSON.stringify(sampleGuide),
            BestSeller: 'false',
            NewArrival: 'false'
        },
        files: {}
    }, res)

    assert.equal(res.body.success, true)
    assert.deepEqual(saved.sizes, ['M', '4XL'])
    assert.deepEqual(Object.fromEntries(saved.inventory), { M: 5, '4XL': 0 })
    assert.deepEqual(saved.sizeGuide.fields, sampleGuide.fields)
    assert.equal(saved.sizeGuide.measurements[1].size, '4XL')
    assert.deepEqual(Object.fromEntries(saved.sizeGuide.measurements[1].values), { 'chest-circumference': 132 })
})

test('invalid, duplicate, unknown, and out-of-range measurements are rejected', () => {
    const invalidGuides = [
        { ...sampleGuide, fields: [...sampleGuide.fields, sampleGuide.fields[0]] },
        { ...sampleGuide, measurements: [{ size: 'S', values: { 'garment-length': 70 } }] },
        { ...sampleGuide, measurements: [{ size: 'M', values: { unknown: 70 } }] },
        { ...sampleGuide, measurements: [{ size: 'M', values: { 'garment-length': 0 } }] },
        { ...sampleGuide, measurements: [{ size: 'M', values: { 'garment-length': 500.01 } }] },
        { ...sampleGuide, measurements: [{ size: 'M', values: { 'garment-length': 'invalid' } }] }
    ]
    for (const guide of invalidGuides) {
        assert.throws(() => normalizeSizeGuide(guide, ['M', '4XL']))
    }
})

test('measurement update preserves stock and persists authoritative values', async t => {
    const current = fixture()
    t.mock.method(productModel, 'findById', () => ({ lean: async () => structuredClone(current) }))
    const update = t.mock.method(productModel, 'findOneAndUpdate', async (filter, changes, options) => {
        assert.deepEqual(filter, { _id: productId, sizes: ['M', '4XL'] })
        assert.deepEqual(changes, { $set: { sizeGuide: sampleGuide } })
        assert.equal(options.returnDocument, 'after')
        assert.equal(options.runValidators, true)
        assert.equal(Object.hasOwn(changes.$set, 'inventory'), false)
        return fixture({ sizeGuide: sampleGuide })
    })
    const res = response()

    await updateProductMeasurements({ params: { id: productId }, body: { sizeGuide: sampleGuide } }, res)

    assert.equal(res.statusCode, 200)
    assert.equal(res.body.success, true)
    assert.deepEqual(res.body.product.inventory, current.inventory)
    assert.deepEqual(res.body.product.sizeGuide, sampleGuide)
    assert.equal(update.mock.callCount(), 1)
})

test('existing products remain compatible and cancelled edits can restore persisted values', async () => {
    const existing = editableSizeGuide(undefined)
    assert.deepEqual(existing, { fields: [], measurements: [] })

    const edited = structuredClone(sampleGuide)
    edited.measurements[0].values['garment-length'] = 70
    const restored = editableSizeGuide(sampleGuide)
    assert.deepEqual(restored, sampleGuide)
    assert.notDeepEqual(restored, edited)
})

test('removing a size retains measurements for remaining sizes only', () => {
    assert.deepEqual(restrictSizeGuideToSizes(sampleGuide, ['M']), {
        fields: sampleGuide.fields,
        measurements: [sampleGuide.measurements[0]]
    })
})
