import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { backendUrl } from '../utils/config'
import { AwaitingPaymentSummary, RecentPaymentsSummary } from '../components/CashierPaymentSummaries'
import PaymentMethodBreakdown from '../components/PaymentMethodBreakdown'
import { ArrowRight, Banknote, Check, Clock3, ChartNoAxesCombined } from 'lucide-react'
import './CashierDashboard.css'

const CollectionOverviewChart = lazy(() => import('../components/CollectionOverviewChart'))

const ranges = [
  { key: 'today', label: 'Today' },
  { key: 'last7days', label: 'Last 7 Days' },
  { key: 'last30days', label: 'Last 30 Days' },
  { key: 'thisyear', label: 'This Year' },
  { key: 'alltime', label: 'All Time' }
]

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const count = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const loadError = 'Payment summary unavailable.'

const metrics = [
  { key: 'totalCollected', monetary: true, label: 'Total Collected', Icon: Banknote, detail: 'Collected, confirmed payments' },
  { key: 'paidTransactions', label: 'Paid Transactions', Icon: Check, detail: 'Confirmed transactions' },
  { key: 'awaitingPayment', label: 'Awaiting Payment', Icon: Clock3, detail: 'Orders needing confirmation' },
  { key: 'averageTransaction', monetary: true, label: 'Average Transaction', Icon: ChartNoAxesCombined, detail: 'Per confirmed transaction' }
]

const CashierDashboardSection = ({ id, title, description, to, actionLabel, children }) => (
  <section aria-labelledby={id} className='cashier-dashboard-panel'>
    <header>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      {to && <Link to={to} className='cashier-dashboard-action'>
        {actionLabel}
        <ArrowRight aria-hidden='true' size={16} />
      </Link>}
    </header>
    {children}
  </section>
)

