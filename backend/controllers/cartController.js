import { getCartSnapshot, mutateCart, validateCartRequest } from '../utils/cart.js'

const getSuccessMessage = operation => {
    if (operation === 'get') return null
    if (operation === 'add') return 'Item added to cart successfully'
    return 'Cart updated successfully'
}

const cartHandler = operation => async (req, res) => {
    try {
        validateCartRequest(req.body, operation)

        let snapshot
        if (operation === 'get') {
            snapshot = await getCartSnapshot(req.body.userId)
        } else {
            snapshot = await mutateCart(req.body, operation)
        }

        const response = { success: true, ...snapshot }
        const message = getSuccessMessage(operation)
        if (message) response.message = message

        return res.json(response)
    } catch (error) {
        const status = error.status || 503
        const message = error.status
            ? error.message
            : 'Unable to save your cart. Please try again.'

        return res.status(status).json({
            success: false,
            message,
            ...(error.snapshot || {})
        })
    }
}

const addToCart = cartHandler('add')
const updateCart = cartHandler('update')
const getUserCart = cartHandler('get')

export { addToCart, getUserCart, updateCart }
