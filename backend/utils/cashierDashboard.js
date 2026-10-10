import orderModel from '../models/orderModel.js';

// Match the established Philippines calendar convention; Manila has no DST.
const timezone = 'Asia/Manila';
const manilaOffset = 8 * 60 * 60 * 1000;
const day = 86400000;
const detailLimit = 5;
const calendarDate = timestamp => new Date(timestamp + manilaOffset);
const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;

export const cashierDashboardRange = (key = 'today', now = Date.now()) => {
    if (!['today', 'last7days', 'last30days', 'thisyear', 'alltime'].includes(key)) {
        throw new Error('Supported cashier dashboard ranges are today, last7days, last30days, thisyear and alltime.');
    }
    const local = calendarDate(now);
    const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - manilaOffset;
    const start = key === 'alltime' ? null : key === 'thisyear'
        ? Date.UTC(local.getUTCFullYear(), 0, 1) - manilaOffset
        : today - (key === 'last7days' ? 6 : key === 'last30days' ? 29 : 0) * day;
    return { key, start, end: now, timezone };
};

// Shift the stored Number's decimal representation before rounding, avoiding
// binary multiplication drift (e.g. 10.075 * 100). Storage remains unchanged.
const amountCents = amount => {
    if (!Number.isFinite(amount) || amount < 0) return null;
    const [coefficient, exponent = '0'] = String(amount).split('e');
    const cents = Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
    return Number.isSafeInteger(cents) ? cents : null;
};
const addCents = (left, right) => {
    const total = left + right;
    if (!Number.isSafeInteger(total)) throw new Error('Cashier money exceeds safe numeric precision.');
    return total;
};

