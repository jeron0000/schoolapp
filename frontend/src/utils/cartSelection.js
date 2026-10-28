const storagePrefix = 'pamo-cart-selection:'

export const cartSelectionKey = (productId, size) => JSON.stringify([
  String(productId).toLowerCase(),
  size,
])

const cartKeys = cartItems => Object.entries(cartItems || {}).flatMap(([productId, sizes]) =>
  Object.entries(sizes || {})
    .filter(([, quantity]) => quantity > 0)
    .map(([size]) => cartSelectionKey(productId, size))
)

const validStoredSelection = value => value
  && Array.isArray(value.known)
  && Array.isArray(value.selected)
  && value.known.every(key => typeof key === 'string')
  && value.selected.every(key => typeof key === 'string')

export const readCartSelection = userId => {
  if (!userId || typeof sessionStorage === 'undefined') return null
  try {
    const stored = JSON.parse(sessionStorage.getItem(storagePrefix + userId))
    return validStoredSelection(stored) ? stored : null
  } catch {
    return null
  }
}

export const reconcileCartSelection = (cartItems, storedSelection) => {
  const current = cartKeys(cartItems)
  const known = new Set(storedSelection?.known || [])
  const selected = new Set(storedSelection?.selected || [])
  return {
    known: current,
    selected: current.filter(key => selected.has(key) || !known.has(key)),
  }
}

export const persistCartSelection = (userId, selection) => {
  if (!userId || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(storagePrefix + userId, JSON.stringify(selection))
  } catch {
    // Checkout remains usable when optional browser storage is unavailable.
  }
}

export const selectCartItems = (cartItems, selectedKeys) => {
  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys)
  const result = {}
  for (const [productId, sizes] of Object.entries(cartItems || {})) {
    for (const [size, quantity] of Object.entries(sizes || {})) {
      if (quantity > 0 && selected.has(cartSelectionKey(productId, size))) {
        result[productId] ||= {}
        result[productId][size] = quantity
      }
    }
  }
  return result
}

export const removePurchasedSelection = (userId, cartItems, purchasedKeys) => {
  const current = reconcileCartSelection(cartItems, readCartSelection(userId))
  const purchased = purchasedKeys instanceof Set ? purchasedKeys : new Set(purchasedKeys)
  const next = {
    known: current.known,
    selected: current.selected.filter(key => !purchased.has(key)),
  }
  persistCartSelection(userId, next)
  return next
}
