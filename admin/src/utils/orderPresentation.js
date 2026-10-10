export const orderFilters = [
  ['All Orders', () => true],
  ['New', order => order.status === 'Order Placed'],
  ['Approved', order => ['Approved', 'Packing'].includes(order.status)],
  ['Cashier', order => ['Sent to Cashier', 'Shipped'].includes(order.status)],
  ['Paid', order => order.payment === true],
  ['Ready for Release', order => order.status === 'Ready To Claim'],
  ['Completed', order => order.status === 'Claimed'],
  ['Cancelled', order => order.status === 'Cancelled']
]

export const statusColors = {
  'Order Placed': 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300',
  Pending: 'bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300',
  Approved: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300',
  Packing: 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300',
  'Sent to Cashier': 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
  Shipped: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
  'Ready To Claim': 'bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300',
  Claimed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
  Paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
  Cancelled: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300'
}

export const actionLabels = {
  Approved: 'Approve Order',
  Cancelled: 'Reject Order',
  'Sent to Cashier': 'Send to Cashier',
  'Ready To Claim': 'Mark Ready for Release',
  Claimed: 'Mark Claimed'
}

export const getOrderStatusLabel = order => order.status === 'Cancelled'
  ? order.cancellationSource === 'customer' ? 'Cancelled by Customer' : order.cancellationSource === 'admin' ? 'Rejected by Admin' : 'Cancelled'
  : order.status

export const orderName = order => [order.address?.firstName, order.address?.lastName].filter(Boolean).join(' ') || 'Name not provided'
export const money = (value, currency) => Number.isFinite(Number(value)) ? `${currency}${Number(value).toFixed(2)}` : 'Unavailable'
export const orderDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? { date: 'Date unavailable', time: '' } : {
    date: date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
}
