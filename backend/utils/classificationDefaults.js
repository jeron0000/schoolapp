import mongoose from 'mongoose'
import categoryModel from '../models/categoryModel.js'
import { defaultManagedClassifications } from '../../shared/productTaxonomy.js'

const key = value => value.normalize('NFKC').toLocaleLowerCase('en-US')

const classificationValues = classification => ({
    name: classification.name,
    nameKey: key(classification.name),
    code: classification.code,
    codeKey: key(classification.code),
    scope: classification.scope,
    active: true
})

export const prepareDefaultClassificationOperations = existingCategories => {
    const operations = []
    const classificationsByCode = new Map()
    const classificationsByName = new Map()

    for (const category of existingCategories) {
        const codeKey = key(category.code)
        const nameKey = key(category.name)
        const scopedNameKey = `${category.scope}:${nameKey}`
        if (classificationsByCode.has(codeKey) || classificationsByName.has(scopedNameKey)) {
            throw new Error('Existing classification codes or names conflict case-insensitively.')
        }
        classificationsByCode.set(codeKey, category)
        classificationsByName.set(scopedNameKey, category)

        if (category.codeKey !== codeKey || category.nameKey !== nameKey) {
            operations.push({
                updateOne: {
                    filter: { _id: category._id },
                    update: { $set: { codeKey, nameKey } }
                }
            })
        }
    }

    for (const classification of defaultManagedClassifications) {
        const values = classificationValues(classification)
        const existingCode = classificationsByCode.get(values.codeKey)
        if (existingCode) {
            if (existingCode.scope !== values.scope) {
                throw new Error(`Classification code ${values.code} already belongs to another scope.`)
            }
            continue
        }

        const scopedNameKey = `${values.scope}:${values.nameKey}`
        if (classificationsByName.has(scopedNameKey)) {
            throw new Error(`Classification name ${values.name} already uses another code.`)
        }
        operations.push({ insertOne: { document: values } })
        classificationsByCode.set(values.codeKey, values)
        classificationsByName.set(scopedNameKey, values)
    }

    return operations
}

export const initializeDefaultClassifications = async () => {
    return mongoose.connection.transaction(async session => {
        const existing = await categoryModel.find({})
            .select('+nameKey +codeKey')
            .session(session)
            .lean()
        const operations = prepareDefaultClassificationOperations(existing)
        if (operations.length > 0) {
            await categoryModel.bulkWrite(operations, { ordered: true, session })
        }
        return { changed: operations.length }
    })
}
