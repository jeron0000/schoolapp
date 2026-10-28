import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronUp, Copy } from 'lucide-react'
import { formatOrderMoney, tryPhpLineTotal } from '../../../shared/money.js'
import { refundPresentation } from '../../../shared/refund.js'
import { getCancellationMode, getCancellationRequestLabel, isPaidOnlineOrder, ONLINE_CANCELLATION_POLICY } from '../../../shared/orderCancellation.js'
import { formatOrderDate, getOrderPresentation, getOrderTotals, statusStyles } from '../utils/orderPresentation'
import OrderTimeline from './OrderTimeline'
import { isDemoOrder } from '../../../shared/demoPayment.js'
import { isTestPaymentReceipt, receiptDisplayValue } from '../../../shared/paymentReceipt.js'

const eyebrowClassName =
  'text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.09em] text-[color:var(--pamo-color-text-secondary)]'
const orderImageClassName = [
  'h-[76px] w-16 flex-[0_0_64px] rounded-md border object-contain',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)]',
  'md:h-[88px] md:w-[76px] md:flex-basis-[76px]',
].join(' ')
const actionClassName = [
  'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-[7px] border px-4 py-2.5',
  'text-[13px] font-semibold leading-5 disabled:cursor-not-allowed disabled:opacity-[0.55]',
].join(' ')
const secondaryActionClassName = [
  'btn-secondary',
  actionClassName,
  'border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]',
  'text-[color:var(--pamo-color-text-primary)]',
  'hover:bg-[var(--pamo-color-surface-subtle)]',
  'dark:border-[color:var(--pamo-color-border-input)] dark:bg-[var(--pamo-color-surface-default)]',
  'dark:text-[color:var(--pamo-color-text-primary)] dark:hover:bg-[var(--pamo-color-surface-subtle)]',
].join(' ')
const dangerActionClassName = [
  secondaryActionClassName,
  'border-[color:var(--pamo-color-error-text)] text-[color:var(--pamo-color-error-text)]',
  'hover:bg-[var(--pamo-color-error-surface)] dark:border-[color:var(--pamo-color-error-text)]',
  'dark:text-[color:var(--pamo-color-error-text)] dark:hover:bg-[var(--pamo-color-error-surface)]',
].join(' ')
const copyButtonClassName = [
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md p-2',
  'text-xs font-medium text-[color:var(--pamo-color-text-secondary)]',
  'hover:bg-[var(--pamo-color-surface-subtle)] hover:text-[color:var(--pamo-color-text-primary)]',
].join(' ')
const panelClassName =
  'mt-6 min-w-0 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-4 md:p-5'

const OrderImage = ({ item }) => {
  const [failed, setFailed] = useState(false)
  const image = item.image?.[0]

  if (!image || failed) {
    return <div aria-hidden='true' className={orderImageClassName} />
  }

  return (
    <img
      src={image}
      alt={item.name || 'Ordered product'}
      className={orderImageClassName}
      onError={() => setFailed(true)}
    />
  )
}

const OrderItems = ({ items, order, showLineTotals = false }) => (
  <ul className='grid min-w-0 gap-5 md:grid-cols-2 md:gap-6'>
    {items.map((item, index) => {
      const lineTotal = tryPhpLineTotal(item.price, item.quantity)
      const quantityLabel = item.size
        ? `Size: ${item.size} · Qty: ${item.quantity ?? 'Unavailable'}`
        : `Qty: ${item.quantity ?? 'Unavailable'}`

      return (
        <li className='flex min-w-0 items-start gap-3.5' key={`${item._id}-${item.size}-${index}`}>
          <OrderImage item={item} />
          <div className='min-w-0 [overflow-wrap:anywhere] text-xs leading-[1.7] text-[color:var(--pamo-color-text-secondary)]'>
            <p className='mb-[3px] text-sm font-semibold text-[color:var(--pamo-color-text-primary)]'>{item.name || 'Ordered product'}</p>
            <p>{quantityLabel}</p>
            {item.optionLabel && <p>Item · {item.optionLabel}</p>}
            {!item.optionLabel && item.colorLabel && <p>Color · {item.colorLabel}</p>}
            <p className='font-semibold text-[color:var(--pamo-color-text-primary)]'>
              {formatOrderMoney(item.price, order)}
              <span className='sr-only'> each</span>
            </p>
            {showLineTotals && (
              <p>
                Item total: <span className='font-semibold text-[color:var(--pamo-color-text-primary)]'>{formatOrderMoney(lineTotal, order)}</span>
              </p>
            )}
          </div>
        </li>
      )
    })}
  </ul>
)

