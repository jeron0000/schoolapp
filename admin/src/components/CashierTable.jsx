import React from 'react'
import { assets } from '../assets/assets'
import { OrderStatusBadge } from './OrderDetails'
import { money, orderDate, orderName } from '../utils/orderPresentation'

const CashierTable = ({ orders, filter, selectedId, loading, pending, onView, currency }) => {
  const awaiting = filter === 'Awaiting Payment'
  const receipts = filter === 'Receipt Records'
  const headings = awaiting
    ? ['Order', 'Student', 'Items', 'Amount Due', 'Payment Status', 'Date Sent', 'Action']
    : [receipts ? 'Receipt Number' : 'Order', 'Student', 'Amount Paid', 'Method', receipts ? 'Order' : 'Receipt Number', 'Paid At / Confirmed By', 'Action']

  return (
    <div className='min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/60'>
      {loading ? <p role='status' className='p-8 text-center text-sm'>Loading payments…</p> : !orders.length ? <div className='p-8 text-center'><h2 className='font-semibold text-slate-900 dark:text-slate-100'>No matching payments</h2><p className='mt-2 text-sm'>{awaiting ? 'Orders sent to Cashier will appear here while awaiting payment.' : 'Try another search or payment tab.'}</p></div> : <div className='overflow-x-auto' tabIndex={0} role='region' aria-label={filter + ' table'} aria-busy={pending}>
        <table className='w-full min-w-[780px] border-separate border-spacing-y-1 text-left text-xs'>
          <thead><tr>{headings.map(heading => <th key={heading} scope='col' className='px-3 py-2 text-[11px] font-medium'>{heading}</th>)}</tr></thead>
          <tbody>{orders.map(order => {
            const selected = order._id === selectedId
            const date = orderDate(awaiting ? order.sentToCashierAt : order.paidAt)
            const cell = 'border-y px-3 py-3 ' + (selected ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-400/10' : 'border-slate-100 dark:border-slate-800')
            return <tr key={order._id}>
              <td className={cell + ' rounded-l-lg border-l'}><div className='flex items-center gap-2'>{awaiting && <img src={order.items?.[0]?.image?.[0] || assets.parcel_icon} alt='' className='h-10 w-9 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-800'/>}<div><p className='max-w-40 break-all font-semibold text-slate-900 dark:text-slate-100'>{receipts ? order.receiptNumber : '#' + order._id}</p>{awaiting && <p className='mt-1 text-[11px]'>{order.items?.length || 0} items</p>}</div></div></td>
              <td className={cell}><p className='min-w-20 max-w-36 break-words font-medium text-slate-900 dark:text-slate-100'>{orderName(order)}</p></td>
              {awaiting ? <>
                <td className={cell}>{order.items?.length || 0}</td>
                <td className={cell + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>{money(order.amount, currency)}</td>
                <td className={cell}><OrderStatusBadge status='Pending'/></td>
              </> : <>
                <td className={cell + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>{money(order.amount, currency)}</td>
                <td className={cell}>{order.paymentMethod === 'COD' ? 'Cash' : order.paymentMethod}</td>
                <td className={cell}><p className='max-w-36 break-all'>{receipts ? '#' + order._id : order.receiptNumber || 'Not recorded'}</p></td>
              </>}
              <td className={cell}><p className='whitespace-nowrap'>{date.date}</p><p className='mt-1 text-[11px]'>{date.time}</p>{!awaiting && <p className='mt-1 max-w-40 break-all text-[11px]'>{order.confirmedBy || 'Not recorded'}</p>}</td>
              <td className={cell + ' rounded-r-lg border-r'}><button type='button' aria-label={'View payment ' + order._id} aria-controls='payment-details' aria-pressed={selected} disabled={pending} onClick={() => onView(order._id)} className='inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-4 w-4'><path d='M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z'/><circle cx='12' cy='12' r='3'/></svg>View</button></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </div>
  )
}

export default CashierTable
