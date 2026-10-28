import { cancellationPaymentState } from './refund.js'

export const CANCELLATION_REVIEW_MS = 24 * 60 * 60 * 1000

export const ONLINE_CANCELLATION_POLICY = {
  title: 'Online Payment — Cancellation Policy',
  message: 'This order has been paid online and cannot be cancelled directly through PAMO.',
  support: 'For payment issues, unavailable items, or refund concerns, please contact PAMO Support.'
}

export const isOnlinePaymentMethod = method => (
  typeof method === 'string' && ['stripe', 'paypal'].includes(method.trim().toLowerCase())
)

// payment is server-owned; order progress alone never proves payment.
export const isPaidOnlineOrder = order => order?.payment === true && isOnlinePaymentMethod(order.paymentMethod)

export const getCancellationMode = (order, { allowPaidOnline = false } = {}) => {
  if (!order || order.inventoryStatus === 'released' || order.refund) return null
  if (isPaidOnlineOrder(order) && !allowPaidOnline) return null
  if (['pending', 'approved'].includes(order.cancellationRequest?.status)) return null
  const paymentState = cancellationPaymentState(order)
  if (paymentState === 'review') return null
  if (order.status === 'Order Placed') {
    if (order.sentToCashierAt) return null
    return paymentState === 'unpaid' ? 'immediate' : 'request'
  }
  if (['Approved', 'Packing', 'Sent to Cashier'].includes(order.status)) return 'request'
  if (order.status === 'Ready To Claim' && paymentState === 'paid') return 'request'
  return null
}

export const canAdminCancelPaidOnline = order => (
  isPaidOnlineOrder(order) && getCancellationMode(order, { allowPaidOnline: true }) !== null
)

export const getCancellationRequestLabel = (request, now = Date.now()) => {
  if (!request) return ''
  if (request.status === 'pending') {
    if (now >= request.requestedAt + CANCELLATION_REVIEW_MS) return 'Overdue'
    return 'Pending Review'
  }
  if (request.status === 'approved') return 'Approved'
  if (request.status === 'rejected') return 'Rejected'
  return ''
}
