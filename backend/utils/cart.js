import userModel from '../models/userModel.js';
import productModel from '../models/productModel.js';
import { getInventorySizes, getSizeStock } from '../../shared/inventory.js';
import { cartRecord, cartSnapshot, cartValue, validCartId, validCartSize, validCartNumber } from '../../shared/cart.js';

const fail = (message, status = 400, snapshot) => { throw Object.assign(new Error(message), { status, snapshot }); };
export const validateCartRequest = (body, operation) => {
    const keys = operation === 'get' ? ['userId'] : ['userId', 'itemId', 'size', 'expectedVersion', 'expectedQuantity', ...(operation === 'update' ? ['quantity'] : [])];
    if (!cartRecord(body) || Reflect.ownKeys(body).some(key => !keys.includes(key))) fail('Invalid cart request.');
    if (!Object.hasOwn(body, 'userId') || !validCartId(body.userId)) fail('Invalid cart account.');
    if (operation === 'get') return;
    if (!Object.hasOwn(body, 'itemId') || !validCartId(body.itemId) || !Object.hasOwn(body, 'size') || !validCartSize(body.size)) fail('Select a valid product and size.');
    if (operation === 'update' && (!Object.hasOwn(body, 'quantity') || !validCartNumber(body.quantity))) fail('Quantity must be a non-negative whole number.');
    const versioned = Object.hasOwn(body, 'expectedVersion');
    if ((versioned && (!validCartNumber(body.expectedVersion) || !Object.hasOwn(body, 'expectedQuantity') || !validCartNumber(body.expectedQuantity)))
        || (!versioned && Object.hasOwn(body, 'expectedQuantity'))) fail('Invalid cart revision.');
    if (operation === 'update' && !versioned) fail('Refresh your cart before changing quantities.', 409);
};
export const getCartSnapshot = async userId => {
    const user = await userModel.findById(userId).select('cartData cartVersions').lean();
    if (!user) fail('Cart account not found.', 404);
    try { return cartSnapshot(user); }
    catch { fail('Saved cart data requires review. Contact PAMO for assistance.', 409); }
};
const missingOr = (path, condition) => ({ $or: [{ [path]: { $exists: false } }, { [path]: condition }] });

export const mutateCart = async (body, operation) => {
    validateCartRequest(body, operation);
    const { userId, size } = body;
    const itemId = body.itemId;
    const snapshot = await getCartSnapshot(userId);
    const currentQuantity = cartValue(snapshot.cartData, itemId, size);
    const currentVersion = cartValue(snapshot.cartVersions, itemId, size);
    const versioned = Object.hasOwn(body, 'expectedVersion');
    if (versioned && (body.expectedVersion !== currentVersion || body.expectedQuantity !== currentQuantity)) {
        fail('Your cart changed. Review it and try again.', 409, snapshot);
    }
    const quantity = operation === 'add' ? currentQuantity + 1 : body.quantity;
    if (!validCartNumber(quantity) || currentVersion === Number.MAX_SAFE_INTEGER) fail('Cart quantity or revision exceeds safe precision.');
    let stock;
    if (quantity > 0) {
        const product = await productModel.findById(itemId).lean();
        if (!product) fail('This product is no longer available.', 404);
        if (!getInventorySizes(product).includes(size)) fail('This size is not available for the selected product.');
        stock = getSizeStock(product, size);
        if (quantity > stock) fail('The requested quantity is unavailable for this size.', 409, snapshot);
    }
    const quantityPath = 'cartData.' + itemId + '.' + size;
    const versionPath = 'cartVersions.' + itemId + '.' + size;
    const conditions = [missingOr('cartData', { $type: 'object' }), missingOr('cartData.' + itemId, { $type: 'object' }),
        missingOr('cartVersions', { $type: 'object' }), missingOr('cartVersions.' + itemId, { $type: 'object' })];
    if (versioned || operation === 'update') {
        conditions.push(currentQuantity === 0 ? missingOr(quantityPath, 0) : { [quantityPath]: currentQuantity });
        conditions.push(currentVersion === 0 ? missingOr(versionPath, 0) : { [versionPath]: currentVersion });
    } else {
        // Legacy additive requests remain additive. Modern callers use revisions for safe retries.
        conditions.push(missingOr(quantityPath, { $type: 'number', $gte: 0, $lte: Math.min(stock - 1, Number.MAX_SAFE_INTEGER - 1) }));
        conditions.push(missingOr(versionPath, { $type: 'number', $gte: 0, $lt: Number.MAX_SAFE_INTEGER }));
    }
    const update = { $inc: { [versionPath]: 1 } };
    if (operation === 'add') update.$inc[quantityPath] = 1;
    else if (quantity === 0) update.$unset = { [quantityPath]: '' };
    else update.$set = { [quantityPath]: quantity };
    const updated = await userModel.findOneAndUpdate({ _id: userId, $and: conditions }, update,
        { returnDocument: 'after', runValidators: true, projection: { cartData: 1, cartVersions: 1 } }).lean();
    if (!updated) fail('Your cart changed. Review it and try again.', 409, await getCartSnapshot(userId));
    return cartSnapshot(updated);
};
