import userModel from '../models/userModel.js';
import { aggregateOrderItems } from './inventory.js';
import { getCartSnapshot } from './cart.js';
import { cartRecord, cartSnapshot, cartValue } from '../../shared/cart.js';

// Optional for older clients/orders: without checkout revision evidence, clear nothing.
export const prepareCheckoutCart = (snapshot, items) => {
    if (snapshot === undefined) return undefined;
    if (!cartRecord(snapshot) || Reflect.ownKeys(snapshot).some(key => !['cartData', 'cartVersions'].includes(key))
        || !Object.hasOwn(snapshot, 'cartData') || !Object.hasOwn(snapshot, 'cartVersions')) {
        throw new Error('Refresh your cart before checkout.');
    }
    const cart = cartSnapshot(snapshot);
    const requested = new Map(aggregateOrderItems(items).map(item => [JSON.stringify([item._id, item.size]), item.quantity]));
    const covered = cartSnapshot();
    for (const [id, sizes] of Object.entries(cart.cartData)) for (const [size, quantity] of Object.entries(sizes)) {
        if (quantity === 0) continue;
        const key = JSON.stringify([id.toLowerCase(), size]);
        if (requested.get(key) !== quantity) throw new Error('Checkout items do not match your cart. Review it and try again.');
        requested.delete(key);
        covered.cartData[id] ||= {};
        covered.cartVersions[id] ||= {};
        covered.cartData[id][size] = quantity;
        covered.cartVersions[id][size] = cartValue(cart.cartVersions, id, size);
    }
    if (requested.size) throw new Error('Checkout items do not match your cart. Review it and try again.');
    return covered;
};

export const clearCheckoutCart = async (order, userId) => {
    if (order.userId !== userId || order.paymentMethod !== 'COD') throw new Error('Invalid checkout cart owner.');
    // Always use evidence saved on the first committed order, never a retry's newer snapshot.
    const covered = prepareCheckoutCart(order.checkoutCart, order.items);
    if (!covered) return;
    await getCartSnapshot(userId);
    for (const [id, sizes] of Object.entries(covered.cartData)) for (const [size, quantity] of Object.entries(sizes)) {
        const version = covered.cartVersions[id][size];
        if (version === Number.MAX_SAFE_INTEGER) continue;
        const quantityPath = 'cartData.' + id + '.' + size;
        const versionPath = 'cartVersions.' + id + '.' + size;
        const objectOrMissing = path => ({ $or: [{ [path]: { $exists: false } }, { [path]: { $type: 'object' } }] });
        await userModel.updateOne({ _id: userId, [quantityPath]: quantity, $and: [
            objectOrMissing('cartData'), objectOrMissing('cartData.' + id),
            objectOrMissing('cartVersions'), objectOrMissing('cartVersions.' + id),
            version === 0 ? { $or: [{ [versionPath]: 0 }, { [versionPath]: { $exists: false } }] } : { [versionPath]: version }
        ] }, { $unset: { [quantityPath]: '' }, $inc: { [versionPath]: 1 } }, { runValidators: true });
        // A conflict preserves the whole changed entry. A successful removal advances
        // its tombstone, so retries and simultaneous cleanup cannot remove it again.
    }
};
