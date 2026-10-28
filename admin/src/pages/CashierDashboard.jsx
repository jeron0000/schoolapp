import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { ArrowRight, Banknote, ChartNoAxesCombined, Check, Clock3 } from 'lucide-react'
import { backendUrl } from '../utils/config'
import { AwaitingPaymentSummary, RecentPaymentsSummary } from '../components/CashierPaymentSummaries'
import PaymentMethodBreakdown from '../components/PaymentMethodBreakdown'
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
const periodButtonClass = 'min-h-[47px] min-w-0 rounded-md px-2.5 py-2 text-[length:var(--pamo-staff-small)] font-semibold leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] hover:bg-[var(--pamo-color-border-default)] aria-pressed:bg-[var(--pamo-color-brand-yellow)] aria-pressed:text-slate-950'
const metricClass = 'cashier-dashboard-metric relative min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 first:border-l-[3px] first:border-l-[color:var(--pamo-color-brand-yellow)] [&_dt]:min-h-[42px] [&_dt]:font-semibold max-md:px-3 max-md:py-3.5 max-md:[&_dt]:text-xs max-[339px]:px-2.5 xl:[&_dt]:pl-[54px]'

const metrics = [
  { key: 'totalCollected', monetary: true, label: 'Total Collected', Icon: Banknote, detail: 'Collected, confirmed payments' },
  { key: 'paidTransactions', label: 'Paid Transactions', Icon: Check, detail: 'Confirmed transactions' },
  { key: 'awaitingPayment', label: 'Awaiting Payment', Icon: Clock3, detail: 'Orders needing confirmation' },
  { key: 'averageTransaction', monetary: true, label: 'Average Transaction', Icon: ChartNoAxesCombined, detail: 'Per confirmed transaction' }
]

const isValidSummary = summary => {
  if (!summary) return false

  return metrics.every(metric => {
    const value = summary[metric.key]
    if (!Number.isFinite(value) || value < 0) return false
    return metric.monetary || Number.isSafeInteger(value)
  })
}

const isValidOverview = (data, selectedRange) => {
  return data?.success === true
    && data.currency === 'PHP'
    && data.range?.key === selectedRange
    && data.range.timezone === 'Asia/Manila'
    && typeof data.dataQuality?.collectionPeriodComplete === 'boolean'
    && isValidSummary(data.summary)
}

const createOverview = (data, selectedRange) => ({
  range: selectedRange,
  status: 'success',
  summary: data.summary,
  complete: data.dataQuality.collectionPeriodComplete,
  collectionTrend: data.collectionTrend,
  trendComplete: data.dataQuality.trendComplete,
  paymentMethodBreakdown: data.paymentMethodBreakdown,
  awaitingPayments: data.awaitingPayments,
  recentPayments: data.recentPayments
})

const getStatusMessage = (status, overview) => {
  if (status === 'error') return loadError
  if (status !== 'success') return 'Loading payment summary…'
  if (overview.complete) return 'Payment periods: Asia/Manila.'
  return 'Collection figures are incomplete.'
}

const getCoverageContent = selectedRange => {
  if (selectedRange === 'alltime') {
    return {
      title: 'Historical collection data is incomplete',
      description: 'All Time totals only reflect available records; do not treat these figures as verified lifetime collections.'
    }
  }

  return {
    title: 'Collection figures are incomplete',
    description: 'Figures reflect available verified records for this period. Some historical records are incomplete.'
  }
}

const getMetricPresentation = (metric, status, overview, rangeLabel) => {
  if (status === 'loading') return { value: '—', caption: 'Loading…' }
  if (status !== 'success') return { value: '—', caption: 'Unavailable' }

  const formatter = metric.monetary ? peso : count
  const value = formatter.format(overview.summary[metric.key])
  if (metric.key === 'awaitingPayment') {
    return { value, caption: 'Current queue · not date-filtered' }
  }

  const completeness = overview.complete ? '' : ' · incomplete'
  return { value, caption: rangeLabel + completeness }
}

const getMetricClassName = (metric, status, overview) => {
  const hasPendingPayments = metric.key === 'awaitingPayment'
    && status === 'success'
    && overview.summary.awaitingPayment > 0

  if (hasPendingPayments) {
    return metricClass + ' cashier-dashboard-metric-pending border-[color:var(--pamo-color-brand-yellow)]'
  }
  return metricClass
}

