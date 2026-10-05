import React, { useState } from 'react'
import { assets } from '../assets/assets'
import { OrderStatusBadge } from './OrderDetails'
import { money, orderDate, orderName } from '../utils/orderPresentation'

const PaymentDetails = ({ order, currency, pending, onConfirm, onClose }) => {
  const [receipt, setReceipt] = useState('')
  const [method, setMethod] = useState('COD')
  if (!order) return <aside className='rounded-xl border border-slate-200 bg-white p-6 text-center text-sm dark:border-slate-800 dark:bg-slate-900/60'><h2 className='font-semibold text-slate-900 dark:text-slate-100'>Payment Details</h2><p className='mt-3'>Select View to review an order and its payment.</p></aside>

  const items = order.items || []
  const sent = orderDate(order.sentToCashierAt)
  const paid = orderDate(order.paidAt)
  const hasSubtotal = items.length > 0 && items.every(item => Number.isFinite(Number(item.price)) && Number.isFinite(Number(item.quantity)))
  const subtotal = hasSubtotal ? items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) : null
  const fee = hasSubtotal && Number.isFinite(Number(order.amount)) ? Math.round((Number(order.amount) - subtotal) * 100) / 100 : null
  const canPay = order.status === 'Sent to Cashier' && order.payment === false && order.paymentMethod === 'COD' && Number(order.amount) > 0
  const inputClass = 'mt-2 min-h-11 min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 2xl:text-xs focus:outline focus:outline-2 focus:outline-amber-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

  return (
    <aside id='payment-details' aria-label='Payment Details' tabIndex={-1} className='min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm focus:outline-none sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'>
      <div className='flex items-center justify-between gap-2'><h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>Payment Details</h2><button type='button' disabled={pending} onClick={onClose} className='min-h-9 rounded px-2 text-xs hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800'>Close</button></div>
      <p className='mt-3 break-all text-sm font-semibold text-slate-900 dark:text-slate-100'>#{order._id}</p>
      <p className='mt-1 text-[11px]'>Sent to Cashier: {sent.date}{sent.time && `, ${sent.time}`}</p>
      <div className='mt-3 flex flex-wrap gap-2'><OrderStatusBadge status={order.payment ? 'Paid' : 'Pending'}/><OrderStatusBadge status={order.status}/></div>
      <div className='my-3 space-y-1 break-words text-xs leading-5'><p className='font-semibold text-slate-900 dark:text-slate-100'>{orderName(order)}</p>{order.address?.email && <p>{order.address.email}</p>}{order.address?.phone && <p>{order.address.phone}</p>}</div>
      <div className='border-t border-slate-200 pt-4 dark:border-slate-800'>
        <h3 className='mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100'>Items ({items.length})</h3>
        <ul className='max-h-56 space-y-3 overflow-y-auto'>{items.map((item, index) => <li key={`${item._id}-${item.size}-${index}`} className='flex items-start gap-2'><img src={item.image?.[0] || assets.parcel_icon} alt={item.name} className='h-12 w-10 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-800'/><div className='min-w-0 flex-1 text-xs'><p className='break-words font-medium text-slate-900 dark:text-slate-100'>{item.name}</p><p className='mt-1'>{item.size && `Size: ${item.size} · `}Qty: {item.quantity}</p><p className='mt-1'>{money(item.price, currency)} each</p></div><span className='text-xs font-semibold text-slate-900 dark:text-slate-100'>{money(item.price * item.quantity, currency)}</span></li>)}</ul>
      </div>
      <dl className='mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'>
        <div className='flex justify-between gap-3'><dt>Subtotal</dt><dd>{subtotal === null ? 'Unavailable' : money(subtotal, currency)}</dd></div>
        <div className='flex justify-between gap-3'><dt>Processing Fee</dt><dd>{fee === null || fee < 0 ? 'Unavailable' : money(fee, currency)}</dd></div>
        <div className='flex justify-between gap-3 pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100'><dt>{order.payment ? 'Total Amount Paid' : 'Total Amount Due'}</dt><dd>{money(order.amount, currency)}</dd></div>
      </dl>
      {order.payment ? <dl className='mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'>
        {[['Payment Method', order.paymentMethod === 'COD' ? 'Cash (School Cashier)' : order.paymentMethod], ['Official Receipt Number', order.receiptNumber || 'Not recorded'], ['Paid At', paid.date + (paid.time ? `, ${paid.time}` : '')], ['Confirmed By', order.confirmedBy || 'Not recorded']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className='mt-1 break-all font-medium text-slate-900 dark:text-slate-100'>{value}</dd></div>)}
      </dl> : canPay ? <form className='mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800' onSubmit={event => { event.preventDefault(); if (receipt.trim() && !pending) onConfirm(order._id, { paymentMethod: method, receiptNumber: receipt.trim() }) }}>
        <div className='grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2'>
        <label className='min-w-0 text-xs font-medium'>Payment Method<select value={method} onChange={event => setMethod(event.target.value)} disabled={pending} className={inputClass}><option value='COD'>Cash (School Cashier)</option></select></label>
        <label className='min-w-0 text-xs font-medium'>Official Receipt Number<input name='receiptNumber' value={receipt} onChange={event => setReceipt(event.target.value)} disabled={pending} required maxLength={100} autoComplete='off' placeholder='Enter OR number' className={inputClass}/></label>
        </div>
        <p className='text-xs leading-5'>Confirm only after receiving the full amount and issuing the official receipt.</p>
        <div className='flex flex-col gap-2 sm:flex-row'><button type='button' disabled={pending} onClick={() => { setReceipt(''); setMethod('COD') }} className='min-h-11 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800'>Cancel Payment</button><button type='submit' disabled={pending || !receipt.trim()} className='min-h-11 flex-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50'>{pending ? 'Confirming…' : 'Confirm Payment'}</button></div>
      </form> : <p className='mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 dark:bg-slate-800/50'>{order.paymentMethod !== 'COD' ? 'This order uses an online payment provider. Cashier cannot confirm it as cash.' : 'This order is not eligible for cashier payment.'}</p>}
    </aside>
  )
}

export default PaymentDetails
