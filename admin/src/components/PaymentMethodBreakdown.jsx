const percent = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })
const validMethod = row => row && (row.method === null || typeof row.method === 'string' && row.method.trim())
  && Number.isSafeInteger(row.transactionCount) && row.transactionCount >= 0
  && Number.isFinite(row.amount) && row.amount >= 0
  && Number.isFinite(row.percentage) && row.percentage >= 0 && row.percentage <= 100
const validBreakdown = data => Array.isArray(data) && data.every(validMethod)
  && new Set(data.map(row => row.method)).size === data.length

const PaymentMethodBreakdown = ({ status, data, complete, formatCurrency }) => {
  const valid = typeof complete === 'boolean' && validBreakdown(data)
  let message
  if (status === 'loading') message = 'Loading payment methods…'
  else if (status !== 'success' || !valid) message = 'Payment-method data unavailable.'
  else if (!data.length) message = complete
    ? 'No payment methods recorded for this period.' : 'No payment methods recorded in the available data for this period.'
  const qualityNote = status === 'success' && valid && !complete ? 'Payment-method data for this period is incomplete.' : null

  if (message) return <div role='status' aria-busy={status === 'loading'} className='flex min-h-40 min-w-0 flex-1 flex-col items-center justify-center gap-2 py-6 sm:min-h-48'>
    <p className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
    {qualityNote && <p className='max-w-xs text-center text-xs leading-5 text-slate-500 dark:text-slate-400'>{qualityNote}</p>}
  </div>

  return <div className='flex min-h-40 min-w-0 flex-1 flex-col justify-center pt-4 sm:min-h-48 [container-type:inline-size]'>
    <ul aria-labelledby='cashier-methods-heading' className='space-y-4'>
      {data.map(row => <li key={row.method ?? ''} className='grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,45%)] items-center gap-x-3 gap-y-2 text-xs [@container(min-width:24rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.25rem_minmax(0,1fr)]'>
        <span className='min-w-0 [overflow-wrap:anywhere] text-sm leading-5 text-slate-700 dark:text-slate-200'>{row.method ?? 'Method not recorded'}</span>
        <span className='min-w-0 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200 [@container(min-width:24rem)]:order-3'>{percent.format(row.percentage)}%<span className='sr-only'> of collected amount</span></span>
        <div aria-hidden='true' className='h-2 min-w-0 rounded-full bg-slate-200 dark:bg-slate-800 [@container(min-width:24rem)]:order-2'>
          <div className='h-full rounded-full bg-amber-700 dark:bg-amber-400' style={{ width: `${row.percentage}%` }} />
        </div>
        <span className='min-w-0 [overflow-wrap:anywhere] text-right leading-5 tabular-nums text-slate-600 dark:text-slate-300 [@container(min-width:24rem)]:order-4'><span className='sr-only'>Collected amount: </span>{formatCurrency(row.amount)}</span>
      </li>)}
    </ul>
    {qualityNote && <p role='status' className='mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400'>{qualityNote}</p>}
  </div>
}

export default PaymentMethodBreakdown
