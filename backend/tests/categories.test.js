import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import categoryModel from '../models/categoryModel.js'
import orderModel from '../models/orderModel.js'
import productModel from '../models/productModel.js'
import userModel from '../models/userModel.js'
import adminAuth from '../middleware/adminAuth.js'
import categoryRouter from '../routes/categoryRoute.js'
import {
    createCategory,
    deleteCategory,
    listActiveCategories,
    listManagedCategories,
    removeDefaultCategory,
    updateCategory,
    updateDefaultCategory
} from '../controllers/categoryController.js'

const categoryId = '0123456789abcdef01234567'
const secondCategoryId = '1123456789abcdef01234567'

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

const queryResult = rows => ({
    sort(value) {
        assert.deepEqual(value, { name: 1, code: 1 })
        return this
    },
    async lean() {
        return rows
    }
})

test('category routes expose one public list and protect every Admin operation', () => {
    const route = (path, method) => categoryRouter.stack.find(layer => {
        return layer.route?.path === path && layer.route.methods[method]
    }).route

    assert.deepEqual(route('/public', 'get').stack.map(layer => layer.handle), [listActiveCategories])
    assert.deepEqual(route('/admin', 'get').stack.map(layer => layer.handle), [adminAuth, listManagedCategories])
    assert.deepEqual(route('/admin', 'post').stack.map(layer => layer.handle), [adminAuth, createCategory])
    assert.deepEqual(route('/admin/default/:scope/:code', 'patch').stack.map(layer => layer.handle), [adminAuth, updateDefaultCategory])
    assert.deepEqual(route('/admin/default/:scope/:code', 'delete').stack.map(layer => layer.handle), [adminAuth, removeDefaultCategory])
    assert.deepEqual(route('/admin/:id', 'patch').stack.map(layer => layer.handle), [adminAuth, updateCategory])
    assert.deepEqual(route('/admin/:id', 'delete').stack.map(layer => layer.handle), [adminAuth, deleteCategory])
    assert.equal(categoryModel.schema.path('code').options.unique, true)
    assert.equal(categoryModel.schema.path('code').options.immutable, true)
    assert.equal(categoryModel.schema.path('scope').options.immutable, true)
    assert.equal(categoryModel.schema.path('removed').options.default, false)
    assert.ok(categoryModel.schema.indexes().some(([keys, options]) => (
        keys.scope === 1 && keys.nameKey === 1 && options.unique === true
    )))
})

test('category creation validates and stores stable category metadata', async t => {
    t.mock.method(categoryModel, 'init', async () => {})
    t.mock.method(categoryModel, 'create', async values => {
        assert.deepEqual(values, {
            name: 'School Supplies',
            nameKey: 'school supplies',
            code: 'school-supplies',
            codeKey: 'school-supplies',
            scope: 'general',
            active: true
        })
        return { _id: categoryId, ...values, removed: false }
    })

    const res = response()
    await createCategory({
        body: { name: '  School Supplies  ', code: 'school-supplies' }
    }, res)

    assert.equal(res.statusCode, 201)
    assert.deepEqual(res.body, {
        success: true,
        message: 'Category created.',
        category: {
            _id: categoryId,
            name: 'School Supplies',
            code: 'school-supplies',
            scope: 'general',
            active: true,
            removed: false,
            createdAt: undefined,
            updatedAt: undefined
        }
    })
})

test('malformed category creation requests never reach MongoDB', async t => {
    t.mock.method(categoryModel, 'init', () => assert.fail('Unexpected index initialization'))
    t.mock.method(categoryModel, 'create', () => assert.fail('Unexpected category creation'))

    const invalidBodies = [
        {},
        { name: '', code: 'valid-code' },
        { name: 'Valid name', code: '1-invalid' },
        { name: 'Valid name', code: 'invalid code' },
        { name: 'Valid name', code: 'valid-code', scope: 'identity' },
        { name: 'Valid name', code: 'valid-code', active: 'true' },
        { name: 'Valid name', code: 'valid-code', unknown: true }
    ]

    for (const body of invalidBodies) {
        const res = response()
        await createCategory({ body }, res)
        assert.equal(res.statusCode, 400)
        assert.equal(res.body.success, false)
    }
})

