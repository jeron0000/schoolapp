import { lazy, Suspense, useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { backendUrl } from '../utils/config'
import OrderStatusSummary from '../components/OrderStatusSummary'
import RecentOrders from '../components/RecentOrders'
import LowStockProducts from '../components/LowStockProducts'
import TopSellingProducts from '../components/TopSellingProducts'
import { ArrowRight, Banknote, LayoutDashboard, ReceiptText, ShieldAlert } from '../components/DashboardIcons'
import './Dashboard.css'

const SalesOverviewChart = lazy(() => import('../components/SalesOverviewChart'))

const summaryCards = [
  { key: 'totalSales', label: 'Total Sales', caption: 'Last 30 days', icon: Banknote },
  { key: 'paidOrders', label: 'Paid Orders', caption: 'Last 30 days', icon: ReceiptText },
  { key: 'awaitingApproval', label: 'Awaiting Approval', caption: 'Current orders', icon: LayoutDashboard },
  { key: 'lowStockProducts', label: 'Low Stock Products', caption: 'Current inventory', icon: ShieldAlert }
]

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const count = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 })
const loadError = 'Dashboard data could not be loaded.'
const eyebrowClassName = 'text-[length:var(--dashboard-small)] font-semibold uppercase tracking-[.025em] text-[color:var(--pamo-color-accent-text)]'
const panelClassName = 'min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[var(--dashboard-padding)]'
const actionClassName = 'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-[7px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-center text-[length:var(--dashboard-small)] font-semibold text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-border-input)] [&_svg]:shrink-0'
const brandActionClassName = 'border-transparent bg-[var(--pamo-color-brand-yellow)] text-slate-950 hover:border-transparent hover:bg-[var(--pamo-color-brand-hover)]'

const validOverviewResponse = data => {
  const summary = data?.summary
  if (data?.success !== true || data.currency !== 'PHP' || !summary) {
    return false
  }
  if (typeof data.dataQuality?.salesPeriodComplete !== 'boolean') {
    return false
  }
  return summaryCards.every(card => {
    const value = summary[card.key]
    if (!Number.isFinite(value) || value < 0) {
      return false
    }
    return card.key === 'totalSales' || Number.isSafeInteger(value)
  })
}

const getCardPresentation = (card, status, overview) => {
  if (status !== 'success') {
    return {
      value: '—',
      caption: status === 'loading' ? 'Loading…' : 'Unavailable',
    }
  }

  const formatter = card.key === 'totalSales' ? peso : count
  let caption = card.caption
  if (!overview.complete && ['totalSales', 'paidOrders'].includes(card.key)) {
    caption += ' · Incomplete data'
  }
  return {
    value: formatter.format(overview.summary[card.key]),
    caption,
  }
}

const PanelLink = ({ to, label, className = '' }) => <Link to={to} className={`${actionClassName} ${className}`}>{label}<ArrowRight size={16} aria-hidden='true' /></Link>

