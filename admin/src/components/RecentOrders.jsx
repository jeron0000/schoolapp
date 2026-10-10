import { OrderStatusBadge } from './OrderDetails'
import { getOrderStatusLabel, orderDate } from '../utils/orderPresentation'

const cellClass = 'block min-w-0 [overflow-wrap:anywhere] [@container(min-width:40rem)]:table-cell [@container(min-width:40rem)]:py-3 [@container(min-width:40rem)]:pr-3 [@container(min-width:40rem)]:align-top'
const labelClass = 'sr-only [@container(min-width:40rem)]:hidden'

const RecentOrders = ({ status, orders, formatMoney }) => {
  // The overview endpoint returns at most six orders, already newest first.
  const valid = Array.isArray(orders) && orders.length <= 6
    && orders.every(order => order && typeof order._id === 'string' && order._id.trim()
      && typeof order.status === 'string' && order.status.trim())
    && new Set(orders.map(order => order._id)).size === orders.length
  let message = ''
  if (status === 'loading') message = 'Loading recent orders…'
  else if (status !== 'success' || !valid) message = 'Recent orders could not be loaded.'
  else if (!orders.length) message = 'No recent orders.'

  if (message) return (
    <div aria-busy={status === 'loading'} className='flex min-h-32 min-w-0 flex-1 items-center justify-center py-6'>
      <p role='status' className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
    </div>
  )

  return (
    <div className='min-w-0 pt-4 [container-type:inline-size]'>
      <table role='table' className='block w-full table-fixed text-left text-xs [@container(min-width:40rem)]:table'>
        <caption className='sr-only'>Latest orders, newest first</caption>
        <thead role='rowgroup' className='hidden [@container(min-width:40rem)]:table-header-group'>
          <tr role='row'>{['Order', 'Student', 'Amount', 'Date', 'Status'].map(heading => <th key={heading} role='columnheader' scope='col' className='border-b border-slate-200 pb-3 pr-3 font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400'>{heading}</th>)}</tr>
        </thead>
        <tbody role='rowgroup' className='block [@container(min-width:40rem)]:table-row-group'>
          {orders.map(order => {
            const date = orderDate(Number.isFinite(order.date) ? order.date : undefined)
            return <tr key={order._id} role='row' className='grid min-w-0 gap-x-3 gap-y-2 border-b border-slate-100 py-3 last:border-b-0 [@container(min-width:20rem)]:grid-cols-2 [@container(min-width:40rem)]:table-row dark:border-slate-800'>
              <td role='cell' className={cellClass + ' font-semibold leading-5 text-slate-950 dark:text-slate-100'}><span className={labelClass}>Order: </span>#{order._id}</td>
              <td role='cell' className={cellClass + ' leading-5 text-slate-600 dark:text-slate-300'}><span className={labelClass}>Student: </span>{typeof order.customerName === 'string' && order.customerName.trim() ? order.customerName : 'Name not provided'}</td>
              <td role='cell' className={cellClass + ' font-semibold leading-5 tabular-nums text-slate-950 dark:text-slate-100'}><span className={labelClass}>Amount: </span>{Number.isFinite(order.amount) && order.amount >= 0 ? formatMoney(order.amount) : 'Unavailable'}</td>
              <td role='cell' className={cellClass + ' leading-5 text-slate-500 dark:text-slate-400'}><span className={labelClass}>Date: </span>{date.date}{date.time && <span className='block'>{date.time}</span>}</td>
              <td role='cell' className={cellClass + ' [@container(min-width:20rem)]:col-span-2'}><span className={labelClass}>Status: </span><OrderStatusBadge status={order.status} label={getOrderStatusLabel(order)} /></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  )
}

export default RecentOrders
