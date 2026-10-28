import { ArrowRight, Minus } from 'lucide-react'
import { formatOrderMoney } from '../../../shared/money.js'
import { receiptDisplayValue } from '../../../shared/paymentReceipt.js'
import { assets } from '../assets/assets'
import { orderDate, orderName } from '../utils/orderPresentation'
import { OrderStatusBadge } from './OrderDetails'

const listClass = 'cashier-payments-list flex min-h-[560px] min-w-0 flex-col rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[18px] max-[339px]:p-3.5'
const emptyClass = 'cashier-payments-empty flex min-h-[300px] flex-1 flex-col items-center justify-center gap-5 px-3 py-9 text-center [&>span]:mb-2 [&>span]:grid [&>span]:h-20 [&>span]:w-20 [&>span]:place-items-center [&>span]:rounded-full [&>span]:bg-[var(--pamo-color-surface-subtle)] [&>span]:text-[color:var(--pamo-color-border-input)] [&>h3]:text-[17px] [&>h3]:font-semibold [&>p]:text-xs [&>p]:text-[color:var(--pamo-color-text-secondary)]'

const createView = filter => {
  const paidView = {
    awaiting: false,
    transactions: false,
    receipts: false,
    headings: ['Order', 'Student', 'Amount Paid', 'Method', 'Receipt Number', 'Paid At / Confirmed By', 'Action'],
    title: 'Paid Payments',
    description: 'Confirmed payments · Review-only records',
    loadingMessage: 'Loading payments…',
    emptyTitle: 'No confirmed payments recorded',
    emptyDescription: 'Confirmed payments will appear here once recorded.',
    searchLabel: 'payments',
    errorTitle: 'Payment records unavailable',
    primaryColumn: 'Order',
    amountColumn: 'Paid amount',
    referenceColumn: 'Receipt',
    resultLabel: 'confirmed payments',
    emptyNote: 'No confirmed payments in this view.'
  }

  if (filter === 'Awaiting Payment') {
    return {
      ...paidView,
      awaiting: true,
      headings: ['Order', 'Student', 'Items', 'Amount Due', 'Payment Status', 'Date Sent', 'Action'],
      title: 'Awaiting Payment',
      description: 'Current cashier confirmation queue.',
      emptyTitle: 'No payments awaiting confirmation',
      emptyDescription: 'Orders requiring payment confirmation will appear here.',
      amountColumn: 'Amount due',
      referenceColumn: 'Items',
      resultLabel: 'orders',
      emptyNote: 'Queue is empty · Refresh to check for newly assigned orders.'
    }
  }

  if (filter === 'Transactions') {
    return {
      ...paidView,
      transactions: true,
      title: 'Transaction History',
      description: 'Recorded payments · Latest confirmations first',
      loadingMessage: 'Loading transactions…',
      emptyTitle: 'No recorded transactions',
      searchLabel: 'transactions',
      errorTitle: 'Transaction records unavailable'
    }
  }

  if (filter === 'Receipt Records') {
    return {
      ...paidView,
      receipts: true,
      headings: ['Receipt Number', 'Student', 'Amount Paid', 'Method', 'Order', 'Paid At / Confirmed By', 'Action'],
      title: 'Recorded Receipts',
      description: 'Official receipt number is the primary lookup reference.',
      loadingMessage: 'Loading receipts…',
      emptyTitle: 'No recorded receipts',
      emptyDescription: 'Official receipt records will appear here once recorded.',
      searchLabel: 'receipts',
      errorTitle: 'Receipt records unavailable',
      primaryColumn: 'Official receipt',
      referenceColumn: 'Order',
      resultLabel: 'official receipt records'
    }
  }

  return paidView
}

const getEmptyState = (view, hasQuery, error) => {
  let title = view.emptyTitle
  let description = view.emptyDescription

  if (hasQuery) {
    title = 'No matching ' + view.searchLabel
    description = 'Try another order reference, student name or receipt number.'
  }

  if (error) {
    title = view.errorTitle
    description = 'Refresh to try loading payments again.'
  }

  return { title, description }
}

