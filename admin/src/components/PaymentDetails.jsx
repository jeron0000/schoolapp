import { useState } from 'react'
import { ArrowLeft, CreditCard, ReceiptText, X } from 'lucide-react'
import { formatOrderMoney, orderPhpTotals, tryPhpLineTotal, validPhpAmount } from '../../../shared/money.js'
import { refundPresentation } from '../../../shared/refund.js'
import { canRecordOnlineReceipt, isTestPaymentReceipt, receiptDisplayValue } from '../../../shared/paymentReceipt.js'
import { getAcademicProgramName } from '../../../shared/productTaxonomy.js'
import { assets } from '../assets/assets'
import { orderAddress, orderDate } from '../utils/orderPresentation'
import { OrderStatusBadge } from './OrderDetails'

const getDetailsPresentation = (receiptRecord, transaction) => {
  if (receiptRecord) {
    return {
      title: 'Receipt Details',
      emptyTitle: 'No receipt selected',
      emptyDescription: 'Select View in a receipt record to review its payment, items and confirming staff.',
      closeLabel: 'Close receipt details',
      backLabel: 'Receipt Records',
      contentLabel: 'Receipt record content',
      readOnlyMessage: 'Receipt records are read-only. No receipt generation or payment confirmation is available here.'
    }
  }

  if (transaction) {
    return {
      title: 'Transaction Details',
      emptyTitle: 'No transaction selected',
      emptyDescription: 'Select View beside a recorded transaction to inspect its official receipt, payment metadata and order details.',
      closeLabel: 'Close transaction details',
      backLabel: 'Transactions',
      contentLabel: 'Transaction record content',
      readOnlyMessage: 'Transaction history is review-only. This panel cannot reconfirm payment.'
    }
  }

  return {
    title: 'Payment Details',
    emptyTitle: 'No payment selected',
    emptyDescription: 'Select View beside an order to review its details and available actions.',
    closeLabel: 'Close payment details',
    backLabel: '',
    contentLabel: undefined,
    readOnlyMessage: 'This is a confirmed payment. No second confirmation action is available.'
  }
}

const getConfirmedHeading = (receiptRecord, paymentConfirmed) => {
  if (receiptRecord) return 'Confirmed payment amount'
  if (paymentConfirmed) return 'Confirmed transaction'
  return 'Unconfirmed record'
}

