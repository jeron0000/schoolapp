import React from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { assets } from '../assets/assets'
import { actionLabels, getOrderStatusLabel, orderAddress, orderDate, statusColors } from '../utils/orderPresentation'
import { refundPresentation } from '../../../shared/refund.js'
import { canAdminCancelPaidOnline, getCancellationRequestLabel } from '../../../shared/orderCancellation.js'
import { formatOrderMoney, orderPhpTotals, tryPhpLineTotal } from '../../../shared/money.js'
import { getAcademicProgramName } from '../../../shared/productTaxonomy.js'
import { isDemoOrder } from '../../../shared/demoPayment.js'
import { isTestPaymentReceipt, receiptDisplayValue } from '../../../shared/paymentReceipt.js'

const compareOrderActions = (firstStatus, secondStatus) => {
  if (firstStatus === 'Cancelled') return -1
  if (secondStatus === 'Cancelled') return 1
  return 0
}

const getNoActionsMessage = order => {
  if (['Claimed', 'Cancelled'].includes(order.status)) {
    return 'No further order actions are available.'
  }
  if (order.payment) return 'No action is available for this order status.'
  return 'Awaiting payment confirmation from the payment or cashier workflow.'
}

const formatAvailableMoney = (value, formatMoney) => {
  if (value === null) return 'Unavailable'
  return formatMoney(value)
}

const formatFee = (fee, formatMoney) => {
  if (fee === null || fee < 0) return 'Unavailable'
  return formatMoney(fee)
}

const primaryActionClass = 'orders-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--pamo-color-brand-yellow)] p-3 text-xs font-semibold text-slate-900 [&:not(:disabled):hover]:bg-[var(--pamo-color-brand-hover)]'
const rejectActionClass = 'orders-reject inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[color:var(--orders-error)] p-3 text-xs font-semibold text-[color:var(--orders-error)]'

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

