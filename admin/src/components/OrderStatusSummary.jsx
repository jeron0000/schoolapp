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
    <div aria-busy={status === 'loading'} className='flex min-h-44 min-w-0 flex-1 items-center justify-center py-6 sm:min-h-52'>
      <p role='status' className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
    </div>
  )

  return (
    <dl aria-label='Order status counts' className='min-w-0 space-y-3 pt-4'>
      {entries.map(([label, value]) => <div key={label} className='min-w-0'>
        <div className='flex min-w-0 items-start justify-between gap-3'>
          <dt className='min-w-0 [overflow-wrap:anywhere] text-xs leading-5 text-slate-600 dark:text-slate-300'>{label}</dt>
          <dd className='min-w-0 max-w-[50%] [overflow-wrap:anywhere] text-right text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-100'>{formatCount(value)}</dd>
        </div>
        <div aria-hidden='true' className='mt-1.5 h-1.5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800'>
          <span className={'block h-full ' + (statusColors[label] || 'text-slate-600 dark:text-slate-300')} style={{ width: `${value / total * 100}%` }}>
            <span className='block h-full bg-current' />
          </span>
        </div>
      </div>)}
    </dl>
  )
}

export default OrderStatusSummary
