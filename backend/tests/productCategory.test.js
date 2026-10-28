import test from 'node:test'
import assert from 'node:assert/strict'
import productModel from '../models/productModel.js'
import categoryModel from '../models/categoryModel.js'
import adminAuth from '../middleware/adminAuth.js'
import productRouter from '../routes/productRoute.js'
import { addProduct, updateProductCategory } from '../controllers/productController.js'
import { presentPublicProduct } from '../utils/productPricing.js'
import {
    academicPrograms,
    assignableProductGenders,
    builtInMerchandiseCategoryCodes,
    legacyMerchandiseCategories
} from '../../shared/productTaxonomy.js'

const productId = '0123456789abcdef01234567'

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

const mockCategoryLookup = (t, lookup) => t.mock.method(
    categoryModel,
    'findOne',
    query => ({
        select() {
            return this
        },
        async lean() {
            const category = await lookup(query)
            if (!category) return null
            return { active: true, ...category }
        }
    })
)

const storedProduct = overrides => ({
    _id: productId,
    name: 'Existing uniform',
    category: 'Men',
    subCategory: 'BSIT',
    price: 225,
    image: ['uniform.png'],
    sizes: ['M'],
    inventory: { M: 4 },
    priceChanges: [],
    ...overrides
})

test('classification route stays protected and the schema keeps legacy fields', async () => {
    const route = productRouter.stack.find(layer => layer.route?.path === '/category/:id').route

    assert.equal(route.methods.patch, true)
    assert.deepEqual(route.stack.map(layer => layer.handle), [adminAuth, updateProductCategory])
    assert.equal(Boolean(productModel.schema.path('productCategoryCode').isRequired), false)
    assert.equal(Boolean(productModel.schema.path('category').isRequired), false)
    assert.equal(Boolean(productModel.schema.path('subCategory').isRequired), false)
    assert.equal(Boolean(productModel.schema.path('academicPrograms').isRequired), false)
    assert.equal(Boolean(productModel.schema.path('genders').isRequired), false)
    assert.equal(Boolean(productModel.schema.path('merchandiseCategoryCodes').isRequired), false)
    for (const productCategoryCode of builtInMerchandiseCategoryCodes) {
        const merchandiseProduct = new productModel({
            name: 'Built-in merchandise',
            description: 'Schema compatibility check',
            price: 100,
            image: [],
            productCategoryCode,
            sizes: ['One Size'],
            date: Date.now()
        })
        await assert.doesNotReject(merchandiseProduct.validate())
    }
})

test('product creation validates Program and Merchandise classifications independently', async t => {
    const categoryQueries = []
    mockCategoryLookup(t, async query => {
        categoryQueries.push(query)
        if (query.code === 'digital-arts' && query.scope === 'program') return { _id: productId }
        if (query.code === 'school-supplies' && query.scope === 'general') return { _id: productId }
        return null
    })
    const saved = []
    t.mock.method(productModel.prototype, 'save', async function () {
        await this.validate()
        saved.push(this.toObject())
    })
    const baseBody = {
        name: 'New item',
        description: 'Classification fixture',
        price: '125',
        sizes: '["One Size"]',
        inventory: '{"One Size":2}',
        BestSeller: 'false',
        NewArrival: 'false'
    }
    const create = async classification => {
        const res = response()
        await addProduct({ body: { ...baseBody, ...classification }, files: {} }, res)
        return res
    }

    const legacyProgram = await create({
        category: 'Men',
        subCategory: 'BSIT',
        productCategoryCode: 'TOP'
    })
    const dynamicProgram = await create({
        category: 'Women',
        subCategory: 'digital-arts',
        productCategoryCode: 'BOTTOM'
    })
    const builtInMerchandise = await create({
        category: 'Not Applicable',
        productCategoryCode: 'EXTRA'
    })
    const dynamicMerchandise = await create({ productCategoryCode: 'school-supplies' })
    const crossedScope = await create({ subCategory: 'school-supplies' })

    assert.equal(legacyProgram.body.success, true)
    assert.equal(dynamicProgram.body.success, true)
    assert.equal(builtInMerchandise.body.success, true)
    assert.equal(dynamicMerchandise.body.success, true)
    assert.equal(crossedScope.statusCode, 400)
    assert.equal(saved.length, 4)
    assert.equal(saved[0].subCategory, 'BSIT')
    assert.equal(saved[0].productCategoryCode, 'TOP')
    assert.deepEqual(saved[0].academicPrograms, ['BSIT'])
    assert.deepEqual(saved[0].genders, ['Men'])
    assert.deepEqual(saved[0].merchandiseCategoryCodes, ['TOP'])
    assert.equal(saved[1].subCategory, 'digital-arts')
    assert.equal(saved[1].productCategoryCode, 'BOTTOM')
    assert.equal(saved[2].productCategoryCode, 'EXTRA')
    assert.equal(saved[2].subCategory, null)
    assert.equal(saved[3].productCategoryCode, 'school-supplies')
    assert.equal(saved[3].category, null)
    assert.deepEqual(categoryQueries, [
        { code: 'Men', scope: 'gender' },
        { code: 'BSIT', scope: 'program' },
        { code: 'TOP', scope: 'general' },
        { code: 'Women', scope: 'gender' },
        { code: 'digital-arts', scope: 'program' },
        { code: 'BOTTOM', scope: 'general' },
        { code: 'EXTRA', scope: 'general' },
        { code: 'school-supplies', scope: 'general' },
        { code: 'school-supplies', scope: 'program' }
    ])
})

