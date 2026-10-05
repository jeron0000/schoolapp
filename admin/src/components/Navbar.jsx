import React from 'react'
import { assets } from '../assets/assets'
import ThemeToggle from './ThemeToggle'

const Navbar = ({setToken, sidebarControls = false}) => {
  return (
    <div className={'flex items-center py-2 px-[4%] dark:bg-slate-900 ' + (sidebarControls ? 'justify-end' : 'justify-between')}>
        {!sidebarControls && <img className='w-20 sm:w-24 md:w-28 object-contain dark:rounded dark:bg-white' src={assets.logo} alt="" />}
        <div className='flex items-center gap-2'>
          <ThemeToggle />
          {!sidebarControls && <button onClick={()=>setToken('')} className='bg-gray-600 text-white px-5 py-2 sm:px-7 sm:py-2 rounded-full text-xs sm:text-sm dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'>Logout</button>}
        </div>
    </div>
  )
}

export default Navbar