import { formatPhp } from '../../../shared/money.js'

export const orderFilters = [
  ['All Orders', () => true],
  ['New', order => order.status === 'Order Placed'],
  ['Approved', order => ['Approved', 'Packing'].includes(order.status)],
  ['Cashier', order => ['Sent to Cashier', 'Shipped'].includes(order.status)],
  ['Paid', order => order.payment === true],
  ['Ready for Release', order => order.status === 'Ready To Claim'],
  ['Completed', order => order.status === 'Claimed'],
  ['Cancelled', order => order.status === 'Cancelled'],
  ['Cancellation Requests', order => order.cancellationRequest?.status === 'pending']
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

export const getOrderStatusLabel = order => {
  if (order.status !== 'Cancelled') return order.status
  if (order.cancellationRequest?.status === 'approved') return 'Cancellation Approved'
  if (order.cancellationSource === 'customer') return 'Cancelled by Customer'
  if (order.cancellationSource === 'admin') return 'Rejected by Admin'
  return 'Cancelled'
}

const textValue = (value, limit) => typeof value === 'string' && value.trim()
  ? value.trim().slice(0, limit)
  : ''

export const orderAddress = order => {
  const student = order?.student && typeof order.student === 'object' && !Array.isArray(order.student)
    ? order.student
    : {}
  const source = order?.address && typeof order.address === 'object' && !Array.isArray(order.address)
    ? order.address
    : {}
  const firstName = textValue(source.firstName, 100)
  const lastName = textValue(source.lastName, 100)
  return {
    name: textValue(student.name, 200) || [firstName, lastName].filter(Boolean).join(' ') || 'Name not provided',
    email: textValue(student.email, 254) || textValue(source.email, 254),
    academicProgram: textValue(student.academicProgram, 100),
    phone: textValue(source.phone, 30),
    street: textValue(source.street, 200),
    locality: [
      textValue(source.city, 100),
      textValue(source.state, 100),
      textValue(source.country, 100),
      textValue(source.zipcode, 20)
    ].filter(Boolean).join(', '),
    campusPickup: order?.fulfillmentMethod === 'campus_pickup'
  }
}

export const orderName = order => orderAddress(order).name
export const money = formatPhp
export const orderDate = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? { date: 'Date unavailable', time: '' } : {
    date: date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
}
