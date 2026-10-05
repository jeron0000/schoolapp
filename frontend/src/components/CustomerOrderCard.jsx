import React, { useState } from 'react'
import OrderTimeline from './OrderTimeline'
import { formatMoney, formatOrderDate, getOrderPresentation, getOrderTotals, statusStyles } from '../utils/orderPresentation'

const OrderItems = ({ items, currency }) => <ul className='grid min-w-0 gap-4 sm:grid-cols-2'>
  {items.map((item, index) => <li key={`${item._id}-${item.size}-${index}`} className='flex min-w-0 items-start gap-3'>
    {item.image?.[0] ? <img src={item.image[0]} alt={item.name || 'Ordered product'} className='h-16 w-16 shrink-0 rounded-lg bg-slate-100 object-contain dark:bg-slate-800'/> : <div aria-hidden='true' className='h-16 w-16 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800'/>}
    <div className='min-w-0 text-xs leading-5'><p className='break-words font-semibold text-slate-900 dark:text-slate-100'>{item.name || 'Ordered product'}</p><p className='text-slate-600 dark:text-slate-400'>{item.size && `Size: ${item.size} · `}Qty: {item.quantity}</p><p className='font-semibold text-slate-900 dark:text-slate-100'>{formatMoney(item.price, currency)}<span className='sr-only'> each</span></p></div>
  </li>)}
</ul>

const CustomerOrderDetails = ({ order, currency, id }) => {
  const { subtotal, fee } = getOrderTotals(order)
  const paidAt = order.payment === true ? formatOrderDate(order.paidAt) : null
  const method = order.paymentMethod === 'COD' ? order.payment === true && order.receiptNumber ? 'Cash (School Cashier)' : 'Pay as you claim' : order.paymentMethod
  return <div id={id} className='mt-5 grid min-w-0 gap-5 border-t border-slate-200 pt-5 text-xs dark:border-slate-800 md:grid-cols-2'>
    <div><h3 className='mb-3 text-sm font-semibold'>Order totals</h3><dl className='space-y-2'>
      {[['Subtotal', formatMoney(subtotal, currency)], ['Processing Fee', formatMoney(fee, currency)], ['Total', formatMoney(order.amount, currency)]].map(([label, value]) => <div key={label} className='flex justify-between gap-3'><dt className='text-slate-500 dark:text-slate-400'>{label}</dt><dd className='font-medium text-slate-900 dark:text-slate-100'>{value}</dd></div>)}
    </dl></div>
    <div><h3 className='mb-3 text-sm font-semibold'>Payment details</h3><dl className='space-y-2'>
      <div className='flex justify-between gap-3'><dt className='text-slate-500 dark:text-slate-400'>Payment Status</dt><dd className={'font-semibold ' + (order.payment === true ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>{order.payment === true ? 'Paid' : 'Pending'}</dd></div>
      {method && <div className='flex justify-between gap-3'><dt className='text-slate-500 dark:text-slate-400'>Payment Method</dt><dd className='max-w-[60%] break-words text-right font-medium text-slate-900 dark:text-slate-100'>{method}</dd></div>}
      {order.payment === true && order.receiptNumber && <div><dt className='text-slate-500 dark:text-slate-400'>Official Receipt Number</dt><dd className='mt-1 break-all font-medium text-slate-900 dark:text-slate-100'>{order.receiptNumber}</dd></div>}
      {paidAt && <div><dt className='text-slate-500 dark:text-slate-400'>Paid At</dt><dd className='mt-1 text-slate-900 dark:text-slate-100'>{paidAt}</dd></div>}
    </dl></div>
    {(order.items?.length || 0) > 2 && <div className='md:col-span-2'><h3 className='mb-3 text-sm font-semibold'>All ordered items</h3><OrderItems items={order.items} currency={currency}/></div>}
  </div>
}

const CustomerOrderCard = ({ order, currency }) => {
  const [expanded, setExpanded] = useState(false)
  const [trackingExpanded, setTrackingExpanded] = useState(false)
  const presentation = getOrderPresentation(order)
  const items = order.items || []
  const placedAt = formatOrderDate(order.date)
  const detailsId = `order-details-${order._id}`
  const timelineId = `order-progress-${order._id}`
  return (
    <article className='min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900/60' aria-label={'Order ' + order._id}>
      <div className='flex flex-col justify-between gap-3 sm:flex-row sm:items-start'>
        <div className='flex min-w-0 items-start gap-3'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinejoin='round' className='mt-0.5 h-6 w-6 shrink-0 text-slate-700 dark:text-slate-300'><path d='m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10M7.5 4.5l9 5'/></svg><div className='min-w-0'><h2 className='break-all text-sm font-semibold'>Order #{order._id}</h2><p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{placedAt ? 'Placed on ' + placedAt : 'Placement date unavailable'}</p></div></div>
        <div className='flex shrink-0 items-center justify-between gap-5 sm:justify-end'><div><p className='text-[11px] text-slate-500 dark:text-slate-400'>Total</p><p className='text-sm font-bold text-slate-900 dark:text-slate-100'>{formatMoney(order.amount, currency)}</p></div><span className={'inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold ' + statusStyles[presentation.tone]}><span aria-hidden='true' className='h-1.5 w-1.5 shrink-0 rounded-full bg-current'/>{presentation.label}</span></div>
      </div>
      <div className='mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50'><OrderItems items={items.slice(0, 2)} currency={currency}/>{items.length > 2 && <button type='button' onClick={() => setExpanded(true)} aria-controls={detailsId} className='mt-2 min-h-11 text-xs font-medium text-slate-600 underline underline-offset-4 dark:text-slate-300'>+{items.length - 2} more {items.length - 2 === 1 ? 'item' : 'items'}</button>}{!items.length && <p className='text-xs text-slate-500 dark:text-slate-400'>Item details unavailable.</p>}</div>
      {trackingExpanded && <OrderTimeline order={order} id={timelineId}/>}
      <div className='mt-5 flex flex-col justify-between gap-3 min-[375px]:flex-row'><button type='button' aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(current => !current)} className='inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800'>{expanded ? 'Hide Details' : 'View Details'}</button><button type='button' onClick={() => setTrackingExpanded(current => !current)} aria-expanded={trackingExpanded} aria-controls={timelineId} className='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-500'>{trackingExpanded ? 'Hide Tracking' : 'Track Order'}<svg aria-hidden='true' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' className={'h-3.5 w-3.5' + (trackingExpanded ? ' -rotate-90' : '')}><path d='M3 8h10m-4-4 4 4-4 4'/></svg></button></div>
      {expanded && <CustomerOrderDetails order={order} currency={currency} id={detailsId}/>}
    </article>
  )
}

export default CustomerOrderCard