test('one atomic update independently assigns gender, Program, and Merchandise Category', async t => {
    const categoryQueries = []
    mockCategoryLookup(t, async query => {
        categoryQueries.push(query)
        return { _id: 'abcdef0123456789abcdef01' }
    })
    t.mock.method(productModel, 'findByIdAndUpdate', async (id, update, options) => {
        assert.equal(id, productId)
        assert.deepEqual(update, {
            $set: {
                category: 'Not Applicable',
                genders: ['Not Applicable'],
                subCategory: 'digital-arts',
                academicPrograms: ['digital-arts'],
                productCategoryCode: 'school-supplies',
                merchandiseCategoryCodes: ['school-supplies']
            }
        })
        assert.deepEqual(options, { returnDocument: 'after', runValidators: true })
        return storedProduct(update.$set)
    })

    const res = response()
    await updateProductCategory({
        params: { id: productId },
        body: {
            category: 'Not Applicable',
            subCategory: 'digital-arts',
            productCategoryCode: 'school-supplies'
        }
    }, res)

    assert.equal(res.body.success, true)
    assert.deepEqual(categoryQueries, [
        { code: 'digital-arts', scope: 'program' },
        { code: 'school-supplies', scope: 'general' }
    ])
    assert.equal(res.body.product.category, 'Not Applicable')
    assert.equal(res.body.product.subCategory, 'digital-arts')
    assert.equal(res.body.product.productCategoryCode, 'school-supplies')
    assert.deepEqual(res.body.product.academicPrograms, ['digital-arts'])
    assert.deepEqual(res.body.product.genders, ['Not Applicable'])
    assert.deepEqual(res.body.product.merchandiseCategoryCodes, ['school-supplies'])
    assert.equal('priceChanges' in res.body.product, false)
})

test('legacy single-field Gender and merchandise requests remain compatible', async t => {
    const categoryQueries = []
    mockCategoryLookup(t, async query => {
        categoryQueries.push(query)
        return { _id: 'abcdef0123456789abcdef01' }
    })
    const updates = []
    t.mock.method(productModel, 'findByIdAndUpdate', async (_id, update) => {
        updates.push(update)
        return storedProduct(update.$set)
    })

    for (const category of assignableProductGenders) {
        const res = response()
        await updateProductCategory({ params: { id: productId }, body: { category } }, res)
        assert.equal(res.body.success, true)
        assert.equal(res.body.product.category, category)
    }

    const legacyProgram = response()
    await updateProductCategory({
        params: { id: productId },
        body: { subCategory: 'BSIT' }
    }, legacyProgram)
    assert.equal(legacyProgram.body.success, true)
    assert.equal(legacyProgram.body.product.subCategory, 'BSIT')

    const merchandise = response()
    await updateProductCategory({
        params: { id: productId },
        body: { productCategoryCode: 'school-supplies' }
    }, merchandise)

    assert.deepEqual(updates.at(-1), {
        $set: {
            productCategoryCode: 'school-supplies',
            merchandiseCategoryCodes: ['school-supplies']
        }
    })

    for (const productCategoryCode of builtInMerchandiseCategoryCodes) {
        const builtInMerchandise = response()
        await updateProductCategory({
            params: { id: productId },
            body: { productCategoryCode }
        }, builtInMerchandise)
        assert.equal(builtInMerchandise.body.success, true)
        assert.deepEqual(updates.at(-1), {
            $set: {
                productCategoryCode,
                merchandiseCategoryCodes: [productCategoryCode]
            }
        })
    }
    assert.deepEqual(categoryQueries, [
        { code: 'Men', scope: 'gender' },
        { code: 'Women', scope: 'gender' },
        { code: 'BSIT', scope: 'program' },
        { code: 'school-supplies', scope: 'general' },
        { code: 'TOP', scope: 'general' },
        { code: 'BOTTOM', scope: 'general' },
        { code: 'EXTRA', scope: 'general' }
    ])
})

