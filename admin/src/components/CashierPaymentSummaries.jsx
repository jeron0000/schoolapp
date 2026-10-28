import { Link } from 'react-router-dom'
import { orderDate } from '../utils/orderPresentation'

const cellClass = 'block min-w-0 [overflow-wrap:anywhere] [@container(min-width:38rem)]:table-cell [@container(min-width:38rem)]:py-3 [@container(min-width:38rem)]:pr-3 [@container(min-width:38rem)]:align-top [@container(min-width:38rem)]:last:pr-0'
const labelClass = 'block text-[11px] font-normal leading-4 text-slate-500 dark:text-slate-400 [@container(min-width:38rem)]:hidden'
const headingClass = 'border-b border-slate-200 pb-3 pr-3 font-medium text-slate-500 last:pr-0 dark:border-slate-800 dark:text-slate-400'
const rowClass = 'grid min-w-0 gap-x-3 gap-y-2 border-b border-slate-100 py-3 last:border-b-0 [@container(min-width:20rem)]:grid-cols-2 [@container(min-width:38rem)]:table-row dark:border-slate-800'
const awaitingHeadings = ['Order', 'Student', 'Items', 'Amount due', 'Waiting since', 'Action']
const recentHeadings = ['Order', 'Student', 'Amount', 'Method', 'OR / Reference', 'Confirmed']

const validTime = value => Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime())

const validIdentity = row => {
  if (!row || typeof row._id !== 'string' || !row._id.trim()) return false
  return typeof row.studentName === 'string' && Boolean(row.studentName.trim())
}

const validAwaiting = row => {
  if (!validIdentity(row)) return false
  if (!Number.isFinite(row.amountDue) || row.amountDue < 0) return false
  if (!Number.isSafeInteger(row.itemCount) || row.itemCount < 0) return false
  if (row.waitingSince !== null && !validTime(row.waitingSince)) return false
  return [null, 'sentToCashier', 'orderCreated'].includes(row.waitingTimeSource)
}

const validOptionalText = value => value === null || (typeof value === 'string' && Boolean(value.trim()))

const validRecent = row => {
  if (!validIdentity(row)) return false
  if (!Number.isFinite(row.amount) || row.amount < 0 || !validTime(row.paidAt)) return false
  return validOptionalText(row.paymentMethod) && validOptionalText(row.receiptNumber)
}

const shortId = id => {
  if (id.length <= 12) return '#' + id
  return '#' + id.slice(0, 10) + '…'
}

const hasUniqueIds = payments => {
  return new Set(payments.map(payment => payment._id)).size === payments.length
}

const summaryMessage = (status, payments, validRow, name, emptyMessage) => {
  if (status === 'loading') return `Loading ${name}…`

  // The overview contract bounds each list to five entries, already ordered by the backend.
  const invalidPayments = status !== 'success'
    || !Array.isArray(payments)
    || payments.length > 5
    || !payments.every(validRow)
    || !hasUniqueIds(payments)
  if (invalidPayments) return `Unable to load ${name}.`
  if (payments.length === 0) return emptyMessage
  return ''
}

const getWaitingTimeLabel = source => {
  if (source === 'sentToCashier') return 'Sent to Cashier'
  if (source === 'orderCreated') return 'Order created'
  return 'Waiting since'
}

const getPaymentMethodLabel = method => {
  if (method === 'COD') return 'Cash'
  return method || 'Not recorded'
}

const SummaryMessage = ({ status, message, emptyMessage, emptyDetail }) => {
  const empty = message === emptyMessage
  const dataEmpty = empty ? '' : undefined

  return (
    <div data-empty={dataEmpty} aria-busy={status === 'loading'} className='cashier-dashboard-empty flex min-h-28 min-w-0 flex-1 flex-col items-center justify-center py-6 sm:min-h-32'>
      {empty && <span aria-hidden='true' className='cashier-dashboard-empty-symbol'>—</span>}
      <p role='status' className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
      {empty && <p className='cashier-dashboard-empty-detail'>{emptyDetail}</p>}
    </div>
  )
}