const DashboardSection = ({ id, title, description, to, actionLabel, className = '', primaryMobileAction = false, children }) => (
  <section aria-labelledby={id} className={`${panelClassName} ${className}`}>
    <header className='flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--pamo-color-border-default)] pb-4'>
      <div className='min-w-0 flex-1 border-l-[3px] border-[color:var(--pamo-color-brand-yellow)] pl-3'><h2 className='text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)] [overflow-wrap:anywhere]' id={id}>{title}</h2><p className='mt-1 text-[length:var(--dashboard-small)] text-[color:var(--pamo-color-text-secondary)]'>{description}</p></div>
      {to && <PanelLink to={to} label={actionLabel} className='hidden sm:inline-flex' />}
    </header>
    {children}
    {to && <PanelLink to={to} label={actionLabel} className={`mt-4 flex w-full sm:hidden ${primaryMobileAction ? brandActionClassName : ''}`} />}
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
        if (!active) {
          return
        }
        if (!validOverviewResponse(data)) {
          throw new Error(loadError)
        }
        setOverview({
          status: 'success',
          summary: data.summary,
          complete: data.dataQuality.salesPeriodComplete,
          salesTrend: data.salesTrend,
          orderStatusCounts: data.orderStatusCounts,
          recentOrders: data.recentOrders,
          lowStockProducts: data.lowStockProducts,
          topProducts: data.topProducts,
        })
      } catch {
        if (!active) {
          return
        }
        setOverview({ status: 'error' })
        toast.error(loadError)
      }
    }
    loadOverview()
    return () => {
      active = false
    }
  }, [token])

  let message = 'Loading dashboard data…'
  if (status === 'error') {
    message = loadError
  }
  if (status === 'success') {
    message = overview.complete
      ? 'Sales and paid orders: last 30 days. Approval and stock: current.'
      : 'Sales figures are incomplete: some paid records lack reliable payment data.'
  }

  return (
  <main aria-labelledby='dashboard-heading' className='mx-auto grid min-w-0 max-w-[2160px] gap-[var(--dashboard-gap)] text-[length:var(--dashboard-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)]'>
    <header>
      <p className={eyebrowClassName}>Administration / Overview</p>
      <h1 className='mt-2 text-[length:var(--pamo-staff-heading)] font-bold leading-[var(--pamo-staff-heading-leading)] tracking-[-.03em]' id='dashboard-heading'>Dashboard</h1>
      <p role='status' className={`mt-2.5 max-w-[80ch] ${status === 'success' && !overview.complete ? 'text-[#b45309] dark:text-[color:var(--pamo-color-brand-hover)]' : 'text-[color:var(--pamo-color-text-secondary)]'}`}>{message}</p>
    </header>

    <dl aria-label='Dashboard summary' aria-busy={status === 'loading'} className='grid min-w-0 gap-[clamp(12px,1.2vw,24px)] min-[360px]:grid-cols-2 min-[1180px]:grid-cols-4'>
      {summaryCards.map(card => {
        const { value, caption } = getCardPresentation(card, status, overview)
        const Icon = card.icon
        const lowStock = card.key === 'lowStockProducts'
        const cardClass = `${panelClassName} ${lowStock ? 'border-t-[3px] border-t-[color:var(--pamo-color-error-text)]' : ''}`
        const metricClass = lowStock ? 'text-[color:var(--pamo-color-error-text)]' : ''
        return (
          <div key={card.key} className={cardClass}>
            <dt className='flex items-center gap-3 text-[length:var(--dashboard-body)] font-medium [overflow-wrap:anywhere]'>
              <span className={`hidden h-9 w-9 shrink-0 basis-9 items-center justify-center rounded-md bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)] min-[1180px]:flex ${metricClass}`}><Icon size={20} aria-hidden='true' /></span>
              <span>{card.label}</span>
            </dt>
            <dd className={`mt-4 text-[clamp(24px,2vw,28px)] font-bold leading-[1.2] tracking-[-.025em] tabular-nums [overflow-wrap:anywhere] ${metricClass}`}>{value}</dd>
            <dd className='mt-3.5 text-[length:var(--dashboard-small)] text-[color:var(--pamo-color-text-secondary)]'>{caption}</dd>
          </div>
        )
      })}
    </dl>

    <div className='grid min-w-0 gap-[var(--dashboard-gap)] min-[1180px]:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] min-[1180px]:items-start'>
      <DashboardSection id='sales-overview-heading' title='Sales Overview' description='Daily merchandise sales · last 30 days'>
        <Suspense fallback={<div role='status' className='dashboard-state'>Loading sales chart…</div>}>
          <SalesOverviewChart status={status} data={overview?.salesTrend} complete={overview?.complete} formatSales={peso.format} />
        </Suspense>
      </DashboardSection>
      <DashboardSection id='order-status-heading' title='Order Status' description='Current distribution of recorded order states'>
        <OrderStatusSummary status={status} counts={overview?.orderStatusCounts} formatCount={count.format} />
      </DashboardSection>
    </div>

    <div className="grid min-w-0 items-start gap-[var(--dashboard-gap)] [grid-template-areas:'inventory'_'recent'_'top'_'priority'] min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1.07fr)] min-[1180px]:grid-rows-[auto_1fr] min-[1180px]:[grid-template-areas:'orders_inventory'_'orders_priority']">
      <div className='contents min-[1180px]:flex min-[1180px]:min-w-0 min-[1180px]:flex-col min-[1180px]:gap-[var(--dashboard-gap)] min-[1180px]:[grid-area:inventory]'>
      <DashboardSection id='low-stock-heading' title='Inventory Alerts' description='Low and out-of-stock sizes · current inventory' to='/list' actionLabel='View All Items' className='[grid-area:inventory]' primaryMobileAction>
        <LowStockProducts status={status} products={overview?.lowStockProducts} formatCount={count.format} />
      </DashboardSection>
      </div>
      <div className='contents min-[1180px]:flex min-[1180px]:min-w-0 min-[1180px]:flex-col min-[1180px]:gap-[var(--dashboard-gap)] min-[1180px]:[grid-area:orders]'>
      <DashboardSection id='recent-orders-heading' title='Recent Orders' description='Latest student orders' to='/orders' actionLabel='View All Orders' className='[grid-area:recent]'>
        <RecentOrders status={status} orders={overview?.recentOrders} formatMoney={peso.format} />
      </DashboardSection>
      <DashboardSection id='top-selling-heading' title='Top Selling Products' description='Ranked by quantity sold · last 30 days' className='[grid-area:top]'>
        <TopSellingProducts status={status} products={overview?.topProducts} complete={overview?.complete} formatCount={count.format} formatMoney={peso.format} />
      </DashboardSection>
      </div>
      <aside className={`${panelClassName} border-t-[3px] border-t-[color:var(--pamo-color-error-text)] [grid-area:priority]`}>
        <p className={`${eyebrowClassName} text-[color:var(--pamo-color-error-text)]`}>Inventory priority</p>
        <h2 className='mt-[18px] text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)] [overflow-wrap:anywhere]'>Review unavailable sizes first</h2>
        <p className='mt-3.5 max-w-[60ch] text-[color:var(--pamo-color-text-secondary)]'>Check the actual per-size quantities before restocking. Prioritize sizes with no available stock.</p>
        <PanelLink to='/list' label='Open Product Management' className={`mt-[26px] ${brandActionClassName}`} />
      </aside>
    </div>
  </main>
)
}

export default Dashboard
