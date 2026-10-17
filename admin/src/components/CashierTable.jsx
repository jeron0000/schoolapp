import { formatOrderMoney } from '../../../shared/money.js'
import React from 'react'
import { assets } from '../assets/assets'
import { OrderStatusBadge } from './OrderDetails'
import { orderDate, orderName } from '../utils/orderPresentation'
import { ArrowRight, Minus } from 'lucide-react'

const CashierTable = ({ orders, filter, selectedId, loading, pending, onView, v2 = false, query = '', error = '' }) => {
  const awaiting = filter === 'Awaiting Payment'
  const transactions = filter === 'Transactions'
  const receipts = filter === 'Receipt Records'
  const headings = awaiting
    ? ['Order', 'Student', 'Items', 'Amount Due', 'Payment Status', 'Date Sent', 'Action']
    : [receipts ? 'Receipt Number' : 'Order', 'Student', 'Amount Paid', 'Method', receipts ? 'Order' : 'Receipt Number', 'Paid At / Confirmed By', 'Action']

  let emptyTitle = awaiting ? 'No payments awaiting confirmation' : 'No confirmed payments recorded'
  if (receipts) emptyTitle = 'No recorded receipts'
  if (transactions) emptyTitle = 'No recorded transactions'
  if (query.trim()) emptyTitle = receipts ? 'No matching receipts' : transactions ? 'No matching transactions' : 'No matching payments'
  if (error) emptyTitle = receipts ? 'Receipt records unavailable' : transactions ? 'Transaction records unavailable' : 'Payment records unavailable'

  if (v2) return (
    <section className='cashier-payments-list' aria-labelledby='cashier-list-heading' aria-busy={loading || pending}>
      <header><h2 id='cashier-list-heading'>{receipts ? 'Recorded Receipts' : transactions ? 'Transaction History' : awaiting ? 'Awaiting Payment' : 'Paid Payments'}</h2><p>{receipts ? 'Official receipt number is the primary lookup reference.' : transactions ? 'Recorded payments · Latest confirmations first' : awaiting ? 'Current cashier confirmation queue.' : 'Confirmed payments · Review-only records'}</p></header>
      {loading ? <p role='status' className='cashier-payments-empty'>{receipts ? 'Loading receipts…' : transactions ? 'Loading transactions…' : 'Loading payments…'}</p>
        : !orders.length ? <div className='cashier-payments-empty' role='status'>
          <span aria-hidden='true'><Minus size={28} /></span>
          <h3>{emptyTitle}</h3>
          <p>{error ? 'Refresh to try loading payments again.' : query.trim() ? 'Try another order reference, student name or receipt number.' : awaiting ? 'Orders requiring payment confirmation will appear here.' : receipts ? 'Official receipt records will appear here once recorded.' : 'Confirmed payments will appear here once recorded.'}</p>
        </div> : <>
          <div className='cashier-payments-column-headings' aria-hidden='true'><span>{receipts ? 'Official receipt' : 'Order'}</span><span>Student</span><span>{awaiting ? 'Amount due' : 'Paid amount'}</span><span>{receipts ? 'Order' : awaiting ? 'Items' : 'Receipt'}</span><span>Action</span></div>
          <ul className='cashier-payments-records'>
            {orders.map(order => {
              const date = orderDate(awaiting ? order.sentToCashierAt : order.paidAt)
              const selected = order._id === selectedId
              return <li key={order._id} className={selected ? 'cashier-payment-record selected-payment' : 'cashier-payment-record'}>
                <div className='cashier-payment-record-main'>
                  <strong title={receipts ? order.receiptNumber : '#' + order._id}>{receipts && <span className='cashier-receipt-number-label'>Official receipt</span>}{awaiting && <img src={order.items?.[0]?.image?.[0] || assets.parcel_icon} alt='' />}{receipts ? order.receiptNumber : '#' + order._id.slice(0, 9) + (order._id.length > 9 ? '…' : '')}</strong>
                  <p className='cashier-payment-record-student'><span className='sr-only'>Student: </span>{orderName(order)}</p>
                  <strong className='cashier-payment-record-amount'><span className='sr-only'>{awaiting ? 'Amount due: ' : 'Paid amount: '}</span>{formatOrderMoney(order.amount, order)}</strong>
                  <p className='cashier-payment-record-receipt'><span>{receipts ? 'Order' : awaiting ? 'Items' : 'Receipt'}</span>{receipts ? '#' + order._id.slice(0, 9) + (order._id.length > 9 ? '…' : '') : awaiting ? order.items?.length || 0 : order.receiptNumber || 'Not recorded'}</p>
                  <button id={'cashier-view-' + order._id} type='button' aria-label={(receipts ? 'View receipt ' + order.receiptNumber + ' for order ' : transactions ? 'View transaction ' : 'View payment ') + order._id} aria-controls='payment-details' aria-pressed={selected} disabled={pending} onClick={() => onView(order._id)}><span>View</span><span>{receipts ? ' Receipt Details' : transactions ? ' Transaction' : ' Details'}</span><ArrowRight size={16} aria-hidden='true' /></button>
                </div>
                <div className='cashier-payment-record-meta'>
                  <p>{(transactions || receipts) && <span className='cashier-transaction-meta-label'>Method</span>}{order.paymentMethod === 'COD' ? (transactions || receipts) ? 'Cash (School Cashier)' : 'Cash' : order.paymentMethod || 'Method not recorded'}{(transactions || receipts) ? '' : awaiting ? ' · Awaiting confirmation' : ' · Official receipt: ' + (order.receiptNumber || 'Not recorded')}</p>
                  <p>{(transactions || receipts) ? <span className='cashier-transaction-meta-label'>Paid at</span> : awaiting ? 'Sent to Cashier' : 'Paid'} {date.date}{date.time && ` · ${date.time}`}</p>
                  {!awaiting && <p>{(transactions || receipts) ? <span className='cashier-transaction-meta-label'>Confirmed by</span> : 'Confirmed by '}{order.confirmedBy || 'Not recorded'}</p>}
                </div>
              </li>
            })}
          </ul>
        </>}
      {!loading && !error && <p className='cashier-payments-list-note'>{orders.length
        ? `${orders.length} ${receipts ? 'official receipt records' : awaiting ? 'orders' : 'confirmed payments'} in this view · Select a record to inspect its details.`
        : query.trim() ? 'No records match this search.' : awaiting ? 'Queue is empty · Refresh to check for newly assigned orders.' : 'No confirmed payments in this view.'}</p>}
    </section>
  )

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
                <td className={cell + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>{formatOrderMoney(order.amount, order)}</td>
                <td className={cell}><OrderStatusBadge status='Pending'/></td>
              </> : <>
                <td className={cell + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>{formatOrderMoney(order.amount, order)}</td>
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