test('classifications can be explicitly unassigned without category lookups', async t => {
    const categoryLookup = mockCategoryLookup(t, () => {
        assert.fail('Unassignment must not query categories')
    })
    t.mock.method(productModel, 'findByIdAndUpdate', async (_id, update) => {
        assert.deepEqual(update, {
            $set: {
                category: null,
                genders: [],
                subCategory: null,
                academicPrograms: [],
                productCategoryCode: null,
                merchandiseCategoryCodes: []
            }
        })
        return storedProduct(update.$set)
    })

    const res = response()
    await updateProductCategory({
        params: { id: productId },
        body: {
            category: null,
            subCategory: null,
            productCategoryCode: null
        }
    }, res)

    assert.equal(res.body.success, true)
    assert.equal(res.body.product.subCategory, null)
    assert.equal(categoryLookup.mock.callCount(), 0)
})

test('resolved Select All payload assigns multiple values without duplicating the product', async t => {
    mockCategoryLookup(t, async query => {
        const validDynamic = query.code === 'digital-arts' && query.scope === 'program'
            || query.code === 'school-supplies' && query.scope === 'general'
        return validDynamic ? { _id: productId } : null
    })
    const update = t.mock.method(productModel, 'findByIdAndUpdate', async (_id, change) => {
        assert.deepEqual(change, {
            $set: {
                genders: ['Men', 'Women'],
                category: 'Men',
                academicPrograms: ['BSIT', 'BSCpE', 'BSBAOM', 'BSHM', 'digital-arts'],
                subCategory: 'BSIT',
                merchandiseCategoryCodes: ['TOP', 'BOTTOM', 'EXTRA', 'school-supplies'],
                productCategoryCode: 'TOP'
            }
        })
        return storedProduct(change.$set)
    })

    const res = response()
    await updateProductCategory({
        params: { id: productId },
        body: {
            genders: ['Men', 'Women'],
            academicPrograms: ['BSIT', 'BSCpE', 'BSBAOM', 'BSHM', 'digital-arts'],
            merchandiseCategoryCodes: ['TOP', 'BOTTOM', 'EXTRA', 'school-supplies']
        }
    }, res)

    assert.equal(res.body.success, true)
    assert.equal(update.mock.callCount(), 1)
    assert.deepEqual(res.body.product.genders, ['Men', 'Women'])
    assert.deepEqual(res.body.product.academicPrograms, [
        'BSIT',
        'BSCpE',
        'BSBAOM',
        'BSHM',
        'digital-arts'
    ])
    assert.deepEqual(res.body.product.merchandiseCategoryCodes, [
        'TOP',
        'BOTTOM',
        'EXTRA',
        'school-supplies'
    ])
})

test('Clear All updates one group without changing other classifications', async t => {
    const categoryLookup = mockCategoryLookup(t, () => {
        assert.fail('Clearing one group must not query categories')
    })
    t.mock.method(productModel, 'findByIdAndUpdate', async (_id, update) => {
        assert.deepEqual(update, {
            $set: {
                academicPrograms: [],
                subCategory: null
            }
        })
        return storedProduct({
            academicPrograms: [],
            subCategory: null,
            genders: ['Men', 'Women'],
            merchandiseCategoryCodes: ['TOP', 'BOTTOM']
        })
    })

    const res = response()
    await updateProductCategory({
        params: { id: productId },
        body: { academicPrograms: [] }
    }, res)

    assert.equal(res.body.success, true)
    assert.deepEqual(res.body.product.academicPrograms, [])
    assert.deepEqual(res.body.product.genders, ['Men', 'Women'])
    assert.deepEqual(res.body.product.merchandiseCategoryCodes, ['TOP', 'BOTTOM'])
    assert.equal(categoryLookup.mock.callCount(), 0)
})