const shortenOrderId = orderId => {
  let shortId = orderId.slice(0, 9)
  if (orderId.length > 9) shortId += '…'
  return '#' + shortId
}

const createRecordPresentation = (order, view) => {
  const orderReference = '#' + order._id
  const shortOrderReference = shortenOrderId(order._id)
  const itemCount = order.items?.length || 0
  let primaryTitle = orderReference
  let primaryText = shortOrderReference
  let referenceLabel = 'Receipt'
  let referenceValue = receiptDisplayValue(order)
  let actionLabel = 'View payment ' + order._id
  let actionText = ' Details'
  let dateLabel = 'Paid'
  let dateValue = order.paidAt
  let methodText = order.paymentMethod || 'Method not recorded'
  let methodSuffix = ' · Receipt: ' + receiptDisplayValue(order)
  const detailedMetadata = view.transactions || view.receipts

  if (order.paymentMethod === 'COD') methodText = 'Cash'

  if (view.awaiting) {
    referenceLabel = 'Items'
    referenceValue = itemCount
    dateLabel = 'Sent to Cashier'
    dateValue = order.sentToCashierAt
    methodSuffix = ' · Awaiting confirmation'
  }

  if (view.transactions) {
    actionLabel = 'View transaction ' + order._id
    actionText = ' Transaction'
    methodSuffix = ''
    if (order.paymentMethod === 'COD') methodText = 'Cash (School Cashier)'
  }

  if (view.receipts) {
    primaryTitle = receiptDisplayValue(order)
    primaryText = receiptDisplayValue(order)
    referenceLabel = 'Order'
    referenceValue = shortOrderReference
    actionLabel = 'View receipt ' + order.receiptNumber + ' for order ' + order._id
    actionText = ' Receipt Details'
    methodSuffix = ''
    if (order.paymentMethod === 'COD') methodText = 'Cash (School Cashier)'
  }

  return {
    actionLabel,
    actionText,
    date: orderDate(dateValue),
    dateLabel,
    detailedMetadata,
    itemCount,
    methodSuffix,
    methodText,
    primaryText,
    primaryTitle,
    referenceLabel,
    referenceValue
  }
}

