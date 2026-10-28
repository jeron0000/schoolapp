import mongoose from 'mongoose'

export const CATEGORY_NAME_LIMIT = 80
export const CATEGORY_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9-]{1,39}$/
export const CATEGORY_SCOPES = ['general', 'program', 'gender']

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: CATEGORY_NAME_LIMIT
    },
    nameKey: {
        type: String,
        required: true,
        select: false
    },
    code: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        match: CATEGORY_CODE_PATTERN
    },
    codeKey: {
        type: String,
        select: false
    },
    scope: {
        type: String,
        required: true,
        enum: CATEGORY_SCOPES,
        default: 'general',
        immutable: true
    },
    active: {
        type: Boolean,
        required: true,
        default: true
    },
    removed: {
        type: Boolean,
        required: true,
        default: false
    }
}, { timestamps: true })

categorySchema.index(
    { scope: 1, nameKey: 1 },
    { name: 'classification_scope_name_unique', unique: true }
)
categorySchema.index(
    { codeKey: 1 },
    {
        name: 'classification_code_key_unique',
        unique: true,
        partialFilterExpression: { codeKey: { $type: 'string' } }
    }
)

const categoryModel = mongoose.models.productCategory
    || mongoose.model('productCategory', categorySchema)

export default categoryModel