test('duplicate category names or codes return a conflict', async t => {
    t.mock.method(categoryModel, 'init', async () => {})
    t.mock.method(categoryModel, 'create', async () => {
        const error = new Error('duplicate key')
        error.code = 11000
        throw error
    })

    const res = response()
    await createCategory({ body: { name: 'Uniforms', code: 'uniforms' } }, res)

    assert.equal(res.statusCode, 409)
    assert.equal(res.body.success, false)
})

test('default and gender codes are ordinary managed classifications', async t => {
    t.mock.method(categoryModel, 'init', async () => {})
    const created = t.mock.method(categoryModel, 'create', async values => ({
        _id: categoryId,
        ...values
    }))

    for (const body of [
        { name: 'Information Technology', code: 'BSIT', scope: 'program' },
        { name: 'Tops', code: 'TOP', scope: 'general' },
        { name: 'Men', code: 'Men', scope: 'gender' }
    ]) {
        const res = response()
        await createCategory({ body }, res)
        assert.equal(res.statusCode, 201)
        assert.equal(res.body.category.scope, body.scope)
    }
    assert.equal(created.mock.callCount(), 3)
})

test('renaming a built-in classification atomically creates its managed override', async t => {
    const upsert = t.mock.method(categoryModel, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { codeKey: 'bsit', scope: 'program' })
        assert.deepEqual(update, {
            $set: { name: 'Information Technology', nameKey: 'information technology' },
            $setOnInsert: {
                code: 'BSIT',
                codeKey: 'bsit',
                scope: 'program',
                active: true,
                removed: false
            }
        })
        assert.equal(options.upsert, true)
        assert.equal(options.returnDocument, 'after')
        return {
            _id: categoryId,
            name: 'Information Technology',
            code: 'BSIT',
            scope: 'program',
            active: true,
            removed: false
        }
    })

    const res = response()
    await updateDefaultCategory({
        params: { scope: 'program', code: 'BSIT' },
        body: { name: 'Information Technology' }
    }, res)

    assert.equal(res.body.success, true)
    assert.equal(res.body.category.code, 'BSIT')
    assert.equal(res.body.category.name, 'Information Technology')
    assert.equal(upsert.mock.callCount(), 1)
})

test('invalid fallback identities cannot create managed records', async t => {
    const upsert = t.mock.method(categoryModel, 'findOneAndUpdate', () => {
        assert.fail('Invalid defaults must not be persisted')
    })
    const res = response()
    await updateDefaultCategory({
        params: { scope: 'program', code: 'unknown-program' },
        body: { name: 'Unknown Program' }
    }, res)
    assert.equal(res.statusCode, 404)
    assert.equal(upsert.mock.callCount(), 0)
})

test('managed and public lists retain status privacy and active filtering', async t => {
    const rows = [
        {
            _id: categoryId,
            name: 'Program Uniforms',
            code: 'program-uniforms',
            scope: 'program',
            active: true,
            nameKey: 'program uniforms'
        },
        {
            _id: secondCategoryId,
            name: 'Archived Program',
            code: 'archived-program',
            scope: 'program',
            active: false,
            nameKey: 'archived program'
        }
    ]
    const filters = []
    t.mock.method(categoryModel, 'find', filter => {
        filters.push(filter)
        return queryResult(rows)
    })

    const managed = response()
    await listManagedCategories({}, managed)
    const publicList = response()
    await listActiveCategories({}, publicList)

    assert.deepEqual(filters, [{}, {}])
    assert.equal(managed.body.categories[0].active, true)
    assert.equal('nameKey' in managed.body.categories[0], false)
    assert.deepEqual(publicList.body.categories, [{
        name: 'Program Uniforms',
        code: 'program-uniforms',
        scope: 'program'
    }])
    assert.deepEqual(publicList.body.archivedCategories, [{
        name: 'Archived Program',
        code: 'archived-program',
        scope: 'program'
    }])
})

