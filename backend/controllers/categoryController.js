import mongoose from 'mongoose'
import categoryModel, {
    CATEGORY_CODE_PATTERN,
    CATEGORY_NAME_LIMIT,
    CATEGORY_SCOPES
} from '../models/categoryModel.js'
import orderModel from '../models/orderModel.js'
import productModel from '../models/productModel.js'
import userModel from '../models/userModel.js'
import { defaultManagedClassifications } from '../../shared/productTaxonomy.js'

const createFields = new Set(['name', 'code', 'scope', 'active'])
const updateFields = new Set(['name', 'active'])

class CategoryInputError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.name = 'CategoryInputError'
        this.status = status
    }
}

const cleanName = value => {
    if (typeof value !== 'string') {
        throw new CategoryInputError('Enter a valid category name.')
    }
    const name = value.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > CATEGORY_NAME_LIMIT) {
        throw new CategoryInputError(`Category names must be between 2 and ${CATEGORY_NAME_LIMIT} characters.`)
    }
    if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(name)) {
        throw new CategoryInputError('Enter a valid category name.')
    }
    return name
}

const comparableKey = value => value.normalize('NFKC').toLocaleLowerCase('en-US')

const cleanCode = value => {
    if (typeof value !== 'string' || !CATEGORY_CODE_PATTERN.test(value)) {
        throw new CategoryInputError('Use a category code with letters, numbers, or hyphens.')
    }
    return value
}

const cleanScope = value => {
    if (!CATEGORY_SCOPES.includes(value)) {
        throw new CategoryInputError('Select a valid category scope.')
    }
    return value
}

const cleanActive = value => {
    if (typeof value !== 'boolean') {
        throw new CategoryInputError('Category status must be active or inactive.')
    }
    return value
}

const assertOnlyFields = (body, allowedFields) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new CategoryInputError('Enter valid category details.')
    }
    const unexpectedField = Object.keys(body).find(field => !allowedFields.has(field))
    if (unexpectedField) {
        throw new CategoryInputError(`Unsupported category field: ${unexpectedField}.`)
    }
}

const parseCreateCategory = body => {
    assertOnlyFields(body, createFields)
    const name = cleanName(body.name)
    const values = {
        name,
        nameKey: comparableKey(name),
        code: cleanCode(body.code),
        codeKey: comparableKey(body.code),
        scope: cleanScope(body.scope ?? 'general'),
        active: cleanActive(body.active ?? true)
    }
    return values
}

const parseCategoryUpdate = body => {
    assertOnlyFields(body, updateFields)
    const values = {}

    if (Object.hasOwn(body, 'name')) {
        values.name = cleanName(body.name)
        values.nameKey = comparableKey(values.name)
    }
    if (Object.hasOwn(body, 'active')) {
        values.active = cleanActive(body.active)
    }
    if (Object.keys(values).length === 0) {
        throw new CategoryInputError('No category changes provided.')
    }
    return values
}

const referenceFilters = category => {
    const productFilters = []
    const orderFilters = []
    const checks = []

    if (category.scope === 'program') {
        productFilters.push(
            { academicPrograms: category.code },
            { subCategory: category.code }
        )
        orderFilters.push(
            { 'student.academicProgram': category.code },
            { items: { $elemMatch: { subCategory: category.code } } }
        )
        checks.push({
            model: userModel,
            filter: { academicProgram: category.code },
            label: 'student account'
        })
    }

    if (category.scope === 'general') {
        productFilters.push(
            { merchandiseCategoryCodes: category.code },
            { productCategoryCode: category.code },
            { subCategory: category.code }
        )
        orderFilters.push({ items: { $elemMatch: { subCategory: category.code } } })
    }

    if (category.scope === 'gender') {
        productFilters.push(
            { genders: category.code },
            { category: category.code }
        )
        orderFilters.push({ items: { $elemMatch: { category: category.code } } })
    }

    checks.unshift({ model: productModel, filter: { $or: productFilters }, label: 'product' })
    checks.push({ model: orderModel, filter: { $or: orderFilters }, label: 'historical order' })
    return checks
}

const findClassificationReference = async (category, session) => {
    for (const check of referenceFilters(category)) {
        const reference = await check.model.exists(check.filter).session(session)
        if (reference) return check.label
    }
    return null
}

const categoryId = value => {
    if (!mongoose.isObjectIdOrHexString(value)) {
        throw new CategoryInputError('Invalid category.')
    }
    return value
}

const presentCategory = category => {
    const source = typeof category?.toObject === 'function'
        ? category.toObject()
        : category
    if (!source) return source

    return {
        _id: source._id,
        name: source.name,
        code: source.code,
        scope: source.scope,
        active: source.active,
        removed: source.removed === true,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt
    }
}

const defaultClassification = (scope, code) => {
    const cleanClassificationScope = cleanScope(scope)
    const cleanClassificationCode = cleanCode(code)
    const codeKey = comparableKey(cleanClassificationCode)
    const classification = defaultManagedClassifications.find(item => {
        return item.scope === cleanClassificationScope
            && comparableKey(item.code) === codeKey
    })
    if (!classification) {
        throw new CategoryInputError('Default classification not found.', 404)
    }
    return classification
}

const defaultInsertValues = classification => ({
    name: classification.name,
    nameKey: comparableKey(classification.name),
    code: classification.code,
    codeKey: comparableKey(classification.code),
    scope: classification.scope,
    active: true,
    removed: false
})

const isDefaultCategory = category => defaultManagedClassifications.some(classification => {
    return classification.scope === category.scope
        && comparableKey(classification.code) === comparableKey(category.code)
})

