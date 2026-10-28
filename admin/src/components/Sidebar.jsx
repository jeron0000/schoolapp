import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { assets } from '../assets/assets'
import ThemeToggle from './ThemeToggle'
import { Image, LayoutDashboard, List, LogOut, Megaphone, Menu, Package, Plus, X } from './DashboardIcons'

const dashboardIcons = { '/dashboard': LayoutDashboard, '/add': Plus, '/list': List, '/orders': Package, '/hero-images': Image, '/announcements': Megaphone }

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { path: '/add', label: 'Add Items', icon: 'M4 4h16v16H4Z M12 8v8M8 12h8' },
  { path: '/list', label: 'List Items', icon: 'M4 4h16v16H4Z M8 8h.01M11 8h5M8 12h.01M11 12h5M8 16h.01M11 16h5' },
  { path: '/orders', label: 'Orders', icon: 'm12 3 9 5v9l-9 5-9-5V8Z M3 8l9 5 9-5M12 13v9M7.5 5.5l9 5' },
  { path: '/hero-images', label: 'Hero Images', icon: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01' },
  { path: '/announcements', label: 'Announcements', icon: 'M3 11v2h2l6 4V7l-6 4H3Zm8-4 8-3v16l-8-3m-6-4 1 6h3' }
]

const Sidebar = ({ onLogout, dashboard = false }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggle = useRef(null)
  const drawer = useRef(null)
  const closeButton = useRef(null)
  const { pathname } = useLocation()

  useEffect(() => {
    const closeAfterNavigation = window.requestAnimationFrame(() => setMenuOpen(false))
    return () => window.cancelAnimationFrame(closeAfterNavigation)
  }, [pathname])

  useEffect(() => {
    if (!dashboard) return undefined
    const desktop = window.matchMedia('(min-width: 768px)')
    const syncInteractivity = () => {
      if (drawer.current) drawer.current.inert = !menuOpen && !desktop.matches
    }
    syncInteractivity()
    desktop.addEventListener('change', syncInteractivity)
    return () => desktop.removeEventListener('change', syncInteractivity)
  }, [dashboard, menuOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    const opener = toggle.current
    const previousOverflow = document.body.style.overflow
    const closeOnDesktop = window.matchMedia('(min-width: 768px)')
    const handleDesktopChange = event => {
      if (event.matches) setMenuOpen(false)
    }
    document.body.style.overflow = 'hidden'
    closeOnDesktop.addEventListener('change', handleDesktopChange)
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      closeOnDesktop.removeEventListener('change', handleDesktopChange)
      if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus()
    }
  }, [menuOpen])

  const handleDrawerKeyDown = event => {
    if (!menuOpen || window.matchMedia('(min-width: 768px)').matches) return
    if (event.key === 'Escape') {
      setMenuOpen(false)
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      drawer.current?.querySelectorAll('a[href], button:not(:disabled)') || []
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

  let menuIconPath = 'M4 6h16M4 12h16M4 18h16'
  if (menuOpen) menuIconPath = 'm6 6 12 12M6 18 18 6'
  let menuIcon = (
    <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' className='h-5 w-5'>
      <path d={menuIconPath} />
    </svg>
  )
  if (dashboard && menuOpen) menuIcon = <X size={20} aria-hidden='true' />
  else if (dashboard) menuIcon = <Menu size={20} aria-hidden='true' />

  const sidebarClass = dashboard
    ? 'border-b-0 border-[color:var(--pamo-color-border-default)] bg-transparent text-[color:var(--pamo-color-text-secondary)] md:sticky md:top-0 md:flex md:h-[100svh] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:bg-[var(--pamo-color-surface-default)]'
    : 'border-b border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r'
  const brandClass = dashboard
    ? 'grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-0 border-b border-[color:var(--pamo-color-border-default)] p-3 md:flex md:justify-start md:gap-2 md:border-b-0 md:px-[18px] md:py-[18px] min-[1180px]:py-6'
    : 'flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-5 lg:py-6'
  let navigationClass = `${menuOpen ? 'flex' : 'hidden'} flex-col lg:flex lg:flex-1`
  if (dashboard) {
    const drawerState = menuOpen ? 'visible translate-x-0' : 'invisible translate-x-full pointer-events-none'
    navigationClass = `fixed inset-y-0 right-0 z-50 flex w-[min(300px,calc(100%-16px))] flex-col bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-secondary)] shadow-2xl transition-[transform,visibility] duration-200 ease-out motion-reduce:transition-none ${drawerState} md:visible md:static md:w-auto md:flex-1 md:transform-none md:pointer-events-auto md:shadow-none md:transition-none`
  }
  const navClass = dashboard
    ? 'min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:overflow-visible md:py-[18px] min-[1180px]:py-[22px]'
    : 'space-y-1.5 px-3 py-5 lg:px-4 lg:py-6'
  const logoutWrapperClass = dashboard
    ? 'mt-auto border-t border-[color:var(--pamo-color-border-default)] px-3 py-4 md:px-2.5 md:py-3.5 min-[1180px]:px-3'
    : 'mt-auto border-t border-slate-200 px-3 py-4 dark:border-slate-800 lg:px-4'

  return (
    <aside className={sidebarClass}>
      <div className={brandClass}>
        {dashboard && <ThemeToggle className='justify-self-start md:hidden' />}
        <Link to='/dashboard' aria-label='Go to PAMO Admin Dashboard' onClick={() => setMenuOpen(false)} className={`flex min-w-0 items-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)] ${dashboard ? 'justify-self-center gap-2 md:justify-self-auto' : 'gap-3'}`}>
          <img src={assets.logo} alt='PAMO logo' className='h-11 w-11 shrink-0 rounded-md border border-slate-200 bg-white p-1 object-contain dark:border-slate-700'/>
          <div className={dashboard ? 'md:block' : ''}>
            <p className={`text-lg font-semibold leading-6 tracking-tight ${dashboard ? 'text-[color:var(--pamo-color-text-primary)]' : 'text-slate-950 dark:text-slate-100'}`}>PAMO</p>
            <p className={`text-[11px] leading-4 ${dashboard ? 'hidden text-[color:var(--pamo-color-text-secondary)] md:block' : ''}`}>School essentials</p>
            <p className={`text-[11px] leading-4 ${dashboard ? 'text-[color:var(--pamo-color-text-secondary)]' : 'text-slate-500 dark:text-slate-400'}`}>Admin Panel</p>
          </div>
        </Link>
        <button ref={toggle} type='button' aria-label={menuOpen ? 'Close admin navigation' : 'Open admin navigation'} aria-expanded={menuOpen} aria-controls='pamo-admin-navigation' onClick={() => setMenuOpen(open => !open)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:hover:bg-slate-800 ${dashboard ? 'justify-self-end text-[color:var(--pamo-color-text-primary)] md:hidden' : 'ml-auto text-slate-700 dark:text-slate-200 lg:hidden'} ${dashboard && menuOpen ? 'invisible pointer-events-none' : ''}`}>
          {menuIcon}
        </button>
      </div>
      {dashboard && menuOpen && <button type='button' aria-label='Dismiss admin navigation backdrop' onClick={() => setMenuOpen(false)} className='fixed inset-0 z-40 bg-slate-950/55 md:hidden' />}
      <div ref={drawer} id='pamo-admin-navigation' className={navigationClass} onKeyDown={dashboard ? handleDrawerKeyDown : undefined}>
        {dashboard && (
          <div className='flex min-h-[70px] items-center gap-2 border-b border-[color:var(--pamo-color-border-default)] px-3 md:hidden'>
            <Link to='/dashboard' aria-label='Go to PAMO Admin Dashboard' onClick={() => setMenuOpen(false)} className='flex min-w-0 flex-1 items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'>
              <img src={assets.logo} alt='' className='h-9 w-9 shrink-0 rounded-md border border-[color:var(--pamo-color-border-default)] bg-white p-1 object-contain' />
              <span className='min-w-0'><strong className='block truncate text-sm text-[color:var(--pamo-color-text-primary)]'>PAMO</strong><span className='block truncate text-[10px]'>Admin Panel</span></span>
            </Link>
            <button ref={closeButton} type='button' aria-label='Close admin navigation' onClick={() => setMenuOpen(false)} className='grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[color:var(--pamo-color-border-default)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'>
              <X size={20} aria-hidden='true' />
            </button>
          </div>
        )}
        <nav aria-label='PAMO admin navigation' className={navClass}>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={dashboard ? item.label : undefined}
              title={dashboard ? item.label : undefined}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => {
                const layoutClass = dashboard
                  ? 'md:justify-start md:px-3.5 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-compact-leading)] '
                  : ''
                const activeClass = dashboard
                  ? 'bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)] before:bg-[var(--pamo-color-brand-yellow)]'
                  : 'bg-amber-50 text-slate-950 before:bg-amber-500 dark:bg-amber-400/10 dark:text-slate-100'
                const idleClass = dashboard
                  ? 'text-[color:var(--pamo-color-text-secondary)] hover:bg-[var(--pamo-color-surface-subtle)] hover:text-[color:var(--pamo-color-text-primary)]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                return `relative flex min-h-12 items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full ${layoutClass}${isActive ? activeClass : idleClass}`
              }}
            >
              {({ isActive }) => {
                const Icon = dashboardIcons[item.path]
                return (
                <>
                  {dashboard ? <Icon size={20} aria-hidden='true' className={isActive ? 'text-[color:var(--pamo-color-accent-text)]' : ''} /> : <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className={'h-5 w-5 shrink-0 ' + (isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400')}>
                    <path d={item.icon}/>
                  </svg>}
                  <span>{item.label}</span>
                </>
                )
              }}
            </NavLink>
          ))}
        </nav>
        <div className={logoutWrapperClass}>
          <button type='button' onClick={onLogout} aria-label='Logout' className={`flex min-h-12 w-full items-center gap-3 rounded-md px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${dashboard ? 'text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-secondary)] hover:bg-[var(--pamo-color-surface-subtle)] hover:text-[color:var(--pamo-color-text-primary)] md:justify-start md:px-3.5' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'}`}>
            {dashboard ? <LogOut size={20} aria-hidden='true' /> : <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 shrink-0'><path d='M10 3H4v18h6M10 12h11m-4-4 4 4-4 4'/></svg>}<span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
