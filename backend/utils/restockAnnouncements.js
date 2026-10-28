import announcementModel from '../models/announcementModel.js'

export const RESTOCK_ANNOUNCEMENT_PREFIX = 'restock:'

const restockAnnouncementKey = productId => `${RESTOCK_ANNOUNCEMENT_PREFIX}${productId}`

const formattedRestockDate = value => {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return new Intl.DateTimeFormat('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Manila'
    }).format(date)
}

export const restockAnnouncementMessage = product => {
    const plan = product?.restockPlan
    if (plan?.status === 'scheduled') {
        const date = formattedRestockDate(plan.estimatedDate)
        if (!date) return null
        return `Restock Scheduled — ${product.name}\n\nNew stock is expected around ${date}. The estimated arrival may change.`
    }
    if (plan?.status === 'soon') {
        return `Restocking Soon — ${product.name}\n\nNew stock is expected soon. The estimated arrival may change.`
    }
    return null
}

const arrivalPublicationDate = estimatedDate => {
    const date = new Date(estimatedDate)
    if (!Number.isFinite(date.getTime())) return null
    const calendarDate = date.toISOString().slice(0, 10)
    return new Date(`${calendarDate}T00:00:00+08:00`)
}

export const productHasUnavailableSize = product => {
    if (!Array.isArray(product?.sizes) || !product.sizes.length) return false
    return product.sizes.some(size => {
        const quantity = product.inventory instanceof Map
            ? product.inventory.get(size)
            : product.inventory?.[size]
        return !Number.isSafeInteger(quantity) || quantity <= 0
    })
}

export const syncRestockAnnouncement = async product => {
    const key = restockAnnouncementKey(product._id)
    const plan = product.restockPlan
    if (!plan?.announce || !restockAnnouncementMessage(product)) {
        await announcementModel.updateOne({ key }, { $set: { enabled: false } })
        return
    }

    let publishAt = new Date()
    if (plan.publicationTiming === 'arrival') {
        publishAt = arrivalPublicationDate(plan.estimatedDate)
    }

    await announcementModel.findOneAndUpdate(
        { key },
        {
            $set: {
                type: 'general',
                message: restockAnnouncementMessage(product),
                link: `/product/${product._id}`,
                linkedProductIds: [product._id],
                priceChangeLinks: [],
                enabled: true,
                publishAt,
                expiresAt: null
            },
            $setOnInsert: { key }
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
    )
}

export const presentRestockAnnouncement = (announcement, source, product) => {
    if (!source?.key?.startsWith(RESTOCK_ANNOUNCEMENT_PREFIX)) return announcement
    if (!product?.restockPlan?.announce || !productHasUnavailableSize(product)) return null
    const message = restockAnnouncementMessage(product)
    if (!message) return null
    return {
        ...announcement,
        type: 'general',
        message,
        link: `/product/${product._id}`,
        linkedProductIds: [String(product._id)]
    }
}
