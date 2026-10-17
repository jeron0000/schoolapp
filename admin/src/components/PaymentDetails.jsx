import React, { useState } from 'react'
import { assets } from '../assets/assets'
import { OrderStatusBadge } from './OrderDetails'
import { orderAddress, orderDate } from '../utils/orderPresentation'
import { refundPresentation } from '../../../shared/refund.js'
import { formatOrderMoney, orderPhpTotals, tryPhpLineTotal, validPhpAmount } from '../../../shared/money.js'
import { ArrowLeft, CreditCard, ReceiptText, X } from 'lucide-react'

const PaymentDetails = ({ order, pending, onConfirm, onClose, v2 = false, error = '', transaction = false, receiptRecord = false }) => {
  const [receipt, setReceipt] = useState('')
  const [method, setMethod] = useState('COD')
  const detailsTitle = receiptRecord ? 'Receipt Details' : transaction ? 'Transaction Details' : 'Payment Details'
  if (!order && v2) return (
    <aside className='cashier-payment-details-empty'>
      <h2>{detailsTitle}</h2>
      <div>{receiptRecord ? <ReceiptText size={28} aria-hidden='true' /> : <CreditCard size={28} aria-hidden='true' />}<h3>{receiptRecord ? 'No receipt selected' : transaction ? 'No transaction selected' : 'No payment selected'}</h3><p>{receiptRecord ? 'Select View in a receipt record to review its payment, items and confirming staff.' : transaction ? 'Select View beside a recorded transaction to inspect its official receipt, payment metadata and order details.' : 'Select View beside an order to review its details and available actions.'}</p></div>
    </aside>
  )
  if (!order) return (
    <aside className='rounded-xl border border-slate-200 bg-white p-6 text-center text-sm dark:border-slate-800 dark:bg-slate-900/60'>
      <h2 className='font-semibold text-slate-900 dark:text-slate-100'>Payment Details</h2>
      <p className='mt-3'>Select View to review an order and its payment.</p>
    </aside>
  )

  const items = order.items || []
  const address = orderAddress(order)
  const sent = orderDate(order.sentToCashierAt)
  const paid = orderDate(order.paidAt)
  const { subtotal, fee } = orderPhpTotals(order)
  const money = value => formatOrderMoney(value, order)

  const canPay = order.status === 'Sent to Cashier'
    && order.payment === false
    && order.paymentMethod === 'COD'
    && order.paymentCurrency === 'PHP'
    && validPhpAmount(order.amount)
    && order.amount > 0
  const refund = order.refundSummary || refundPresentation(order)
  const inputClass = 'mt-2 min-h-11 min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 2xl:text-xs focus:outline focus:outline-2 focus:outline-amber-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

  return (
    <aside
      id='payment-details'
      aria-label={detailsTitle}
      tabIndex={-1}
      className={v2 ? 'cashier-payment-details-v2' + (receiptRecord ? ' cashier-receipt-details' : transaction ? ' cashier-transaction-details' : '') : 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm focus:outline-none sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'}
    >
      <div className={v2 ? 'cashier-payment-details-heading' : 'flex items-center justify-between gap-2'}>
        <div>
          {v2 && <button type='button' className='cashier-payment-details-back' disabled={pending} onClick={onClose}><ArrowLeft size={14} aria-hidden='true' />{receiptRecord ? 'Receipt Records' : transaction ? 'Transactions' : order.payment ? 'Paid Payments' : 'Awaiting Payment'}</button>}
          <h2 className='text-lg font-semibold text-slate-900 dark:text-slate-100'>{detailsTitle}</h2>
        </div>
        <button
          type='button'
          disabled={pending}
          onClick={onClose}
          className={v2 ? 'cashier-payment-details-close' : 'min-h-9 rounded px-2 text-xs hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800'}
          aria-label={v2 ? receiptRecord ? 'Close receipt details' : transaction ? 'Close transaction details' : 'Close payment details' : undefined}
        >
          {v2 ? <><span>Close</span><X size={16} aria-hidden='true' /></> : 'Close'}
        </button>
      </div>
      <div className={v2 ? 'cashier-payment-details-body' : undefined} tabIndex={transaction || receiptRecord ? 0 : undefined} role={transaction || receiptRecord ? 'region' : undefined} aria-label={receiptRecord ? 'Receipt record content' : transaction ? 'Transaction record content' : undefined}>
      {receiptRecord && <section className='cashier-receipt-summary'>
        <h3>Official receipt</h3>
        <strong>No. {order.receiptNumber || 'Not recorded'}</strong>
        <div className='cashier-payment-states'>
          <div><h3>Payment status</h3><OrderStatusBadge status={order.payment === true ? 'Paid' : 'Pending'} /></div>
          <div><h3>Fulfillment</h3><OrderStatusBadge status={order.status} /></div>
        </div>
      </section>}
      {(transaction || receiptRecord) && <section className='cashier-transaction-confirmed'>
        <h3>{receiptRecord ? 'Confirmed payment amount' : order.payment === true ? 'Confirmed transaction' : 'Unconfirmed record'}</h3>
        <strong>{money(order.amount)}</strong>
        <p>{paid.date}{paid.time && ` · ${paid.time}`}</p>
        {!receiptRecord && <OrderStatusBadge status={order.payment === true ? 'Paid' : 'Pending'} />}
        <dl><div><dt>Payment method</dt><dd>{order.paymentMethod === 'COD' ? 'Cash (School Cashier)' : order.paymentMethod || 'Not recorded'}</dd></div><div><dt>Confirmed by</dt><dd>{order.confirmedBy || 'Not recorded'}</dd></div></dl>
      </section>}
      <section className={v2 ? 'cashier-payment-reference' : undefined}>
      {v2 && <h3>Order reference</h3>}
      <p className='mt-3 break-all text-sm font-semibold text-slate-900 dark:text-slate-100'>#{order._id}</p>
      <p className='mt-1 text-[11px]'>
        Sent to Cashier: {sent.date}{sent.time && `, ${sent.time}`}
      </p>
      {!receiptRecord && <div className={v2 ? 'cashier-payment-states' : 'mt-3 flex flex-wrap gap-2'}>
        {!transaction && <div>{v2 && <h3>Payment status</h3>}<OrderStatusBadge status={order.payment ? 'Paid' : 'Pending'} /></div>}
        <div>{v2 && <h3>Fulfillment</h3>}<OrderStatusBadge status={order.status} /></div>
      </div>}
      {refund && <p className='mt-3 break-words text-xs leading-5 text-slate-700 dark:text-slate-300'><strong>{refund.status}.</strong> {refund.message}</p>}
      {v2 && error && <p role='alert' className='cashier-payments-error'>{error}</p>}
      </section>
      <div className={v2 ? 'cashier-payment-student' : 'my-3 space-y-1 break-words text-xs leading-5'}>
        {v2 && <h3>Student information</h3>}
        <p className='font-semibold text-slate-900 dark:text-slate-100'>{address.name}</p>
        <p>{address.email || 'Email not provided'}</p>
        <p>{address.phone || 'Mobile number not provided'}</p>
      </div>
      <div className={v2 ? 'cashier-payment-items' : 'border-t border-slate-200 pt-4 dark:border-slate-800'}>
        <h3 className='mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100'>Items ({items.length})</h3>
        <ul className='max-h-56 space-y-3 overflow-y-auto'>
          {items.map((item, index) => (
            <li key={`${item._id}-${item.size}-${index}`} className='flex items-start gap-2'>
              <img
                src={item.image?.[0] || assets.parcel_icon}
                alt={item.name}
                className='h-12 w-10 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-800'
              />
              <div className='min-w-0 flex-1 text-xs'>
                <p className='break-words font-medium text-slate-900 dark:text-slate-100'>{item.name}</p>
                <p className='mt-1'>{item.size && `Size: ${item.size} · `}Qty: {item.quantity}</p>
                <p className='mt-1'>{money(item.price)} each</p>
              </div>
              <span className='text-xs font-semibold text-slate-900 dark:text-slate-100'>
                {money(tryPhpLineTotal(item.price, item.quantity))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <dl className={v2 ? 'cashier-payment-totals' : 'mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'}>
        <div className='flex justify-between gap-3'>
          <dt>Subtotal</dt>
          <dd>{subtotal === null ? 'Unavailable' : money(subtotal)}</dd>
        </div>
        <div className='flex justify-between gap-3'>
          <dt>Processing Fee</dt>
          <dd>{fee === null || fee < 0 ? 'Unavailable' : money(fee)}</dd>
        </div>
        <div className='flex justify-between gap-3 pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100'>
          <dt>{order.payment ? 'Total Amount Paid' : 'Total Amount Due'}</dt>
          <dd>{money(order.amount)}</dd>
        </div>
      </dl>
      {receiptRecord ? null : order.payment ? (
        <dl className={v2 ? 'cashier-payment-receipt' : 'mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'}>
          {[
            ['Payment Method', order.paymentMethod === 'COD' ? 'Cash (School Cashier)' : order.paymentMethod],
            ['Official Receipt Number', order.receiptNumber || 'Not recorded'],
            ['Paid At', paid.date + (paid.time ? `, ${paid.time}` : '')],
            ['Confirmed By', order.confirmedBy || 'Not recorded']
          ].filter(([label]) => !transaction || label === 'Official Receipt Number').map(([label, value]) => (
            <div key={label} data-label={v2 ? label : undefined}>
              <dt>{label}</dt>
              <dd className='mt-1 break-all font-medium text-slate-900 dark:text-slate-100'>{value}</dd>
            </div>
          ))}
        </dl>
      ) : canPay && !transaction && !receiptRecord ? (
        <form
          className='mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800'
          onSubmit={event => {
            event.preventDefault();
            if (receipt.trim() && !pending) onConfirm(order._id, {
              paymentMethod: method,
              receiptNumber: receipt.trim()
            })
          }}
        >
          <div className='grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2'>
            <label className='min-w-0 text-xs font-medium'>
              Payment Method
              <select
                value={method}
                onChange={event => setMethod(event.target.value)}
                disabled={pending}
                className={inputClass}
              >
                <option value='COD'>Cash (School Cashier)</option>
              </select>
            </label>
            <label className='min-w-0 text-xs font-medium'>
              Official Receipt Number
              <input
                name='receiptNumber'
                value={receipt}
                onChange={event => setReceipt(event.target.value)}
                disabled={pending}
                required
                maxLength={100}
                autoComplete='off'
                placeholder='Enter OR number'
                className={inputClass}
              />
            </label>
          </div>
          <p className='text-xs leading-5'>Confirm only after receiving the full amount and issuing the official receipt.</p>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <button
              type='button'
              disabled={pending}
              onClick={() => { setReceipt(''); setMethod('COD') }}
              className='min-h-11 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800'
            >
              Cancel Payment
            </button>
            <button
              type='submit'
              disabled={pending || !receipt.trim()}
              className='min-h-11 flex-1 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {pending ? 'Confirming…' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      ) : transaction || receiptRecord ? null : (
        <p className='mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 dark:bg-slate-800/50'>
          {order.paymentMethod !== 'COD'
            ? 'This order uses an online payment provider. Cashier cannot confirm it as cash.'
            : 'This order is not eligible for cashier payment.'}
        </p>
      )}
      {v2 && order.payment && <p className='cashier-payment-readonly'>{receiptRecord ? 'Receipt records are read-only. No receipt generation or payment confirmation is available here.' : transaction ? 'Transaction history is review-only. This panel cannot reconfirm payment.' : 'This is a confirmed payment. No second confirmation action is available.'}</p>}
      </div>
    </aside>
  )
}

export default PaymentDetails
