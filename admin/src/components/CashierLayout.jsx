import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { assets } from '../assets/assets'
import ThemeToggle from './ThemeToggle'
import Cashier from '../pages/Cashier'
import CashierDashboard from '../pages/CashierDashboard'
import { LayoutDashboard, CreditCard, ArrowLeftRight, ReceiptText, LogOut, Menu } from 'lucide-react'

const navigationIcons = { Dashboard: LayoutDashboard, Payments: CreditCard, Transactions: ArrowLeftRight, 'Receipt Records': ReceiptText }

const views = [
  { path: '/cashier', label: 'Dashboard', title: 'Cashier Dashboard', icon: 'M3 10 12 3l9 7v10H3Z M9 20v-7h6v7' },
  { path: '/cashier/payments', label: 'Payments', title: 'Payments', filter: 'Awaiting Payment', icon: 'M3 7h18v13H3Z M3 11h18 M7 16h4' },
  { path: '/cashier/transactions', label: 'Transactions', title: 'Transactions', filter: 'Transactions', icon: 'M4 7h16m-4-4 4 4-4 4 M20 17H4m4-4-4 4 4 4' },
  { path: '/cashier/receipts', label: 'Receipt Records', title: 'Receipt Records', filter: 'Receipt Records', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2Z M9 8h6m-6 4h6' },
  { path: '/cashier/paid', title: 'Paid Payments', filter: 'Paid' }
]

const dashboardLayoutClass = ' cashier-dashboard-layout min-w-0 bg-[var(--pamo-color-surface-subtle)] [font-family:var(--pamo-font-family)] text-[color:var(--pamo-color-text-primary)] dark:bg-[var(--pamo-color-surface-navy)] xl:grid-cols-[225px_minmax(0,1fr)]'
const navigationLinkClass = active => {
  const baseClass = "relative flex min-h-12 items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-[length:var(--pamo-staff-body)] font-medium leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-secondary)] hover:bg-[var(--pamo-color-surface-subtle)] hover:text-[color:var(--pamo-color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)] xl:justify-start xl:px-[13px] before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-full before:bg-[var(--pamo-color-brand-yellow)] before:content-['']"
  if (active) {
    return baseClass + ' bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)] before:block'
  }
  return baseClass + ' before:hidden'
}

const CashierLayout = ({ token, setToken }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)
  const closeButton = useRef(null)
  const drawer = useRef(null)
  const [desktopNavigation, setDesktopNavigation] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches)
  const { pathname } = useLocation()
  const dashboard = pathname === '/cashier' || pathname === '/cashier/' || pathname === '/cashier/payments' || pathname === '/cashier/paid' || pathname === '/cashier/transactions' || pathname === '/cashier/receipts'
  const navigate = useNavigate()
  const changeFilter = filter => navigate(views.find(view => view.filter === filter).path)
  const paymentsPath = views.find(view => view.filter === 'Awaiting Payment').path
  const transactionsPath = views.find(view => view.filter === 'Transactions').path
  const drawerAvailable = menuOpen || desktopNavigation

  useEffect(() => {
    const closeAfterNavigation = window.requestAnimationFrame(() => setMenuOpen(false))
    return () => window.cancelAnimationFrame(closeAfterNavigation)
  }, [pathname])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1280px)')
    const updateNavigationMode = event => {
      setDesktopNavigation(event.matches)
      if (event.matches) setMenuOpen(false)
    }
    desktopQuery.addEventListener('change', updateNavigationMode)
    return () => desktopQuery.removeEventListener('change', updateNavigationMode)
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const opener = menuButton.current
    const drawerElement = drawer.current
    const handleDrawerKeys = event => {
      if (window.matchMedia('(min-width: 1280px)').matches) return
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        drawerElement?.querySelectorAll('a[href], button:not(:disabled)') || []
      ).filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleDrawerKeys)
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleDrawerKeys)
      if (opener?.isConnected && opener.getClientRects().length > 0) {
        opener.focus()
        return
      }
      const visibleNavigationLink = Array.from(drawerElement?.querySelectorAll('a[href]') || [])
        .find(element => element.getClientRects().length > 0 && !element.closest('[inert]'))
      visibleNavigationLink?.focus()
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className={'min-h-screen bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400 xl:grid xl:grid-cols-[224px_minmax(0,1fr)]' + (dashboard ? dashboardLayoutClass : '')}>
      <aside className='cashier-workspace-sidebar border-b-0 border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-secondary)] xl:sticky xl:top-0 xl:flex xl:h-screen xl:flex-col xl:overflow-y-auto xl:border-r'>
        <div inert={menuOpen ? true : undefined} className='cashier-workspace-brand flex items-center justify-between gap-3 p-4 xl:justify-start xl:px-[17px] xl:py-6'>
          {dashboard && <ThemeToggle className='cashier-dashboard-mobile-theme' />}
          <Link to='/cashier' onClick={closeMenu} className='flex min-w-0 items-center gap-3 rounded focus-visible:outline-[var(--pamo-color-focus)]'><img src={assets.logo} alt='' className='h-10 w-10 shrink-0 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-white object-contain'/><span className='hidden min-w-0 min-[280px]:block xl:block'><strong className='block text-base text-[color:var(--pamo-color-text-primary)]'>PAMO</strong><span className='text-[11px]'>Cashier Admin</span></span></Link>
          <button ref={menuButton} type='button' aria-label='Open cashier navigation' aria-expanded={menuOpen} aria-controls='cashier-navigation-drawer' onClick={() => setMenuOpen(true)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 text-[color:var(--pamo-color-text-primary)] hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:hover:bg-slate-800 xl:hidden ${menuOpen ? 'invisible pointer-events-none' : ''}`}><Menu size={20} aria-hidden='true' /></button>
        </div>
        {menuOpen && <button type='button' aria-label='Dismiss cashier navigation backdrop' onClick={closeMenu} className='fixed inset-0 z-40 bg-slate-950/55 xl:hidden' />}
        <div ref={drawer} id='cashier-navigation-drawer' inert={drawerAvailable ? undefined : true} aria-hidden={drawerAvailable ? undefined : true} className={'fixed inset-y-0 right-0 z-50 flex w-[min(300px,calc(100%-16px))] min-w-0 flex-col border-l border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] shadow-2xl transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none xl:visible xl:static xl:z-auto xl:w-auto xl:flex-1 xl:transform-none xl:border-l-0 xl:shadow-none xl:transition-none xl:pointer-events-auto ' + (menuOpen ? 'visible translate-x-0' : 'invisible translate-x-full pointer-events-none')}>
          <div className='flex min-h-[70px] items-center gap-2 border-b border-[color:var(--pamo-color-border-default)] px-3 xl:hidden'>
            <Link to='/cashier' onClick={closeMenu} className='flex min-w-0 flex-1 items-center gap-2 rounded focus-visible:outline-[var(--pamo-color-focus)]'><img src={assets.logo} alt='' className='h-8 w-8 shrink-0 rounded-md border border-[color:var(--pamo-color-border-default)] bg-white object-contain'/><span className='min-w-0'><strong className='block truncate text-sm text-[color:var(--pamo-color-text-primary)]'>PAMO</strong><span className='block truncate text-[10px]'>Cashier Admin</span></span></Link>
            <button ref={closeButton} type='button' aria-label='Close cashier navigation' onClick={closeMenu} className='grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[color:var(--pamo-color-border-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-5 w-5'><path d='m6 6 12 12M6 18 18 6'/></svg></button>
          </div>
          <nav id='cashier-navigation' aria-label='Cashier navigation' className='flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4 xl:gap-2 xl:px-[13px] xl:pt-6'>
            {views.filter(view => view.label).map(view => {
              const active = pathname === view.path || view.label === 'Payments' && pathname === '/cashier/paid'
              const Icon = navigationIcons[view.label]
              const tooltip = dashboard && !menuOpen ? view.label : undefined
              return <Link key={view.path} to={view.path} title={tooltip} aria-label={dashboard ? view.label : undefined} aria-current={active ? 'page' : undefined} onClick={closeMenu} className={navigationLinkClass(active)}>{dashboard ? <Icon size={20} aria-hidden='true' /> : <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 shrink-0'><path d={view.icon}/></svg>}<span className={dashboard ? 'cashier-dashboard-nav-label xl:inline' : undefined}>{view.label}</span></Link>
            })}
          </nav>
          {dashboard && <div className='cashier-dashboard-signout mt-auto grid gap-1 border-t border-[color:var(--pamo-color-border-default)] px-3 py-4 text-xs'>
            <div><strong className='block text-[color:var(--pamo-color-text-primary)]'>Cashier Admin</strong><span className='block'>Payment workspace</span></div>
            <button type='button' aria-label='Sign out' onClick={() => setToken('')} className='flex min-h-11 items-center justify-end gap-2 rounded-[7px] px-2 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-compact-leading)] hover:bg-[var(--pamo-color-surface-subtle)] hover:text-[color:var(--pamo-color-text-primary)]'><LogOut size={16} aria-hidden='true' /><span>Sign out</span></button>
          </div>}
        </div>
        {!dashboard && <div className='hidden border-t border-slate-200 p-4 dark:border-slate-800 md:block'><div className='flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-8 w-8'><circle cx='12' cy='8' r='4'/><path d='M4 21v-2a8 8 0 0 1 16 0v2'/></svg><div><p className='text-xs font-semibold text-slate-900 dark:text-slate-100'>Cashier Admin</p><p className='mt-1 text-[11px]'>Payment workspace</p></div></div></div>}
      </aside>
      <main inert={menuOpen ? true : undefined} className={'cashier-workspace-main min-w-0' + (dashboard ? ' p-0' : ' px-4 pb-6 sm:px-5 lg:px-6')}>
        <div className='cashier-workspace-topbar mx-auto flex h-[74px] max-w-[2240px] items-center justify-between gap-2 bg-transparent px-[clamp(16px,2.4vw,40px)] text-[color:var(--pamo-color-text-secondary)] max-md:hidden'>{dashboard && <span className='text-[length:var(--pamo-staff-small)] font-semibold uppercase'>Cashier workspace</span>}<ThemeToggle/>{!dashboard && <button type='button' onClick={() => setToken('')} className='min-h-11 rounded-lg px-3 text-xs font-medium text-slate-700 hover:bg-slate-200 focus-visible:outline-amber-700 dark:focus-visible:outline-amber-500 dark:text-slate-200 dark:hover:bg-slate-800'>Logout</button>}</div>
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
