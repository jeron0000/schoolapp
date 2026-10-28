import orderModel from '../models/orderModel.js'
import { phpMinorUnits, validPhpAmount } from '../../shared/money.js'

// Match the established Philippines calendar convention; Manila has no DST.
const timezone = 'Asia/Manila'
const manilaOffset = 8 * 60 * 60 * 1000
const day = 86400000
const detailLimit = 5
const supportedRanges = ['today', 'last7days', 'last30days', 'thisyear', 'alltime']

const calendarDate = timestamp => new Date(timestamp + manilaOffset)
const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000

export const cashierDashboardRange = (key = 'today', now = Date.now()) => {
    if (!supportedRanges.includes(key)) {
        throw new Error('Supported cashier dashboard ranges are today, last7days, last30days, thisyear and alltime.')
    }

    const local = calendarDate(now)
    const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - manilaOffset
    let start = today
    if (key === 'alltime') {
        start = null
    } else if (key === 'thisyear') {
        start = Date.UTC(local.getUTCFullYear(), 0, 1) - manilaOffset
    } else if (key === 'last7days') {
        start = today - 6 * day
    } else if (key === 'last30days') {
        start = today - 29 * day
    }

    return { key, start, end: now, timezone }
}

// Legacy fractional-cent amounts are excluded for review, never rounded into collections.
const amountCents = amount => {
    if (!validPhpAmount(amount)) {
        return null
    }
    return phpMinorUnits(amount)
}

const addCents = (left, right) => {
    const total = left + right
    if (!Number.isSafeInteger(total)) {
        throw new Error('Cashier money exceeds safe numeric precision.')
    }
    return total
}

const bucketKey = (date, granularity) => {
    const keyLength = { hour: 13, day: 10, month: 7, year: 4 }[granularity]
    return date.toISOString().slice(0, keyLength)
}

const addBucket = (buckets, key, cents, transactionCount = 1) => {
    const previous = buckets.get(key) || { cents: 0, transactionCount: 0 }
    buckets.set(key, {
        cents: addCents(previous.cents, cents),
        transactionCount: previous.transactionCount + transactionCount
    })
}

const trendStart = (range, buckets) => {
    if (range.start !== null) {
        return calendarDate(range.start)
    }

    const firstKey = [...buckets.keys()].sort()[0]
    if (!firstKey) {
        return null
    }
    return new Date(`${firstKey}-01T00:00:00Z`)
}

const exceedsMonthlyTrendLimit = (start, end) => {
    const yearDifference = end.getUTCFullYear() - start.getUTCFullYear()
    const monthDifference = end.getUTCMonth() - start.getUTCMonth()
    return yearDifference * 12 + monthDifference + 1 > 120
}

const groupBucketsByYear = buckets => {
    const years = new Map()
    for (const [key, row] of buckets) {
        addBucket(years, key.slice(0, 4), row.cents, row.transactionCount)
    }
    return years
}

const firstTrendDate = (start, granularity) => {
    let month = start.getUTCMonth()
    let date = start.getUTCDate()
    if (granularity === 'year') {
        month = 0
    }
    if (granularity === 'year' || granularity === 'month') {
        date = 1
    }
    return new Date(Date.UTC(start.getUTCFullYear(), month, date))
}

const advanceTrendDate = (date, granularity) => {
    if (granularity === 'hour') {
        date.setUTCHours(date.getUTCHours() + 1)
        return
    }
    if (granularity === 'day') {
        date.setUTCDate(date.getUTCDate() + 1)
        return
    }
    if (granularity === 'month') {
        date.setUTCMonth(date.getUTCMonth() + 1)
        return
    }
    date.setUTCFullYear(date.getUTCFullYear() + 1)
}

