import { createProductLookup } from './productLookup.js'

export const PHP_CURRENCY = 'PHP'
export const PHP_SYMBOL = '₱'
export const ORDER_FEE_PHP = 10

const invalidMoney = () => {
  throw new Error('Enter a non-negative PHP amount with at most two decimal places and safe numeric precision.')
}

// Parse decimal digits exactly; do not round fractional centavos or use value * 100.
export const phpMinorUnits = value => {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) invalidMoney()
  const text = String(value).trim()
  if (!text || text.length > 64) invalidMoney()
  const match = text.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) invalidMoney()
  const scale = 2 + Number(match[3] || 0) - (match[2]?.length || 0)
  if (!Number.isInteger(scale) || Math.abs(scale) > 400) invalidMoney()
  const digits = BigInt(match[1] + (match[2] || ''))
  const divisor = scale < 0 ? 10n ** BigInt(-scale) : 1n
  if (digits % divisor) invalidMoney()
  const minor = scale < 0 ? digits / divisor : digits * 10n ** BigInt(scale)
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) invalidMoney()
  return Number(minor)
}

export const phpFromMinorUnits = minor => {
  if (!Number.isSafeInteger(minor) || minor < 0) invalidMoney()
  const value = minor / 100
  if (phpMinorUnits(value) !== minor) invalidMoney()
  return value
}

export const validPhpAmount = value => {
  try {
    return typeof value === 'number' && phpMinorUnits(value) >= 0
  } catch {
    return false
  }
}

export const sumPhp = (...values) => phpFromMinorUnits(values.reduce((total, value) => {
  const sum = total + phpMinorUnits(value)
  if (!Number.isSafeInteger(sum)) invalidMoney()
  return sum
}, 0))

export const phpLineTotal = (price, quantity) => {
  if (!Number.isSafeInteger(quantity) || quantity < 0) invalidMoney()
  return phpFromMinorUnits(phpMinorUnits(price) * quantity)
}

export const phpItemsTotal = items => sumPhp(...items.map(item => phpLineTotal(item.price, item.quantity)))

export const cartPhpTotal = (products, cart) => {
  const items = []
  let findProduct
  for (const [id, sizes] of Object.entries(cart)) {
    findProduct ??= createProductLookup(products)
    const product = findProduct(id)
    if (!product) continue // Deleted products retain the existing cart-removal behavior.
    for (const quantity of Object.values(sizes)) {
      if (quantity > 0) {
        items.push({ price: product.price, quantity })
      }
    }
  }
  return phpItemsTotal(items)
}

export const tryPhpLineTotal = (price, quantity) => {
  try {
    return phpLineTotal(price, quantity)
  } catch {
    return null
  }
}

export const orderPhpTotals = order => {
  try {
    if (!Array.isArray(order.items) || !order.items.length) return { subtotal: null, fee: null }
    const subtotal = phpItemsTotal(order.items)
    const difference = phpMinorUnits(order.amount) - phpMinorUnits(subtotal)
    return { subtotal, fee: difference >= 0 ? phpFromMinorUnits(difference) : null }
  } catch {
    return { subtotal: null, fee: null }
  }
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: PHP_CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nominal = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatPhp = value => {
  try {
    return peso.format(phpFromMinorUnits(phpMinorUnits(value)))
  } catch {
    return 'Unavailable'
  }
}

// Currency on historical orders is evidence, not a preference or an FX instruction.
export const formatOrderMoney = (value, order) => {
  const currency = order?.paymentCurrency
  if (currency === PHP_CURRENCY) {
    if (validPhpAmount(value)) {
      return formatPhp(value)
    }
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return `${value} PHP (precision needs review)`
    }
    return 'Unavailable'
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'Unavailable'
  }

  const exact = validPhpAmount(value)
  const displayedValue = exact ? nominal.format(value) : value
  const hasVerifiedCurrency = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)
  const currencyLabel = hasVerifiedCurrency ? currency : '(currency unverified)'
  const precisionNotice = exact ? '' : ' (precision needs review)'

  return `${displayedValue} ${currencyLabel}${precisionNotice}`
}
