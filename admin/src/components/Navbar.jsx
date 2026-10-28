import React from 'react'
import { assets } from '../assets/assets'
import ThemeToggle from './ThemeToggle'

const Navbar = ({setToken, sidebarControls = false, dashboard = false}) => {
  let navbarClass = 'flex items-center px-[4%] py-2 dark:bg-slate-900 '
  navbarClass += sidebarControls ? 'justify-end' : 'justify-between'
  if (dashboard) {
    navbarClass += ' hidden min-h-[73px] justify-between bg-transparent px-[clamp(12px,2.2vw,44px)] py-3.5 md:flex dark:bg-transparent'
  }

  return (
    <div className={navbarClass}>
        {dashboard && <p className='text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>PAMO / Administration</p>}
        {!sidebarControls && <img className='w-20 sm:w-24 md:w-28 object-contain dark:rounded dark:bg-white' src={assets.logo} alt="" />}
        <div className='flex items-center gap-2'>
          <ThemeToggle />
          {!sidebarControls && <button onClick={()=>setToken('')} className='bg-gray-600 text-white px-5 py-2 sm:px-7 sm:py-2 rounded-full text-xs sm:text-sm dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'>Logout</button>}
        </div>
    </div>
  )
}

export default Navbar
