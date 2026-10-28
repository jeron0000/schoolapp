import mongoose from 'mongoose'

export const ANNOUNCEMENT_MESSAGE_LIMIT = 500
export const ANNOUNCEMENT_LINK_LIMIT = 500
export const ANNOUNCEMENT_PRODUCT_LIMIT = 20
export const ANNOUNCEMENT_TYPES = ['general', 'price-change']

const priceChangeLinkSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'product',
        required: true
    },
    priceChangeId: { type: mongoose.Schema.Types.ObjectId, required: true }
}, { _id: false })

export const validAnnouncementMessage = value => {
    return typeof value === 'string'
        && value.trim().length > 0
        && value.length <= ANNOUNCEMENT_MESSAGE_LIMIT
        && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/.test(value)
}

export const validInternalLink = value => {
    if (value === null || value === undefined || value === '') {
        return true
    }
    if (typeof value !== 'string' || value.length > ANNOUNCEMENT_LINK_LIMIT) {
        return false
    }
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
        return false
    }
    if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(value)) {
        return false
    }

    try {
        const url = new URL(value, 'https://pamo.local')
        return url.origin === 'https://pamo.local'
    } catch {
        return false
    }
}

const announcementSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        default: () => `announcement:${new mongoose.Types.ObjectId()}`
    },
    type: { type: String, required: true, enum: ANNOUNCEMENT_TYPES },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: ANNOUNCEMENT_MESSAGE_LIMIT,
        validate: validAnnouncementMessage
    },
    link: {
        type: String,
        default: null,
        maxlength: ANNOUNCEMENT_LINK_LIMIT,
        validate: validInternalLink
    },
    linkedProductIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'product' }],
        default: () => [],
        validate: {
            validator: value => value.length <= ANNOUNCEMENT_PRODUCT_LIMIT,
            message: `Link no more than ${ANNOUNCEMENT_PRODUCT_LIMIT} products.`
        }
    },
    priceChangeLinks: {
        type: [priceChangeLinkSchema],
        default: () => [],
        validate: {
            validator: value => value.length <= ANNOUNCEMENT_PRODUCT_LIMIT,
            message: `Link no more than ${ANNOUNCEMENT_PRODUCT_LIMIT} price changes.`
        }
    },
    enabled: { type: Boolean, required: true, default: false },
    publishAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
}, { timestamps: true })

announcementSchema.pre('validate', function validateAnnouncementDates() {
    if (this.publishAt && this.expiresAt && this.expiresAt <= this.publishAt) {
        this.invalidate('expiresAt', 'Expiration must be after publication.')
    }
})

const announcementModel = mongoose.models.announcement
    || mongoose.model('announcement', announcementSchema)

export default announcementModel