const renderV2Record = (order, view, selectedId, pending, onView) => {
  const presentation = createRecordPresentation(order, view)
  const selected = order._id === selectedId
  const metadataLabelClass = 'mb-1.5 block text-[10px] uppercase'
  let recordClass = 'cashier-payment-record min-w-0 rounded-[7px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-4 max-md:grid max-md:grid-cols-2 xl:bg-[var(--pamo-color-surface-default)] xl:p-3'
  if (selected) recordClass += ' selected-payment border-[color:var(--pamo-color-brand-yellow)]'
  if (view.receipts) recordClass += ' max-xl:grid max-xl:grid-cols-2'

  const recordMainClass = view.receipts
    ? 'cashier-payment-record-main grid grid-cols-2 items-start gap-3.5 max-xl:contents xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.9fr)_60px] xl:gap-3'
    : 'cashier-payment-record-main grid grid-cols-2 items-start gap-3.5 max-md:contents xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.9fr)_60px] xl:gap-3'
  const primaryReferenceClass = view.receipts
    ? 'font-mono block break-words max-xl:text-xl max-md:col-span-2'
    : 'font-mono flex items-center gap-2 max-md:col-start-1 max-md:row-start-1'
  const studentClass = view.receipts
    ? 'cashier-payment-record-student col-span-2 text-base font-semibold text-[color:var(--pamo-color-text-primary)] max-xl:row-start-2 max-xl:mt-3 max-md:row-start-3 xl:col-auto'
    : 'cashier-payment-record-student col-span-2 text-base font-semibold text-[color:var(--pamo-color-text-primary)] max-md:row-start-2 max-md:mt-3 xl:col-auto'
  const amountClass = view.receipts
    ? 'cashier-payment-record-amount col-start-2 row-start-1 text-right [font-variant-numeric:tabular-nums] max-xl:text-[17px] max-md:col-span-2 max-md:col-start-1 max-md:row-start-2 max-md:mt-2.5 max-md:text-left xl:col-auto xl:row-auto xl:text-left'
    : 'cashier-payment-record-amount col-start-2 row-start-1 text-right [font-variant-numeric:tabular-nums] xl:col-auto xl:row-auto xl:text-left'
  let referenceClass = view.receipts
    ? 'cashier-payment-record-receipt col-span-2 flex gap-4 max-xl:row-start-3 max-xl:mt-3.5 max-md:row-start-4 xl:col-auto [&>span]:text-[color:var(--pamo-color-text-secondary)]'
    : 'cashier-payment-record-receipt col-span-2 flex gap-4 max-md:row-start-3 max-md:mt-3.5 xl:col-auto [&>span]:text-[color:var(--pamo-color-text-secondary)]'
  if (!view.awaiting) referenceClass += ' font-mono text-xs'
  let metadataClass = 'cashier-payment-record-meta grid gap-2 pt-3 text-[11px] text-[color:var(--pamo-color-text-secondary)] max-md:col-span-2 max-md:row-start-4 xl:mt-3 xl:grid-cols-2 xl:border-t xl:border-[color:var(--pamo-color-border-default)]'
  if (view.transactions) {
    metadataClass = 'cashier-payment-record-meta grid gap-4 pt-[18px] text-[11px] text-[color:var(--pamo-color-text-secondary)] max-md:col-span-2 max-md:row-start-4 max-md:mt-3.5 max-md:border-t max-md:border-[color:var(--pamo-color-border-default)] xl:mt-3 xl:grid-cols-3 xl:border-t xl:border-[color:var(--pamo-color-border-default)] xl:pb-6 xl:[&>p:first-child]:order-1 xl:[&>p:last-child]:order-2'
  }
  if (view.receipts) {
    metadataClass = 'cashier-payment-record-meta grid gap-4 py-[18px] text-[11px] text-[color:var(--pamo-color-text-secondary)] max-xl:col-span-2 max-xl:row-start-4 max-xl:mt-3.5 max-xl:border-t max-xl:border-[color:var(--pamo-color-border-default)] max-md:row-start-5 xl:mt-3 xl:grid-cols-3 xl:border-t xl:border-[color:var(--pamo-color-border-default)]'
  }
  const actionClass = 'col-span-2 row-start-5 mt-[18px] inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-semibold leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-50 xl:col-auto xl:row-auto xl:mt-0 xl:w-auto xl:px-2' + (view.receipts ? ' max-md:row-start-6' : '')

  return (
    <li key={order._id} className={recordClass}>
      <div className={recordMainClass}>
        <strong title={presentation.primaryTitle} className={primaryReferenceClass}>
          {view.receipts && <span className='mb-1.5 hidden text-[10px] font-medium uppercase text-[color:var(--pamo-color-text-secondary)] max-xl:block'>Official receipt</span>}
          {view.awaiting && <img src={order.items?.[0]?.image?.[0] || assets.parcel_icon} alt='' className='h-9 w-8 object-contain' />}
          {presentation.primaryText}
        </strong>
        <p className={studentClass}>
          <span className='sr-only'>Student: </span>
          {orderName(order)}
        </p>
        <strong className={amountClass}>
          <span className='sr-only'>{view.amountColumn}: </span>
          {formatOrderMoney(order.amount, order)}
        </strong>
        <p className={referenceClass}>
          <span className='xl:hidden'>{presentation.referenceLabel}</span>
          {presentation.referenceValue}
        </p>
        <button
          id={'cashier-view-' + order._id}
          type='button'
          aria-label={presentation.actionLabel}
          aria-controls='payment-details'
          aria-pressed={selected}
          disabled={pending}
          onClick={() => onView(order._id)}
          className={actionClass}
        >
          <span>View</span>
          <span className='xl:hidden'>{presentation.actionText}</span>
          <ArrowRight size={16} aria-hidden='true' className='xl:hidden' />
        </button>
      </div>
      <div className={metadataClass}>
        <p className={view.receipts ? 'xl:col-auto' : 'xl:col-span-2'}>
          {presentation.detailedMetadata && <span className={metadataLabelClass}>Method</span>}
          {presentation.methodText}{presentation.methodSuffix}
        </p>
        <p>
          {presentation.detailedMetadata && <span className={metadataLabelClass}>Paid at</span>}
          {!presentation.detailedMetadata && presentation.dateLabel + ' '}
          {presentation.date.date}
          {presentation.date.time && ' · ' + presentation.date.time}
        </p>
        {!view.awaiting && (
          <p>
            {presentation.detailedMetadata && <span className={metadataLabelClass}>Confirmed by</span>}
            {!presentation.detailedMetadata && 'Confirmed by '}
            {order.confirmedBy || 'Not recorded'}
          </p>
        )}
      </div>
    </li>
  )
}