const trendSeries = (range, initialBuckets, initialGranularity, undatedCents, undatedTransactions) => {
    const end = calendarDate(range.end)
    const start = trendStart(range, initialBuckets)
    let buckets = initialBuckets
    let granularity = initialGranularity

    if (start && range.key === 'alltime' && exceedsMonthlyTrendLimit(start, end)) {
        buckets = groupBucketsByYear(buckets)
        granularity = 'year'
    }

    const points = []
    if (start) {
        const date = firstTrendDate(start, granularity)
        while (date <= end) {
            const key = bucketKey(date, granularity)
            const row = buckets.get(key)
            let label = key
            if (granularity === 'hour') {
                label = `${key.slice(-2)}:00`
            }
            points.push({
                key,
                label,
                amount: (row?.cents || 0) / 100,
                transactionCount: row?.transactionCount || 0
            })
            advanceTrendDate(date, granularity)
        }
    }

    return {
        granularity,
        points,
        undatedAmount: undatedCents / 100,
        undatedTransactions
    }
}

const keepDetail = (list, row, compare) => {
    list.push(row)
    list.sort(compare)
    if (list.length > detailLimit) {
        list.pop()
    }
}

const studentName = order => {
    if (typeof order.student?.name === 'string' && order.student.name.trim()) {
        return order.student.name.trim()
    }
    const nameParts = [order.address?.firstName, order.address?.lastName]
        .filter(part => typeof part === 'string' && part.trim())
        .map(part => part.trim())
    if (!nameParts.length) {
        return 'Name not provided'
    }
    return nameParts.join(' ')
}

const methodName = method => {
    if (typeof method !== 'string' || !method.trim()) {
        return null
    }
    return method
}

const awaitingDetail = (order, now) => {
    let sentToCashierAt = null
    if (validTime(order.sentToCashierAt) && order.sentToCashierAt <= now) {
        sentToCashierAt = order.sentToCashierAt
    }

    let createdAt = null
    if (validTime(order.date) && order.date <= now) {
        createdAt = order.date
    }

    let waitingTimeSource = null
    if (sentToCashierAt !== null) {
        waitingTimeSource = 'sentToCashier'
    } else if (createdAt !== null) {
        waitingTimeSource = 'orderCreated'
    }

    return {
        _id: String(order._id),
        studentName: studentName(order),
        itemCount: Array.isArray(order.items) ? order.items.length : 0,
        amountDue: order.amount,
        status: order.status,
        sentToCashierAt,
        waitingSince: sentToCashierAt ?? createdAt,
        waitingTimeSource
    }
}

const oldestFirst = (left, right) => {
    const timeDifference = (left.waitingSince ?? Infinity) - (right.waitingSince ?? Infinity)
    return timeDifference || left._id.localeCompare(right._id)
}

const newestFirst = (left, right) => {
    return right.paidAt - left.paidAt || right._id.localeCompare(left._id)
}

const trendGranularity = rangeKey => {
    if (rangeKey === 'today') {
        return 'hour'
    }
    if (rangeKey === 'last7days' || rangeKey === 'last30days') {
        return 'day'
    }
    return 'month'
}

const actionableAwaitingPayment = order => {
    return order.paymentMethod === 'COD'
        && order.paymentCurrency === 'PHP'
        && validPhpAmount(order.amount)
        && order.amount > 0
}

const receiptNumber = order => {
    if (typeof order.receiptNumber !== 'string' || !order.receiptNumber.trim()) {
        return null
    }
    return order.receiptNumber
}

const paymentMethodBreakdown = (methods, totalCents) => {
    const breakdown = [...methods].map(([method, row]) => {
        let percentage = 0
        if (totalCents) {
            percentage = Math.round(row.cents / totalCents * 10000) / 100
        }
        return {
            method,
            transactionCount: row.transactionCount,
            amount: row.cents / 100,
            percentage
        }
    })
    return breakdown.sort((left, right) => {
        return right.amount - left.amount
            || String(left.method ?? '').localeCompare(String(right.method ?? ''))
    })
}

