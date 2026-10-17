import mongoose from 'mongoose';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import { getAllowedOrderStatuses } from './orderStatus.js';
import { getInventorySizes } from '../../shared/inventory.js';
import { cancellationRefund } from './orderRefund.js';
import { ORDER_FEE_PHP, phpItemsTotal, sumPhp, validPhpAmount } from '../../shared/money.js';

const fail = (message, status) => { throw Object.assign(new Error(message), status ? { status } : {}); };
const validSize = size => typeof size === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(size) && !['constructor', 'prototype', '__proto__'].includes(size);
const validObject = value => value && typeof value === 'object' && !Array.isArray(value);

export const validateInitialInventory = (sizes, inventory) => {
    if (!Array.isArray(sizes) || !sizes.length || sizes.some(size => !validSize(size)) || new Set(sizes).size !== sizes.length) fail('Select valid, unique product sizes.');
    if (!validObject(inventory) || Object.keys(inventory).length !== sizes.length) fail('Enter initial stock for every selected size.');
    for (const size of sizes) {
        if (!Object.hasOwn(inventory, size) || !Number.isSafeInteger(inventory[size]) || inventory[size] < 0) fail(`Stock for ${size} must be a non-negative whole number.`);
    }
    return inventory;
};

export const aggregateOrderItems = (items) => {
    if (!Array.isArray(items) || !items.length) fail('Your order must contain at least one item.');
    const aggregated = new Map();
    for (const item of items) {
        if (!item || typeof item._id !== 'string' || !mongoose.isObjectIdOrHexString(item._id) || !validSize(item.size) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) fail('Order items must have a valid product, size and positive whole quantity.');
        const id = item._id.toLowerCase();
        const key = JSON.stringify([id, item.size]);
        const quantity = (aggregated.get(key)?.quantity || 0) + item.quantity;
        if (!Number.isSafeInteger(quantity)) fail('Order quantity is too large.');
        aggregated.set(key, { _id: id, size: item.size, quantity });
    }
    return [...aggregated.values()].sort((a, b) => `${a._id}/${a.size}`.localeCompare(`${b._id}/${b.size}`));
};

// Transactions are required: never fall back to partial multi-product reservations.
export const createReservedOrder = async (data) => {
    const requested = aggregateOrderItems(data.items);
    if (typeof data.requestId !== 'string' || !/^[A-Za-z0-9-]{16,100}$/.test(data.requestId)) fail('Refresh checkout and try again.');
    if (typeof data.userId !== 'string' || !mongoose.isObjectIdOrHexString(data.userId)) fail('Sign in to place your order.');
    await orderModel.init();
    const sameRequest = order => {
        if (order.paymentMethod !== data.paymentMethod || JSON.stringify(aggregateOrderItems(order.items)) !== JSON.stringify(requested)) fail('This checkout was already used. Start a new checkout.');
        if (order.status === 'Cancelled' || order.inventoryStatus === 'released') fail('This order was cancelled. Start a new checkout.');
        return order;
    };
    const key = { userId: data.userId, requestId: data.requestId };
    const existing = await orderModel.findOne(key);
    if (existing) return sameRequest(existing);
    try {
        return await mongoose.connection.transaction(async session => {
            const retry = await orderModel.findOne(key).session(session);
            if (retry) return sameRequest(retry);
            const items = [];
            for (const item of requested) {
                const product = await productModel.findById(item._id).session(session).lean();
                if (!product) fail('A product in your cart is no longer available.');
                if (!validPhpAmount(product.price)) fail(`The price for ${product.name} needs monetary precision review. Contact the administrator.`);
                if (!product.sizes.includes(item.size)) fail(`Size ${item.size} is not available for ${product.name}.`);
                const path = `inventory.${item.size}`;
                const updated = await productModel.updateOne(
                    { _id: item._id, sizes: item.size, [path]: { $gte: item.quantity } },
                    { $inc: { [path]: -item.quantity } }, { session }
                );
                if (updated.modifiedCount !== 1) fail(`Insufficient stock for ${product.name} — Size ${item.size}. Only ${product.inventory?.[item.size] || 0} remaining.`);
                items.push({ _id: item._id, name: product.name, image: product.image, price: product.price, category: product.category, subCategory: product.subCategory, size: item.size, quantity: item.quantity });
            }
            const [order] = await orderModel.create([{ ...data, items, amount: sumPhp(phpItemsTotal(items), ORDER_FEE_PHP), inventoryStatus: 'reserved' }], { session });
            return order;
        });
    } catch (error) {
        // Concurrent retries with one request ID share the same committed order.
        if (error.code === 11000) {
            const order = await orderModel.findOne(key);
            if (order) return sameRequest(order);
        }
        throw error;
    }
};

