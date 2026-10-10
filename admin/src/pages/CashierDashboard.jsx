import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { backendUrl } from '../utils/config'
import { AwaitingPaymentSummary, RecentPaymentsSummary } from '../components/CashierPaymentSummaries'
import PaymentMethodBreakdown from '../components/PaymentMethodBreakdown'

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
  { key: 'totalCollected', monetary: true, label: 'Total Collected', caption: 'Selected period', icon: 'M17 5c0 1.7-3.1 3-7 3S3 6.7 3 5s3.1-3 7-3 7 1.3 7 3ZM3 5v5c0 1.7 3.1 3 7 3m7-8v4M3 10v5c0 1.7 3.1 3 7 3M14 11c0 1.1 1.6 2 3.5 2s3.5-.9 3.5-2-1.6-2-3.5-2-3.5.9-3.5 2Zm0 0v5c0 1.1 1.6 2 3.5 2s3.5-.9 3.5-2v-5m-7 5v4c0 1.1 1.6 2 3.5 2s3.5-.9 3.5-2v-4', color: 'text-amber-700 dark:text-amber-400' },
  { key: 'paidTransactions', label: 'Paid Transactions', caption: 'Selected period', icon: 'M2 3h3l3 13h10l3-10H6M8 16l-1 3h12M10 22h.01M18 22h.01', color: 'text-blue-600 dark:text-blue-400' },
  { key: 'awaitingPayment', label: 'Awaiting Payment', caption: 'Current payment queue', icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', color: 'text-orange-600 dark:text-orange-400' },
  { key: 'averageTransaction', monetary: true, label: 'Average Transaction', caption: 'Selected period', icon: 'M4 13h3v8H4ZM10.5 3h3v18h-3ZM17 8h3v13h-3Z', color: 'text-amber-700 dark:text-amber-400' }
]

const CashierDashboardSection = ({ id, title, description, to, actionLabel, children }) => (
  <section aria-labelledby={id} className='flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'>
    <header className='flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800'>
      <div className='min-w-0 flex-1 basis-full sm:basis-auto'>
        <h2 id={id} className='break-words text-lg font-semibold tracking-tight text-slate-950 sm:text-xl dark:text-slate-100'>{title}</h2>
        <p className='mt-1 text-sm leading-5 text-slate-600 dark:text-slate-400'>{description}</p>
      </div>
      {to && <Link to={to} className='inline-flex min-h-11 max-w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'>
        {actionLabel}
        <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4 shrink-0'><path d='M4 12h16m-6-6 6 6-6 6' /></svg>
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
  <section aria-labelledby='cashier-dashboard-heading' className='mx-auto min-w-0 max-w-screen-2xl space-y-4 sm:space-y-5'>
    <header className='flex flex-wrap items-start justify-between gap-4'>
      <div className='min-w-0 flex-1 basis-full xl:basis-auto'>
        <h1 id='cashier-dashboard-heading' className='break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100'>Cashier Dashboard</h1>
        <p className='mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400'>Payments and collections at a glance.</p>
      </div>
      <div className='w-full min-w-0 max-w-full sm:w-auto'>
        <fieldset aria-describedby='cashier-dashboard-range-note' className='grid min-w-0 grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 min-[480px]:grid-cols-3 sm:grid-cols-5 dark:border-slate-800 dark:bg-slate-900'>
          <legend className='sr-only'>Time range</legend>
          {ranges.map(range => <button key={range.key} type='button' aria-pressed={selectedRange === range.key} onClick={() => selectRange(range.key)} className={'min-h-11 min-w-0 rounded-md px-3 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 ' + (selectedRange === range.key ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800')}>{range.label}</button>)}
        </fieldset>
        <p id='cashier-dashboard-range-note' role='status' className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{message}</p>
      </div>
    </header>

    <div role='list' aria-label='Cashier payment summary' aria-describedby='cashier-dashboard-range-note' aria-busy={status === 'loading'} className='grid min-w-0 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4'>
      {metrics.map(metric => {
        let value = '—'
        let caption = status === 'loading' ? 'Loading…' : 'Unavailable'
        if (status === 'success') {
          value = (metric.monetary ? peso : count).format(overview.summary[metric.key])
          caption = metric.key === 'awaitingPayment' ? metric.caption : rangeLabel
        }
        return <div key={metric.key} role='listitem' className='flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:gap-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'>
        <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 sm:h-12 sm:w-12 dark:bg-slate-800'>
          <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className={'h-6 w-6 ' + metric.color}><path d={metric.icon} /></svg>
        </span>
        <dl className='min-w-0 flex-1'>
          <dt className='break-words text-sm font-medium text-slate-600 dark:text-slate-300'>{metric.label}</dt>
          <dd className='mt-2 [overflow-wrap:anywhere] text-2xl font-semibold tabular-nums tracking-tight text-slate-950 2xl:text-3xl dark:text-slate-100'>{status === 'success' ? value : <><span aria-hidden='true'>—</span><span className='sr-only'>{caption}</span></>}</dd>
          <dd className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{caption}</dd>
        </dl>
      </div>})}
    </div>

    <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
      <CashierDashboardSection id='cashier-collection-heading' title='Collection Overview' description='Confirmed payments over the selected period.'>
        <Suspense fallback={<div role='status' aria-busy='true' className='flex min-h-40 min-w-0 flex-1 items-center justify-center py-6 sm:min-h-48'>
          <p className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>Loading collections…</p>
        </div>}>
          <CollectionOverviewChart status={status} data={overview?.collectionTrend} complete={overview?.trendComplete} formatCurrency={peso.format} />
        </Suspense>
      </CashierDashboardSection>
      <CashierDashboardSection id='cashier-methods-heading' title='Payment Methods' description='Distribution of collected payments.'>
        <PaymentMethodBreakdown status={status} data={overview?.paymentMethodBreakdown} complete={overview?.complete} formatCurrency={peso.format} />
      </CashierDashboardSection>
    </div>

    <div className='grid min-w-0 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]'>
      <CashierDashboardSection id='cashier-awaiting-heading' title='Awaiting Payment' description='Orders waiting for payment confirmation.' to={paymentsPath} actionLabel='View All Payments'>
        <AwaitingPaymentSummary status={status} payments={overview?.awaitingPayments} paymentsPath={paymentsPath} formatCurrency={peso.format} />
      </CashierDashboardSection>
      <CashierDashboardSection id='cashier-recent-heading' title='Recent Payments' description='Latest confirmed payments.' to={transactionsPath} actionLabel='View All Transactions'>
        <RecentPaymentsSummary status={status} payments={overview?.recentPayments} complete={overview?.complete} formatCurrency={peso.format} />
      </CashierDashboardSection>
    </div>
  </section>
)
}

export default CashierDashboard
