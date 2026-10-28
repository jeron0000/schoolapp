import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import { executeDueScheduledStockUpdates } from './scheduledStock.js';
import { getInventorySizes, getSizeStock, getStockLabel } from '../../shared/inventory.js';

const day = 86400000;
const manilaOffset = 8 * 60 * 60 * 1000;
const timezone = 'Asia/Manila';
const cancelledStatus = 'Cancelled';
const awaitingApprovalStatus = 'Order Placed';
const detailLimit = 5;
const paidOrderFilter = { payment: true, status: { $ne: cancelledStatus }, 'demoPayment.mode': { $ne: 'demo' } };
const includedOrder = { $match: { included: true } };

// Calendar days in the Philippines, including today up to the request time.
export const dashboardRange = (key = '30d', now = Date.now()) => {
    if (!['7d', '30d', 'thisMonth'].includes(key)) {
        throw new Error('Supported dashboard ranges are 7d, 30d and thisMonth.');
    }
    const local = new Date(now + manilaOffset);
    const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - manilaOffset;
    let start = today - 29 * day;
    if (key === '7d') {
        start = today - 6 * day;
    } else if (key === 'thisMonth') {
        start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - manilaOffset;
    }
    return { key, start, end: now, timezone };
};

const storedItems = { $cond: [{ $isArray: '$items' }, '$items', []] };
const decimal = input => ({ $convert: { input, to: 'decimal', onError: 0, onNull: 0 } });
// Decimal arithmetic avoids binary drift. validItems excludes fractional-cent
// snapshots before these exact-cent lines contribute to PHP analytics.
const itemCents = item => ({ $round: [{ $multiply: [
    decimal(`${item}.price`), decimal(`${item}.quantity`), 100
] }, 0] });
const merchandiseCents = { $sum: { $map: { input: storedItems, as: 'item', in: itemCents('$$item') } } };
const validItems = { $and: [
    { $gt: [{ $size: storedItems }, 0] },
    { $allElementsTrue: [{ $map: { input: storedItems, as: 'item', in: { $and: [
        { $isNumber: '$$item.price' },
        { $gte: ['$$item.price', 0] },
        { $lte: ['$$item.price', Number.MAX_SAFE_INTEGER / 100] },
        { $eq: [{ $mod: [{ $multiply: [decimal('$$item.price'), 100] }, 1] }, 0] },
        { $cond: [{ $isNumber: '$$item.quantity' }, { $and: [
            { $gt: ['$$item.quantity', 0] },
            { $lte: ['$$item.quantity', Number.MAX_SAFE_INTEGER] },
            { $eq: [{ $mod: ['$$item.quantity', 1] }, 0] }
        ] }, false] }
    ] } } }] }
] };
const validPaymentTime = { $cond: [{ $isNumber: '$paidAt' }, { $and: [
    { $gt: ['$paidAt', 0] },
    { $lte: ['$paidAt', 8640000000000000] },
    { $eq: [{ $mod: ['$paidAt', 1] }, 0] }
] }, false] };

const salesPipeline = range => [
    { $match: paidOrderFilter },
    { $project: { items: 1, paidAt: 1, paymentCurrency: 1, cents: merchandiseCents, validItems, hasPaymentTime: validPaymentTime } },
    { $set: {
        inRange: { $and: ['$hasPaymentTime', { $gte: ['$paidAt', range.start] }, { $lt: ['$paidAt', range.end] }] },
        validSnapshot: { $and: [{ $eq: ['$paymentCurrency', 'PHP'] }, '$validItems', { $gte: ['$cents', 0] }, { $lte: ['$cents', Number.MAX_SAFE_INTEGER] }] }
    } },
    { $set: { included: { $and: ['$inRange', '$validSnapshot'] } } },
    { $facet: {
        summary: [includedOrder, { $group: { _id: null, cents: { $sum: '$cents' }, paidOrders: { $sum: 1 } } }],
        trend: [includedOrder, { $group: {
            _id: { $dateToString: { date: { $toDate: '$paidAt' }, format: '%Y-%m-%d', timezone } },
            cents: { $sum: '$cents' }, paidOrders: { $sum: 1 }
        } }, { $sort: { _id: 1 } }],
        topProducts: [
            includedOrder, { $sort: { paidAt: -1, _id: -1 } }, { $unwind: '$items' },
            { $set: { productId: { $convert: { input: '$items._id', to: 'string', onError: null, onNull: null } } } },
            { $group: {
                _id: { productId: '$productId', name: { $cond: [{ $ne: ['$productId', null] }, null, '$items.name'] } },
                name: { $first: '$items.name' }, quantitySold: { $sum: '$items.quantity' }, cents: { $sum: itemCents('$items') }
            } },
            { $sort: { quantitySold: -1, cents: -1, '_id.productId': 1, name: 1 } }, { $limit: detailLimit }
        ],
        quality: [{ $group: {
            _id: null,
            undatedPaidOrders: { $sum: { $cond: ['$hasPaymentTime', 0, 1] } },
            invalidPaidOrderSnapshots: { $sum: { $cond: [{ $and: ['$inRange', { $not: ['$validSnapshot'] }] }, 1, 0] } }
        } }]
    } }
];