const renderLegacyRow = (order, view, selectedId, pending, onView) => {
  const selected = order._id === selectedId
  const dateValue = view.awaiting ? order.sentToCashierAt : order.paidAt
  const date = orderDate(dateValue)
  let cellClass = 'border-y px-3 py-3 border-slate-100 dark:border-slate-800'
  if (selected) cellClass = 'border-y px-3 py-3 border-amber-400 bg-amber-50/70 dark:bg-amber-400/10'

  let primaryReference = '#' + order._id
  if (view.receipts) primaryReference = receiptDisplayValue(order)

  let paymentCells
  if (view.awaiting) {
    paymentCells = (
      <>
        <td className={cellClass}>{order.items?.length || 0}</td>
        <td className={cellClass + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>
          {formatOrderMoney(order.amount, order)}
        </td>
        <td className={cellClass}><OrderStatusBadge status='Pending' /></td>
      </>
    )
  } else {
    let paymentMethod = order.paymentMethod
    if (paymentMethod === 'COD') paymentMethod = 'Cash'
    let receiptReference = receiptDisplayValue(order)
    if (view.receipts) receiptReference = '#' + order._id

    paymentCells = (
      <>
        <td className={cellClass + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>
          {formatOrderMoney(order.amount, order)}
        </td>
        <td className={cellClass}>{paymentMethod}</td>
        <td className={cellClass}><p className='max-w-36 break-all'>{receiptReference}</p></td>
      </>
    )
  }

  return (
    <tr key={order._id}>
      <td className={cellClass + ' rounded-l-lg border-l'}>
        <div className='flex items-center gap-2'>
          {view.awaiting && (
            <img
              src={order.items?.[0]?.image?.[0] || assets.parcel_icon}
              alt=''
              className='h-10 w-9 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-800'
            />
          )}
          <div>
            <p className='font-mono max-w-40 break-all font-semibold text-slate-900 dark:text-slate-100'>{primaryReference}</p>
            {view.awaiting && <p className='mt-1 text-[11px]'>{order.items?.length || 0} items</p>}
          </div>
        </div>
      </td>
      <td className={cellClass}>
        <p className='min-w-20 max-w-36 break-words font-medium text-slate-900 dark:text-slate-100'>{orderName(order)}</p>
      </td>
      {paymentCells}
      <td className={cellClass}>
        <p className='whitespace-nowrap'>{date.date}</p>
        <p className='mt-1 text-[11px]'>{date.time}</p>
        {!view.awaiting && <p className='mt-1 max-w-40 break-all text-[11px]'>{order.confirmedBy || 'Not recorded'}</p>}
      </td>
      <td className={cellClass + ' rounded-r-lg border-r'}>
        <button
          type='button'
          aria-label={'View payment ' + order._id}
          aria-controls='payment-details'
          aria-pressed={selected}
          disabled={pending}
          onClick={() => onView(order._id)}
          className='inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
        >
          <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-4 w-4'>
            <path d='M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z' />
            <circle cx='12' cy='12' r='3' />
          </svg>
          View
        </button>
      </td>
    </tr>
  )
}

const CashierTable = ({ orders, filter, selectedId, loading, pending, onView, v2 = false, query = '', error = '' }) => {
  const view = createView(filter)
  const hasQuery = Boolean(query.trim())
  const emptyState = getEmptyState(view, hasQuery, error)
  const containerClass = 'min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/60'
  let v2ListClass = listClass
  if (view.transactions || view.receipts) {
    v2ListClass += ' min-h-[720px] max-md:min-h-[480px]'
  }

  if (v2) {
    let listContent
    if (loading) {
      listContent = <p role='status' className={emptyClass}>{view.loadingMessage}</p>
    } else if (!orders.length) {
      listContent = (
        <div className={emptyClass} role='status'>
          <span aria-hidden='true'><Minus size={28} /></span>
          <h3>{emptyState.title}</h3>
          <p>{emptyState.description}</p>
        </div>
      )
    } else {
      listContent = (
        <>
          <div className='hidden gap-3 rounded-md bg-[var(--pamo-color-surface-subtle)] px-2.5 py-4 text-[10px] uppercase xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,.9fr)_60px]' aria-hidden='true'>
            <span>{view.primaryColumn}</span>
            <span>Student</span>
            <span>{view.amountColumn}</span>
            <span>{view.referenceColumn}</span>
            <span>Action</span>
          </div>
          <ul className='cashier-payments-records grid gap-3.5 pt-5 xl:pt-2.5'>
            {orders.map(order => renderV2Record(order, view, selectedId, pending, onView))}
          </ul>
        </>
      )
    }

    let listNote = view.emptyNote
    if (hasQuery) listNote = 'No records match this search.'
    if (orders.length) {
      listNote = orders.length + ' ' + view.resultLabel + ' in this view · Select a record to inspect its details.'
    }

    return (
      <section className={v2ListClass} aria-labelledby='cashier-list-heading' aria-busy={loading || pending}>
        <header className='border-b border-[color:var(--pamo-color-border-default)] pb-[22px]'>
          <h2 id='cashier-list-heading' className='text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)]'>{view.title}</h2>
          <p className='mt-1.5 text-[color:var(--pamo-color-text-secondary)]'>{view.description}</p>
        </header>
        {listContent}
        {!loading && !error && <p className='cashier-payments-list-note mt-auto pt-5 text-xs text-[color:var(--pamo-color-text-secondary)]'>{listNote}</p>}
      </section>
    )
  }

  if (loading) {
    return (
      <div className={containerClass}>
        <p role='status' className='p-8 text-center text-sm'>Loading payments…</p>
      </div>
    )
  }

  if (!orders.length) {
    let description = 'Try another search or payment tab.'
    if (view.awaiting) description = 'Orders sent to Cashier will appear here while awaiting payment.'

    return (
      <div className={containerClass}>
        <div className='p-8 text-center'>
          <h2 className='font-semibold text-slate-900 dark:text-slate-100'>No matching payments</h2>
          <p className='mt-2 text-sm'>{description}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={containerClass}>
      <div className='overflow-x-auto' tabIndex={0} role='region' aria-label={filter + ' table'} aria-busy={pending}>
        <table className='w-full min-w-[780px] border-separate border-spacing-y-1 text-left text-xs'>
          <thead>
            <tr>
              {view.headings.map(heading => <th key={heading} scope='col' className='px-3 py-2 text-[11px] font-medium'>{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {orders.map(order => renderLegacyRow(order, view, selectedId, pending, onView))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default CashierTable
