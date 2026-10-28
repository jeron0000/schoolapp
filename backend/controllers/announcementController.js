import mongoose from 'mongoose'
import announcementModel from '../models/announcementModel.js'
import productModel from '../models/productModel.js'
import {
    ANNOUNCEMENT_KEY,
    AnnouncementError,
    nextAnnouncementsChangeAt,
    parseAnnouncementInput,
    presentManagedAnnouncement,
    presentPublicAnnouncements
} from '../utils/announcements.js'
import { publicAnnouncementPriceComparisons } from '../utils/productPricing.js'
import {
    presentRestockAnnouncement,
    RESTOCK_ANNOUNCEMENT_PREFIX
} from '../utils/restockAnnouncements.js'
import { resolveDueScheduledStockUpdate } from '../utils/scheduledStock.js'

const respondWithError = (res, error, fallback) => {
    if (error instanceof AnnouncementError) {
        return res.status(error.status).json({ success: false, message: error.message })
    }
    if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: 'The announcement changed. Refresh and try again.' })
    }
    return res.status(500).json({ success: false, message: fallback })
}

const validateLinkedProducts = async values => {
    if (!Object.hasOwn(values, 'linkedProductIds') || !values.linkedProductIds.length) {
        return
    }
    // The public product API currently publishes every stored product record.
    const productCount = await productModel.countDocuments({
        _id: { $in: values.linkedProductIds }
    })
    if (productCount !== values.linkedProductIds.length) {
        throw new AnnouncementError('One or more linked products are unavailable.')
    }
}

const announcementId = value => {
    if (!mongoose.isObjectIdOrHexString(value)) {
        throw new AnnouncementError('Invalid announcement.', 400)
    }
    return value
}

const getLegacyAnnouncement = async () => {
    const legacy = await announcementModel.findOne({ key: ANNOUNCEMENT_KEY }).lean()
    if (legacy) return legacy
    return announcementModel.findOne({}).sort({ createdAt: 1 }).lean()
}

const getAnnouncements = async filter => {
    return announcementModel.find(filter).sort({ createdAt: -1 }).lean()
}

const getPresentedPublicAnnouncements = async (announcements, now) => {
    const presented = presentPublicAnnouncements(announcements, now)
    const presentedIds = new Set(presented.map(item => String(item._id)))
    const sourceById = new Map(
        announcements
            .filter(item => presentedIds.has(String(item._id)))
            .map(item => [String(item._id), item])
    )
    const productIds = new Set()
    for (const announcement of sourceById.values()) {
        if (announcement.key?.startsWith(RESTOCK_ANNOUNCEMENT_PREFIX)) {
            for (const productId of announcement.linkedProductIds || []) {
                productIds.add(String(productId))
            }
        }
        for (const link of announcement.priceChangeLinks || []) {
            productIds.add(String(link.productId))
        }
    }
    if (!productIds.size) return presented

    await Promise.all(
        [...productIds].map(productId => {
            return resolveDueScheduledStockUpdate(productId, new Date(now))
        })
    )
    const products = await productModel.find({
        _id: { $in: [...productIds] }
    }).lean()
    const productsById = new Map(products.map(product => [String(product._id), product]))
    return presented.map(item => {
        const source = sourceById.get(String(item._id))
        if (source?.key?.startsWith(RESTOCK_ANNOUNCEMENT_PREFIX)) {
            const productId = source.linkedProductIds?.[0]
            return presentRestockAnnouncement(item, source, productsById.get(String(productId)))
        }
        if (!source?.priceChangeLinks?.length) return item
        const priceComparisons = publicAnnouncementPriceComparisons(source, products)
        if (!priceComparisons.length) return null
        return {
            ...item,
            linkedProductIds: priceComparisons.map(comparison => comparison.productId),
            priceComparisons
        }
    }).filter(Boolean)
}

export const getPublicAnnouncement = async (_req, res) => {
    try {
        const now = Date.now()
        const announcements = await getAnnouncements({ enabled: true })
        const publicAnnouncements = await getPresentedPublicAnnouncements(announcements, now)
        return res.json({
            success: true,
            announcement: publicAnnouncements[0] || null,
            nextChangeAt: nextAnnouncementsChangeAt(announcements, now)
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: 'Unable to load the Storefront announcement.'
        })
    }
}

