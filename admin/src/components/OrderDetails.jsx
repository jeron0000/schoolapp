import React from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { assets } from '../assets/assets'
import { actionLabels, getOrderStatusLabel, orderAddress, orderDate, statusColors } from '../utils/orderPresentation'
import { refundPresentation } from '../../../shared/refund.js'
import { formatOrderMoney, orderPhpTotals, tryPhpLineTotal } from '../../../shared/money.js'

export const OrderStatusBadge = ({ status, label = status }) => (
  <span
    className={
      'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium leading-4 ' +
      (statusColors[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')
    }
  >
    <span aria-hidden='true' className='h-1.5 w-1.5 shrink-0 rounded-full bg-current' />
    {label || 'Unknown'}
  </span>
)

const OrderDetails = ({ order, pending, onAction, onClose, error }) => {
  if (!order) return (
    <aside className='order-details-empty'>
      <h2>Order Details</h2>
      <p>Select View on an order to see its details.</p>
    </aside>
  )

  const items = order.items || []
  const address = orderAddress(order)
  const date = orderDate(order.date)
  const { subtotal, fee } = orderPhpTotals(order)
  const money = value => formatOrderMoney(value, order)
  // Orders store historical item prices and the final amount, not a separate fee.
  const actions = (order.allowedStatuses || []).filter(status => actionLabels[status])
  const refund = order.refundSummary || refundPresentation(order)

  return (
    <aside id='order-details' aria-label='Order Details' tabIndex={-1} className='pamo-order-details'>
      <header className='order-details-heading'>
        <div>
          <button type='button' className='order-details-back' aria-label='Back to orders' onClick={onClose}><ArrowLeft size={14} aria-hidden='true' />Orders</button>
          <h2>Order Details</h2>
          <p className='order-details-selected'>Selected order</p>
        </div>
        <button type='button' onClick={onClose} aria-label='Close order details'><span>Close</span><X size={16} aria-hidden='true' /></button>
      </header>
      <div className='order-details-content'>
        <section className='order-details-reference' aria-label='Order reference and status'>
          <p>#{order._id}</p>
          <span>{date.date}{date.time && `, ${date.time}`}</span>
          <div className='order-details-states'>
            <div><h3>Payment</h3><span className='orders-badge'><OrderStatusBadge status={order.payment ? 'Paid' : 'Pending'} /></span></div>
            <div><h3>Order progress</h3><span className='orders-badge'><OrderStatusBadge status={order.status} label={getOrderStatusLabel(order)} /></span></div>
          </div>
          {refund && <p className='order-details-refund'><strong>{refund.status}.</strong> {refund.message}</p>}
          {error && <p role='alert' className='orders-error'>{error}</p>}
        </section>
        <section className='order-details-customer' aria-labelledby='order-customer-heading'>
          <h3 id='order-customer-heading'>Customer information</h3>
          <dl>
            <div><dt>Student</dt><dd>{address.name}</dd></div>
            <div><dt>Email</dt><dd>{address.email || 'Email not provided'}</dd></div>
            <div><dt>Phone</dt><dd>{address.phone || 'Mobile number not provided'}</dd></div>
            <div><dt>Address</dt><dd>{address.street || 'Street address not provided'}<br />{address.locality || 'City, province, country and zipcode not provided'}</dd></div>
            <div><dt>Payment method</dt><dd>{order.paymentMethod}</dd></div>
          </dl>
        </section>
        <section className='order-details-items' aria-labelledby='order-items-heading'>
          <h3 id='order-items-heading'>Ordered items · {items.length}</h3>
          <ul>
            {items.map((item, index) => (
              <li key={`${item._id}-${item.size}-${index}`}>
                <img src={item.image?.[0] || assets.parcel_icon} alt={item.name || 'Order item'} />
                <div>
                  <p>{item.name}</p>
                  <span>{item.size && `Size: ${item.size} · `}Qty: {item.quantity}</span>
                  <span>{money(item.price)} each</span>
                </div>
                <strong>{money(tryPhpLineTotal(item.price, item.quantity))}</strong>
              </li>
            ))}
          </ul>
        </section>
        <dl className='order-details-totals'>
          <div><dt>Subtotal</dt><dd>{subtotal === null ? 'Unavailable' : money(subtotal)}</dd></div>
          <div><dt>Processing Fee</dt><dd>{fee === null || fee < 0 ? 'Unavailable' : money(fee)}</dd></div>
          <div><dt>Total</dt><dd>{money(order.amount)}</dd></div>
        </dl>
      </div>
      <footer className='order-details-actions'>
        {actions.length > 0 ? [...actions]
          .sort((a, b) => (a === 'Cancelled' ? -1 : b === 'Cancelled' ? 1 : 0))
          .map(status => (
            <button key={status} type='button' disabled={pending} onClick={() => onAction(order, status)} className={status === 'Cancelled' ? 'orders-reject' : 'orders-primary'}>
              {pending ? 'Updating…' : actionLabels[status]}{status !== 'Cancelled' && <ArrowRight size={16} aria-hidden='true' />}
            </button>
          )) : (
            <p>{['Claimed', 'Cancelled'].includes(order.status)
              ? 'No further order actions are available.'
              : order.payment
                ? 'No action is available for this order status.'
                : 'Awaiting payment confirmation from the payment or cashier workflow.'}</p>
          )}
      </footer>
    </aside>
  )
}

export default OrderDetails