test('multi-value creation preserves price, inventory, images, and compatibility mirrors', async t => {
    mockCategoryLookup(t, async query => {
        const validDynamic = query.code === 'digital-arts' && query.scope === 'program'
            || query.code === 'school-supplies' && query.scope === 'general'
        return validDynamic ? { _id: productId } : null
    })
    let savedProduct
    t.mock.method(productModel.prototype, 'save', async function () {
        await this.validate()
        savedProduct = this.toObject({ flattenMaps: true })
    })

    const res = response()
    await addProduct({
        body: {
            name: 'Shared uniform pants',
            description: 'One product and one inventory record',
            price: '235.50',
            sizes: '["M","L"]',
            inventory: '{"M":4,"L":3}',
            academicPrograms: '["BSIT","BSCpE","digital-arts"]',
            genders: '["Men","Women"]',
            merchandiseCategoryCodes: '["BOTTOM","school-supplies"]',
            BestSeller: 'true',
            NewArrival: 'false'
        },
        files: {}
    }, res)

    assert.equal(res.body.success, true)
    assert.equal(savedProduct.price, 235.5)
    assert.deepEqual(savedProduct.inventory, { M: 4, L: 3 })
    assert.deepEqual(savedProduct.academicPrograms, ['BSIT', 'BSCpE', 'digital-arts'])
    assert.deepEqual(savedProduct.genders, ['Men', 'Women'])
    assert.deepEqual(savedProduct.merchandiseCategoryCodes, ['BOTTOM', 'school-supplies'])
    assert.equal(savedProduct.subCategory, 'BSIT')
    assert.equal(savedProduct.category, 'Men')
    assert.equal(savedProduct.productCategoryCode, 'BOTTOM')
    assert.equal(savedProduct.BestSeller, true)
})

test('duplicate, cross-scope, incompatible, and magic All assignments are rejected', async t => {
    mockCategoryLookup(t, async query => {
        if (query.code === 'digital-arts' && query.scope === 'program') {
            return { _id: productId }
        }
        if (query.code === 'school-supplies' && query.scope === 'general') {
            return { _id: productId }
        }
        return null
    })
    const update = t.mock.method(productModel, 'findByIdAndUpdate', () => {
        assert.fail('Invalid multi-value assignments must not update products')
    })
    const invalidBodies = [
        { academicPrograms: ['BSIT', 'BSIT'] },
        { academicPrograms: ['EXTRA'] },
        { academicPrograms: ['school-supplies'] },
        { academicPrograms: ['ALL'] },
        { genders: ['Men', 'Men'] },
        { genders: ['Not Applicable', 'Women'] },
        { genders: ['Unassigned'] },
        { merchandiseCategoryCodes: ['TOP', 'TOP'] },
        { merchandiseCategoryCodes: ['digital-arts'] },
        { merchandiseCategoryCodes: ['ALL'] }
    ]

    for (const body of invalidBodies) {
        const res = response()
        await updateProductCategory({ params: { id: productId }, body }, res)
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.success, false)
    }
    assert.equal(update.mock.callCount(), 0)
})

test('Program and Merchandise Category scopes cannot be crossed', async t => {
    let rejectedScope = 'program'
    const exists = mockCategoryLookup(t, async query => {
        if (query.scope === rejectedScope) return null
        return { _id: 'abcdef0123456789abcdef01' }
    })
    const update = t.mock.method(productModel, 'findByIdAndUpdate', () => {
        assert.fail('Invalid scoped categories must not update products')
    })

    const invalidProgram = response()
    await updateProductCategory({
        params: { id: productId },
        body: { subCategory: 'school-supplies' }
    }, invalidProgram)

    assert.equal(invalidProgram.statusCode, 400)
    assert.match(invalidProgram.body.message, /active academic program/i)
    assert.equal(exists.mock.callCount(), 1)
    assert.equal(update.mock.callCount(), 0)

    rejectedScope = 'general'
    const invalidMerchandise = response()
    await updateProductCategory({
        params: { id: productId },
        body: { productCategoryCode: 'digital-arts' }
    }, invalidMerchandise)

    assert.equal(invalidMerchandise.statusCode, 400)
    assert.match(invalidMerchandise.body.message, /active merchandise category/i)
    assert.equal(exists.mock.callCount(), 2)
    assert.equal(update.mock.callCount(), 0)
})

