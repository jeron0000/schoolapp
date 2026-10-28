export const DEMO_PAYMENT_METHODS = {
  stripe: 'Stripe (DEMO)',
  paypal: 'PayPal (DEMO)',
}

export const isDemoOrder = order => (
  order?.demoPayment?.mode === 'demo'
  && typeof order.demoPayment.provider === 'string'
  && Object.hasOwn(DEMO_PAYMENT_METHODS, order.demoPayment.provider)
  && DEMO_PAYMENT_METHODS[order.demoPayment.provider] === order.paymentMethod
  && !order.receiptNumber
  && !order.confirmedBy
  && !order.stripePayment
  && !order.paypalPayment
  && !order.paymentRecovery
  && !order.refund
)
