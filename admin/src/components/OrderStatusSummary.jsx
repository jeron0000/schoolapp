import { statusColors } from '../utils/orderPresentation'

const OrderStatusSummary = ({ status, counts, formatCount }) => {
  const entries = counts && typeof counts === 'object' && !Array.isArray(counts) ? Object.entries(counts) : null
  const valid = entries?.every(([label, value]) => label.trim() && Number.isSafeInteger(value) && value >= 0)
  const total = valid ? entries.reduce((sum, [, value]) => sum + value, 0) : null
  let message = ''
  if (status === 'loading') message = 'Loading order status data…'
  else if (status !== 'success' || !valid || !Number.isSafeInteger(total)) message = 'Order status data unavailable.'
  else if (total === 0) message = 'No orders yet.'

  if (message) return (
    <div aria-busy={status === 'loading'} className='dashboard-state dashboard-chart-state'>
      <p role='status'>{message}</p>
    </div>
  )

  return (
    <dl aria-label='Order status counts' className='dashboard-statuses'>
      {entries.map(([label, value]) => <div key={label} className='dashboard-status'>
        <div className='dashboard-status-label'>
          <dt>{label}</dt>
          <dd>{formatCount(value)} <span>· {Math.round(value / total * 100)}%</span></dd>
        </div>
        <div aria-hidden='true' className='dashboard-status-track'>
          <span className={'block h-full ' + (statusColors[label] || 'text-slate-600 dark:text-slate-300')} style={{ width: `${value / total * 100}%` }}>
            <span className='block h-full bg-current' />
          </span>
        </div>
      </div>)}
    </dl>
  )
}

export default OrderStatusSummary
