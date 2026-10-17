import { useState } from 'react'
import { OrderStatusBadge } from './OrderDetails'
import { getOrderStatusLabel, orderDate } from '../utils/orderPresentation'
import { Copy } from './DashboardIcons'
import { formatOrderMoney } from '../../../shared/money.js'

const RecentOrders = ({ status, orders }) => {
  const [copyFeedback, setCopyFeedback] = useState('')
  const copyOrderId = async id => {
    try {
      await navigator.clipboard.writeText(id)
      setCopyFeedback(`Copied full order ID #${id}.`)
    } catch {
      setCopyFeedback(`Unable to copy. Full order ID: ${id}`)
    }
  }
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
    <div aria-busy={status === 'loading'} className='dashboard-state'>
      <p role='status'>{message}</p>
    </div>
  )

  return (
    <div className='dashboard-recent-orders'>
      <table role='table'>
        <caption className='sr-only'>Latest orders, newest first</caption>
        <thead role='rowgroup'>
          <tr role='row'>{['Order', 'Student', 'Amount', 'Status'].map(heading => <th key={heading} role='columnheader' scope='col'>{heading}</th>)}</tr>
        </thead>
        <tbody role='rowgroup'>
          {orders.map(order => {
            const date = orderDate(Number.isFinite(order.date) ? order.date : undefined)
            return <tr key={order._id} role='row'>
              <td role='cell' className='dashboard-order-id'><span className='dashboard-cell-label'>Order: </span><button type='button' onClick={() => copyOrderId(order._id)} title={`Full order ID: ${order._id}`} aria-label={`Copy full order ID ${order._id}`} className='dashboard-copy-order'>#{order._id.length > 14 ? order._id.slice(0, 8) + '…' + order._id.slice(-4) : order._id}<Copy size={14} aria-hidden='true' /></button><span className='dashboard-order-date'>{date.date}{date.time && <span>{date.time}</span>}</span></td>
              <td role='cell'><span className='dashboard-cell-label'>Student: </span>{typeof order.customerName === 'string' && order.customerName.trim() ? order.customerName : 'Name not provided'}</td>
              <td role='cell' className='dashboard-order-amount'><span className='dashboard-cell-label'>Amount: </span>{formatOrderMoney(order.amount, order)}</td>
              <td role='cell'><span className='dashboard-cell-label'>Status: </span><OrderStatusBadge status={order.status} label={getOrderStatusLabel(order)} /></td>
            </tr>
          })}
        </tbody>
      </table>
      <p role='status' className='dashboard-copy-feedback'>{copyFeedback}</p>
      <p className='dashboard-panel-note'>Copy the full reference, then open Orders to view its record.</p>
    </div>
  )
}

export default RecentOrders
