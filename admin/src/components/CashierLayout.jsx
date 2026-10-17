import React, { useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { assets } from '../assets/assets'
import ThemeToggle from './ThemeToggle'
import Cashier from '../pages/Cashier'
import CashierDashboard from '../pages/CashierDashboard'
import { LayoutDashboard, CreditCard, ArrowLeftRight, ReceiptText, LogOut } from 'lucide-react'

const navigationIcons = { Dashboard: LayoutDashboard, Payments: CreditCard, Transactions: ArrowLeftRight, 'Receipt Records': ReceiptText }

const views = [
  { path: '/cashier', label: 'Dashboard', title: 'Cashier Dashboard', icon: 'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7' },
  { path: '/cashier/payments', label: 'Payments', title: 'Payments', filter: 'Awaiting Payment', icon: 'M3 7h18v13H3Z M3 11h18 M7 16h4' },
  { path: '/cashier/transactions', label: 'Transactions', title: 'Transactions', filter: 'Transactions', icon: 'M4 7h16m-4-4 4 4-4 4 M20 17H4m4-4-4 4 4 4' },
  { path: '/cashier/receipts', label: 'Receipt Records', title: 'Receipt Records', filter: 'Receipt Records', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2Z M9 8h6m-6 4h6' },
  { path: '/cashier/paid', title: 'Paid Payments', filter: 'Paid' }
]

const CashierLayout = ({ token, setToken }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const dashboard = pathname === '/cashier' || pathname === '/cashier/' || pathname === '/cashier/payments' || pathname === '/cashier/paid' || pathname === '/cashier/transactions' || pathname === '/cashier/receipts'
  const navigate = useNavigate()
  const changeFilter = filter => navigate(views.find(view => view.filter === filter).path)
  const paymentsPath = views.find(view => view.filter === 'Awaiting Payment').path
  const transactionsPath = views.find(view => view.filter === 'Transactions').path

  return (
    <div className={'min-h-screen bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400 md:grid md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[224px_minmax(0,1fr)]' + (dashboard ? ' cashier-dashboard-layout' : '')}>
      <aside className='cashier-workspace-sidebar border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto md:border-b-0 md:border-r'>
        <div className='cashier-workspace-brand flex items-center justify-between gap-3 p-4 md:px-5 md:py-6'>
          <Link to='/cashier' onClick={() => setMenuOpen(false)} className='flex items-center gap-3 rounded focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500'><img src={assets.logo} alt='' className='h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700'/><span><strong className='block text-base text-slate-950 dark:text-slate-100'>PAMO</strong><span className='text-[11px]'>Cashier Admin</span></span></Link>
          <button type='button' aria-label='Toggle cashier navigation' aria-expanded={menuOpen} aria-controls='cashier-navigation' onClick={() => setMenuOpen(open => !open)} className='flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 dark:border-slate-700 md:hidden'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-5 w-5'><path d={menuOpen ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'}/></svg></button>
          {dashboard && <ThemeToggle className='cashier-dashboard-mobile-theme' />}
        </div>
        <nav id='cashier-navigation' aria-label='Cashier navigation' className={(menuOpen ? 'block' : 'hidden') + ' px-4 pb-4 md:block md:flex-1 md:pt-3'}>
          {views.filter(view => view.label).map(view => {
            const active = pathname === view.path || view.label === 'Payments' && pathname === '/cashier/paid'
            const Icon = navigationIcons[view.label]
            return <Link key={view.path} to={view.path} title={dashboard ? view.label : undefined} aria-label={dashboard ? view.label : undefined} aria-current={active ? 'page' : undefined} onClick={() => setMenuOpen(false)} className={'mb-2 flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 ' + (active ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300' : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>{dashboard ? <Icon size={20} aria-hidden='true' /> : <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 shrink-0'><path d={view.icon}/></svg>}<span className={dashboard ? 'cashier-dashboard-nav-label' : undefined}>{view.label}</span></Link>
          })}
        </nav>
        {dashboard && <div className='cashier-dashboard-signout'>
          <div><strong>Cashier Admin</strong><span>Payment workspace</span></div>
          <button type='button' aria-label='Sign out' onClick={() => setToken('')}><LogOut size={16} aria-hidden='true' /><span>Sign out</span></button>
        </div>}
        {!dashboard && <div className='hidden border-t border-slate-200 p-4 dark:border-slate-800 md:block'><div className='flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-8 w-8'><circle cx='12' cy='8' r='4'/><path d='M4 21v-2a8 8 0 0 1 16 0v2'/></svg><div><p className='text-xs font-semibold text-slate-900 dark:text-slate-100'>Cashier Admin</p><p className='mt-1 text-[11px]'>Payment workspace</p></div></div></div>}
      </aside>
      <main className='cashier-workspace-main min-w-0 px-4 pb-6 sm:px-5 lg:px-6'>
        <div className='cashier-workspace-topbar flex h-14 items-center justify-end gap-2'>{dashboard && <span>Cashier workspace</span>}<ThemeToggle/>{!dashboard && <button type='button' onClick={() => setToken('')} className='min-h-11 rounded-lg px-3 text-xs font-medium text-slate-700 hover:bg-slate-200 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 dark:text-slate-200 dark:hover:bg-slate-800'>Logout</button>}</div>
        <Routes>
          {views.map(view => <Route key={view.path} path={view.path} element={view.filter
            ? <Cashier token={token} title={view.title} filter={view.filter} onFilterChange={changeFilter}/>
            : <CashierDashboard key={token} token={token} paymentsPath={paymentsPath} transactionsPath={transactionsPath}/>
          }/>)}
          <Route path='*' element={<Navigate to='/cashier' replace/>}/>
        </Routes>
      </main>
    </div>
  )
}

export default CashierLayout
