import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronUp, Copy } from 'lucide-react'
import OrderTimeline from './OrderTimeline'
import { formatOrderDate, getOrderPresentation, getOrderTotals, statusStyles } from '../utils/orderPresentation'
import { refundPresentation } from '../../../shared/refund.js'
import { formatOrderMoney, tryPhpLineTotal } from '../../../shared/money.js'

const OrderImage = ({ item }) => {
  const [failed, setFailed] = useState(false)
  return item.image?.[0] && !failed
    ? <img src={item.image[0]} alt={item.name || 'Ordered product'} className='order-item-image' onError={() => setFailed(true)} />
    : <div aria-hidden='true' className='order-item-image' />
}

const OrderItems = ({ items, order, showLineTotals = false }) => <ul className='order-items'>
  {items.map((item, index) => {
    const lineTotal = tryPhpLineTotal(item.price, item.quantity)
    return <li key={`${item._id}-${item.size}-${index}`}>
      <OrderImage item={item} />
      <div className='order-item-info'><p className='order-item-name'>{item.name || 'Ordered product'}</p><p>{item.size && `Size: ${item.size} · `}Qty: {item.quantity ?? 'Unavailable'}</p><p className='order-item-price'>{formatOrderMoney(item.price, order)}<span className='sr-only'> each</span></p>{showLineTotals && <p>Item total: <span className='order-item-price'>{formatOrderMoney(lineTotal, order)}</span></p>}</div>
    </li>
  })}
</ul>

const CustomerOrderDetails = ({ order, onCopy }) => {
  const { subtotal, fee } = getOrderTotals(order)
  const paidAt = order.payment === true ? formatOrderDate(order.paidAt) : null
  const method = order.paymentMethod === 'COD' ? order.payment === true && order.receiptNumber ? 'Cash (School Cashier)' : 'Pay as you claim' : order.paymentMethod
  return <div className='order-details-grid'>
    <div><h4>Order totals</h4><dl className='order-data'>
      {[['Subtotal', formatOrderMoney(subtotal, order)], ['Processing Fee', formatOrderMoney(fee, order)], ['Total', formatOrderMoney(order.amount, order)]].map(([label, value]) => <div key={label} className={label === 'Total' ? 'order-grand-total' : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl></div>
    <div><h4>Payment details</h4><dl className='order-data'>
      <div><dt>Payment Status</dt><dd className={order.payment === true ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{order.payment === true ? 'Paid' : 'Pending'}</dd></div>
      {method && <div><dt>Payment Method</dt><dd>{method}</dd></div>}
      {order.payment === true && order.receiptNumber && <div className='order-receipt'><dt>Official Receipt Number</dt><dd><span>{order.receiptNumber}</span><button type='button' onClick={() => onCopy(order.receiptNumber, 'Receipt number')} className='order-copy' aria-label='Copy official receipt number'><Copy size={14} aria-hidden='true' />Copy</button></dd></div>}
      {paidAt && <div><dt>Paid At</dt><dd>{paidAt}</dd></div>}
    </dl></div>
    {(order.items?.length || 0) > 2 && <div className='order-all-items'><h4>All ordered items</h4><OrderItems items={order.items} order={order} showLineTotals /></div>}
  </div>
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
  const toggleDetails = () => { focusAfterRender.current = 'details'; setExpanded(current => !current) }
  const toggleTracking = () => { focusAfterRender.current = 'tracking'; setTrackingExpanded(current => !current) }
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
  const detailsId = `order-details-${order._id}`
  const timelineId = `order-progress-${order._id}`
  const isTrackingOpen = trackingExpanded && order.status !== 'Cancelled'
  return <article className={'order-card' + (expanded || isTrackingOpen ? ' is-expanded' : '')} aria-label={'Order ' + order._id}>
    <div className='order-card-header'>
      <div className='order-reference'><p className='orders-eyebrow'>Order reference</p><div><h2>{order._id}</h2><button type='button' className='order-copy' onClick={() => copyValue(order._id, 'Order ID')} aria-label={'Copy order ID ' + order._id}><Copy size={14} aria-hidden='true' />Copy ID</button></div><p className='order-placed'>{placedAt ? 'Placed on ' + placedAt : 'Placement date unavailable'}</p></div>
      <div className='order-summary'><div><p className='order-total-label'>Total</p><p className='order-total'>{formatOrderMoney(order.amount, order)}</p></div><span className={'order-status ' + statusStyles[presentation.tone]}><span aria-hidden='true' />{presentation.label}</span></div>
    </div>
    <p className='order-copy-feedback' role='status'>{copyFeedback}</p>
    {refund && <p className='order-panel-note'><strong>{refund.status}.</strong> {refund.message}</p>}
    {(expanded || isTrackingOpen) && <div className='order-current-stage'><span>Current stage</span><strong>{order.status === 'Cancelled' ? presentation.label : order.status || 'Status unavailable'}</strong></div>}
    <div className='order-preview'><OrderItems items={items.slice(0, 2)} order={order} showLineTotals={expanded && items.length <= 2} />{items.length > 2 && !expanded && <button type='button' className='order-more' onClick={toggleDetails} aria-expanded='false' aria-controls={detailsId}>+{items.length - 2} more {items.length - 2 === 1 ? 'item' : 'items'}</button>}{!items.length && <p>Item details unavailable.</p>}</div>
    {isTrackingOpen && <section className='order-panel' id={timelineId} aria-labelledby={`${timelineId}-heading`}><div className='order-panel-heading'><div><h3 id={`${timelineId}-heading`}>Order tracking</h3><p>Follow the progress of your school essentials.</p></div><button ref={trackingButton} type='button' className='btn-secondary orders-action' onClick={toggleTracking} aria-expanded='true' aria-controls={timelineId}>Hide Tracking<ChevronUp size={14} aria-hidden='true' /></button></div><OrderTimeline order={order} /><p className='order-panel-note'>Dates are shown only for recorded events.</p></section>}
    {expanded && <section className='order-panel' id={detailsId} aria-labelledby={`${detailsId}-heading`}><div className='order-panel-heading'><div><h3 id={`${detailsId}-heading`}>Order details</h3><p>Your purchased items, totals, and payment information.</p></div><button ref={detailsButton} type='button' className='btn-secondary orders-action' onClick={toggleDetails} aria-expanded='true' aria-controls={detailsId}>Hide Details<ChevronUp size={14} aria-hidden='true' /></button></div><CustomerOrderDetails order={order} onCopy={copyValue} /></section>}
    <div className='order-card-actions'>
      {!expanded && <button ref={detailsButton} type='button' className='btn-secondary orders-action' onClick={toggleDetails} aria-expanded='false' aria-controls={detailsId}>View Details</button>}
      {order.status === 'Order Placed' && <button type='button' className='btn-secondary orders-action orders-danger' disabled={cancellationPending} onClick={() => onCancel(order)}>Cancel Order</button>}
      {order.status !== 'Cancelled' && !isTrackingOpen && <button ref={trackingButton} type='button' className='btn-secondary orders-action order-track-action' onClick={toggleTracking} aria-expanded='false' aria-controls={timelineId}>Track Order<ArrowRight size={14} aria-hidden='true' /></button>}
    </div>
    {order.status !== 'Cancelled' && <p className='order-cancel-note'>{order.status === 'Order Placed' ? 'You can cancel this order before it is approved.' : 'Only orders awaiting approval can be cancelled.'}</p>}
  </article>
}

export default CustomerOrderCard
