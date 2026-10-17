import { getCartSnapshot, mutateCart, validateCartRequest } from '../utils/cart.js';

const cartHandler = operation => async (req, res) => {
    try {
        validateCartRequest(req.body, operation);
        const snapshot = operation === 'get' ? await getCartSnapshot(req.body.userId) : await mutateCart(req.body, operation);
        return res.json({ success: true, ...snapshot,
            ...(operation === 'get' ? {} : { message: operation === 'add' ? 'Item added to cart successfully' : 'Cart updated successfully' }) });
    } catch (error) {
        return res.status(error.status || 503).json({ success: false,
            message: error.status ? error.message : 'Unable to save your cart. Please try again.',
            ...(error.snapshot || {}) });
    }
};

const addToCart = cartHandler('add');
const updateCart = cartHandler('update');
const getUserCart = cartHandler('get');
export { addToCart, updateCart, getUserCart };
