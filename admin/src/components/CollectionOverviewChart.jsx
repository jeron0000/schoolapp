import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../hooks/useTheme'

const axisPeso = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1
})
const dateFormat = options => new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'UTC' })
const bucketFormats = {
  hour: [dateFormat({ hour: 'numeric', hour12: true }), dateFormat({ year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', hour12: true })],
  day: [dateFormat({ month: 'short', day: 'numeric' }), dateFormat({ year: 'numeric', month: 'short', day: 'numeric' })],
  month: [dateFormat({ year: 'numeric', month: 'short' }), dateFormat({ year: 'numeric', month: 'short' })]
}
const bucketPatterns = {
  hour: /^\d{4}-\d{2}-\d{2}T\d{2}$/, day: /^\d{4}-\d{2}-\d{2}$/, month: /^\d{4}-\d{2}$/, year: /^\d{4}$/
}
// Keys already describe Manila calendar buckets; UTC formatting preserves their displayed dates/hours.
const bucketDate = (key, granularity) => new Date(key + {
  hour: ':00:00Z', day: 'T00:00:00Z', month: '-01T00:00:00Z', year: '-01-01T00:00:00Z'
}[granularity])

const formatBucket = (key, granularity, full = false) => {
  if (granularity === 'year') return key
  const formatIndex = full ? 1 : 0
  return bucketFormats[granularity][formatIndex].format(bucketDate(key, granularity))
}

const validPoint = (point, granularity) => {
  if (!point || typeof point.key !== 'string' || !bucketPatterns[granularity]?.test(point.key)) return false

  const date = bucketDate(point.key, granularity)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, point.key.length) !== point.key) return false
  if (typeof point.label !== 'string' || !point.label.trim()) return false
  if (!Number.isFinite(point.amount) || point.amount < 0) return false
  return Number.isSafeInteger(point.transactionCount) && point.transactionCount >= 0
}

const validTrend = data => {
  if (!data || !Object.hasOwn(bucketPatterns, data.granularity) || !Array.isArray(data.points)) return false
  if (!Number.isFinite(data.undatedAmount) || data.undatedAmount < 0) return false
  if (!Number.isSafeInteger(data.undatedTransactions) || data.undatedTransactions < 0) return false

  return data.points.every((point, index) => {
    if (!validPoint(point, data.granularity)) return false
    if (index === 0) return true
    return point.key > data.points[index - 1].key
  })
}

const getCollectionMessage = (status, data, complete, valid, rangeLabel) => {
  if (status === 'loading') return 'Loading collections…'
  if (status !== 'success' || !valid) return 'Collection data unavailable.'
  if (data.points.some(point => point.amount > 0)) return ''
  if (complete) return `No collections for ${rangeLabel}.`
  return 'No dated collections recorded in the available data.'
}

const getQualityNote = (status, data, complete, valid, formatCurrency) => {
  if (status !== 'success' || !valid) return null
  if (data.undatedTransactions > 0) {
    return `Payments without a recorded date (${formatCurrency(data.undatedAmount)}) are not plotted.`
  }
  if (!complete) return 'Collection data for this period is incomplete.'
  return null
}

const CollectionTooltip = ({ active, payload, granularity, formatCurrency }) => {
  const point = payload?.[0]?.payload
  if (!active || !validPoint(point, granularity)) return null

  return (
    <div role='status' aria-live='polite' className='w-36 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900'>
      <p className='text-xs leading-4 text-slate-600 dark:text-slate-300'>{formatBucket(point.key, granularity, true)}</p>
      <p className='mt-1 [overflow-wrap:anywhere] text-sm font-semibold leading-5 tabular-nums text-slate-950 dark:text-slate-100'>
        <span className='sr-only'>Collected amount: </span>
        {formatCurrency(point.amount)}
      </p>
    </div>
  )
}

const CollectionOverviewChart = ({ status, data, complete, formatCurrency, rangeLabel = 'this period' }) => {
  const { theme } = useTheme()
  const [compact, setCompact] = useState(true)
  const valid = typeof complete === 'boolean' && validTrend(data)
  const message = getCollectionMessage(status, data, complete, valid, rangeLabel)
  const qualityNote = getQualityNote(status, data, complete, valid, formatCurrency)
  const empty = status === 'success' && valid
  const dataEmpty = empty ? '' : undefined

  if (message) {
    return (
      <div role='status' aria-busy={status === 'loading'} data-empty={dataEmpty} className='cashier-dashboard-empty flex min-h-40 min-w-0 flex-1 flex-col items-center justify-center gap-2 py-6 sm:min-h-48'>
        {empty && <span aria-hidden='true' className='cashier-dashboard-empty-symbol'>—</span>}
        <p className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
        {qualityNote && <p className='max-w-xs text-center text-xs leading-5 text-slate-500 dark:text-slate-400'>{qualityNote}</p>}
        {empty && !qualityNote && <p className='cashier-dashboard-empty-detail'>This space displays your payment trend once recorded payments exist.</p>}
      </div>
    )
  }

  const dark = theme === 'dark'
  const accent = dark ? '#ffd100' : '#d97706'
  const muted = dark ? '#94a3b8' : '#64748b'
  const grid = dark ? '#334155' : '#e2e8f0'
  const chartLabel = `Collected amount by ${data.granularity} (Asia/Manila)`
  const handleResize = width => setCompact(width < 420)

  return (
    <figure aria-labelledby='cashier-collection-heading' className='min-h-40 min-w-0 flex-1 pt-4 sm:min-h-48'>
      <figcaption className='sr-only'>{chartLabel}. Focus the chart and use the left and right arrow keys to inspect each period.</figcaption>
      <div className='h-36 min-w-0 w-full sm:h-44'>
        <ResponsiveContainer width='100%' height='100%' minWidth={0} onResize={handleResize}>
          <BarChart data={data.points} accessibilityLayer aria-label={chartLabel} margin={{ top: 8, right: compact ? 4 : 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray='3 3' vertical={false} />
            <XAxis
              dataKey='key'
              tickFormatter={key => formatBucket(key, data.granularity)}
              interval='preserveStartEnd'
              minTickGap={compact ? 24 : 32}
              tick={{ fill: muted, fontSize: compact ? 11 : 12 }}
              tickLine={false}
              axisLine={{ stroke: grid }}
              tickMargin={8}
              height={28}
            />
            <YAxis
              tickFormatter={amount => axisPeso.format(amount)}
              domain={[0, 'auto']}
              width={compact ? 48 : 52}
              tickCount={compact ? 3 : 4}
              tick={{ fill: muted, fontSize: compact ? 11 : 12 }}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
            />
            <Tooltip
              content={<CollectionTooltip granularity={data.granularity} formatCurrency={formatCurrency} />}
              allowEscapeViewBox={{ x: false, y: false }}
              cursor={{ fill: grid }}
              isAnimationActive={false}
            />
            <Bar dataKey='amount' name='Collected Amount' fill={accent} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {qualityNote && <p className='mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400'>{qualityNote}</p>}
      <div className='sr-only'>
        <table>
          <caption>{chartLabel}</caption>
          <thead>
            <tr>
              <th scope='col'>Period</th>
              <th scope='col'>Collected amount</th>
            </tr>
          </thead>
          <tbody>
            {data.points.map(point => (
              <tr key={point.key}>
                <th scope='row'>{formatBucket(point.key, data.granularity, true)}</th>
                <td>{formatCurrency(point.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

export default CollectionOverviewChart
