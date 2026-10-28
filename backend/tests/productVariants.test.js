import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import productModel from '../models/productModel.js'
import orderModel from '../models/orderModel.js'
import router from '../routes/productRoute.js'
import adminAuth from '../middleware/adminAuth.js'
import { removeProduct } from '../controllers/productController.js'
import { createProductInVariantGroup, saveProductVariantGroup, unlinkProductVariant } from '../utils/productVariants.js'

const a = '0123456789abcdef01234567'
const b = '1123456789abcdef01234567'
const c = '2123456789abcdef01234567'
const fixture = (id, extra = {}) => ({ _id: id, __v: 0, name: `Shirt ${id}`, price: 225,
    image: ['shirt.jpg'], sizes: ['M'], inventory: { M: 7 }, sizeGuide: { fields: [] }, ...extra })
const body = (version = 0) => ({ version, groupTitle: 'Washday Shirt',
    members: [{ productId: a, colorLabel: ' Yellow ' }, { productId: b, colorLabel: 'Green' }] })

const harness = t => {
    let records = new Map([fixture(a), fixture(b), fixture(c)].map(product => [product._id, product]))
    let tail = Promise.resolve()
    const matches = (product, filter) => Object.entries(filter).every(([key, expected]) => {
        if (key === '$or') return expected.some(clause => matches(product, clause))
        const actual = product[key]
        if (expected && typeof expected === 'object') {
            if ('$exists' in expected) return (actual !== undefined) === expected.$exists
            if ('$in' in expected) return expected.$in.includes(actual)
            if ('$ne' in expected) return actual !== expected.$ne
        }
        return actual === expected
    })
    const query = get => ({ session() { return this }, lean: async () => structuredClone(get()),
        then(resolve, reject) { return Promise.resolve(structuredClone(get())).then(resolve, reject) } })
    const update = (product, changes) => {
        for (const [key, value] of Object.entries(changes.$set || {})) product[key] = value
        for (const key of Object.keys(changes.$unset || {})) delete product[key]
        for (const [key, value] of Object.entries(changes.$inc || {})) product[key] = (product[key] || 0) + value
    }
    t.mock.method(mongoose.connection, 'transaction', work => {
        const result = tail.then(async () => {
            const before = structuredClone(records)
            try { return await work({ fixture: true }) } catch (error) { records = before; throw error }
        })
        tail = result.catch(() => {})
        return result
    })
    t.mock.method(productModel, 'findById', id => query(() => records.get(id) || null))
    t.mock.method(productModel, 'find', filter => query(() => [...records.values()].filter(product => matches(product, filter))))
    t.mock.method(productModel, 'exists', filter => query(() => [...records.values()].find(product => matches(product, filter)) || null))
    t.mock.method(productModel, 'updateOne', async (filter, changes) => {
        const product = [...records.values()].find(item => matches(item, filter))
        if (!product) return { matchedCount: 0 }
        update(product, changes)
        return { matchedCount: 1 }
    })
    t.mock.method(productModel, 'updateMany', async (filter, changes) => {
        for (const product of records.values()) if (matches(product, filter)) update(product, changes)
    })
    t.mock.method(productModel, 'findOneAndUpdate', async (filter, changes) => {
        const product = [...records.values()].find(item => matches(item, filter))
        if (!product) return null
        update(product, changes)
        return structuredClone(product)
    })
    t.mock.method(productModel, 'create', async ([data]) => {
        const product = fixture('3123456789abcdef01234567', data)
        records.set(product._id, product)
        return [structuredClone(product)]
    })
    t.mock.method(productModel, 'deleteOne', async filter => ({ deletedCount: Number(records.delete(filter._id)) }))
    t.mock.method(orderModel, 'exists', () => query(() => null))
    return { product: id => structuredClone(records.get(id)), all: () => structuredClone([...records.values()]) }
}

test('variant management is Admin protected and the group/color index is uniquely scoped', () => {
    for (const method of ['put', 'delete']) {
        const route = router.stack.find(layer => layer.route?.path === '/variants/:id' && layer.route.methods[method]).route
        assert.equal(route.stack[0].handle, adminAuth)
    }
    const [keys, options] = productModel.schema.indexes().find(([, options]) => options.name === 'variant_group_color_unique')
    assert.deepEqual(keys, { variantGroupId: 1, colorKey: 1 })
    assert.equal(options.unique, true)
    assert.ok(options.partialFilterExpression)
})

