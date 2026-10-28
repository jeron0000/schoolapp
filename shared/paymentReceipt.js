export const isTestPaymentReceipt = order => Boolean(order?.receiptIsTest
  || order?.stripePayment?.livemode === false
  || order?.paypalPayment?.environment === 'sandbox'
  || order?.demoPayment?.mode === 'demo')

export const canRecordOnlineReceipt = order => {
  if (!order || order.payment !== true || order.receiptNumber || order.demoPayment
    || !Number.isSafeInteger(order.paidAt) || order.paidAt <= 0) return false
  if (order.paymentMethod === 'Stripe') {
    const evidence = order.stripePayment
    return Boolean(evidence?.sessionId && evidence.paymentIntentId && evidence.chargeId
      && evidence.accountId && typeof evidence.livemode === 'boolean' && evidence.verifiedAt === order.paidAt)
  }
  if (order.paymentMethod === 'Paypal' || order.paymentMethod === 'PayPal') {
    const evidence = order.paypalPayment
    return Boolean(evidence?.orderId && evidence.captureId && evidence.merchantId
      && ['sandbox', 'live'].includes(evidence.environment) && evidence.verifiedAt === order.paidAt)
  }
  return false
}

export const receiptDisplayValue = order => {
  if (order.receiptNumber) {
    return isTestPaymentReceipt(order) ? `TEST — ${order.receiptNumber}` : order.receiptNumber
  }
  if (order.payment === true && ['Stripe', 'Paypal', 'PayPal'].includes(order.paymentMethod)) {
    return 'Awaiting Official Receipt'
  }
  return 'Not recorded'
}
