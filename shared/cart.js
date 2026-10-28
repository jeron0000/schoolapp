import { isValidSizeLabel } from './inventory.js';

// Cart keys must also be safe MongoDB dotted-path segments.
export const validCartId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const validCartSize = value => isValidSizeLabel(value);
export const validCartNumber = value => Number.isSafeInteger(value) && value >= 0;
export const cartRecord = value => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return [Object.prototype, null].includes(Object.getPrototypeOf(value));
};
export const cartValue = (cart, id, size) => {
  if (!Object.hasOwn(cart, id) || !Object.hasOwn(cart[id], size)) {
    return 0;
  }
  return cart[id][size];
};

const copyEntries = source => {
  if (!cartRecord(source)) {
    throw new Error('Saved cart data is invalid. Contact PAMO for assistance.');
  }
  const result = {};
  for (const id of Reflect.ownKeys(source)) {
    if (!validCartId(id) || !cartRecord(source[id])) {
      throw new Error('Saved cart data is invalid. Contact PAMO for assistance.');
    }
    result[id] = {};
    for (const size of Reflect.ownKeys(source[id])) {
      if (!validCartSize(size) || !validCartNumber(source[id][size])) {
        throw new Error('Saved cart data is invalid. Contact PAMO for assistance.');
      }
      result[id][size] = source[id][size];
    }
  }
  return result;
};
export const cartSnapshot = ({ cartData = {}, cartVersions = {} } = {}) => ({
  cartData: copyEntries(cartData),
  cartVersions: copyEntries(cartVersions),
});
export const withCartQuantity = (cart, id, size, quantity) => {
  if (!validCartId(id) || !validCartSize(size) || !validCartNumber(quantity)) {
    throw new Error('Invalid cart item or quantity.');
  }
  const next = { ...cart, [id]: { ...(Object.hasOwn(cart, id) ? cart[id] : {}) } };
  if (quantity === 0) {
    delete next[id][size];
  } else {
    next[id][size] = quantity;
  }
  return next;
};