test('group create, color rename/swap, and unlink preserve independent products and inventory', async t => {
    const h = harness(t)
    const before = h.all()
    await saveProductVariantGroup(a, body())
    assert.equal(h.product(a).variantGroupId, a)
    assert.equal(h.product(a).groupTitle, 'Washday Shirt')
    assert.equal(h.product(b).colorKey, 'green')
    assert.equal(h.product(b).groupTitle, undefined)
    assert.equal(h.product(c).variantGroupId, undefined)
    await saveProductVariantGroup(a, { ...body(1), members: [
        { productId: a, colorLabel: 'Green' }, { productId: b, colorLabel: 'Yellow' }
    ] })
    assert.equal(h.product(a).colorKey, 'green')
    await unlinkProductVariant(b)
    assert.equal(h.product(b).variantGroupId, undefined)
    await unlinkProductVariant(a)
    for (const product of before) {
        assert.deepEqual(h.product(product._id).inventory, product.inventory)
        assert.deepEqual(h.product(product._id).sizes, product.sizes)
        assert.deepEqual(h.product(product._id).sizeGuide, product.sizeGuide)
        assert.equal(h.product(product._id).price, product.price)
    }
})

test('duplicate colors, repeated products, chained groups, and stale saves are rejected', async t => {
    const h = harness(t)
    await assert.rejects(saveProductVariantGroup(a, { ...body(), members: [
        { productId: a, colorLabel: 'Green' }, { productId: b, colorLabel: ' green ' }
    ] }), /unique/)
    await assert.rejects(saveProductVariantGroup(a, { ...body(), members: [body().members[0], body().members[0]] }), /only once/)
    await saveProductVariantGroup(a, body())
    await assert.rejects(saveProductVariantGroup(a, body()), { status: 409 })
    await assert.rejects(saveProductVariantGroup(b, { ...body(), members: [{ productId: b, colorLabel: 'Blue' }] }), /anchor/)
    await assert.rejects(saveProductVariantGroup(c, { ...body(), members: [{ productId: c, colorLabel: 'Red' }, { productId: b, colorLabel: 'Blue' }] }), /current group/)
    assert.equal(h.product(c).variantGroupId, undefined)
})

test('concurrent stale saves cannot replace a new group or partially assign members', async t => {
    const h = harness(t)
    const results = await Promise.allSettled([saveProductVariantGroup(a, body()), saveProductVariantGroup(a, body())])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(h.product(a).__v, 1)
    await assert.rejects(saveProductVariantGroup(a, { ...body(1), members: [
        body().members[0], { productId: 'ffffffffffffffffffffffff', colorLabel: 'Red' }
    ] }), /no longer exist/)
    assert.equal(h.product(a).__v, 1, 'failed transactions roll the anchor lock back')
    assert.equal(h.product(b).variantGroupId, a)
})

test('joining an existing group is atomic, rejects duplicate colors, and invalidates stale editors', async t => {
    const h = harness(t)
    await saveProductVariantGroup(a, body())
    const added = await createProductInVariantGroup(fixture('new', { inventory: { M: 0 } }), a, 'Red')
    assert.equal(added.variantGroupId, a)
    assert.equal(added.inventory.M, 0)
    await assert.rejects(createProductInVariantGroup(fixture('new'), a, ' red '), /already exists/)
    await assert.rejects(saveProductVariantGroup(a, body(1)), /changed/)
    assert.equal(h.product(a).__v, 2)
    await unlinkProductVariant(a)
    await assert.rejects(createProductInVariantGroup(fixture('new'), a, 'Blue'), /no longer exists/)
})

test('anchor deletion is blocked while linked colors remain', async t => {
    const h = harness(t)
    await saveProductVariantGroup(a, body())
    const res = { status(code) { this.code = code; return this }, json(data) { this.body = data } }
    await removeProduct({ body: { id: a } }, res)
    assert.equal(res.code, 409)
    assert.equal(res.body.code, 'PRODUCT_HAS_COLOR_VARIANTS')
    assert.equal(h.product(a).__v, 1)
    await unlinkProductVariant(a)
    await removeProduct({ body: { id: a } }, res)
    assert.equal(res.body.success, true)
    assert.ok(h.product(b))
})

test('general item labels reuse the existing group index and preserve legacy color groups', async t => {
    const h = harness(t)
    await saveProductVariantGroup(a, body())
    assert.equal(h.product(a).colorLabel, 'Yellow', 'Legacy requests remain accepted')
    const members = [
        { productId: a, optionLabel: 'Classic Shirt' },
        { productId: b, optionLabel: 'Department Shirt' }
    ]
    await saveProductVariantGroup(a, { ...body(1), groupTitle: 'Campus Shirts', members })
    assert.equal(h.product(a).optionLabel, 'Classic Shirt')
    assert.equal(h.product(a).colorLabel, undefined)
    assert.equal(h.product(b).colorKey, 'department shirt')
    await assert.rejects(saveProductVariantGroup(a, { ...body(2), members: [members[0], { ...members[1], optionLabel: ' classic  shirt ' }] }), /unique/)
    assert.deepEqual(h.product(b).inventory, { M: 7 })
    await unlinkProductVariant(b)
    assert.equal(h.product(b).optionLabel, undefined)
    assert.equal(h.product(b).name, fixture(b).name)
})