const bucketKey = (date, granularity) => date.toISOString().slice(0, { hour: 13, day: 10, month: 7, year: 4 }[granularity]);
const addBucket = (buckets, key, cents, transactionCount = 1) => {
    const previous = buckets.get(key) || { cents: 0, transactionCount: 0 };
    buckets.set(key, { cents: addCents(previous.cents, cents), transactionCount: previous.transactionCount + transactionCount });
};
const trendSeries = (range, buckets, granularity, undatedCents, undatedTransactions) => {
    const end = calendarDate(range.end);
    const firstKey = [...buckets.keys()].sort()[0];
    const start = range.start === null ? (firstKey ? new Date(`${firstKey}-01T00:00:00Z`) : null) : calendarDate(range.start);
    if (start && range.key === 'alltime' && (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1 > 120) {
        const years = new Map();
        for (const [key, row] of buckets) addBucket(years, key.slice(0, 4), row.cents, row.transactionCount);
        buckets = years;
        granularity = 'year';
    }
    const points = [];
    if (start) {
        const date = new Date(Date.UTC(start.getUTCFullYear(), granularity === 'year' ? 0 : start.getUTCMonth(),
            ['year', 'month'].includes(granularity) ? 1 : start.getUTCDate()));
        while (date <= end) {
            const key = bucketKey(date, granularity);
            const row = buckets.get(key);
            points.push({ key, label: granularity === 'hour' ? `${key.slice(-2)}:00` : key,
                amount: (row?.cents || 0) / 100, transactionCount: row?.transactionCount || 0 });
            if (granularity === 'hour') date.setUTCHours(date.getUTCHours() + 1);
            else if (granularity === 'day') date.setUTCDate(date.getUTCDate() + 1);
            else if (granularity === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
            else date.setUTCFullYear(date.getUTCFullYear() + 1);
        }
    }
    return { granularity, points, undatedAmount: undatedCents / 100, undatedTransactions };
};

const keepDetail = (list, row, compare) => {
    list.push(row);
    list.sort(compare);
    if (list.length > detailLimit) list.pop();
};
const studentName = order => [order.address?.firstName, order.address?.lastName]
    .filter(part => typeof part === 'string' && part.trim()).map(part => part.trim()).join(' ') || 'Name not provided';
const methodName = method => typeof method === 'string' && method.trim() ? method : null;
const awaitingDetail = (order, now) => {
    const sentToCashierAt = validTime(order.sentToCashierAt) && order.sentToCashierAt <= now ? order.sentToCashierAt : null;
    const createdAt = validTime(order.date) && order.date <= now ? order.date : null;
    return { _id: String(order._id), studentName: studentName(order), itemCount: Array.isArray(order.items) ? order.items.length : 0,
        amountDue: order.amount, status: order.status, sentToCashierAt,
        waitingSince: sentToCashierAt ?? createdAt,
        waitingTimeSource: sentToCashierAt !== null ? 'sentToCashier' : createdAt !== null ? 'orderCreated' : null };
};
const oldestFirst = (left, right) => (left.waitingSince ?? Infinity) - (right.waitingSince ?? Infinity) || left._id.localeCompare(right._id);
const newestFirst = (left, right) => right.paidAt - left.paidAt || right._id.localeCompare(left._id);

export const getCashierDashboardOverview = async range => {
    // One Order is one business payment. Never read callbacks, current prices,
    // users or inventory; project only the snapshot fields this overview needs.
    const cursor = orderModel.find({ $or: [{ payment: true }, { status: 'Sent to Cashier', payment: false }] }, {
        amount: 1, payment: 1, status: 1, paymentMethod: 1, paymentCurrency: 1, paidAt: 1, sentToCashierAt: 1, date: 1,
        receiptNumber: 1, 'address.firstName': 1, 'address.lastName': 1, 'items._id': 1
    }).lean().cursor();
    let totalCents = 0, paidTransactions = 0, awaitingPayment = 0, undatedCents = 0, undatedTransactions = 0;
    const awaitingPayments = [], recentPayments = [], methods = new Map(), buckets = new Map();
    const granularity = range.key === 'today' ? 'hour' : ['last7days', 'last30days'].includes(range.key) ? 'day' : 'month';
    const quality = { undatedPaidOrders: 0, invalidPaidAmounts: 0, currencyUnresolvedPaidOrders: 0, nonPhpPaidOrders: 0,
        paidCancelledOrders: 0, nonActionableAwaitingOrders: 0 };
    try {
        for await (const order of cursor) {
            if (order.payment === false && order.status === 'Sent to Cashier') {
                // Match the existing confirmation guards: cash, unpaid, positive stored total.
                if (order.paymentMethod === 'COD' && Number.isFinite(order.amount) && order.amount > 0) {
                    awaitingPayment++;
                    keepDetail(awaitingPayments, awaitingDetail(order, range.end), oldestFirst);
                } else quality.nonActionableAwaitingOrders++;
            }
            if (order.payment !== true) continue;
            // Cashier Transactions includes paid cancellations; there is no refund ledger.
            if (order.status === 'Cancelled') quality.paidCancelledOrders++;
            const dated = validTime(order.paidAt);
            if (!dated) quality.undatedPaidOrders++;
            if (dated && (order.paidAt >= range.end || (range.start !== null && order.paidAt < range.start))) continue;
            // Method labels cannot prove historical currency. Never mix unknown/foreign money into PHP.
            if (typeof order.paymentCurrency !== 'string' || !/^[A-Z]{3}$/.test(order.paymentCurrency)) {
                quality.currencyUnresolvedPaidOrders++; continue;
            }
            if (order.paymentCurrency !== 'PHP') { quality.nonPhpPaidOrders++; continue; }
            const cents = amountCents(order.amount);
            if (cents === null) { quality.invalidPaidAmounts++; continue; }
            if (!dated && range.start !== null) continue;
            totalCents = addCents(totalCents, cents);
            paidTransactions++;
            const method = methodName(order.paymentMethod);
            addBucket(methods, method, cents);
            if (dated) {
                addBucket(buckets, bucketKey(calendarDate(order.paidAt), granularity), cents);
                keepDetail(recentPayments, { _id: String(order._id), studentName: studentName(order), amount: cents / 100,
                    paymentMethod: method, receiptNumber: typeof order.receiptNumber === 'string' && order.receiptNumber.trim() ? order.receiptNumber : null,
                    paidAt: order.paidAt, status: order.status }, newestFirst);
            } else { undatedCents = addCents(undatedCents, cents); undatedTransactions++; }
        }
    } finally { await cursor.close(); }
    const collectionPeriodComplete = !quality.invalidPaidAmounts && !quality.currencyUnresolvedPaidOrders && !quality.nonPhpPaidOrders
        && (range.start === null || !quality.undatedPaidOrders);
    return {
        range: { ...range, start: range.start === null ? null : new Date(range.start).toISOString(), end: new Date(range.end).toISOString() },
        currency: 'PHP',
        summary: { totalCollected: totalCents / 100, paidTransactions, awaitingPayment,
            averageTransaction: paidTransactions ? Math.round(totalCents / paidTransactions) / 100 : 0 },
        collectionTrend: trendSeries(range, buckets, granularity, undatedCents, undatedTransactions),
        paymentMethodBreakdown: [...methods].map(([method, row]) => ({ method, transactionCount: row.transactionCount,
            amount: row.cents / 100, percentage: totalCents ? Math.round(row.cents / totalCents * 10000) / 100 : 0 }))
            .sort((left, right) => right.amount - left.amount || String(left.method ?? '').localeCompare(String(right.method ?? ''))),
        awaitingPayments, recentPayments,
        dataQuality: { ...quality, collectionPeriodComplete, trendComplete: collectionPeriodComplete && !quality.undatedPaidOrders }
    };
};
