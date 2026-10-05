import React from 'react'
import { assets } from '../assets/assets'
import { actionLabels, money, orderDate, orderName, statusColors } from '../utils/orderPresentation'

export const OrderStatusBadge = ({ status }) => <span className={'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium leading-4 ' + (statusColors[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}><span aria-hidden='true' className='h-1.5 w-1.5 shrink-0 rounded-full bg-current'/>{status || 'Unknown'}</span>

const OrderDetails = ({ order, currency, pending, onAction, onClose }) => {
  if (!order) return <aside className='rounded-xl border border-slate-200 bg-white p-6 text-center text-sm dark:border-slate-800 dark:bg-slate-900/60'><h2 className='font-semibold text-slate-900 dark:text-slate-100'>Order Details</h2><p className='mt-3 text-slate-500 dark:text-slate-400'>Select View on an order to see its details.</p></aside>

  const items = order.items || []
  const address = order.address || {}
  const date = orderDate(order.date)
  const hasSubtotal = items.length > 0 && items.every(item => Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.quantity)))
  const subtotal = hasSubtotal ? items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) : null
  // Orders store historical item prices and the final amount, not a separate fee.
  const fee = hasSubtotal && Number.isFinite(Number(order.amount)) ? Math.round((Number(order.amount) - subtotal) * 100) / 100 : null
  const actions = (order.allowedStatuses || []).filter(status => actionLabels[status])

  return (
    <aside id='order-details' aria-label='Order Details' tabIndex={-1} className='min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm focus:outline-none sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'>
      <div className='flex flex-wrap items-center justify-between gap-3'><h2 className='border-l-4 border-amber-400 pl-3 text-lg font-semibold text-slate-900 dark:text-slate-100'>Order Details</h2><button type='button' onClick={onClose} className='min-h-9 rounded px-2 text-xs hover:bg-slate-100 focus-visible:outline-amber-500 dark:hover:bg-slate-800' aria-label='Close order details'>Close</button></div>
      <p className='mt-4 break-all text-sm font-semibold text-slate-900 dark:text-slate-100'>#{order._id}</p>
      <p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{date.date}{date.time && `, ${date.time}`}</p>
      <div className='mt-3 flex flex-wrap gap-2'><OrderStatusBadge status={order.status}/><OrderStatusBadge status={order.payment ? 'Paid' : 'Pending'}/></div>
      <div className='my-5 space-y-2 break-words text-xs leading-5'>
        <p className='text-sm font-semibold text-slate-900 dark:text-slate-100'>{orderName(order)}</p>
        {address.email && <p>{address.email}</p>}
        {address.phone && <p>{address.phone}</p>}
        {address.street && <p>{address.street}</p>}
        <p>{[address.city, address.state, address.country, address.zipcode].filter(Boolean).join(', ')}</p>
        <p>Payment method: <span className='font-medium text-slate-900 dark:text-slate-200'>{order.paymentMethod}</span></p>
      </div>
      <div className='border-t border-slate-200 pt-4 dark:border-slate-800'>
        <h3 className='mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100'>Items</h3>
        <ul className='max-h-80 space-y-2 overflow-y-auto'>
          {items.map((item,index)=><li key={`${item._id}-${item.size}-${index}`} className='flex items-start gap-3 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50'><img src={item.image?.[0] || assets.parcel_icon} alt={item.name || 'Order item'} className='h-12 w-10 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-700'/><div className='min-w-0 flex-1'><p className='break-words text-xs font-medium text-slate-900 dark:text-slate-100'>{item.name}</p><p className='mt-1 text-xs text-slate-500 dark:text-slate-400'>{item.size && `Size: ${item.size} · `}Qty: {item.quantity}</p><p className='mt-1 text-xs'>{money(item.price,currency)} each</p></div><p className='shrink-0 text-xs font-semibold text-slate-900 dark:text-slate-100'>{money(item.price * item.quantity,currency)}</p></li>)}
        </ul>
      </div>
      <dl className='mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'>
        <div className='flex justify-between gap-3'><dt>Subtotal</dt><dd className='font-medium text-slate-900 dark:text-slate-100'>{subtotal === null ? 'Unavailable' : money(subtotal,currency)}</dd></div>
        <div className='flex justify-between gap-3'><dt>Processing Fee</dt><dd className='font-medium text-slate-900 dark:text-slate-100'>{fee === null || fee < 0 ? 'Unavailable' : money(fee,currency)}</dd></div>
        <div className='flex justify-between gap-3 text-sm font-semibold text-slate-900 dark:text-slate-100'><dt>Total</dt><dd>{money(order.amount,currency)}</dd></div>
      </dl>
      {actions.length > 0 ? <div className='mt-5 flex flex-wrap gap-2'>{[...actions].sort((a,b)=>(a === 'Cancelled' ? -1 : b === 'Cancelled' ? 1 : 0)).map(status=><button key={status} type='button' disabled={pending} onClick={()=>onAction(order,status)} className={'min-h-10 flex-1 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-wait disabled:opacity-50 ' + (status === 'Cancelled' ? 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10' : 'bg-amber-400 text-slate-950 hover:bg-amber-500')}>{pending ? 'Updating…' : actionLabels[status]}</button>)}</div> : <p className='mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 dark:bg-slate-800/50'>{['Claimed','Cancelled'].includes(order.status) ? 'No further order actions are available.' : order.payment ? 'No action is available for this order status.' : 'Awaiting payment confirmation from the payment or cashier workflow.'}</p>}
    </aside>
  )
}

export default OrderDetails