const CashierDashboard = ({ token, paymentsPath, transactionsPath }) => {
  const [selectedRange, setSelectedRange] = useState('today')
  const [overview, setOverview] = useState(null)
  const status = overview?.range === selectedRange ? overview.status : 'loading'
  const rangeLabel = ranges.find(range => range.key === selectedRange).label
  const selectRange = key => {
    if (key === selectedRange) return
    setSelectedRange(key)
    setOverview(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const loadOverview = async () => {
      try {
        const { data } = await axios.get(backendUrl + '/api/order/cashier/dashboard/overview', {
          headers: { token }, params: { range: selectedRange }, signal: controller.signal
        })
        if (!active) return
        const summary = data?.summary
        if (data?.success !== true || data.currency !== 'PHP' || data.range?.key !== selectedRange
          || data.range.timezone !== 'Asia/Manila' || typeof data.dataQuality?.collectionPeriodComplete !== 'boolean'
          || !summary || !metrics.every(metric => Number.isFinite(summary[metric.key]) && summary[metric.key] >= 0
            && (metric.monetary || Number.isSafeInteger(summary[metric.key])))) {
          throw new Error(loadError)
        }
        setOverview({ range: selectedRange, status: 'success', summary, complete: data.dataQuality.collectionPeriodComplete,
          collectionTrend: data.collectionTrend, trendComplete: data.dataQuality.trendComplete,
          paymentMethodBreakdown: data.paymentMethodBreakdown,
          awaitingPayments: data.awaitingPayments, recentPayments: data.recentPayments })
      } catch {
        if (active) setOverview({ range: selectedRange, status: 'error' })
      }
    }
    loadOverview()
    return () => { active = false; controller.abort() }
  }, [token, selectedRange])

  let message = 'Loading payment summary…'
  if (status === 'error') message = loadError
  if (status === 'success') message = overview.complete ? 'Payment periods: Asia/Manila.' : 'Collection figures are incomplete.'

  return (
    <section aria-labelledby='cashier-dashboard-heading' className='cashier-dashboard-v2'>
      <header className='cashier-dashboard-heading'>
        <div className='cashier-dashboard-title'>
          <p className='cashier-dashboard-eyebrow'>Financial overview</p>
          <div>
            <h1 id='cashier-dashboard-heading'>Cashier Dashboard</h1>
            <p>Payments and collections at a glance.</p>
          </div>
        </div>
        <div className='cashier-dashboard-period'>
          <fieldset aria-describedby='cashier-dashboard-range-note'>
            <legend>Reporting period</legend>
            <div className='cashier-dashboard-period-control'>
              <div className='cashier-dashboard-period-buttons'>
                {ranges.map(range => <button key={range.key} type='button' aria-pressed={selectedRange === range.key} onClick={() => selectRange(range.key)}>{range.label}</button>)}
              </div>
              <p>Asia/Manila · This Year: January 1 through today</p>
            </div>
          </fieldset>
          <p id='cashier-dashboard-range-note' role='status' className='sr-only'>{message}</p>
        </div>
      </header>

      {status === 'success' && !overview.complete && <aside className='cashier-dashboard-coverage'>
        <strong>{selectedRange === 'alltime' ? 'Historical collection data is incomplete' : 'Collection figures are incomplete'}</strong>
        <p>{selectedRange === 'alltime'
          ? 'All Time totals only reflect available records; do not treat these figures as verified lifetime collections.'
          : 'Figures reflect available verified records for this period. Some historical records are incomplete.'}</p>
      </aside>}
      {status === 'error' && <p role='alert' className='cashier-dashboard-coverage'>{loadError} Select another reporting period to retry.</p>}

      <div role='list' aria-label='Cashier payment summary' aria-describedby='cashier-dashboard-range-note' aria-busy={status === 'loading'} className='cashier-dashboard-metrics'>
        {metrics.map(metric => {
          let value = '—'
          let caption = status === 'loading' ? 'Loading…' : 'Unavailable'
          if (status === 'success') {
            value = (metric.monetary ? peso : count).format(overview.summary[metric.key])
            caption = metric.key === 'awaitingPayment' ? 'Current queue · not date-filtered' : rangeLabel + (overview.complete ? '' : ' · incomplete')
          }
          const Icon = metric.Icon
          return (
            <div key={metric.key} role='listitem' className={'cashier-dashboard-metric' + (metric.key === 'awaitingPayment' && status === 'success' && overview.summary.awaitingPayment > 0 ? ' cashier-dashboard-metric-pending' : '')}>
              <span className='cashier-dashboard-metric-icon'>
                <Icon aria-hidden='true' size={22} />
              </span>
              <dl>
                <dt>{metric.label}</dt>
                <dd className='cashier-dashboard-metric-value'>{status === 'success' ? value : <><span aria-hidden='true'>—</span><span className='sr-only'>{caption}</span></>}</dd>
                <dd className='cashier-dashboard-metric-caption'>{caption}</dd>
                <dd className='cashier-dashboard-metric-detail'>{metric.detail}</dd>
              </dl>
            </div>
          )
        })}
      </div>

      <div className='cashier-dashboard-charts'>
        <CashierDashboardSection id='cashier-collection-heading' title='Collection Overview' description='Confirmed payments over the selected period.'>
          <Suspense fallback={<div role='status' aria-busy='true' className='flex min-h-40 min-w-0 flex-1 items-center justify-center py-6 sm:min-h-48'>
            <p className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>Loading collections…</p>
          </div>}>
            <CollectionOverviewChart status={status} data={overview?.collectionTrend} complete={overview?.trendComplete} formatCurrency={peso.format} rangeLabel={rangeLabel} />
          </Suspense>
        </CashierDashboardSection>
        <CashierDashboardSection id='cashier-methods-heading' title='Payment Methods' description='Distribution of collected payments.'>
          <PaymentMethodBreakdown status={status} data={overview?.paymentMethodBreakdown} complete={overview?.complete} formatCurrency={peso.format} rangeLabel={rangeLabel} />
        </CashierDashboardSection>
      </div>

      <div className='cashier-dashboard-summaries'>
        <CashierDashboardSection id='cashier-awaiting-heading' title='Awaiting Payment' description='Current orders awaiting payment confirmation.' to={paymentsPath} actionLabel='View All Payments'>
          <AwaitingPaymentSummary status={status} payments={overview?.awaitingPayments} paymentsPath={paymentsPath} formatCurrency={peso.format} />
        </CashierDashboardSection>
        <CashierDashboardSection id='cashier-recent-heading' title='Recent Payments' description={'Latest confirmed payments during ' + rangeLabel + '.'} to={transactionsPath} actionLabel='View Transactions'>
          <RecentPaymentsSummary status={status} payments={overview?.recentPayments} complete={overview?.complete} formatCurrency={peso.format} rangeLabel={rangeLabel} />
        </CashierDashboardSection>
      </div>
      <p className='cashier-dashboard-footnote'>Financial figures are based on existing verified collection records. No demonstration data is shown.</p>
    </section>
  )
}

export default CashierDashboard
