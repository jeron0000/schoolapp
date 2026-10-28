import userModel from '../models/userModel.js';
import { aggregateOrderItems } from './inventory.js';
import { getCartSnapshot } from './cart.js';
import { cartRecord, cartSnapshot, cartValue } from '../../shared/cart.js';
import { isDemoOrder } from '../../shared/demoPayment.js';

// Optional for older clients/orders: without checkout revision evidence, clear nothing.
export const prepareCheckoutCart = (snapshot, items) => {
    if (snapshot === undefined) {
        return undefined;
    }

    const hasOnlySnapshotKeys = cartRecord(snapshot)
        && Reflect.ownKeys(snapshot).every(key => ['cartData', 'cartVersions'].includes(key));
    let hasRequiredSnapshotData = false;
    if (hasOnlySnapshotKeys) {
        hasRequiredSnapshotData = Object.hasOwn(snapshot, 'cartData')
            && Object.hasOwn(snapshot, 'cartVersions');
    }
    if (!hasOnlySnapshotKeys || !hasRequiredSnapshotData) {
        throw new Error('Refresh your cart before checkout.');
    }

    const cart = cartSnapshot(snapshot);
    const requested = new Map(aggregateOrderItems(items).map(item => [
        JSON.stringify([item._id, item.size]),
        item.quantity
    ]));
    const covered = cartSnapshot();
    const cartKeys = new Set();
    for (const [id, sizes] of Object.entries(cart.cartData)) {
        for (const [size, quantity] of Object.entries(sizes)) {
            const key = JSON.stringify([id.toLowerCase(), size]);
            if (cartKeys.has(key)) {
                throw new Error('Checkout items do not match your cart. Review it and try again.');
            }
            cartKeys.add(key);
            if (quantity === 0) {
                continue;
            }

            if (!requested.has(key)) {
                continue;
            }
            if (requested.get(key) !== quantity) {
                throw new Error('Checkout items do not match your cart. Review it and try again.');
            }
            requested.delete(key);
            covered.cartData[id] ||= {};
            covered.cartVersions[id] ||= {};
            covered.cartData[id][size] = quantity;
            covered.cartVersions[id][size] = cartValue(cart.cartVersions, id, size);
        }
    }
    if (requested.size) {
        throw new Error('Checkout items do not match your cart. Review it and try again.');
    }
    return covered;
};

const objectOrMissing = path => ({
    $or: [
        { [path]: { $exists: false } },
        { [path]: { $type: 'object' } }
    ]
});

const versionCondition = (path, version) => {
    if (version === 0) {
        return { $or: [{ [path]: 0 }, { [path]: { $exists: false } }] };
    }
    return { [path]: version };
};

export const clearCheckoutCart = async (order, userId) => {
    const successfulDemo = isDemoOrder(order) && order.payment === true && order.demoPayment.status === 'succeeded';
    const verifiedStripe = order.paymentMethod === 'Stripe' && order.payment === true
        && order.stripePayment?.verifiedAt === order.paidAt && Number.isSafeInteger(order.paidAt)
        && Boolean(order.stripePayment?.chargeId);
    const verifiedPaypal = order.paymentMethod === 'Paypal' && order.payment === true
        && order.paypalPayment?.verifiedAt === order.paidAt && Number.isSafeInteger(order.paidAt)
        && Boolean(order.paypalPayment?.captureId);
    if (order.userId !== userId || (order.paymentMethod !== 'COD' && !successfulDemo && !verifiedStripe && !verifiedPaypal)) {
        throw new Error('Invalid checkout cart owner.');
    }
    // Always use evidence saved on the first committed order, never a retry's newer snapshot.
    const covered = prepareCheckoutCart(order.checkoutCart, order.items);
    if (!covered) {
        return;
    }

    await getCartSnapshot(userId);
    for (const [id, sizes] of Object.entries(covered.cartData)) {
        for (const [size, quantity] of Object.entries(sizes)) {
            const version = covered.cartVersions[id][size];
            if (version === Number.MAX_SAFE_INTEGER) {
                continue;
            }

            const quantityPath = 'cartData.' + id + '.' + size;
            const versionPath = 'cartVersions.' + id + '.' + size;
            const conditions = [
                objectOrMissing('cartData'),
                objectOrMissing('cartData.' + id),
                objectOrMissing('cartVersions'),
                objectOrMissing('cartVersions.' + id),
                versionCondition(versionPath, version)
            ];
            await userModel.updateOne(
                { _id: userId, [quantityPath]: quantity, $and: conditions },
                { $unset: { [quantityPath]: '' }, $inc: { [versionPath]: 1 } },
                { runValidators: true }
            );
            // A conflict preserves the whole changed entry. A successful removal advances
            // its tombstone, so retries and simultaneous cleanup cannot remove it again.
        }
    }
};
