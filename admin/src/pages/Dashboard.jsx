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

const PanelLink = ({ to, label, className }) => <Link to={to} className={'dashboard-action ' + className}>{label}<ArrowRight size={16} aria-hidden='true' /></Link>

const DashboardSection = ({ id, title, description, to, actionLabel, className = '', children }) => (
  <section aria-labelledby={id} className={'dashboard-panel ' + className}>
    <header className='dashboard-panel-heading'>
      <div><h2 id={id}>{title}</h2><p>{description}</p></div>
      {to && <PanelLink to={to} label={actionLabel} className='dashboard-desktop-action' />}
    </header>
    {children}
    {to && <PanelLink to={to} label={actionLabel} className='dashboard-mobile-action' />}
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
  <main aria-labelledby='dashboard-heading' className='pamo-dashboard'>
    <header className='dashboard-heading'>
      <p className='dashboard-eyebrow'>Administration / Overview</p>
      <h1 id='dashboard-heading'>Dashboard</h1>
      <p role='status' className={'dashboard-reporting-note' + (status === 'success' && !overview.complete ? ' is-incomplete' : '')}>{message}</p>
    </header>

    <dl aria-label='Dashboard summary' aria-busy={status === 'loading'} className='dashboard-kpis'>
      {summaryCards.map(card => {
        let value = '—'
        let caption = status === 'loading' ? 'Loading…' : 'Unavailable'
        if (status === 'success') {
          value = (card.key === 'totalSales' ? peso : count).format(overview.summary[card.key])
          caption = card.caption
          if (!overview.complete && ['totalSales', 'paidOrders'].includes(card.key)) caption += ' · Incomplete data'
        }
        const Icon = card.icon
        return <div key={card.key} className={'dashboard-kpi' + (card.key === 'lowStockProducts' ? ' dashboard-kpi-stock' : '')}>
        <dt><span className='dashboard-kpi-icon'><Icon size={20} aria-hidden='true' /></span><span>{card.label}</span>
        </dt>
        <dd className='dashboard-kpi-value'>{value}</dd>
        <dd className='dashboard-kpi-caption'>{caption}</dd>
      </div>})}
    </dl>

    <div className='dashboard-analytics'>
      <DashboardSection id='sales-overview-heading' title='Sales Overview' description='Daily merchandise sales · last 30 days'>
        <Suspense fallback={<div role='status' className='dashboard-state'>Loading sales chart…</div>}>
          <SalesOverviewChart status={status} data={overview?.salesTrend} complete={overview?.complete} formatSales={peso.format} />
        </Suspense>
      </DashboardSection>
      <DashboardSection id='order-status-heading' title='Order Status' description='Current distribution of recorded order states'>
        <OrderStatusSummary status={status} counts={overview?.orderStatusCounts} formatCount={count.format} />
      </DashboardSection>
    </div>

    <div className='dashboard-details'>
      <div className='dashboard-inventory-column'>
      <DashboardSection id='low-stock-heading' title='Inventory Alerts' description='Low and out-of-stock sizes · current inventory' to='/list' actionLabel='View All Items' className='dashboard-inventory-panel'>
        <LowStockProducts status={status} products={overview?.lowStockProducts} formatCount={count.format} />
      </DashboardSection>
      </div>
      <div className='dashboard-orders-column'>
      <DashboardSection id='recent-orders-heading' title='Recent Orders' description='Latest student orders' to='/orders' actionLabel='View All Orders' className='dashboard-recent-panel'>
        <RecentOrders status={status} orders={overview?.recentOrders} formatMoney={peso.format} />
      </DashboardSection>
      <DashboardSection id='top-selling-heading' title='Top Selling Products' description='Ranked by quantity sold · last 30 days' className='dashboard-top-panel'>
        <TopSellingProducts status={status} products={overview?.topProducts} complete={overview?.complete} formatCount={count.format} formatMoney={peso.format} />
      </DashboardSection>
      </div>
      <aside className='dashboard-panel dashboard-priority'>
        <p className='dashboard-eyebrow'>Inventory priority</p>
        <h2>Review unavailable sizes first</h2>
        <p>Check the actual per-size quantities before restocking. Prioritize sizes with no available stock.</p>
        <PanelLink to='/list' label='Open Product Management' className='dashboard-brand-action' />
      </aside>
    </div>
  </main>
)
}

export default Dashboard