export const AwaitingPaymentSummary = ({ status, payments, paymentsPath, formatCurrency }) => {
  const emptyMessage = 'Nothing needs confirmation.'
  const message = summaryMessage(status, payments, validAwaiting, 'awaiting payments', emptyMessage)
  if (message) {
    return <SummaryMessage status={status} message={message} emptyMessage={emptyMessage} emptyDetail='The queue is current, not date-filtered.' />
  }

  return (
    <div className='min-w-0 pt-4 [container-type:inline-size]'>
      <table role='table' className='block w-full table-fixed text-left text-xs [@container(min-width:38rem)]:table'>
        <caption className='sr-only'>Current awaiting payments, in backend queue order</caption>
        <thead role='rowgroup' className='hidden [@container(min-width:38rem)]:table-header-group'>
          <tr role='row'>
            {awaitingHeadings.map(heading => <th key={heading} role='columnheader' scope='col' className={headingClass}>{heading}</th>)}
          </tr>
        </thead>
        <tbody role='rowgroup' className='block [@container(min-width:38rem)]:table-row-group'>
          {payments.map(payment => {
            const date = orderDate(payment.waitingSince ?? undefined)
            const timeLabel = getWaitingTimeLabel(payment.waitingTimeSource)

            return (
              <tr key={payment._id} role='row' className={rowClass}>
                <td role='cell' className={cellClass + ' font-semibold leading-5 text-slate-950 dark:text-slate-100'}>
                  <span className={labelClass}>Order</span>
                  <span className='font-mono' title={'#' + payment._id} aria-label={'Order ' + payment._id}>{shortId(payment._id)}</span>
                </td>
                <td role='cell' className={cellClass + ' leading-5 text-slate-600 dark:text-slate-300'}>
                  <span className={labelClass}>Student</span>
                  {payment.studentName}
                </td>
                <td role='cell' className={cellClass + ' leading-5 text-slate-600 dark:text-slate-300'}>
                  <span className={labelClass}>Items</span>
                  {payment.itemCount}
                </td>
                <td role='cell' className={cellClass + ' font-semibold leading-5 tabular-nums text-slate-950 dark:text-slate-100'}>
                  <span className={labelClass}>Amount due</span>
                  {formatCurrency(payment.amountDue)}
                </td>
                <td role='cell' className={cellClass + ' leading-5 text-slate-500 dark:text-slate-400'}>
                  <span className='block text-[11px]'>{timeLabel}</span>
                  {date.date}
                  {date.time && <span className='block'>{date.time}</span>}
                </td>
                <td role='cell' className={cellClass}>
                  <Link to={paymentsPath} state={{ paymentOrderId: payment._id }} aria-label={'View payment ' + payment._id} className='inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'>
                    <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-4 w-4 shrink-0'>
                      <path d='M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z' />
                      <circle cx='12' cy='12' r='3' />
                    </svg>
                    View
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const RecentPaymentsSummary = ({ status, payments, complete, formatCurrency, rangeLabel = 'this period' }) => {
  const emptyMessage = complete === false ? 'No dated confirmed payments in the available data for this period.' : `No confirmed payments for ${rangeLabel}.`
  const message = summaryMessage(status, payments, validRecent, 'recent payments', emptyMessage)
  const emptyDetail = complete === false
    ? 'Historical coverage is incomplete; these records are not guaranteed lifetime totals.'
    : 'Confirmed transactions will be listed here.'
  if (message) {
    return <SummaryMessage status={status} message={message} emptyMessage={emptyMessage} emptyDetail={emptyDetail} />
  }

  return (
    <div className='min-w-0 pt-4 [container-type:inline-size]'>
      <table role='table' className='block w-full table-fixed text-left text-xs [@container(min-width:38rem)]:table'>
        <caption className='sr-only'>Recent confirmed payments within the selected period, newest first</caption>
        <thead role='rowgroup' className='hidden [@container(min-width:38rem)]:table-header-group'>
          <tr role='row'>
            {recentHeadings.map(heading => <th key={heading} role='columnheader' scope='col' className={headingClass}>{heading}</th>)}
          </tr>
        </thead>
        <tbody role='rowgroup' className='block [@container(min-width:38rem)]:table-row-group'>
          {payments.map(payment => {
            const date = orderDate(payment.paidAt)
            const methodLabel = getPaymentMethodLabel(payment.paymentMethod)

            return (
              <tr key={payment._id} role='row' className={rowClass}>
                <td role='cell' className={cellClass + ' font-semibold leading-5 text-slate-950 dark:text-slate-100'}>
                  <span className={labelClass}>Order</span>
                  <span className='font-mono' title={'#' + payment._id} aria-label={'Order ' + payment._id}>{shortId(payment._id)}</span>
                </td>
                <td role='cell' className={cellClass + ' leading-5 text-slate-600 dark:text-slate-300'}>
                  <span className={labelClass}>Student</span>
                  {payment.studentName}
                </td>
                <td role='cell' className={cellClass + ' font-semibold leading-5 tabular-nums text-slate-950 dark:text-slate-100'}>
                  <span className={labelClass}>Amount</span>
                  {formatCurrency(payment.amount)}
                </td>
                <td role='cell' className={cellClass}>
                  <span className={labelClass}>Method</span>
                  <span className='inline-block max-w-full rounded bg-slate-100 px-2 py-1 text-xs leading-5 text-slate-700 dark:bg-slate-800 dark:text-slate-300'>{methodLabel}</span>
                </td>
                <td role='cell' className={cellClass + ' leading-5 text-slate-600 dark:text-slate-300'}>
                  <span className={labelClass}>OR / Reference</span>
                  <span className='font-mono'>{payment.receiptNumber || '—'}</span>
                </td>
                <td role='cell' className={cellClass + ' leading-5 text-slate-500 dark:text-slate-400'}>
                  <span className={labelClass}>Confirmed</span>
                  {date.date}
                  <span className='block'>{date.time}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