test('default and Admin-created classifications can be renamed or archived without changing identity', async t => {
    t.mock.method(categoryModel, 'findByIdAndUpdate', async (id, update, options) => {
        assert.equal(id, categoryId)
        assert.deepEqual(update, {
            $set: {
                name: 'Updated Uniforms',
                nameKey: 'updated uniforms',
                active: false
            }
        })
        assert.deepEqual(options, { returnDocument: 'after', runValidators: true })
        return {
            _id: categoryId,
            code: 'uniforms',
            ...update.$set
        }
    })

    const res = response()
    await updateCategory({
        params: { id: categoryId },
        body: { name: 'Updated Uniforms', active: false }
    }, res)

    assert.equal(res.body.success, true)
    assert.equal(res.body.category.code, 'uniforms')
    assert.equal(res.body.category.active, false)

    const immutableCode = response()
    await updateCategory({
        params: { id: categoryId },
        body: { code: 'different-code' }
    }, immutableCode)
    assert.equal(immutableCode.statusCode, 400)

    const immutableScope = response()
    await updateCategory({
        params: { id: categoryId },
        body: { scope: 'gender' }
    }, immutableScope)
    assert.equal(immutableScope.statusCode, 400)
})

test('invalid, empty, and missing category updates return safe errors', async t => {
    const update = t.mock.method(categoryModel, 'findByIdAndUpdate', async () => null)

    for (const request of [
        { params: { id: 'invalid' }, body: { active: false } },
        { params: { id: categoryId }, body: {} },
        { params: { id: categoryId }, body: { active: 'false' } }
    ]) {
        const res = response()
        await updateCategory(request, res)
        assert.equal(res.statusCode, 400)
    }

    const missing = response()
    await updateCategory({ params: { id: categoryId }, body: { active: false } }, missing)
    assert.equal(update.mock.callCount(), 1)
    assert.equal(missing.statusCode, 404)

    update.mock.mockImplementation(async () => {
        const error = new Error('duplicate key')
        error.code = 11000
        throw error
    })
    const duplicate = response()
    await updateCategory({ params: { id: categoryId }, body: { name: 'Duplicate' } }, duplicate)
    assert.equal(duplicate.statusCode, 409)
})

const sessionQuery = value => ({
    session(receivedSession) {
        assert.deepEqual(receivedSession, { transaction: true })
        return Promise.resolve(value)
    }
})

test('archived unreferenced classifications delete inside one transaction', async t => {
    const session = { transaction: true }
    t.mock.method(mongoose.connection, 'transaction', async callback => callback(session))
    t.mock.method(categoryModel, 'findById', id => {
        assert.equal(id, categoryId)
        return sessionQuery({ _id: categoryId, code: 'club-items', scope: 'general', active: false })
    })
    for (const model of [productModel, orderModel]) {
        t.mock.method(model, 'exists', () => sessionQuery(null))
    }
    const remove = t.mock.method(categoryModel, 'deleteOne', async (filter, options) => {
        assert.deepEqual(filter, { _id: categoryId })
        assert.equal(options.session, session)
        return { deletedCount: 1 }
    })

    const res = response()
    await deleteCategory({ params: { id: categoryId } }, res)

    assert.deepEqual(res.body, {
        success: true,
        action: 'deleted',
        message: 'Classification deleted.'
    })
    assert.equal(remove.mock.callCount(), 1)
})

test('unreferenced built-in removal persists a tombstone so fallback does not reappear', async t => {
    const session = { transaction: true }
    t.mock.method(mongoose.connection, 'transaction', async callback => callback(session))
    for (const model of [productModel, userModel, orderModel]) {
        t.mock.method(model, 'exists', () => sessionQuery(null))
    }
    let call = 0
    const update = t.mock.method(categoryModel, 'findOneAndUpdate', async (filter, operation, options) => {
        call += 1
        assert.equal(options.session, session)
        if (call === 1) {
            assert.deepEqual(filter, { codeKey: 'bsit', scope: 'program' })
            assert.equal(options.upsert, true)
            return {
                _id: categoryId,
                name: 'BSIT',
                code: 'BSIT',
                scope: 'program',
                active: true,
                removed: false
            }
        }
        assert.deepEqual(filter, { _id: categoryId })
        assert.deepEqual(operation, { $set: { active: false, removed: true } })
        return {
            _id: categoryId,
            name: 'BSIT',
            code: 'BSIT',
            scope: 'program',
            active: false,
            removed: true
        }
    })

    const res = response()
    await removeDefaultCategory({ params: { scope: 'program', code: 'BSIT' } }, res)

    assert.deepEqual(res.body, {
        success: true,
        action: 'deleted',
        message: 'Classification deleted.'
    })
    assert.equal(update.mock.callCount(), 2)
})