export const getCashierDashboardOverview = async range => {
    // One Order is one business payment. Never read callbacks, current prices,
    // users or inventory; project only the snapshot fields this overview needs.
    const cursor = orderModel.find(
        { 'demoPayment.mode': { $ne: 'demo' }, $or: [{ payment: true }, { status: 'Sent to Cashier', payment: false }] },
        {
            amount: 1,
            payment: 1,
            status: 1,
            paymentMethod: 1,
            paymentCurrency: 1,
            paidAt: 1,
            sentToCashierAt: 1,
            date: 1,
            receiptNumber: 1,
            'student.name': 1,
            'address.firstName': 1,
            'address.lastName': 1,
            'items._id': 1
        }
    ).lean().cursor()

    let totalCents = 0
    let paidTransactions = 0
    let awaitingPayment = 0
    let undatedCents = 0
    let undatedTransactions = 0
    const awaitingPayments = []
    const recentPayments = []
    const methods = new Map()
    const buckets = new Map()
    const granularity = trendGranularity(range.key)
    const quality = {
        undatedPaidOrders: 0,
        invalidPaidAmounts: 0,
        currencyUnresolvedPaidOrders: 0,
        nonPhpPaidOrders: 0,
        paidCancelledOrders: 0,
        nonActionableAwaitingOrders: 0
    }

    try {
        for await (const order of cursor) {
            if (order.payment === false && order.status === 'Sent to Cashier') {
                // Match confirmation: cash, unpaid, explicit PHP and exact positive total.
                if (actionableAwaitingPayment(order)) {
                    awaitingPayment++
                    keepDetail(awaitingPayments, awaitingDetail(order, range.end), oldestFirst)
                } else {
                    quality.nonActionableAwaitingOrders++
                }
            }

            if (order.payment !== true) {
                continue
            }
            // Cashier Transactions includes paid cancellations; there is no refund ledger.
            if (order.status === 'Cancelled') {
                quality.paidCancelledOrders++
            }

            const dated = validTime(order.paidAt)
            if (!dated) {
                quality.undatedPaidOrders++
            }
            const outsideRange = dated
                && (order.paidAt >= range.end || (range.start !== null && order.paidAt < range.start))
            if (outsideRange) {
                continue
            }

            // Method labels cannot prove historical currency. Never mix unknown/foreign money into PHP.
            if (typeof order.paymentCurrency !== 'string' || !/^[A-Z]{3}$/.test(order.paymentCurrency)) {
                quality.currencyUnresolvedPaidOrders++
                continue
            }
            if (order.paymentCurrency !== 'PHP') {
                quality.nonPhpPaidOrders++
                continue
            }

            const cents = amountCents(order.amount)
            if (cents === null) {
                quality.invalidPaidAmounts++
                continue
            }
            if (!dated && range.start !== null) {
                continue
            }

            totalCents = addCents(totalCents, cents)
            paidTransactions++
            const method = methodName(order.paymentMethod)
            addBucket(methods, method, cents)

            if (dated) {
                addBucket(buckets, bucketKey(calendarDate(order.paidAt), granularity), cents)
                keepDetail(recentPayments, {
                    _id: String(order._id),
                    studentName: studentName(order),
                    amount: cents / 100,
                    paymentMethod: method,
                    receiptNumber: receiptNumber(order),
                    paidAt: order.paidAt,
                    status: order.status
                }, newestFirst)
            } else {
                undatedCents = addCents(undatedCents, cents)
                undatedTransactions++
            }
        }
    } finally {
        await cursor.close()
    }

    const collectionPeriodComplete = !quality.invalidPaidAmounts
        && !quality.currencyUnresolvedPaidOrders
        && !quality.nonPhpPaidOrders
        && (range.start === null || !quality.undatedPaidOrders)
    let rangeStart = null
    if (range.start !== null) {
        rangeStart = new Date(range.start).toISOString()
    }
    let averageTransaction = 0
    if (paidTransactions) {
        averageTransaction = Math.round(totalCents / paidTransactions) / 100
    }

    return {
        range: {
            ...range,
            start: rangeStart,
            end: new Date(range.end).toISOString()
        },
        currency: 'PHP',
        summary: {
            totalCollected: totalCents / 100,
            paidTransactions,
            awaitingPayment,
            averageTransaction
        },
        collectionTrend: trendSeries(range, buckets, granularity, undatedCents, undatedTransactions),
        paymentMethodBreakdown: paymentMethodBreakdown(methods, totalCents),
        awaitingPayments,
        recentPayments,
        dataQuality: {
            ...quality,
            collectionPeriodComplete,
            trendComplete: collectionPeriodComplete && !quality.undatedPaidOrders
        }
    }
}