const CashierDashboardSection = ({ id, title, description, to, actionLabel, children }) => (
  <section aria-labelledby={id} className='cashier-dashboard-panel flex min-w-0 flex-col rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[18px] max-md:p-4'>
    <header className='flex flex-wrap items-start justify-between gap-3.5 border-b border-[color:var(--pamo-color-border-default)] pb-5'>
      <div className='min-w-0 flex-[1_1_200px]'>
        <h2 id={id} className='text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)]'>{title}</h2>
        <p className='mt-[7px] text-[length:var(--pamo-staff-small)] text-[color:var(--pamo-color-text-secondary)]'>{description}</p>
      </div>
      {to && <Link to={to} className='cashier-dashboard-action inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-[7px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-semibold hover:border-[color:var(--pamo-color-accent-text)]'>
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
        if (!isValidOverview(data, selectedRange)) throw new Error(loadError)
        setOverview(createOverview(data, selectedRange))
      } catch {
        if (active) setOverview({ range: selectedRange, status: 'error' })
      }
    }
    loadOverview()
    return () => { active = false; controller.abort() }
  }, [token, selectedRange])

  const message = getStatusMessage(status, overview)
  const coverage = getCoverageContent(selectedRange)

  return (
    <section aria-labelledby='cashier-dashboard-heading' className='cashier-dashboard-v2 mx-auto grid max-w-[2240px] min-w-0 gap-6 break-words px-[clamp(16px,2.4vw,40px)] pb-8 pt-7 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] max-xl:gap-5 max-xl:px-[clamp(12px,2.2vw,44px)] max-xl:py-[clamp(18px,2.4vw,40px)]'>
      <header className='cashier-dashboard-heading flex flex-wrap items-center justify-between gap-6'>
        <div className='cashier-dashboard-title min-w-0'>
          <p className='cashier-dashboard-eyebrow mb-2 text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>Financial overview</p>
          <div className='border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-[17px]'>
            <h1 id='cashier-dashboard-heading' className='text-[length:var(--pamo-staff-heading)] font-bold leading-[var(--pamo-staff-heading-leading)] tracking-[-.03em] text-[color:var(--pamo-color-text-primary)]'>Cashier Dashboard</h1>
            <p className='mt-2.5 text-[length:var(--pamo-staff-body)] text-[color:var(--pamo-color-text-secondary)]'>Payments and collections at a glance.</p>
          </div>
        </div>
        <div className='cashier-dashboard-period w-full min-w-0 xl:w-[min(50%,536px)]'>
          <fieldset aria-describedby='cashier-dashboard-range-note' className='min-w-0'>
            <legend className='mb-2 text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)] xl:sr-only'>Reporting period</legend>
            <div className='cashier-dashboard-period-control'>
              <div className='cashier-dashboard-period-buttons grid grid-cols-5 gap-1.5 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-1.5'>
                {ranges.map(range => <button key={range.key} type='button' aria-pressed={selectedRange === range.key} onClick={() => selectRange(range.key)} className={periodButtonClass}>{range.label}</button>)}
              </div>
              <p className='mt-2 text-[11px] text-[color:var(--pamo-color-text-secondary)] xl:text-right'>Asia/Manila · This Year: January 1 through today</p>
            </div>
          </fieldset>
          <p id='cashier-dashboard-range-note' role='status' className='sr-only'>{message}</p>
        </div>
      </header>

      {status === 'success' && !overview.complete && <aside className='cashier-dashboard-coverage rounded-[7px] border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] px-4 py-3 text-[color:var(--cashier-warning)]'>
        <strong>{coverage.title}</strong>
        <p className='mt-1 text-xs text-[color:var(--pamo-color-text-secondary)]'>{coverage.description}</p>
      </aside>}
      {status === 'error' && <p role='alert' className='cashier-dashboard-coverage rounded-[7px] border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] px-4 py-3 text-[color:var(--cashier-warning)]'>{loadError} Select another reporting period to retry.</p>}

      <div role='list' aria-label='Cashier payment summary' aria-describedby='cashier-dashboard-range-note' aria-busy={status === 'loading'} className='cashier-dashboard-metrics grid min-w-0 grid-cols-2 gap-5 max-md:gap-3 max-[339px]:grid-cols-1 xl:grid-cols-4'>
        {metrics.map(metric => {
          const { value, caption } = getMetricPresentation(metric, status, overview, rangeLabel)
          const className = getMetricClassName(metric, status, overview)
          const Icon = metric.Icon
          return (
            <div key={metric.key} role='listitem' className={className}>
              <span className='cashier-dashboard-metric-icon absolute left-3.5 top-4 hidden h-[42px] w-[42px] place-items-center rounded-lg bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)] xl:grid'>
                <Icon aria-hidden='true' size={22} />
              </span>
              <dl>
                <dt>{metric.label}</dt>
                <dd className={`cashier-dashboard-metric-value mt-2 text-[clamp(24px,2.1vw,28px)] font-bold leading-tight tracking-[-.025em] tabular-nums [overflow-wrap:anywhere] ${metric.monetary ? 'font-financial' : ''}`}>
                  {status === 'success' && value}
                  {status !== 'success' && <><span aria-hidden='true'>—</span><span className='sr-only'>{caption}</span></>}
                </dd>
                <dd className='cashier-dashboard-metric-caption mt-4 text-xs text-[color:var(--pamo-color-text-secondary)] max-md:text-[11px]'>{caption}</dd>
                <dd className='cashier-dashboard-metric-detail mt-1.5 text-[11px] text-[color:var(--pamo-color-text-secondary)] max-md:hidden'>{metric.detail}</dd>
              </dl>
            </div>
          )
        })}
      </div>

      <div className='cashier-dashboard-charts grid min-w-0 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]'>
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

      <div className='cashier-dashboard-summaries grid min-w-0 gap-5 xl:grid-cols-2'>
        <CashierDashboardSection id='cashier-awaiting-heading' title='Awaiting Payment' description='Current orders awaiting payment confirmation.' to={paymentsPath} actionLabel='View All Payments'>
          <AwaitingPaymentSummary status={status} payments={overview?.awaitingPayments} paymentsPath={paymentsPath} formatCurrency={peso.format} />
        </CashierDashboardSection>
        <CashierDashboardSection id='cashier-recent-heading' title='Recent Payments' description={'Latest confirmed payments during ' + rangeLabel + '.'} to={transactionsPath} actionLabel='View Transactions'>
          <RecentPaymentsSummary status={status} payments={overview?.recentPayments} complete={overview?.complete} formatCurrency={peso.format} rangeLabel={rangeLabel} />
        </CashierDashboardSection>
      </div>
      <p className='cashier-dashboard-footnote text-xs leading-relaxed text-[color:var(--pamo-color-text-secondary)]'>Financial figures are based on existing verified collection records. No demonstration data is shown.</p>
    </section>
  )
}

export default CashierDashboard