export const getPublicAnnouncements = async (_req, res) => {
    try {
        const now = Date.now()
        const announcements = await getAnnouncements({ enabled: true })
        const publicAnnouncements = await getPresentedPublicAnnouncements(announcements, now)
        return res.json({
            success: true,
            announcements: publicAnnouncements,
            nextChangeAt: nextAnnouncementsChangeAt(announcements, now)
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: 'Unable to load Storefront announcements.'
        })
    }
}

export const getManagedAnnouncement = async (_req, res) => {
    try {
        const announcement = await getLegacyAnnouncement()
        return res.json({
            success: true,
            announcement: presentManagedAnnouncement(announcement)
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: 'Unable to load the managed announcement.'
        })
    }
}

export const getManagedAnnouncements = async (_req, res) => {
    try {
        const announcements = await getAnnouncements({})
        return res.json({
            success: true,
            announcements: announcements.map(presentManagedAnnouncement)
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: 'Unable to load managed announcements.'
        })
    }
}

export const createAnnouncement = async (req, res) => {
    try {
        const values = parseAnnouncementInput(req.body)
        await validateLinkedProducts(values)
        await announcementModel.init()
        const announcement = await announcementModel.create(values)
        return res.status(201).json({
            success: true,
            message: 'Announcement created.',
            announcement: presentManagedAnnouncement(announcement)
        })
    } catch (error) {
        return respondWithError(res, error, 'Unable to create the announcement.')
    }
}

export const updateAnnouncement = async (req, res) => {
    try {
        const current = await getLegacyAnnouncement()
        if (!current) {
            throw new AnnouncementError('Announcement not found.', 404)
        }
        const values = parseAnnouncementInput(req.body, { partial: true, current })
        await validateLinkedProducts(values)
        const announcement = await announcementModel.findOneAndUpdate(
            { _id: current._id, updatedAt: current.updatedAt },
            { $set: values },
            { returnDocument: 'after', runValidators: true }
        )
        if (!announcement) {
            throw new AnnouncementError('The announcement changed. Refresh and try again.', 409)
        }
        return res.json({
            success: true,
            message: 'Announcement updated.',
            announcement: presentManagedAnnouncement(announcement)
        })
    } catch (error) {
        return respondWithError(res, error, 'Unable to update the announcement.')
    }
}

export const updateAnnouncementById = async (req, res) => {
    try {
        const id = announcementId(req.params.id)
        const current = await announcementModel.findById(id).lean()
        if (!current) {
            throw new AnnouncementError('Announcement not found.', 404)
        }
        const values = parseAnnouncementInput(req.body, { partial: true, current })
        await validateLinkedProducts(values)
        const announcement = await announcementModel.findOneAndUpdate(
            { _id: current._id, updatedAt: current.updatedAt },
            { $set: values },
            { returnDocument: 'after', runValidators: true }
        )
        if (!announcement) {
            throw new AnnouncementError('The announcement changed. Refresh and try again.', 409)
        }
        return res.json({
            success: true,
            message: 'Announcement updated.',
            announcement: presentManagedAnnouncement(announcement)
        })
    } catch (error) {
        return respondWithError(res, error, 'Unable to update the announcement.')
    }
}

export const deleteAnnouncement = async (_req, res) => {
    try {
        const current = await getLegacyAnnouncement()
        if (!current) {
            throw new AnnouncementError('Announcement not found.', 404)
        }
        const announcement = await announcementModel.findByIdAndDelete(current._id)
        if (!announcement) {
            throw new AnnouncementError('Announcement not found.', 404)
        }
        return res.json({ success: true, message: 'Announcement deleted.' })
    } catch (error) {
        return respondWithError(res, error, 'Unable to delete the announcement.')
    }
}

export const deleteAnnouncementById = async (req, res) => {
    try {
        const announcement = await announcementModel.findByIdAndDelete(
            announcementId(req.params.id)
        )
        if (!announcement) {
            throw new AnnouncementError('Announcement not found.', 404)
        }
        return res.json({ success: true, message: 'Announcement deleted.' })
    } catch (error) {
        return respondWithError(res, error, 'Unable to delete the announcement.')
    }
}