const getPaymentMethod = order => {
  if (order.paymentMethod !== 'COD') {
    return order.paymentMethod
  }
  if (order.payment === true && order.receiptNumber) {
    return 'Cash (School Cashier)'
  }
  return 'Pay as you claim'
}

const CustomerOrderDetails = ({ order, onCopy }) => {
  const { subtotal, fee } = getOrderTotals(order)
  const paid = order.payment === true
  const paidAt = paid ? formatOrderDate(order.paidAt) : null
  const method = getPaymentMethod(order)
  let paymentLabel = paid ? 'Paid' : 'Pending'
  if (isDemoOrder(order)) paymentLabel += ' (DEMO)'
  const paymentStatusClass = paid
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-amber-700 dark:text-amber-300'
  const totalRows = [
    ['Subtotal', formatOrderMoney(subtotal, order)],
    ['Processing Fee', formatOrderMoney(fee, order)],
    ['Total', formatOrderMoney(order.amount, order)],
  ]

  return (
    <div className='grid min-w-0 gap-7 md:grid-cols-2 md:gap-8'>
      <div>
        <h4 className='mb-4 text-sm font-semibold'>Order totals</h4>
        <dl className='grid gap-3 text-[13px]'>
          {totalRows.map(([label, value]) => (
            <div key={label} className={`flex min-w-0 items-baseline justify-between gap-3.5 ${label === 'Total' ? 'mt-1 border-t border-[color:var(--pamo-color-border-input)] pt-4 text-lg' : ''}`}>
              <dt className='text-[color:var(--pamo-color-text-secondary)]'>{label}</dt>
              <dd className={`max-w-[60%] min-w-0 text-right [overflow-wrap:anywhere] ${label === 'Total' ? 'font-semibold' : 'font-medium'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h4 className='mb-4 text-sm font-semibold'>Payment details</h4>
        <dl className='grid gap-3 text-[13px] [&>div]:flex [&>div]:min-w-0 [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-3.5 [&_dt]:text-[color:var(--pamo-color-text-secondary)] [&_dd]:max-w-[60%] [&_dd]:min-w-0 [&_dd]:text-right [&_dd]:font-medium [&_dd]:[overflow-wrap:anywhere]'>
          <div>
            <dt>Payment Status</dt>
            <dd className={paymentStatusClass}>{paymentLabel}</dd>
          </div>
          {method && (
            <div>
              <dt>Payment Method</dt>
              <dd>{method}</dd>
            </div>
          )}
          {paid && (order.receiptNumber || isPaidOnlineOrder(order)) && (
            <div className='!block'>
              <dt>{isTestPaymentReceipt(order) ? 'Test Receipt Reference' : 'Official Receipt Number'}</dt>
              <dd className='mt-1 !flex !max-w-full flex-wrap !items-center gap-x-3 gap-y-1 !text-left'>
                <span className='min-w-0 font-mono text-[0.95em] [overflow-wrap:anywhere]'>{receiptDisplayValue(order)}</span>
                {order.receiptNumber && <button
                  type='button'
                  onClick={() => onCopy(order.receiptNumber, 'Receipt number')}
                  className={copyButtonClassName}
                  aria-label={isTestPaymentReceipt(order) ? 'Copy test receipt reference' : 'Copy official receipt number'}
                >
                  <Copy size={14} aria-hidden='true' />
                  Copy
                </button>}
              </dd>
            </div>
          )}
          {paidAt && (
            <div>
              <dt>Paid At</dt>
              <dd>{paidAt}</dd>
            </div>
          )}
        </dl>
      </div>
      {(order.items?.length || 0) > 2 && (
        <div className='md:col-span-full'>
          <h4 className='mb-4 text-sm font-semibold'>All ordered items</h4>
          <OrderItems items={order.items} order={order} showLineTotals />
        </div>
      )}
    </div>
  )
}

const CustomerOrderCard = ({ order, onCancel, cancellationPending }) => {
  const [expanded, setExpanded] = useState(false)
  const [trackingExpanded, setTrackingExpanded] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState('')
  const copyPending = useRef(false)
  const detailsButton = useRef(null)
  const trackingButton = useRef(null)
  const focusAfterRender = useRef(null)

  // Disclosure controls move into their panel headers when expanded.
  useEffect(() => {
    const target = focusAfterRender.current
    if (target === 'details') detailsButton.current?.focus()
    if (target === 'tracking') trackingButton.current?.focus()
    focusAfterRender.current = null
  }, [expanded, trackingExpanded])

  const toggleDetails = () => {
    focusAfterRender.current = 'details'
    setExpanded(current => !current)
  }
  const toggleTracking = () => {
    focusAfterRender.current = 'tracking'
    setTrackingExpanded(current => !current)
  }
  const copyValue = async (value, label) => {
    if (copyPending.current) return
    copyPending.current = true
    setCopyFeedback('')
    try {
      await navigator.clipboard.writeText(String(value))
      setCopyFeedback(`${label} copied.`)
    } catch {
      setCopyFeedback(`Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`)
    } finally {
      copyPending.current = false
    }
  }

  const presentation = getOrderPresentation(order)
  const refund = order.refundSummary || refundPresentation(order)
  const items = order.items || []
  const placedAt = formatOrderDate(order.date)
  const placedLabel = placedAt ? `Placed on ${placedAt}` : 'Placement date unavailable'
  const detailsId = `order-details-${order._id}`
  const timelineId = `order-progress-${order._id}`
  const isCancelled = order.status === 'Cancelled'
  const isTrackingOpen = trackingExpanded && !isCancelled
  const cardClass = [
    'min-w-0 rounded-[10px] border border-[color:var(--pamo-color-border-default)]',
    'bg-[var(--pamo-color-surface-default)] px-4 py-5 md:p-6',
    expanded || isTrackingOpen ? 'shadow-[inset_3px_0_0_var(--pamo-color-brand-yellow)]' : '',
  ].join(' ')
  const currentStage = isCancelled ? presentation.label : order.status || 'Status unavailable'
  const cancellationMode = order.cancellationMode === undefined ? getCancellationMode(order) : order.cancellationMode
  const paidOnline = isPaidOnlineOrder(order)
  const canCancel = !paidOnline && Boolean(cancellationMode)
  const cancellationRequest = order.cancellationRequest
  const requestLabel = getCancellationRequestLabel(cancellationRequest)
  let cancelNote = 'Contact PAMO if you need help with this order.'
  if (cancellationMode === 'immediate') cancelNote = 'You can cancel this unpaid order before it is approved.'
  if (cancellationMode === 'request') cancelNote = 'Cancellation requires PAMO review. Stock remains reserved until approval.'
  if (cancellationRequest?.status === 'pending') cancelNote = 'Fulfillment is on hold while PAMO reviews your cancellation request.'
  const hiddenItemCount = items.length - 2
  const hiddenItemLabel = hiddenItemCount === 1 ? 'item' : 'items'

  return (
    <article className={cardClass} aria-label={'Order ' + order._id}>
      <div className='flex flex-col gap-5 md:flex-row md:justify-between md:gap-6'>
        <div className='min-w-0 md:flex-1'>
          <p className={eyebrowClassName}>Order reference</p>
          <div className='mt-1.5 flex flex-wrap items-center gap-x-3'>
            <h2 className='min-w-0 font-mono text-sm font-semibold leading-[1.5] [overflow-wrap:anywhere] md:text-base'>{order._id}</h2>
            <button
              type='button'
              className={copyButtonClassName}
              onClick={() => copyValue(order._id, 'Order ID')}
              aria-label={'Copy order ID ' + order._id}
            >
              <Copy size={14} aria-hidden='true' />
              Copy ID
            </button>
          </div>
          <p className='text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>{placedLabel}</p>
        </div>
        <div className='flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 md:max-w-[35%] md:flex-col md:items-end md:justify-start md:gap-2.5 md:text-right min-[1180px]:flex-row min-[1180px]:items-center min-[1180px]:gap-8'>
          <div>
            <p className='text-[11px] text-[color:var(--pamo-color-text-secondary)]'>Total</p>
            <p className='font-financial text-[20px] font-semibold leading-[1.5] [overflow-wrap:anywhere] md:text-[22px]'>{formatOrderMoney(order.amount, order)}</p>
          </div>
          <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold leading-[1.5] ${statusStyles[presentation.tone]}`}>
            <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-current' aria-hidden='true' />
            {presentation.label}
          </span>
        </div>
      </div>

      <p className='mt-2 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)] empty:hidden' role='status'>{copyFeedback}</p>
      {isDemoOrder(order) && (
        <section aria-label='Demo payment information' className='mt-4 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3.5 text-sm leading-relaxed'>
          <p className='font-semibold'>{order.paymentMethod} · {order.demoPayment.status}</p>
          <p>No real money was charged. No provider verification or official receipt.</p>
          {order.demoPayment.transactionId && <p className='mt-2 break-all font-mono text-xs'>Demo transaction: {order.demoPayment.transactionId}</p>}
          {order.demoPayment.status === 'pending' && order.status === 'Order Placed' && (
            <Link to={'/demo-payment/' + order._id} className={`${secondaryActionClassName} mt-3`}>Continue demo payment</Link>
          )}
        </section>
      )}
      {paidOnline && !isCancelled && (
        <section aria-label={ONLINE_CANCELLATION_POLICY.title} className='mt-4 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3.5 text-sm leading-relaxed'>
          <h3 className='font-semibold'>{ONLINE_CANCELLATION_POLICY.title}</h3>
          <p className='mt-2 text-[color:var(--pamo-color-text-secondary)]'>{ONLINE_CANCELLATION_POLICY.message}</p>
          <p className='mt-2 text-[color:var(--pamo-color-text-secondary)]'>{ONLINE_CANCELLATION_POLICY.support}</p>
          <Link to='/contact' className={`${secondaryActionClassName} mt-3`}>Contact Support<ArrowRight size={14} aria-hidden='true' /></Link>
        </section>
      )}
      {requestLabel && (
        <section aria-label='Cancellation request' className='mt-4 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3.5 text-sm leading-relaxed'>
          <p className='font-semibold'>Cancellation · {requestLabel}</p>
          <p className='mt-1 text-xs text-[color:var(--pamo-color-text-secondary)]'>Requested: {formatOrderDate(cancellationRequest.requestedAt)}</p>
          <p className='mt-2 whitespace-pre-wrap break-words'>Reason: {cancellationRequest.reason}</p>
          {cancellationRequest.rejectionReason && <p className='mt-2 whitespace-pre-wrap break-words'>PAMO reason: {cancellationRequest.rejectionReason}</p>}
        </section>
      )}
      {refund && (
        <p className='mt-5 text-[11px] text-[color:var(--pamo-color-text-secondary)]'>
          <strong>{refund.status}.</strong> {refund.message}
        </p>
      )}
      {(expanded || isTrackingOpen) && (
        <div className='mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-xs'>
          <span className='text-[color:var(--pamo-color-text-secondary)]'>Current stage</span>
          <strong className='font-semibold text-[color:var(--pamo-color-accent-text)]'>{currentStage}</strong>
        </div>
      )}

      <div className='mt-5 rounded-md bg-[var(--pamo-color-surface-subtle)] p-3 text-[13px] text-[color:var(--pamo-color-text-secondary)]'>
        <OrderItems items={items.slice(0, 2)} order={order} showLineTotals={expanded && items.length <= 2} />
        {items.length > 2 && !expanded && (
          <button type='button' className='mt-2 min-h-11 p-2 underline underline-offset-4' onClick={toggleDetails} aria-expanded='false' aria-controls={detailsId}>
            +{hiddenItemCount} more {hiddenItemLabel}
          </button>
        )}
        {!items.length && <p>Item details unavailable.</p>}
      </div>

      {isTrackingOpen && (
        <section className={panelClassName} id={timelineId} aria-labelledby={`${timelineId}-heading`}>
          <div className='mb-6 flex flex-wrap items-start justify-between gap-4 max-[374px]:[&>button]:w-full'>
            <div className='min-w-0'>
              <h3 className='text-base font-semibold' id={`${timelineId}-heading`}>Order tracking</h3>
              <p className='mt-1 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>Follow the progress of your school essentials.</p>
            </div>
            <button ref={trackingButton} type='button' className={secondaryActionClassName} onClick={toggleTracking} aria-expanded='true' aria-controls={timelineId}>
              Hide Tracking
              <ChevronUp size={14} aria-hidden='true' />
            </button>
          </div>
          <OrderTimeline order={order} />
          <p className='mt-5 text-[11px] text-[color:var(--pamo-color-text-secondary)]'>Dates are shown only for recorded events.</p>
        </section>
      )}

      {expanded && (
        <section className={panelClassName} id={detailsId} aria-labelledby={`${detailsId}-heading`}>
          <div className='mb-6 flex flex-wrap items-start justify-between gap-4 max-[374px]:[&>button]:w-full'>
            <div className='min-w-0'>
              <h3 className='text-base font-semibold' id={`${detailsId}-heading`}>Order details</h3>
              <p className='mt-1 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>Your purchased items, totals, and payment information.</p>
            </div>
            <button ref={detailsButton} type='button' className={secondaryActionClassName} onClick={toggleDetails} aria-expanded='true' aria-controls={detailsId}>
              Hide Details
              <ChevronUp size={14} aria-hidden='true' />
            </button>
          </div>
          <CustomerOrderDetails order={order} onCopy={copyValue} />
        </section>
      )}

      <div className='mt-6 flex flex-wrap gap-3 empty:hidden'>
        {!expanded && (
          <button ref={detailsButton} type='button' className={`${secondaryActionClassName} max-[374px]:w-full`} onClick={toggleDetails} aria-expanded='false' aria-controls={detailsId}>
            View Details
          </button>
        )}
        {canCancel && (
          <button type='button' className={`${dangerActionClassName} max-[374px]:w-full`} disabled={cancellationPending} onClick={() => onCancel(order)}>
            {cancellationMode === 'request' ? 'Request Cancellation' : 'Cancel Order'}
          </button>
        )}
        {!isCancelled && !isTrackingOpen && (
          <button ref={trackingButton} type='button' className={`${secondaryActionClassName} ml-auto max-[374px]:ml-0 max-[374px]:w-full`} onClick={toggleTracking} aria-expanded='false' aria-controls={timelineId}>
            Track Order
            <ArrowRight size={14} aria-hidden='true' />
          </button>
        )}
      </div>
      {!isCancelled && !paidOnline && <p className='mt-4 text-[11px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>{cancelNote}</p>}
    </article>
  )
}

export default CustomerOrderCard
