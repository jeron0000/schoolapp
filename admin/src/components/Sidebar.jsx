import React, { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { assets } from '../assets/assets'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { path: '/add', label: 'Add Items', icon: 'M4 4h16v16H4Z M12 8v8M8 12h8' },
  { path: '/list', label: 'List Items', icon: 'M4 4h16v16H4Z M8 8h.01M11 8h5M8 12h.01M11 12h5M8 16h.01M11 16h5' },
  { path: '/orders', label: 'Orders', icon: 'm12 3 9 5v9l-9 5-9-5V8Z M3 8l9 5 9-5M12 13v9M7.5 5.5l9 5' },
  { path: '/hero-images', label: 'Hero Images', icon: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01' }
]

const Sidebar = ({ onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const toggle = useRef(null)

  const closeWithEscape = event => {
    if (event.key !== 'Escape' || !menuOpen) return
    setMenuOpen(false)
    toggle.current?.focus()
  }

  return (
    <aside onKeyDown={closeWithEscape} className='border-b border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r'>
      <div className='flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:px-5 lg:py-6'>
        <div className='flex min-w-0 items-center gap-3'>
          <img src={assets.logo} alt='PAMO logo' className='h-11 w-11 shrink-0 rounded-md border border-slate-200 bg-white p-1 object-contain dark:border-slate-700'/>
          <div>
            <p className='text-lg font-semibold leading-6 tracking-tight text-slate-950 dark:text-slate-100'>PAMO</p>
            <p className='text-[11px] leading-4'>School essentials</p>
            <p className='text-[11px] leading-4 text-slate-500 dark:text-slate-400'>Admin Panel</p>
          </div>
        </div>
        <button ref={toggle} type='button' aria-label={menuOpen ? 'Close admin navigation' : 'Open admin navigation'} aria-expanded={menuOpen} aria-controls='pamo-admin-navigation' onClick={() => setMenuOpen(open => !open)} className='flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden'>
          <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' className='h-5 w-5'><path d={menuOpen ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'}/></svg>
        </button>
      </div>
      <div id='pamo-admin-navigation' className={(menuOpen ? 'flex' : 'hidden') + ' flex-col lg:flex lg:flex-1'}>
        <nav aria-label='PAMO admin navigation' className='space-y-1.5 px-3 py-5 lg:px-4 lg:py-6'>
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => 'relative flex min-h-12 items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ' + (isActive
                ? 'bg-amber-50 text-slate-950 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full before:bg-amber-500 dark:bg-amber-400/10 dark:text-slate-100'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')}
            >
              {({ isActive }) => (
                <>
                  <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className={'h-5 w-5 shrink-0 ' + (isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400')}>
                    <path d={item.icon}/>
                  </svg>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className='mt-auto border-t border-slate-200 px-3 py-4 dark:border-slate-800 lg:px-4'>
          <button type='button' onClick={onLogout} className='flex min-h-12 w-full items-center gap-3 rounded-md px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'>
            <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className='h-5 w-5 shrink-0'><path d='M10 3H4v18h6M10 12h11m-4-4 4 4-4 4'/></svg>Logout
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar