import mongoose from 'mongoose'
import productModel from '../models/productModel.js'
import { colorKey, normalizeColorLabel, normalizeOptionLabel, optionKey } from '../../shared/productVariants.js'

export class ProductVariantError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.status = status
    }
}

const validId = value => typeof value === 'string' && mongoose.isObjectIdOrHexString(value)
const groupFields = { variantGroupId: '', optionLabel: '', colorLabel: '', colorKey: '', groupTitle: '' }

export const parseProductOption = value => {
    const optionLabel = normalizeOptionLabel(value)
    if (!optionLabel) throw new ProductVariantError('Enter an item label using 1–80 letters, numbers, or simple separators.')
    return { optionLabel, colorKey: optionKey(optionLabel) }
}

export const parseVariantColor = value => {
    const label = normalizeColorLabel(value)
    if (!label) throw new ProductVariantError('Enter a color name using 1–40 letters, numbers, or simple separators.')
    return { colorLabel: label, colorKey: colorKey(label) }
}

// All membership changes and deletions write the same anchor. MongoDB retries
// transaction conflicts; a failed transaction never leaves partial membership.
export const lockVariantAnchor = async (groupId, session) => {
    const anchor = await productModel.findOneAndUpdate(
        { _id: groupId, variantGroupId: groupId },
        { $inc: { __v: 1 } },
        { session, returnDocument: 'after' }
    )
    if (!anchor) throw new ProductVariantError('This listing changed or no longer exists. Refresh and try again.', 409)
    return anchor
}

export const createProductInVariantGroup = async (productData, groupId, label, legacyColor = false) => {
    if (!validId(groupId)) throw new ProductVariantError('Select a valid product listing.')
    const option = parseProductOption(label)
    if (legacyColor) Object.assign(option, parseVariantColor(label))
    return mongoose.connection.transaction(async session => {
        await lockVariantAnchor(groupId, session)
        const duplicate = await productModel.exists({ variantGroupId: groupId, colorKey: option.colorKey }).session(session)
        if (duplicate) throw new ProductVariantError('That item label already exists in this listing.', 409)
        const [product] = await productModel.create([{ ...productData, variantGroupId: groupId, ...option }], { session })
        return product
    })
}

export const saveProductVariantGroup = async (anchorId, body) => {
    if (!validId(anchorId)) throw new ProductVariantError('Select a valid group anchor.')
    const groupTitle = typeof body?.groupTitle === 'string' ? body.groupTitle.trim() : ''
    if (!groupTitle || groupTitle.length > 120) throw new ProductVariantError('Enter a group title up to 120 characters.')
    if (!Array.isArray(body.members) || !body.members.length) throw new ProductVariantError('Include the anchor and at least one item.')
    if (!Number.isSafeInteger(body.version) || body.version < 0) throw new ProductVariantError('Refresh the product list before saving.')
    const members = body.members.map(member => {
        if (!validId(member?.productId)) throw new ProductVariantError('Select valid products.')
        const option = parseProductOption(member.optionLabel ?? member.colorLabel)
        if (!Object.hasOwn(member, 'optionLabel')) Object.assign(option, parseVariantColor(member.colorLabel))
        return { productId: member.productId.toLowerCase(), ...option }
    })
    const ids = members.map(member => member.productId)
    if (!ids.includes(anchorId) || new Set(ids).size !== ids.length) {
        throw new ProductVariantError('Include the anchor once and select each product only once.')
    }
    if (new Set(members.map(member => member.colorKey)).size !== members.length) {
        throw new ProductVariantError('Each item label must be unique within the listing.')
    }

    return mongoose.connection.transaction(async session => {
        const anchor = await productModel.findById(anchorId).session(session).lean()
        if (!anchor) throw new ProductVariantError('Product not found.', 404)
        if (anchor.variantGroupId && String(anchor.variantGroupId) !== anchorId) {
            throw new ProductVariantError('Manage this group through its existing anchor.', 409)
        }
        const versionFilter = body.version === 0
            ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
            : { __v: body.version }
        const locked = await productModel.updateOne(
            { _id: anchorId, ...versionFilter }, { $inc: { __v: 1 } }, { session }
        )
        if (locked.matchedCount !== 1) throw new ProductVariantError('This group changed. Refresh before saving.', 409)

        const products = await productModel.find({ _id: { $in: ids } }).session(session).lean()
        if (products.length !== ids.length) throw new ProductVariantError('One or more selected products no longer exist.', 409)
        if (products.some(product => product.variantGroupId && String(product.variantGroupId) !== anchorId)) {
            throw new ProductVariantError('Unlink products from their current group before moving them.', 409)
        }

        // Membership and labels commit together; an index conflict rolls back everything.
        await productModel.updateMany({ variantGroupId: anchorId }, { $unset: groupFields }, { session })
        for (const member of members) {
            const product = products.find(item => String(item._id) === member.productId)
            const filter = { _id: member.productId }
            if (member.productId !== anchorId) {
                filter.__v = product.__v ?? { $exists: false }
            }
            const values = { variantGroupId: anchorId, optionLabel: member.optionLabel, colorKey: member.colorKey }
            if (member.colorLabel) values.colorLabel = member.colorLabel
            if (member.productId === anchorId) values.groupTitle = groupTitle
            const updated = await productModel.updateOne(filter, {
                $set: values,
                ...(member.productId !== anchorId ? { $inc: { __v: 1 } } : {})
            }, { session, runValidators: true })
            if (updated.matchedCount !== 1) throw new ProductVariantError('A selected product changed. Refresh before saving.', 409)
        }
        return productModel.find({ variantGroupId: anchorId }).session(session).lean()
    })
}

export const unlinkProductVariant = async productId => {
    if (!validId(productId)) throw new ProductVariantError('Select a valid product.')
    return mongoose.connection.transaction(async session => {
        const product = await productModel.findById(productId).session(session).lean()
        if (!product?.variantGroupId) throw new ProductVariantError('This product is not in a multi-item listing.', 409)
        const groupId = String(product.variantGroupId)
        await lockVariantAnchor(groupId, session)
        if (groupId === productId) {
            await productModel.updateMany({ variantGroupId: groupId }, { $unset: groupFields }, { session })
        } else {
            await productModel.updateOne({ _id: productId, variantGroupId: groupId }, {
                $unset: groupFields, $inc: { __v: 1 }
            }, { session })
        }
    })
}
