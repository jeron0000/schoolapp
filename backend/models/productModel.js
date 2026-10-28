import mongoose from 'mongoose'
import { validPhpAmount } from '../../shared/money.js'
import {
    academicPrograms as builtInAcademicPrograms,
    assignableProductGenders,
    builtInMerchandiseCategoryCodes,
    isBuiltInMerchandiseCategory
} from '../../shared/productTaxonomy.js'
import { MAX_MEASUREMENT_CM } from '../../shared/productMeasurements.js'

const managedClassificationCodePattern = /^[A-Za-z][A-Za-z0-9-]{1,39}$/
const uniqueValues = values => new Set(values).size === values.length
const validAcademicPrograms = values => Array.isArray(values)
    && uniqueValues(values)
    && values.every(value => typeof value === 'string'
        && !isBuiltInMerchandiseCategory(value)
        && (builtInAcademicPrograms.includes(value) || managedClassificationCodePattern.test(value)))
const validGenders = values => {
    if (!Array.isArray(values) || !uniqueValues(values)) return false
    const validValues = values.every(value => assignableProductGenders.includes(value)
        || managedClassificationCodePattern.test(value))
    if (!validValues) return false
    return !values.includes('Not Applicable') || values.length === 1
}
const validMerchandiseCategories = values => Array.isArray(values)
    && uniqueValues(values)
    && values.every(value => builtInMerchandiseCategoryCodes.includes(value)
        || managedClassificationCodePattern.test(value))

const priceChangeSchema = new mongoose.Schema({
    amount: { type: Number, required: true, validate: validPhpAmount },
    effectiveAt: { type: Date, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    cancelledAt: { type: Date, default: null }
})

const measurementFieldSchema = new mongoose.Schema({
    key: { type: String, required: true, match: /^[a-z][a-z0-9-]{0,39}$/ },
    label: { type: String, required: true, minlength: 2, maxlength: 40 }
}, { _id: false })

const sizeMeasurementSchema = new mongoose.Schema({
    size: { type: String, required: true },
    values: {
        type: Map,
        of: {
            type: Number,
            min: Number.MIN_VALUE,
            max: MAX_MEASUREMENT_CM
        },
        default: () => ({})
    }
}, { _id: false })

const sizeGuideSchema = new mongoose.Schema({
    fields: { type: [measurementFieldSchema], default: () => [] },
    measurements: { type: [sizeMeasurementSchema], default: () => [] }
}, { _id: false })

const restockPlanSchema = new mongoose.Schema({
    status: { type: String, required: true, enum: ['soon', 'scheduled'] },
    announce: { type: Boolean, required: true, default: false },
    publicationTiming: {
        type: String,
        enum: ['immediate', 'arrival'],
        default: 'immediate'
    },
    estimatedDate: {
        type: Date,
        required() {
            return this.status === 'scheduled'
        }
    }
}, { _id: false })

const scheduledStockUpdateSchema = new mongoose.Schema({
    adjustments: {
        type: Map,
        of: {
            type: Number,
            min: 1,
            validate: Number.isSafeInteger
        },
        required: true
    },
    executeAt: { type: Date, required: true },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'completed', 'cancelled', 'failed'],
        default: 'pending'
    },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
    executedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 240 }
})

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, validate: validPhpAmount },
    image: { type: Array, required: true },
    variantGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'product' },
    optionLabel: { type: String, maxlength: 80 },
    colorLabel: { type: String, maxlength: 40 },
    colorKey: { type: String, maxlength: 80 },
    groupTitle: { type: String, maxlength: 120 },
    productCategoryCode: {
        type: String,
        validate: value => value === null
            || builtInMerchandiseCategoryCodes.includes(value)
            || managedClassificationCodePattern.test(value)
    },
    category: { type: String },
    subCategory: { type: String },
    academicPrograms: {
        type: [String],
        default: undefined,
        validate: validAcademicPrograms
    },
    genders: {
        type: [String],
        default: undefined,
        validate: validGenders
    },
    merchandiseCategoryCodes: {
        type: [String],
        default: undefined,
        validate: validMerchandiseCategories
    },
    sizes: { type: Array, required: true },
    inventory: { type: Map, of: { type: Number, min: 0, validate: Number.isSafeInteger }, default: () => ({}) },
    sizeGuide: { type: sizeGuideSchema, default: undefined },
    restockPlan: { type: restockPlanSchema, default: undefined },
    scheduledStockUpdate: { type: scheduledStockUpdateSchema, default: undefined },
    BestSeller: { type: Boolean },
    NewArrival: { type: Boolean, default: false },
    newArrivalMarkedAt: { type: Date },
    priceChanges: { type: [priceChangeSchema], default: () => [] },
    date: { type: Number, required: true }

})

// Retain the existing index/key for both general item labels and legacy colors.
productSchema.index({ variantGroupId: 1, colorKey: 1 }, {
    name: 'variant_group_color_unique',
    unique: true,
    partialFilterExpression: { variantGroupId: { $type: 'objectId' }, colorKey: { $type: 'string' } }
})

const productModel = mongoose.models.product || mongoose.model('product', productSchema)

export default productModel