const categoryErrorResponse = (res, error, fallbackMessage) => {
    if (error instanceof CategoryInputError) {
        return res.status(error.status).json({ success: false, message: error.message })
    }
    if (error?.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'A category with this name or code already exists.'
        })
    }
    return res.status(500).json({ success: false, message: fallbackMessage })
}

export const createCategory = async (req, res) => {
    try {
        const values = parseCreateCategory(req.body)
        await categoryModel.init()
        const category = await categoryModel.create(values)
        return res.status(201).json({
            success: true,
            message: 'Category created.',
            category: presentCategory(category)
        })
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to create the category.')
    }
}

export const listManagedCategories = async (_req, res) => {
    try {
        const categories = await categoryModel.find({})
            .sort({ name: 1, code: 1 })
            .lean()
        return res.json({
            success: true,
            categories: categories.map(presentCategory)
        })
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to load categories.')
    }
}

export const listActiveCategories = async (_req, res) => {
    try {
        const categories = await categoryModel.find({})
            .sort({ name: 1, code: 1 })
            .lean()
        const presentPublicCategory = category => ({
            name: category.name,
            code: category.code,
            scope: category.scope
        })
        return res.json({
            success: true,
            categories: categories.filter(category => category.active)
                .map(presentPublicCategory),
            archivedCategories: categories.filter(category => !category.active)
                .map(presentPublicCategory)
        })
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to load active categories.')
    }
}

export const updateCategory = async (req, res) => {
    try {
        const id = categoryId(req.params.id)
        const values = parseCategoryUpdate(req.body)
        const category = await categoryModel.findByIdAndUpdate(
            id,
            { $set: values },
            { returnDocument: 'after', runValidators: true }
        )
        if (!category) {
            throw new CategoryInputError('Category not found.', 404)
        }
        return res.json({
            success: true,
            message: 'Category updated.',
            category: presentCategory(category)
        })
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to update the category.')
    }
}

export const updateDefaultCategory = async (req, res) => {
    try {
        const classification = defaultClassification(req.params.scope, req.params.code)
        const values = parseCategoryUpdate(req.body)
        if (Object.hasOwn(values, 'active')) {
            throw new CategoryInputError('Use the classification status action to restore a classification.')
        }
        const defaults = defaultInsertValues(classification)
        const insertIdentity = {
            code: defaults.code,
            codeKey: defaults.codeKey,
            scope: defaults.scope,
            active: true,
            removed: false
        }
        const category = await categoryModel.findOneAndUpdate(
            { codeKey: defaults.codeKey, scope: defaults.scope },
            {
                $set: values,
                $setOnInsert: insertIdentity
            },
            {
                upsert: true,
                returnDocument: 'after',
                runValidators: true,
                setDefaultsOnInsert: true
            }
        )
        return res.json({
            success: true,
            message: 'Classification updated.',
            category: presentCategory(category)
        })
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to update the classification.')
    }
}

const removeClassification = async (category, session) => {
    const reference = await findClassificationReference(category, session)
    if (reference) {
        const archived = await categoryModel.findOneAndUpdate(
            { _id: category._id },
            { $set: { active: false, removed: false } },
            { returnDocument: 'after', runValidators: true, session }
        )
        if (!archived) {
            throw new CategoryInputError('The classification changed. Refresh and try again.', 409)
        }
        return { action: 'archived', category: presentCategory(archived), reference }
    }

    if (isDefaultCategory(category)) {
        const removed = await categoryModel.findOneAndUpdate(
            { _id: category._id },
            { $set: { active: false, removed: true } },
            { returnDocument: 'after', runValidators: true, session }
        )
        if (!removed) {
            throw new CategoryInputError('The classification changed. Refresh and try again.', 409)
        }
        return { action: 'deleted' }
    }

    const deleted = await categoryModel.deleteOne({ _id: category._id }, { session })
    if (deleted.deletedCount !== 1) {
        throw new CategoryInputError('The classification changed. Refresh and try again.', 409)
    }
    return { action: 'deleted' }
}

const removalResponse = result => {
    if (result.action === 'archived') {
        return {
            success: true,
            action: 'archived',
            message: `Classification archived because it is still used by a ${result.reference}.`,
            category: result.category
        }
    }
    return { success: true, action: 'deleted', message: 'Classification deleted.' }
}

export const deleteCategory = async (req, res) => {
    try {
        const id = categoryId(req.params.id)
        let result
        await mongoose.connection.transaction(async session => {
            const category = await categoryModel.findById(id).session(session)
            if (!category) {
                throw new CategoryInputError('Classification not found.', 404)
            }
            result = await removeClassification(category, session)
        })
        return res.json(removalResponse(result))
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to delete the classification.')
    }
}

export const removeDefaultCategory = async (req, res) => {
    try {
        const classification = defaultClassification(req.params.scope, req.params.code)
        const defaults = defaultInsertValues(classification)
        let result
        await mongoose.connection.transaction(async session => {
            const category = await categoryModel.findOneAndUpdate(
                { codeKey: defaults.codeKey, scope: defaults.scope },
                { $setOnInsert: defaults },
                {
                    upsert: true,
                    returnDocument: 'after',
                    runValidators: true,
                    setDefaultsOnInsert: true,
                    session
                }
            )
            result = await removeClassification(category, session)
        })
        return res.json(removalResponse(result))
    } catch (error) {
        return categoryErrorResponse(res, error, 'Unable to remove the classification.')
    }
}