const PaymentDetails = ({ order, pending, onConfirm, onClose, v2 = false, error = '', transaction = false, receiptRecord = false, programCategories = [] }) => {
  const [receipt, setReceipt] = useState('')
  const [method, setMethod] = useState('COD')
  const presentation = getDetailsPresentation(receiptRecord, transaction)

  if (!order && v2) {
    let emptyIcon = <CreditCard size={28} aria-hidden='true' />
    if (receiptRecord) emptyIcon = <ReceiptText size={28} aria-hidden='true' />
    const reviewRecord = receiptRecord || transaction
    const emptyDetailsClass = reviewRecord
      ? 'cashier-payment-details-empty flex min-h-[720px] min-w-0 flex-col rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[18px] max-xl:hidden max-[339px]:p-3.5'
      : 'cashier-payment-details-empty flex min-h-[560px] min-w-0 flex-col rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[18px] max-md:min-h-[130px] max-[339px]:p-3.5'

    return (
      <aside className={emptyDetailsClass}>
        <h2 className='text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)]'>{presentation.title}</h2>
        <div className='grid flex-1 content-center place-items-center gap-5 px-2.5 py-[30px] text-center max-md:block max-md:px-0 max-md:pb-0 max-md:pt-3 max-md:text-left max-md:[&>svg]:hidden max-md:[&>h3]:hidden'>
          {emptyIcon}
          <h3 className='text-[15px] font-semibold'>{presentation.emptyTitle}</h3>
          <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>{presentation.emptyDescription}</p>
        </div>
      </aside>
    )
  }

  if (!order) {
    return (
      <aside className='rounded-xl border border-slate-200 bg-white p-6 text-center text-sm dark:border-slate-800 dark:bg-slate-900/60'>
        <h2 className='font-semibold text-slate-900 dark:text-slate-100'>Payment Details</h2>
        <p className='mt-3'>Select View to review an order and its payment.</p>
      </aside>
    )
  }

  const items = order.items || []
  const address = orderAddress(order)
  const academicProgramName = getAcademicProgramName(programCategories, address.academicProgram)
  const sent = orderDate(order.sentToCashierAt)
  const paid = orderDate(order.paidAt)
  const { subtotal, fee } = orderPhpTotals(order)
  const money = value => formatOrderMoney(value, order)
  const canPay = order.status === 'Sent to Cashier'
    && order.cancellationRequest?.status !== 'pending'
    && order.payment === false
    && order.paymentMethod === 'COD'
    && order.paymentCurrency === 'PHP'
    && validPhpAmount(order.amount)
    && order.amount > 0
  const refund = order.refundSummary || refundPresentation(order)
  const canRecordReceipt = canRecordOnlineReceipt(order)
  const testReceipt = isTestPaymentReceipt(order)
  let receiptSubmitLabel = testReceipt ? 'Record Test Receipt Reference' : 'Record Official Receipt'
  if (pending) receiptSubmitLabel = 'Saving…'
  const inputClass = 'mt-2 min-h-11 min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline focus:outline-2 focus:outline-amber-400 max-md:text-base 2xl:text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

  const reviewRecord = transaction || receiptRecord
  let detailsClass = 'min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm focus:outline-none sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'
  if (v2) {
    detailsClass = 'cashier-payment-details-v2 min-w-0 [overflow-wrap:anywhere] text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)]'
    if (reviewRecord) detailsClass += ' flex max-h-[calc(100dvh-32px)] flex-col max-md:h-dvh max-md:max-h-dvh'
  }

  let backLabel = presentation.backLabel
  if (!backLabel && order.payment) backLabel = 'Paid Payments'
  if (!backLabel) backLabel = 'Awaiting Payment'

  let closeContent = 'Close'
  if (v2) {
    closeContent = (
      <>
        <span>Close</span>
        <X size={16} aria-hidden='true' />
      </>
    )
  }

  let sentAt = sent.date
  if (sent.time) sentAt += ', ' + sent.time
  let paidAt = paid.date
  if (paid.time) paidAt += ', ' + paid.time

  const confirmedHeading = getConfirmedHeading(receiptRecord, order.payment === true)
  const confirmedPaymentStatus = order.payment === true ? 'Paid' : 'Pending'
  const paymentStatus = order.payment ? 'Paid' : 'Pending'
  const paymentMethod = order.paymentMethod === 'COD' ? 'Cash (School Cashier)' : order.paymentMethod
  const subtotalText = subtotal === null ? 'Unavailable' : money(subtotal)
  const feeText = fee === null || fee < 0 ? 'Unavailable' : money(fee)
  const totalLabel = order.payment ? 'Total Amount Paid' : 'Total Amount Due'
  const confirmedSectionClass = 'cashier-transaction-summary'
  const confirmedHeadingClass = '!text-[color:var(--pamo-color-accent-text)]'
  const confirmedAmountClass = 'font-financial mt-3 block text-[clamp(24px,2vw,32px)] font-bold leading-[1.3] tracking-[-.02em] [overflow-wrap:anywhere]'
  const confirmedDateClass = 'mb-5 mt-3 text-xs text-[color:var(--pamo-color-text-secondary)]'
  const confirmedListClass = 'mt-6 grid gap-3.5 text-xs'
  const confirmedRowClass = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 max-md:grid-cols-1 max-md:gap-1.5'
  const confirmedTermClass = 'text-[color:var(--pamo-color-text-secondary)]'
  const confirmedValueClass = 'min-w-0 break-words font-semibold'

  const handlePaymentSubmit = event => {
    event.preventDefault()
    const receiptNumber = receipt.trim()
    if (!receiptNumber || pending) return
    if (canRecordReceipt) {
      onConfirm(order._id, { receiptNumber, receiptOnly: true })
      return
    }
    onConfirm(order._id, { paymentMethod: method, receiptNumber })
  }

  const resetPaymentForm = () => {
    setReceipt('')
    setMethod('COD')
  }

  let paymentAction = null
  if (!receiptRecord && order.payment) {
    let receiptFields = [
      ['Payment Method', paymentMethod],
      ['Official Receipt Number', receiptDisplayValue(order)],
      ['Paid At', paidAt],
      ['Confirmed By', order.confirmedBy || 'Not recorded']
    ]
    if (transaction) {
      receiptFields = receiptFields.filter(([label]) => label === 'Official Receipt Number')
    }

    const receiptClass = v2
      ? 'flex flex-col gap-3.5 text-xs'
      : 'mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'

    paymentAction = (
      <>
      <dl className={receiptClass}>
        {receiptFields.map(([label, value]) => (
          <div key={label} className={v2 && label === 'Official Receipt Number' ? '-order-1' : undefined}>
            <dt className={v2 ? 'text-[color:var(--pamo-color-text-secondary)]' + (label === 'Official Receipt Number' ? ' text-[11px] uppercase' : '') : undefined}>{testReceipt && label === 'Official Receipt Number' ? 'Test Receipt Reference' : label}</dt>
            <dd className={'mt-1 break-all font-medium text-slate-900 dark:text-slate-100' + (label === 'Official Receipt Number' ? ' font-mono' : '') + (v2 && label === 'Official Receipt Number' ? ' text-[23px] font-bold' : '')}>{value}</dd>
          </div>
        ))}
      </dl>
      {canRecordReceipt && !transaction && (
        <form className='mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800' onSubmit={handlePaymentSubmit}>
          <label className='block text-xs font-medium'>
            {testReceipt ? 'Test Receipt Reference' : 'Official Receipt Number'}
            <input name='receiptNumber' value={receipt} onChange={event => setReceipt(event.target.value)}
              disabled={pending} required maxLength={100} autoComplete='off' className={inputClass}
              placeholder={testReceipt ? 'Enter a test reference' : 'Enter OR number'} />
          </label>
          <p className='text-xs leading-5'>
            {testReceipt ? 'TEST / SANDBOX only. This reference is not a genuine school-issued receipt.'
              : 'Record the school-issued receipt number. This does not confirm or collect payment again.'}
          </p>
          <button type='submit' disabled={pending || !receipt.trim()}
            className='min-h-11 w-full rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50'>
            {receiptSubmitLabel}
          </button>
        </form>
      )}
      </>
    )
  } else if (canPay && !transaction && !receiptRecord) {
    paymentAction = (
      <form className='mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800' onSubmit={handlePaymentSubmit}>
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
            onClick={resetPaymentForm}
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
    )
  } else if (!transaction && !receiptRecord) {
    let unavailableMessage = 'This order is not eligible for cashier payment.'
    if (order.cancellationRequest?.status === 'pending') {
      unavailableMessage = 'Cancellation is pending PAMO review. Payment confirmation is on hold.'
    }
    if (order.paymentMethod !== 'COD') {
      unavailableMessage = 'This order uses an online payment provider. Cashier cannot confirm it as cash.'
    }

    paymentAction = (
      <p className='mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 dark:bg-slate-800/50'>
        {unavailableMessage}
      </p>
    )
  }

  return (
    <aside
      id='payment-details'
      aria-label={presentation.title}
      tabIndex={-1}
      className={detailsClass}
    >
      <div className={v2 ? 'flex items-start justify-between gap-3 border-b border-[color:var(--pamo-color-border-default)] p-[18px] max-md:min-h-[90px] xl:p-4' + (reviewRecord ? ' shrink-0' : '') : 'flex items-center justify-between gap-2'}>
        <div>
          {v2 && (
            <button type='button' className='hidden min-h-11 items-center gap-1.5 text-xs max-md:inline-flex' disabled={pending} onClick={onClose}>
              <ArrowLeft size={14} aria-hidden='true' />
              {backLabel}
            </button>
          )}
          <h2 className={v2 ? 'text-[21px] font-semibold text-[color:var(--pamo-color-text-primary)] max-md:mt-1.5 max-md:text-[25px] xl:text-[19px]' : 'text-lg font-semibold text-slate-900 dark:text-slate-100'}>{presentation.title}</h2>
        </div>
        <button
          type='button'
          disabled={pending}
          onClick={onClose}
          className={v2 ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-semibold leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-50 max-md:[&>span]:hidden' : 'min-h-9 rounded px-2 text-xs hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800'}
          aria-label={v2 ? presentation.closeLabel : undefined}
        >
          {closeContent}
        </button>
      </div>
      <div
        className={v2 ? 'cashier-payment-details-body max-h-[calc(100dvh-120px)] overflow-y-auto overscroll-contain px-[18px] pb-6 max-md:max-h-[calc(100dvh-126px)] xl:max-h-[calc(100dvh-116px)] xl:px-4' + (reviewRecord ? ' min-h-0 flex-1 !max-h-none' : '') : undefined}
        tabIndex={reviewRecord ? 0 : undefined}
        role={reviewRecord ? 'region' : undefined}
        aria-label={presentation.contentLabel}
      >
        {receiptRecord && (
          <section className='cashier-receipt-summary'>
            <h3 className='!text-[color:var(--pamo-color-accent-text)]'>{testReceipt ? 'Test receipt reference' : 'Official receipt'}</h3>
            <strong className='font-mono block break-words text-[clamp(20px,2vw,26px)] font-bold leading-[1.3]'>No. {receiptDisplayValue(order)}</strong>
            <div className='mt-[22px] flex flex-wrap gap-5 [&>div]:min-w-0 [&_span]:max-w-full [&_span]:rounded-[20px]'>
              <div><h3>Payment status</h3><OrderStatusBadge status={confirmedPaymentStatus} /></div>
              <div><h3>Fulfillment</h3><OrderStatusBadge status={order.status} /></div>
            </div>
          </section>
        )}
        {reviewRecord && (
          <section className={confirmedSectionClass}>
            <h3 className={confirmedHeadingClass}>{confirmedHeading}</h3>
            <strong className={confirmedAmountClass}>{money(order.amount)}</strong>
            <p className={confirmedDateClass}>{paid.date}{paid.time && ' · ' + paid.time}</p>
            {!receiptRecord && <OrderStatusBadge status={confirmedPaymentStatus} />}
            <dl className={confirmedListClass}>
              <div className={confirmedRowClass}><dt className={confirmedTermClass}>Payment method</dt><dd className={confirmedValueClass}>{paymentMethod || 'Not recorded'}</dd></div>
              <div className={confirmedRowClass}><dt className={confirmedTermClass}>Confirmed by</dt><dd className={confirmedValueClass}>{order.confirmedBy || 'Not recorded'}</dd></div>
            </dl>
          </section>
        )}
        <section>
          {v2 && <h3>Order reference</h3>}
          <p className={(v2 ? 'text-[13px]' : 'mt-3 text-sm') + ' font-mono break-all font-semibold text-slate-900 dark:text-slate-100'}>#{order._id}</p>
          <p className='mt-1 text-[11px] text-[color:var(--pamo-color-text-secondary)]'>Sent to Cashier: {sentAt}</p>
          {!receiptRecord && (
            <div className={v2 ? 'mt-[22px] flex flex-wrap gap-5 [&>div]:min-w-0 [&_span]:max-w-full [&_span]:rounded-[20px]' : 'mt-3 flex flex-wrap gap-2'}>
              {!transaction && (
                <div>
                  {v2 && <h3>Payment status</h3>}
                  <OrderStatusBadge status={paymentStatus} />
                </div>
              )}
              <div>
                {v2 && <h3>Fulfillment</h3>}
                <OrderStatusBadge status={order.status} />
              </div>
            </div>
          )}
          {refund && <p className='mt-3 break-words text-xs leading-5 text-slate-700 dark:text-slate-300'><strong>{refund.status}.</strong> {refund.message}</p>}
          {v2 && error && <p role='alert' className='my-3 rounded-[7px] border border-[color:var(--pamo-color-error-text)] bg-[var(--pamo-color-surface-subtle)] p-3 text-[13px] text-[color:var(--pamo-color-error-text)]'>{error}</p>}
        </section>
        <div className={v2 ? '[&>p]:mt-1.5 [&>p]:text-xs [&>p]:text-[color:var(--pamo-color-text-secondary)] [&>p:first-of-type]:text-base [&>p:first-of-type]:text-[color:var(--pamo-color-text-primary)]' : 'my-3 space-y-1 break-words text-xs leading-5'}>
          {v2 && <h3>Student information</h3>}
          <p className='font-semibold text-slate-900 dark:text-slate-100'>{address.name}</p>
          <p>{address.email || 'Email not provided'}</p>
          {address.academicProgram && <p>{academicProgramName}</p>}
          {!address.campusPickup && <p>{address.phone || 'Mobile number not provided'}</p>}
        </div>
        <div className={v2 ? '' : 'border-t border-slate-200 pt-4 dark:border-slate-800'}>
          <h3 className='mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100'>Items ({items.length})</h3>
          <ul className={(v2 ? 'max-h-none ' : 'max-h-56 ') + 'space-y-3 ' + (receiptRecord ? 'overflow-visible' : 'overflow-y-auto')}>
            {items.map((item, index) => (
              <li key={item._id + '-' + item.size + '-' + index} className={v2 ? 'grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-md bg-[var(--pamo-color-surface-subtle)] p-2.5' : 'flex items-start gap-2'}>
                <img
                  src={item.image?.[0] || assets.parcel_icon}
                  alt={item.name}
                  className='h-12 w-10 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-800'
                />
                <div className='min-w-0 flex-1 text-xs'>
                  <p className='break-words font-medium text-slate-900 dark:text-slate-100'>{item.name}</p>
                  <p className='mt-1'>{item.size && 'Size: ' + item.size + ' · '}Qty: {item.quantity}</p>
                  <p className='mt-1'>{money(item.price)} each</p>
                </div>
                <span className={(v2 ? 'col-start-2 max-w-full break-words ' : '') + 'text-xs font-semibold text-slate-900 dark:text-slate-100'}>
                  {money(tryPhpLineTotal(item.price, item.quantity))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <dl className={v2 ? '' : 'mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs dark:border-slate-800'}>
          <div className={v2 ? 'mb-3 flex justify-between gap-3 text-[color:var(--pamo-color-text-secondary)] [&>dd]:max-w-[65%] [&>dd]:break-words [&>dd]:text-right' : 'flex justify-between gap-3'}>
            <dt>Subtotal</dt>
            <dd>{subtotalText}</dd>
          </div>
          <div className={v2 ? 'mb-3 flex justify-between gap-3 text-[color:var(--pamo-color-text-secondary)] [&>dd]:max-w-[65%] [&>dd]:break-words [&>dd]:text-right' : 'flex justify-between gap-3'}>
            <dt>Processing Fee</dt>
            <dd>{feeText}</dd>
          </div>
          <div className={v2 ? 'mt-[22px] block rounded-[7px] bg-[var(--pamo-color-surface-subtle)] p-3.5 text-[color:var(--pamo-color-text-primary)]' : 'flex justify-between gap-3 pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100'}>
            <dt className={v2 ? 'text-[11px] uppercase' : undefined}>{totalLabel}</dt>
            <dd className={v2 ? 'mt-2 max-w-full break-words text-left text-[27px] font-bold leading-[1.3]' : undefined}>{money(order.amount)}</dd>
          </div>
        </dl>
        {paymentAction}
        {v2 && order.payment && <p className='pt-[30px] text-xs text-[color:var(--pamo-color-text-secondary)]'>{presentation.readOnlyMessage}</p>}
      </div>
    </aside>
  )
}

export default PaymentDetails