const OrderDetails = ({ order, pending, onAction, onClose, error, onReview, programCategories = [] }) => {
  if (!order) return (
    <aside className='order-details-empty p-10 text-center'>
      <h2>Order Details</h2>
      <p>Select View on an order to see its details.</p>
    </aside>
  )

  const items = order.items || []
  const address = orderAddress(order)
  const academicProgramName = getAcademicProgramName(programCategories, address.academicProgram)
  const date = orderDate(order.date)
  const { subtotal, fee } = orderPhpTotals(order)
  const money = value => formatOrderMoney(value, order)
  // Orders store historical item prices and the final amount, not a separate fee.
  const actions = (order.allowedStatuses || [])
    .filter(status => actionLabels[status])
    .sort(compareOrderActions)
  const refund = order.refundSummary || refundPresentation(order)
  const cancellationRequest = order.cancellationRequest
  const requestLabel = getCancellationRequestLabel(cancellationRequest)
  const paymentStatus = order.payment ? 'Paid' : 'Pending'
  const demo = isDemoOrder(order)
  const paymentLabel = demo ? `${paymentStatus} (DEMO)` : paymentStatus
  let receiptNumber = order.payment ? receiptDisplayValue(order) : 'Awaiting Cashier Confirmation'
  if (order.payment && receiptNumber === 'Not recorded') receiptNumber = 'No receipt recorded'
  if (demo) receiptNumber = 'Not issued for demo payments'
  const paymentConfirmationDate = order.paidAt ? orderDate(order.paidAt) : null
  const noActionsMessage = getNoActionsMessage(order)
  let actionContent = <p>{noActionsMessage}</p>

  if (actions.length > 0) {
    actionContent = actions.map(status => {
      const className = status === 'Cancelled' ? rejectActionClass : primaryActionClass
      const label = pending ? 'Updating…' : actionLabels[status]

      return (
        <button key={status} type='button' disabled={pending} onClick={() => onAction(order, status)} className={className}>
          {label}
          {status !== 'Cancelled' && <ArrowRight size={16} aria-hidden='true' />}
        </button>
      )
    })
  }
  if (cancellationRequest?.status === 'pending') {
    actionContent = <>
      <button type='button' disabled={pending} className={primaryActionClass} onClick={() => onReview(order, 'approve')}>Approve Cancellation</button>
      <button type='button' disabled={pending} className={rejectActionClass} onClick={() => onReview(order, 'reject')}>Reject Cancellation</button>
    </>
  }
  if (canAdminCancelPaidOnline(order)) {
    actionContent = <>{actionContent}
      <button type='button' disabled={pending} className={rejectActionClass} onClick={() => onReview(order, 'exception')}>Exceptional Cancellation</button>
    </>
  }

  return (
    <aside id='order-details' aria-label='Order Details' tabIndex={-1} className='pamo-order-details flex h-full min-w-0 flex-col text-[length:var(--pamo-staff-body)] outline-none'>
      <header className='order-details-heading flex shrink-0 items-start justify-between gap-3 border-b border-l-[3px] border-b-[color:var(--pamo-color-border-default)] border-l-[color:var(--pamo-color-brand-yellow)] px-4 py-[18px]'>
        <div>
          <button type='button' className='order-details-back' aria-label='Back to orders' onClick={onClose}><ArrowLeft size={14} aria-hidden='true' />Orders</button>
          <h2 className='text-[22px] font-semibold leading-tight tracking-[-.02em]'>Order Details</h2>
          <p className='order-details-selected mt-1.5 text-[11px] text-[color:var(--pamo-color-text-secondary)]'>Selected order</p>
        </div>
        <button type='button' onClick={onClose} aria-label='Close order details' className='inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] p-2.5 text-[11px]'><span>Close</span><X size={16} aria-hidden='true' /></button>
      </header>
      <div className='order-details-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-[18px]'>
        <section className='order-details-reference' aria-label='Order reference and status'>
          <p className='font-mono break-words text-[13px] font-semibold'>#{order._id}</p>
          <span className='mt-2 block text-[11px] text-[color:var(--pamo-color-text-secondary)]'>{date.date}{date.time && `, ${date.time}`}</span>
          <div className='order-details-states mt-4 flex flex-wrap gap-3'>
            <div>
              <h3 className='mb-1.5 text-[10px] uppercase text-[color:var(--pamo-color-text-secondary)]'>Payment</h3>
              <span className='orders-badge'><OrderStatusBadge status={paymentStatus} label={paymentLabel} /></span>
            </div>
            <div>
              <h3 className='mb-1.5 text-[10px] uppercase text-[color:var(--pamo-color-text-secondary)]'>Order progress</h3>
              <span className='orders-badge'><OrderStatusBadge status={order.status} label={getOrderStatusLabel(order)} /></span>
            </div>
          </div>
          {refund && <p className='order-details-refund mt-3.5 break-words text-xs leading-[1.7] text-[color:var(--pamo-color-text-secondary)]'><strong>{refund.status}.</strong> {refund.message}</p>}
          {error && <p role='alert' className='orders-error'>{error}</p>}
          {requestLabel && (
            <section aria-label='Cancellation request' className='mt-4 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3 text-sm leading-relaxed'>
              <h3 className='font-semibold'>Cancellation · {requestLabel}</h3>
              <p className='mt-2 text-xs'>Requested: {orderDate(cancellationRequest.requestedAt).date} {orderDate(cancellationRequest.requestedAt).time} · Review target: 24 hours</p>
              <p className='mt-2 whitespace-pre-wrap break-words'>{cancellationRequest.reason}</p>
              {cancellationRequest.rejectionReason && <p className='mt-2 whitespace-pre-wrap break-words'>Rejection reason: {cancellationRequest.rejectionReason}</p>}
            </section>
          )}
        </section>
        <section className='order-details-customer mt-6 border-t border-[color:var(--pamo-color-border-default)] pt-5' aria-labelledby='order-customer-heading'>
          <h3 id='order-customer-heading' className='mb-4 text-[11px] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>Customer information</h3>
          <dl className='grid gap-[18px]'>
            <div>
              <dt>Student</dt>
              <dd>{address.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{address.email || 'Email not provided'}</dd>
            </div>
            {address.academicProgram && <div><dt>Academic program</dt><dd>{academicProgramName}</dd></div>}
            {address.campusPickup ? (
              <div>
                <dt>Fulfillment</dt>
                <dd>Campus pickup</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Phone</dt>
                  <dd>{address.phone || 'Mobile number not provided'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{address.street || 'Street address not provided'}<br />{address.locality || 'City, province, country and zipcode not provided'}</dd>
                </div>
              </>
            )}
          </dl>
        </section>
        <section className='mt-6 border-t border-[color:var(--pamo-color-border-default)] pt-5' aria-labelledby='order-payment-heading'>
          <h3 id='order-payment-heading' className='mb-4 text-[11px] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>Payment information</h3>
          <dl className='grid gap-[18px] sm:grid-cols-2'>
            {demo && (
              <div className='min-w-0 sm:col-span-2'>
                <dt>Demo payment — {order.demoPayment.status}</dt>
                <dd className='break-all font-mono'>{order.demoPayment.transactionId || 'No demo transaction yet'}</dd>
                <p className='mt-2 text-xs'>Simulation only. No money charged or provider verification.</p>
              </div>
            )}
            <div className='min-w-0 sm:col-span-2'>
              <dt>{isTestPaymentReceipt(order) ? 'Test Receipt Reference' : 'Official Receipt Number'}</dt>
              <dd className='break-words font-mono'>{receiptNumber}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{order.paymentMethod}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd><OrderStatusBadge status={paymentStatus} label={paymentLabel} /></dd>
            </div>
            {paymentConfirmationDate && (
              <div className='sm:col-span-2'>
                <dt>Payment confirmation date</dt>
                <dd>{paymentConfirmationDate.date}{paymentConfirmationDate.time && `, ${paymentConfirmationDate.time}`}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className='order-details-items mt-6 border-t border-[color:var(--pamo-color-border-default)] pt-5' aria-labelledby='order-items-heading'>
          <h3 id='order-items-heading' className='mb-4 text-[11px] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>Ordered items · {items.length}</h3>
          <ul className='grid gap-2.5'>
            {items.map((item, index) => (
              <li key={`${item._id}-${item.size}-${index}`} className='flex flex-wrap items-start gap-2.5 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3'>
                <img src={item.image?.[0] || assets.parcel_icon} alt={item.name || 'Order item'} className='h-12 w-10 shrink-0 rounded object-contain' />
                <div className='min-w-[60px] flex-1 break-words'>
                  <p className='text-xs font-semibold'>{item.name}</p>
                  {item.optionLabel && <span className='mt-1 block text-xs'>Item · {item.optionLabel}</span>}
                  {!item.optionLabel && item.colorLabel && <span className='mt-1 block text-xs'>Color · {item.colorLabel}</span>}
                  <span className='mt-1.5 block text-[11px] text-[color:var(--pamo-color-text-secondary)]'>{item.size && `Size: ${item.size} · `}Qty: {item.quantity}</span>
                  <span className='mt-1.5 block text-[11px] text-[color:var(--pamo-color-text-secondary)]'>{money(item.price)} each</span>
                </div>
                <strong className='max-w-full break-words text-xs font-semibold'>{money(tryPhpLineTotal(item.price, item.quantity))}</strong>
              </li>
            ))}
          </ul>
        </section>
        <dl className='order-details-totals mt-6 grid gap-3 border-t border-[color:var(--pamo-color-border-default)] pt-[18px]'>
          <div><dt>Subtotal</dt><dd>{formatAvailableMoney(subtotal, money)}</dd></div>
          <div><dt>Processing Fee</dt><dd>{formatFee(fee, money)}</dd></div>
          <div><dt>Total</dt><dd className='font-financial [overflow-wrap:anywhere]'>{money(order.amount)}</dd></div>
        </dl>
      </div>
      <footer className='order-details-actions flex shrink-0 flex-wrap gap-2.5 border-t border-[color:var(--pamo-color-border-default)] p-4'>
        {actionContent}
      </footer>
    </aside>
  )
}

export default OrderDetails