test('malformed, unknown, and unsupported classification updates are rejected', async t => {
    const exists = mockCategoryLookup(t, async () => null)
    const update = t.mock.method(productModel, 'findByIdAndUpdate', () => {
        assert.fail('Invalid classifications must not update products')
    })
    const requests = [
        { params: { id: 'invalid' }, body: { category: 'Men' } },
        { params: { id: productId }, body: {} },
        { params: { id: productId }, body: { category: '' } },
        { params: { id: productId }, body: { category: 'Accessories' } },
        { params: { id: productId }, body: { subCategory: 'bad code' } },
        { params: { id: productId }, body: { subCategory: 'EXTRA' } },
        { params: { id: productId }, body: { productCategoryCode: 'missing-category' } },
        { params: { id: productId }, body: { category: 'Men', price: 0 } }
    ]

    for (const request of requests) {
        const res = response()
        await updateProductCategory(request, res)
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.success, false)
    }

    assert.equal(exists.mock.callCount(), 2)
    assert.equal(update.mock.callCount(), 0)
})

test('legacy EXTRA products remain public as merchandise compatibility records', () => {
    assert.equal(academicPrograms.includes('EXTRA'), false)
    assert.equal(legacyMerchandiseCategories.includes('EXTRA'), true)

    const legacy = storedProduct({ subCategory: 'EXTRA' })
    const presented = presentPublicProduct(legacy, Date.now())

    assert.equal(presented.subCategory, 'EXTRA')
    assert.equal(Object.hasOwn(presented, 'productCategoryCode'), false)
    assert.deepEqual(presented.academicPrograms, [])
    assert.deepEqual(presented.genders, ['Men'])
    assert.deepEqual(presented.merchandiseCategoryCodes, ['EXTRA'])
})

test('public product responses retain authoritative dynamic classification fields', () => {
    const product = storedProduct({
        subCategory: 'digital-arts',
        productCategoryCode: 'school-supplies'
    })
    const presented = presentPublicProduct(product, Date.now())

    assert.equal(presented.category, 'Men')
    assert.equal(presented.subCategory, 'digital-arts')
    assert.equal(presented.productCategoryCode, 'school-supplies')
    assert.deepEqual(presented.academicPrograms, ['digital-arts'])
    assert.deepEqual(presented.genders, ['Men'])
    assert.deepEqual(presented.merchandiseCategoryCodes, ['school-supplies'])
})

test('explicitly cleared arrays never fall back to outdated scalar classifications', () => {
    const product = storedProduct({
        category: 'Men',
        subCategory: 'BSIT',
        productCategoryCode: 'TOP',
        genders: [],
        academicPrograms: [],
        merchandiseCategoryCodes: []
    })
    const presented = presentPublicProduct(product, Date.now())

    assert.deepEqual(presented.genders, [])
    assert.deepEqual(presented.academicPrograms, [])
    assert.deepEqual(presented.merchandiseCategoryCodes, [])
    assert.equal(presented.category, 'Men')
    assert.equal(presented.subCategory, 'BSIT')
    assert.equal(presented.productCategoryCode, 'TOP')
})

test('missing products and database failures retain safe responses', async t => {
    mockCategoryLookup(t, async () => null)
    const update = t.mock.method(productModel, 'findByIdAndUpdate', async () => null)
    const missing = response()
    await updateProductCategory({ params: { id: productId }, body: { category: 'Women' } }, missing)

    assert.equal(missing.statusCode, 404)
    assert.deepEqual(missing.body, { success: false, message: 'Product not found.' })

    update.mock.mockImplementation(async () => {
        throw new Error('Database unavailable')
    })
    const failed = response()
    await updateProductCategory({ params: { id: productId }, body: { category: 'Women' } }, failed)

    assert.equal(failed.statusCode, 500)
    assert.deepEqual(failed.body, {
        success: false,
        message: 'Unable to update the product category. Please try again.'
    })
})