export const cancelReservedOrder = async (orderId, { userId, paymentMethod, unpaidOnly = false, expectedStatus, expectedPayment, source } = {}) =>
    mongoose.connection.transaction(async session => {
        if (source === 'customer' && (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId))) fail('Sign in to cancel your order.', 401);
        const filter = { _id: orderId, ...(userId ? { userId } : {}), ...(paymentMethod ? { paymentMethod } : {}) };
        const order = await orderModel.findOne(filter).session(session).lean();
        if (!order) fail('Order not found.', 404);
        if (order.status === 'Cancelled') return order;
        if (source === 'customer' && order.status !== 'Order Placed') fail('This order can no longer be cancelled because it has already been approved or progressed.', 409);
        if (!getAllowedOrderStatuses(order).includes('Cancelled') || (unpaidOnly && order.payment) || (expectedStatus !== undefined && (order.status !== expectedStatus || order.payment !== expectedPayment))) fail('This order can no longer be cancelled. Refresh its status.', 409);
        const refund = cancellationRefund(order);
        // Lock the eligible order transition and inventory release in one transaction.
        const cancelled = await orderModel.findOneAndUpdate(
            { ...filter, status: order.status, payment: order.payment, inventoryStatus: order.inventoryStatus ?? { $exists: false } },
            { $set: { status: 'Cancelled', ...(refund ? { refund } : {}), ...(source ? { cancellationSource: source } : {}), ...(order.inventoryStatus === 'reserved' ? { inventoryStatus: 'released' } : {}) } },
            { session, returnDocument: 'after', runValidators: true }
        );
        if (!cancelled) fail('This order changed. Refresh your orders and try again.', 409);
        if (order.inventoryStatus === 'reserved') {
            for (const item of aggregateOrderItems(order.items)) {
                const restored = await productModel.updateOne({ _id: item._id, sizes: item.size, [`inventory.${item.size}`]: { $lte: Number.MAX_SAFE_INTEGER - item.quantity } }, { $inc: { [`inventory.${item.size}`]: item.quantity } }, { session });
                if (restored.matchedCount !== 1) fail('Unable to restore a product. Contact the administrator.');
            }
        }
        return cancelled;
    });

export const adjustInventory = async (id, adjustments) => {
    if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) fail('Invalid product.');
    if (!validObject(adjustments) || !Object.keys(adjustments).length) fail('Enter a stock adjustment.');
    const product = await productModel.findById(id).lean();
    if (!product) fail('Product not found.');
    const conditions = [], increments = {};
    for (const [size, delta] of Object.entries(adjustments)) {
        if (!validSize(size) || !getInventorySizes(product).includes(size) || !Number.isSafeInteger(delta)) fail('Adjustments must be whole numbers for this product’s sizes.');
        if (!delta) continue;
        const path = `inventory.${size}`;
        conditions.push({ $expr: { $and: [
            { $gte: [{ $add: [{ $ifNull: [`$${path}`, 0] }, delta] }, 0] },
            { $lte: [{ $add: [{ $ifNull: [`$${path}`, 0] }, delta] }, Number.MAX_SAFE_INTEGER] }
        ] } });
        increments[path] = delta;
    }
    if (!Object.keys(increments).length) fail('Enter at least one non-zero adjustment.');
    const updated = await productModel.findOneAndUpdate({ _id: id, $and: conditions }, { $inc: increments, ...(!product.sizes?.length ? { $set: { sizes: ['One Size'] } } : {}) }, { new: true });
    if (!updated) fail('Stock changed or the adjustment would make stock negative. Refresh and try again.');
    return updated;
};