const namePart = input => ({ $convert: { input, to: 'string', onError: '', onNull: '' } });
const studentName = { $trim: { input: namePart('$student.name') } };
const addressName = { $trim: { input: { $concat: [namePart('$address.firstName'), ' ', namePart('$address.lastName')] } } };
const currentOrdersPipeline = [
    { $facet: {
        statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        recentOrders: [{ $sort: { date: -1, _id: -1 } }, { $limit: 6 }, { $project: {
            amount: 1, paymentCurrency: 1, date: 1, status: 1, payment: 1, cancellationSource: 1,
            customerName: { $cond: [{ $ne: [studentName, ''] }, studentName, addressName] },
            itemCount: { $size: storedItems }
        } }],
        paidCancelledOrders: [{ $match: { payment: true, status: cancelledStatus, 'demoPayment.mode': { $ne: 'demo' } } }, { $count: 'count' }]
    } }
];

const attentionOrder = (left, right) => {
    const stockDifference = left.minimumStock - right.minimumStock;
    if (stockDifference) {
        return stockDifference;
    }

    const affectedSizeDifference = right.affectedSizes.length - left.affectedSizes.length;
    if (affectedSizeDifference) {
        return affectedSizeDifference;
    }

    const nameDifference = left.name.localeCompare(right.name);
    if (nameDifference) {
        return nameDifference;
    }
    return left.productId.localeCompare(right.productId);
};

const affectedInventorySizes = product => {
    const sizes = [...new Set(getInventorySizes(product))];
    return sizes
        .map(size => ({ size, stock: getSizeStock(product, size) }))
        .filter(entry => getStockLabel(entry.stock) !== 'In Stock');
};

// Stream projected products to reuse the canonical inventory helpers, not a
// second MongoDB interpretation of applicable sizes or missing/invalid stock.
const lowStockOverview = async () => {
    await executeDueScheduledStockUpdates(new Date());
    const cursor = productModel.find({}, { name: 1, sizes: 1, inventory: 1 }).lean().cursor();
    let count = 0;
    const products = [];
    try {
        for await (const product of cursor) {
            const affectedSizes = affectedInventorySizes(product);
            if (!affectedSizes.length) {
                continue;
            }

            count++;
            products.push({
                productId: String(product._id),
                name: product.name,
                affectedSizes,
                minimumStock: Math.min(...affectedSizes.map(entry => entry.stock))
            });
            products.sort(attentionOrder);
            if (products.length > detailLimit) {
                products.pop();
            }
        }
    } finally {
        await cursor.close();
    }
    return {
        count,
        products: products.map(({ productId, name, affectedSizes }) => ({ productId, name, affectedSizes }))
    };
};

const money = cents => {
    const value = Number(cents ?? 0);
    if (!Number.isSafeInteger(value)) {
        throw new Error('Dashboard money exceeds safe numeric precision.');
    }
    return value / 100;
};

const buildSalesTrend = (range, trendRows) => {
    const rowsByDay = new Map(trendRows.map(row => [row._id, row]));
    const trend = [];
    const lastDay = Math.floor((range.end + manilaOffset) / day) * day - manilaOffset;

    for (let date = range.start; date <= lastDay; date += day) {
        const key = new Date(date + manilaOffset).toISOString().slice(0, 10);
        const row = rowsByDay.get(key);
        trend.push({
            date: key,
            sales: money(row?.cents),
            paidOrders: row?.paidOrders || 0
        });
    }
    return trend;
};

const buildTopProducts = rows => {
    return rows.map(row => ({
        productId: row._id.productId ?? null,
        name: row.name,
        quantitySold: row.quantitySold,
        sales: money(row.cents)
    }));
};

export const getDashboardOverview = async (range) => {
    const [[sales], [current], stock] = await Promise.all([
        orderModel.aggregate(salesPipeline(range)),
        orderModel.aggregate(currentOrdersPipeline),
        lowStockOverview()
    ]);
    const summary = sales?.summary[0];
    const quality = sales?.quality[0];
    const orderStatusCounts = Object.fromEntries((current?.statuses || []).map(row => [row._id, row.count]));
    const salesTrend = buildSalesTrend(range, sales?.trend || []);
    const undatedPaidOrders = quality?.undatedPaidOrders || 0;
    const invalidPaidOrderSnapshots = quality?.invalidPaidOrderSnapshots || 0;
    const paidCancelledOrders = current?.paidCancelledOrders[0]?.count || 0;

    return {
        range: {
            ...range,
            start: new Date(range.start).toISOString(),
            end: new Date(range.end).toISOString()
        },
        currency: 'PHP',
        summary: {
            totalSales: money(summary?.cents),
            paidOrders: summary?.paidOrders || 0,
            awaitingApproval: orderStatusCounts[awaitingApprovalStatus] || 0,
            lowStockProducts: stock.count
        },
        salesTrend,
        orderStatusCounts,
        recentOrders: current?.recentOrders || [],
        topProducts: buildTopProducts(sales?.topProducts || []),
        lowStockProducts: stock.products,
        dataQuality: {
            undatedPaidOrders,
            invalidPaidOrderSnapshots,
            paidCancelledOrders,
            salesPeriodComplete: !(undatedPaidOrders || invalidPaidOrderSnapshots)
        }
    };
};
