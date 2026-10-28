import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../hooks/useTheme'

const axisPeso = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1
})
const shortDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
const fullDate = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
const dateValue = value => new Date(value + 'T00:00:00Z')

const validTrend = data => Array.isArray(data) && data.every((entry, index) => {
  const date = dateValue(entry?.date)
  return typeof entry?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
    && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === entry.date
    && Number.isFinite(entry.sales) && entry.sales >= 0
    && (!index || entry.date > data[index - 1].date)
})

const SalesTooltip = ({ active, payload, formatSales }) => {
  const point = payload?.[0]?.payload
  if (!active || !point || !Number.isFinite(point.sales)) return null
  return (
    <div role='status' aria-live='polite' className='dashboard-chart-tooltip'>
      <p>{fullDate.format(dateValue(point.date))}</p>
      <p>Merchandise sales</p>
      <p>{formatSales(point.sales)}</p>
    </div>
  )
}

const SalesOverviewChart = ({ status, data, complete, formatSales }) => {
  const { theme } = useTheme()
  let message = ''
  if (status === 'loading') message = 'Loading sales data…'
  else if (status !== 'success' || !validTrend(data)) message = 'Sales data could not be loaded.'
  else if (!data.length) message = 'No sales data for this period.'
  else if (data.every(entry => entry.sales === 0)) message = complete
    ? 'No sales recorded for this period.' : 'No sales recorded in the available data. This period is incomplete.'

  if (message) return (
    <div aria-busy={status === 'loading'} className='dashboard-state dashboard-chart-state'>
      <p role='status'>{message}</p>
    </div>
  )

  const dark = theme === 'dark'
  const accent = dark ? '#ffd100' : '#d97706'
  const muted = dark ? '#94a3b8' : '#64748b'
  const grid = dark ? '#334155' : '#e2e8f0'

  return (
    <figure className='dashboard-sales-chart'>
      <figcaption className='sr-only'>Daily merchandise sales in Philippine Pesos. Focus the chart and use the left and right arrow keys to explore dates.</figcaption>
      <div className='dashboard-chart-plot'>
        <ResponsiveContainer width='100%' height='100%' minWidth={0}>
          <BarChart data={data} accessibilityLayer aria-label='Daily merchandise sales' margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={grid} strokeDasharray='3 3' />
            <XAxis dataKey='date' tickFormatter={value => shortDate.format(dateValue(value))} interval='preserveStartEnd' minTickGap={32}
              tick={{ fill: muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: grid }} tickMargin={8} height={28} />
            <YAxis tickFormatter={axisPeso.format} domain={[0, 'auto']} width={52} tickCount={4}
              tick={{ fill: muted, fontSize: 12 }} tickLine={false} axisLine={false} tickMargin={6} />
            <Tooltip content={<SalesTooltip formatSales={formatSales} />} allowEscapeViewBox={{ x: false, y: false }}
              cursor={{ stroke: muted, strokeDasharray: '3 3' }} isAnimationActive={false} />
            <Bar dataKey='sales' name='Sales' fill={accent} maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className='dashboard-panel-note'>Focus the chart and use arrow keys to inspect daily merchandise sales.</p>
      {!complete && <p role='status' className='dashboard-panel-note'>Sales data for this period is incomplete.</p>}
      <div className='sr-only'>
        <table>
          <caption>Daily merchandise sales</caption>
          <thead><tr><th scope='col'>Date</th><th scope='col'>Sales</th></tr></thead>
          <tbody>{data.map(entry => <tr key={entry.date}><th scope='row'>{fullDate.format(dateValue(entry.date))}</th><td>{formatSales(entry.sales)}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  )
}

export default SalesOverviewChart
