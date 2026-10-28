import { isDemoOrder } from './demoPayment.js'

// Only a refund obligation is currently implemented. No provider/manual refund
// execution exists, so Pending, Refunded and Failed cannot be asserted here.
export const REFUND_STATUSES = Object.freeze({
  notRequired: 'Not Required',
  required: 'Refund Required',
  pending: 'Refund Pending',
  refunded: 'Refunded',
  failed: 'Refund Failed'
})

export const cancellationPaymentState = order => {
  if (typeof order.$isDefault === 'function' && order.$isDefault('payment')) {
    return 'review'
  }
  if (order.payment === true) {
    return 'paid'
  }

  const evidence = ['paidAt', 'receiptNumber', 'confirmedBy', 'stripePayment', 'paypalPayment', 'paymentRecovery']
    .some(field => order[field] !== undefined && order[field] !== null)
  const isConfirmedUnpaidCod = order.payment === false
    && (order.paymentMethod === 'COD' || isDemoOrder(order))
    && !evidence
    && !order.refund

  return isConfirmedUnpaidCod ? 'unpaid' : 'review'
}

export const refundPresentation = order => {
  if (order?.status !== 'Cancelled') {
    return null
  }
  if (isDemoOrder(order)) {
    return { status: REFUND_STATUSES.notRequired, message: 'Demo payment only. No money was charged and no refund is due.' }
  }

  const state = cancellationPaymentState(order)
  if (state === 'unpaid') {
    return {
      status: REFUND_STATUSES.notRequired,
      message: 'No payment is recorded for this cancelled order. No refund is required.'
    }
  }

  let message = 'Payment records need PAMO review. If payment was collected, a refund is required. No refund has been confirmed.'
  if (state === 'paid') {
    message = 'This order is cancelled. A refund is required and has not been confirmed. Contact PAMO to arrange the refund.'
  }

  return {
    status: REFUND_STATUSES.required,
    message
  }
}
