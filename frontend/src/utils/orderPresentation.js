const statusPresentation = {
  'Order Placed': { group: 'Pending', label: 'Order Placed', tone: 'amber', current: 'placed' },
  Approved: { group: 'Pending', label: 'Approved', tone: 'blue', current: 'approved' },
  'Sent to Cashier': { group: 'Processing', label: 'Awaiting Payment', tone: 'violet', current: 'cashier' },
  Packing: { group: 'Processing', label: 'Processing', tone: 'blue', current: 'preparing' },
  Shipped: { group: 'Processing', label: 'Processing', tone: 'blue', current: 'preparing' },
  'Ready To Claim': { group: 'Processing', label: 'Ready for Release', tone: 'amber', current: 'ready' },
  Claimed: { group: 'Completed', label: 'Completed', tone: 'green', current: 'completed' },
  Cancelled: { group: 'Cancelled', label: 'Cancelled', tone: 'red', current: null }
}

export const orderFilters = ['All Orders', 'Pending', 'Processing', 'Completed', 'Cancelled']
export const statusStyles = {
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

export const getOrderPresentation = order => {
  const presentation = statusPresentation[order.status] || { group: null, label: order.status || 'Status unavailable', tone: 'neutral', current: null }
  if (order.status === 'Sent to Cashier' && order.payment === true) {
    return { ...presentation, label: 'Payment Confirmed', tone: 'green', current: 'payment' }
  }
  return presentation
}

export const formatOrderDate = value => {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

export const formatMoney = (value, currency) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  ? `${currency}${Number(value).toFixed(2)}` : 'Unavailable'

export const getOrderTotals = order => {
  const items = order.items || []
  const hasPrices = items.length > 0 && items.every(item => item.price != null && item.quantity != null && Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.quantity)))
  const subtotal = hasPrices ? items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) : null
  // The existing schema stores historical item prices and the final amount.
  const difference = subtotal !== null && order.amount != null && Number.isFinite(Number(order.amount)) ? Math.round((Number(order.amount) - subtotal) * 100) / 100 : null
  return { subtotal, fee: difference !== null && difference >= 0 ? difference : null }
}

export const getOrderTimeline = order => {
  const { current } = getOrderPresentation(order)
  const approved = ['Approved', 'Sent to Cashier', 'Packing', 'Shipped', 'Ready To Claim', 'Claimed'].includes(order.status)
  // Online payments can occur before approval and can bypass the cashier stage.
  // A later fulfillment status alone is not evidence of a cashier handoff.
  const cashier = order.status === 'Sent to Cashier' || Boolean(formatOrderDate(order.sentToCashierAt)) || Boolean(order.receiptNumber && order.payment === true && formatOrderDate(order.paidAt))
  const preparing = ['Packing', 'Shipped', 'Ready To Claim', 'Claimed'].includes(order.status)
  return [
    { key: 'placed', label: 'Order Placed', reached: true, date: order.date },
    { key: 'approved', label: 'Approved', reached: approved },
    { key: 'cashier', label: 'Sent to Cashier', reached: cashier, date: cashier ? order.sentToCashierAt : undefined },
    { key: 'payment', label: 'Payment Confirmed', reached: order.payment === true, date: order.payment === true ? order.paidAt : undefined },
    { key: 'preparing', label: 'Preparing', reached: preparing },
    { key: 'ready', label: 'Ready for Release', reached: ['Ready To Claim', 'Claimed'].includes(order.status) },
    { key: 'completed', label: 'Completed', reached: order.status === 'Claimed' }
  ].map(step => ({ ...step, current: step.key === current }))
}
