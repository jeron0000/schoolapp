import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { backendUrl } from '../utils/config'
import OrderStatusSummary from '../components/OrderStatusSummary'
import RecentOrders from '../components/RecentOrders'
import LowStockProducts from '../components/LowStockProducts'
import TopSellingProducts from '../components/TopSellingProducts'

const SalesOverviewChart = lazy(() => import('../components/SalesOverviewChart'))

const summaryCards = [
  { key: 'totalSales', label: 'Total Sales', caption: 'Last 30 days', icon: 'M5 7h14l2 14H3ZM9 7V5a3 3 0 0 1 6 0v2' },
  { key: 'paidOrders', label: 'Paid Orders', caption: 'Last 30 days', icon: 'M3 3h2l3 12h11l2-8H6M9 21h.01M18 21h.01' },
  { key: 'awaitingApproval', label: 'Awaiting Approval', caption: 'Current orders', icon: 'M5 3h10l4 4v14H5ZM14 3v5h5M9 12h6M9 16h4' },
  { key: 'lowStockProducts', label: 'Low Stock Products', caption: 'Current inventory', icon: 'm12 3 9 5v9l-9 5-9-5V8ZM3 8l9 5 9-5M12 13v9' }
]

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const count = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const loadError = 'Dashboard data could not be loaded.'

const DashboardSection = ({ id, title, description, to, actionLabel, children }) => (
  <section aria-labelledby={id} className='flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'>
    <header className='flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800'>
      <div className='min-w-0 flex-1 basis-full border-l-2 border-amber-400 pl-3 sm:basis-auto'>
        <h2 id={id} className='break-words text-sm font-semibold text-slate-950 dark:text-slate-100'>{title}</h2>
        <p className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{description}</p>
      </div>
      {to && <Link to={to} className='inline-flex min-h-11 max-w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'>
        {actionLabel}<svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-4 w-4 shrink-0'><path d='M4 12h16m-6-6 6 6-6 6' /></svg>
      </Link>}
    </header>
    {children}
  </section>
)

const Dashboard = ({ token }) => {
  const [overview, setOverview] = useState(null)
  const status = overview?.status || 'loading'

  useEffect(() => {
    let active = true
    const loadOverview = async () => {
      try {
        const { data } = await axios.get(backendUrl + '/api/dashboard/overview', { headers: { token } })
        if (!active) return
        const summary = data?.summary
        if (data?.success !== true || data.currency !== 'PHP' || !summary
          || typeof data.dataQuality?.salesPeriodComplete !== 'boolean'
          || !summaryCards.every(card => Number.isFinite(summary[card.key]) && summary[card.key] >= 0
            && (card.key === 'totalSales' || Number.isSafeInteger(summary[card.key])))) {
          throw new Error(loadError)
        }
        setOverview({ status: 'success', summary, complete: data.dataQuality.salesPeriodComplete, salesTrend: data.salesTrend,
          orderStatusCounts: data.orderStatusCounts, recentOrders: data.recentOrders,
          lowStockProducts: data.lowStockProducts, topProducts: data.topProducts })
      } catch {
        if (!active) return
        setOverview({ status: 'error' })
        toast.error(loadError)
      }
    }
    loadOverview()
    return () => { active = false }
  }, [token])

  let message = 'Loading dashboard data…'
  if (status === 'error') message = loadError
  if (status === 'success') message = overview.complete
    ? 'Sales and paid orders: last 30 days. Approval and stock: current.'
    : 'Sales figures are incomplete: some paid records lack reliable payment data.'

  return (
  <main aria-labelledby='dashboard-heading' className='mx-auto min-w-0 max-w-screen-2xl space-y-5 sm:space-y-6'>
    <header className='border-l-4 border-amber-400 pl-4'>
      <h1 id='dashboard-heading' className='text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100'>Dashboard</h1>
      <p className='mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400'>Overview of PAMO sales, orders, and inventory.</p>
      <p role='status' className='mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400'>{message}</p>
    </header>

    <dl aria-label='Dashboard summary' aria-busy={status === 'loading'} className='grid min-w-0 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4'>
      {summaryCards.map(card => {
        let value = '—'
        let caption = status === 'loading' ? 'Loading…' : 'Unavailable'
        if (status === 'success') {
          value = (card.key === 'totalSales' ? peso : count).format(overview.summary[card.key])
          caption = card.caption
          if (!overview.complete && ['totalSales', 'paidOrders'].includes(card.key)) caption += ' · Incomplete data'
        }
        return <div key={card.key} className='min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'>
        <dt className='flex items-start gap-2 text-sm font-medium text-slate-600 dark:text-slate-300'>
          <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400'><path d={card.icon} /></svg>
          <span className='min-w-0 break-words'>{card.label}</span>
        </dt>
        <dd className='mt-3 [overflow-wrap:anywhere] text-2xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-slate-100'>{value}</dd>
        <dd className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{caption}</dd>
      </div>})}
    </dl>

    <div className='grid min-w-0 gap-5 sm:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
      <DashboardSection id='sales-overview-heading' title='Sales Overview' description='Merchandise sales over time.'>
        <Suspense fallback={<div role='status' className='flex min-h-44 items-center justify-center py-6 text-sm text-slate-500 sm:min-h-52 dark:text-slate-400'>Loading sales chart…</div>}>
          <SalesOverviewChart status={status} data={overview?.salesTrend} complete={overview?.complete} formatSales={peso.format} />
        </Suspense>
      </DashboardSection>
      <DashboardSection id='order-status-heading' title='Order Status' description='Distribution of PAMO order states.'>
        <OrderStatusSummary status={status} counts={overview?.orderStatusCounts} formatCount={count.format} />
      </DashboardSection>
    </div>

    <div className='grid min-w-0 gap-5 sm:gap-6 xl:grid-cols-2'>
      <DashboardSection id='recent-orders-heading' title='Recent Orders' description='Latest orders from students.' to='/orders' actionLabel='View All Orders'>
        <RecentOrders status={status} orders={overview?.recentOrders} formatMoney={peso.format} />
      </DashboardSection>
      <DashboardSection id='low-stock-heading' title='Low Stock Products' description='Products with low inventory by size.' to='/list' actionLabel='View All Items'>
        <LowStockProducts status={status} products={overview?.lowStockProducts} formatCount={count.format} />
      </DashboardSection>
    </div>

    <DashboardSection id='top-selling-heading' title='Top Selling Products' description='By quantity sold in the last 30 days.'>
      <TopSellingProducts status={status} products={overview?.topProducts} complete={overview?.complete} formatCount={count.format} formatMoney={peso.format} />
    </DashboardSection>
  </main>
)
}

export default Dashboard
