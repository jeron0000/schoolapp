import categoryModel, { CATEGORY_CODE_PATTERN } from '../models/categoryModel.js'

const normalizeCode = value => {
    if (typeof value !== 'string') return undefined
    const code = value.trim()
    return CATEGORY_CODE_PATTERN.test(code) ? code : undefined
}

export const resolveActiveClassification = async ({
    value,
    scope,
    legacyCodes = [],
    includeArchived = false
}) => {
    const code = normalizeCode(value)
    if (!code) return undefined

    const managed = await categoryModel.findOne({ code, scope })
        .select('active removed')
        .lean()
    if (managed) {
        if (managed.active || (includeArchived && managed.removed !== true)) return code
        return undefined
    }
    return legacyCodes.includes(code) ? code : undefined
}