test('classification deletion fails closed when transactions are unavailable', async t => {
    t.mock.method(mongoose.connection, 'transaction', async () => {
        throw new Error('Transactions are unavailable')
    })
    const find = t.mock.method(categoryModel, 'findById', () => {
        assert.fail('Deletion must not continue without a transaction')
    })
    const remove = t.mock.method(categoryModel, 'deleteOne', () => {
        assert.fail('Deletion must not continue without a transaction')
    })

    const res = response()
    await deleteCategory({ params: { id: categoryId } }, res)

    assert.equal(res.statusCode, 500)
    assert.equal(res.body.message, 'Unable to delete the classification.')
    assert.equal(find.mock.callCount(), 0)
    assert.equal(remove.mock.callCount(), 0)
})

test('referenced classifications are archived instead of deleted', async t => {
    const session = { transaction: true }
    t.mock.method(mongoose.connection, 'transaction', async callback => callback(session))
    const category = { _id: categoryId, code: 'BSIT', scope: 'program', active: true }
    t.mock.method(categoryModel, 'findById', () => sessionQuery(category))
    t.mock.method(productModel, 'exists', () => sessionQuery({ _id: 'product' }))
    t.mock.method(userModel, 'exists', () => sessionQuery(null))
    t.mock.method(orderModel, 'exists', () => sessionQuery(null))
    const remove = t.mock.method(categoryModel, 'deleteOne', () => {
        assert.fail('Protected classifications must not be deleted')
    })
    const archive = t.mock.method(categoryModel, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: categoryId })
        assert.deepEqual(update, { $set: { active: false, removed: false } })
        assert.equal(options.session, session)
        return { ...category, active: false, removed: false }
    })

    const res = response()
    await deleteCategory({ params: { id: categoryId } }, res)
    assert.equal(res.body.action, 'archived')
    assert.match(res.body.message, /product/i)
    assert.equal(res.body.category.active, false)
    assert.equal(remove.mock.callCount(), 0)
    assert.equal(archive.mock.callCount(), 1)
})

test('student and historical order references preserve classifications by archiving them', async t => {
    const session = { transaction: true }
    t.mock.method(mongoose.connection, 'transaction', async callback => callback(session))
    t.mock.method(categoryModel, 'findById', () => sessionQuery({
        _id: categoryId,
        code: 'BSIT',
        scope: 'program',
        active: false
    }))
    t.mock.method(productModel, 'exists', () => sessionQuery(null))
    let studentReference = true
    t.mock.method(userModel, 'exists', () => sessionQuery(studentReference ? { _id: 'student' } : null))
    t.mock.method(orderModel, 'exists', () => sessionQuery({ _id: 'order' }))
    t.mock.method(categoryModel, 'deleteOne', () => assert.fail('Referenced classifications must not be deleted'))
    t.mock.method(categoryModel, 'findOneAndUpdate', async (_filter, _update, options) => {
        assert.equal(options.session, session)
        return { _id: categoryId, code: 'BSIT', scope: 'program', active: false, removed: false }
    })

    const student = response()
    await deleteCategory({ params: { id: categoryId } }, student)
    assert.equal(student.body.action, 'archived')
    assert.match(student.body.message, /student account/i)

    studentReference = false
    const historical = response()
    await deleteCategory({ params: { id: categoryId } }, historical)
    assert.equal(historical.body.action, 'archived')
    assert.match(historical.body.message, /historical order/i)
})
