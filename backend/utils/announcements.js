import mongoose from 'mongoose'
import {
    ANNOUNCEMENT_PRODUCT_LIMIT,
    ANNOUNCEMENT_TYPES,
    validAnnouncementMessage,
    validInternalLink
} from '../models/announcementModel.js'

export const ANNOUNCEMENT_KEY = 'site-wide'

export class AnnouncementError extends Error {
    constructor(message, status = 400) {
        super(message)
        this.name = 'AnnouncementError'
        this.status = status
    }
}

const allowedFields = new Set([
    'type',
    'message',
    'link',
    'linkedProductIds',
    'enabled',
    'publishAt',
    'expiresAt'
])

const plainAnnouncement = announcement => {
    if (typeof announcement?.toObject === 'function') {
        return announcement.toObject({ flattenMaps: true })
    }
    return { ...announcement }
}

const optionalDate = (value, label) => {
    if (value === null || value === undefined || value === '') {
        return null
    }
    if (typeof value !== 'string') {
        throw new AnnouncementError(`Enter a valid ${label} date and time.`)
    }
    const date = new Date(value)
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
        throw new AnnouncementError(`Enter a valid ${label} date and time.`)
    }
    return date
}

const normalizedLink = value => {
    if (value === null || value === undefined || value === '') {
        return null
    }
    if (!validInternalLink(value)) {
        throw new AnnouncementError('Use a valid internal Storefront link beginning with /.')
    }
    const url = new URL(value, 'https://pamo.local')
    return `${url.pathname}${url.search}${url.hash}`
}

const normalizedProductIds = value => {
    if (value === null || value === undefined || value === '') {
        return []
    }

    const productIds = Array.isArray(value) ? value : [value]
    if (productIds.length > ANNOUNCEMENT_PRODUCT_LIMIT) {
        throw new AnnouncementError(
            `Link no more than ${ANNOUNCEMENT_PRODUCT_LIMIT} products.`
        )
    }

    const uniqueProductIds = new Set()
    for (const productId of productIds) {
        if (typeof productId !== 'string' || !mongoose.isObjectIdOrHexString(productId)) {
            throw new AnnouncementError('Choose valid linked products.')
        }
        uniqueProductIds.add(productId.toLowerCase())
    }
    return [...uniqueProductIds].map(productId => new mongoose.Types.ObjectId(productId))
}

export const parseAnnouncementInput = (body, { partial = false, current = null } = {}) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AnnouncementError('Enter valid announcement details.')
    }

    const fields = Object.keys(body)
    if (!fields.length || fields.some(field => !allowedFields.has(field))) {
        throw new AnnouncementError('Enter only supported announcement details.')
    }

    const values = {}
    if (Object.hasOwn(body, 'type')) {
        if (!ANNOUNCEMENT_TYPES.includes(body.type)) {
            throw new AnnouncementError('Choose a valid announcement type.')
        }
        values.type = body.type
    } else if (!partial) {
        throw new AnnouncementError('Choose an announcement type.')
    }

    if (Object.hasOwn(body, 'message')) {
        if (!validAnnouncementMessage(body.message)) {
            throw new AnnouncementError('Enter an announcement message of 500 characters or fewer.')
        }
        values.message = body.message.trim()
    } else if (!partial) {
        throw new AnnouncementError('Enter an announcement message.')
    }

    if (Object.hasOwn(body, 'link')) {
        values.link = normalizedLink(body.link)
    }
    if (Object.hasOwn(body, 'linkedProductIds')) {
        values.linkedProductIds = normalizedProductIds(body.linkedProductIds)
    }
    if (Object.hasOwn(body, 'enabled')) {
        if (typeof body.enabled !== 'boolean') {
            throw new AnnouncementError('Choose whether the announcement is enabled.')
        }
        values.enabled = body.enabled
    } else if (!partial) {
        values.enabled = false
    }
    if (Object.hasOwn(body, 'publishAt')) {
        values.publishAt = optionalDate(body.publishAt, 'publication')
    }
    if (Object.hasOwn(body, 'expiresAt')) {
        values.expiresAt = optionalDate(body.expiresAt, 'expiration')
    }

    const publishAt = Object.hasOwn(values, 'publishAt') ? values.publishAt : current?.publishAt
    const expiresAt = Object.hasOwn(values, 'expiresAt') ? values.expiresAt : current?.expiresAt
    if (publishAt && expiresAt && expiresAt <= publishAt) {
        throw new AnnouncementError('Expiration must be after publication.')
    }
    return values
}

export const announcementIsActive = (announcement, now = Date.now()) => {
    if (!announcement?.enabled) {
        return false
    }
    const nowTime = new Date(now).getTime()
    const publishTime = announcement.publishAt
        ? new Date(announcement.publishAt).getTime()
        : null
    const expirationTime = announcement.expiresAt
        ? new Date(announcement.expiresAt).getTime()
        : null
    if (!Number.isFinite(nowTime)) {
        throw new AnnouncementError('Unable to evaluate announcement timing.', 500)
    }
    if (publishTime !== null && (!Number.isFinite(publishTime) || publishTime > nowTime)) {
        return false
    }
    if (expirationTime !== null && (!Number.isFinite(expirationTime) || expirationTime <= nowTime)) {
        return false
    }
    return true
}

export const nextAnnouncementChangeAt = (announcement, now = Date.now()) => {
    if (!announcement?.enabled) {
        return null
    }
    const nowTime = new Date(now).getTime()
    const publishTime = announcement.publishAt
        ? new Date(announcement.publishAt).getTime()
        : null
    const expirationTime = announcement.expiresAt
        ? new Date(announcement.expiresAt).getTime()
        : null

    if (Number.isFinite(publishTime) && publishTime > nowTime) {
        return new Date(publishTime).toISOString()
    }
    if (announcementIsActive(announcement, now) && Number.isFinite(expirationTime)) {
        return new Date(expirationTime).toISOString()
    }
    return null
}

export const nextAnnouncementsChangeAt = (announcements, now = Date.now()) => {
    const changes = announcements
        .map(announcement => nextAnnouncementChangeAt(announcement, now))
        .filter(Boolean)
        .sort()
    return changes[0] || null
}

export const presentPublicAnnouncement = (announcement, now = Date.now()) => {
    if (!announcementIsActive(announcement, now)) {
        return null
    }
    const presented = plainAnnouncement(announcement)
    return {
        _id: presented._id,
        type: presented.type,
        message: presented.message,
        link: presented.link || null,
        linkedProductIds: (presented.linkedProductIds || []).map(String),
        publishAt: presented.publishAt || null,
        expiresAt: presented.expiresAt || null
    }
}

export const presentManagedAnnouncement = announcement => {
    if (!announcement) {
        return null
    }
    const managed = plainAnnouncement(announcement)
    delete managed.key
    delete managed.__v
    managed.linkedProductIds = (managed.linkedProductIds || []).map(String)
    return managed
}

export const presentPublicAnnouncements = (announcements, now = Date.now()) => {
    return announcements
        .map(announcement => presentPublicAnnouncement(announcement, now))
        .filter(Boolean)
        .sort((left, right) => {
            const leftTime = new Date(left.publishAt || 0).getTime()
            const rightTime = new Date(right.publishAt || 0).getTime()
            return rightTime - leftTime
        })
}
