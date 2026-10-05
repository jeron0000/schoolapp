import React, { useContext, useEffect, useRef, useState } from 'react'
import { assets } from '../assets/assets'
import { Link, NavLink } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext';
import ThemeToggle from './ThemeToggle';


const NavBar = () => {

  const [visible,setVisible] = useState(false);
  const [accountOpen,setAccountOpen] = useState(false);
  const mobilePanel = useRef(null);
  const menuButton = useRef(null);
  const accountMenu = useRef(null);

  const {search, setSearch, setShowSearch, getCartCount, navigate, token, setToken, setCartItems} = useContext(ShopContext);
  const restrictedLinkProps = token ? {} : {
    inert: true,
    'aria-disabled': true,
    tabIndex: -1,
    onClick: (event) => event.preventDefault()
  };

  useEffect(() => {
    if (!visible) return;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setVisible(false);
      if (event.key !== 'Tab') return;
      const controls = mobilePanel.current?.querySelectorAll('a:not([aria-disabled="true"]), button:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const onResize = () => { if (window.innerWidth >= 1024) setVisible(false); };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      trigger?.focus();
    };
  }, [visible]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event) => {
      if (!accountMenu.current?.contains(event.target)) setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [accountOpen]);

  const logout = () => {
    navigate('/login')
    localStorage.removeItem('token');
    setToken('')
    setCartItems({})
    


  }

  return (

    <header className='relative z-30 bg-slate-50 px-4 py-3 sm:px-6 lg:px-8 lg:py-4 2xl:px-12 dark:bg-slate-950'>
      <a href='#main-content' className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 dark:focus:bg-slate-900'>Skip to content</a>
      <div className='mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 shadow-sm sm:h-20 sm:px-5 lg:gap-7 xl:gap-9 xl:px-6 2xl:gap-11 dark:border-slate-800 dark:bg-slate-900/60'>
        <Link to='/' {...restrictedLinkProps} className='flex shrink-0 items-center gap-2 rounded-lg' aria-label='PAMO home'>
          <img src={assets.logo} className='h-8 w-8 rounded-lg object-contain sm:h-12 sm:w-12' alt='' />
          <span className='text-sm font-bold tracking-tight text-slate-900 min-[375px]:text-base sm:text-xl dark:text-slate-100'>PAMO</span>
          <span className='ml-1 hidden border-l border-slate-200 pl-3 text-xs font-medium leading-5 text-slate-500 xl:block dark:border-slate-700 dark:text-slate-400'>School essentials<br/>SmartStock</span>
        </Link>
        <nav aria-label='Main navigation' className='hidden shrink-0 items-center gap-1 lg:flex lg:gap-3 xl:gap-4 2xl:gap-5'>
          {[['/', 'Home'], ['/collection', 'Collection'], ['/about', 'About'], ['/contact', 'Contact']].map(([path, label]) => (
            <NavLink key={path} to={path} {...restrictedLinkProps} className={({isActive}) => 'relative rounded-xl px-3 py-3 text-sm transition-colors duration-[250ms] xl:px-4 ' + (isActive ? 'bg-amber-50 font-semibold text-amber-800 after:absolute after:inset-x-3 after:-bottom-2 after:h-0.5 after:bg-amber-500 dark:bg-amber-400/10 dark:text-amber-300 dark:after:bg-amber-400' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100')}>{label}</NavLink>
          ))}
        </nav>
        <div className='flex min-w-0 items-center gap-0 sm:gap-1 lg:gap-3 xl:gap-4 2xl:gap-5'>
          <div className='hidden min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 lg:flex lg:w-40 xl:w-48 2xl:w-64 dark:border-slate-700 dark:bg-slate-950/40 dark:focus-within:border-blue-400'>
            <img src={assets.search_icon} className='theme-icon w-4 shrink-0' alt='' />
            <input type='search' value={search} disabled={!token} onFocus={()=>{setShowSearch(true); navigate('/collection')}} onChange={(event)=>setSearch(event.target.value)} placeholder='Search school essentials…' aria-label='Search collection' className='h-11 w-full min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-400' />
          </div>
          <button type='button' disabled={!token} onClick={()=>{setShowSearch(true); navigate('/collection')}} className='icon-button h-10 w-10 sm:h-11 sm:w-11 lg:hidden' aria-label='Search collection'>
            <img src={assets.search_icon} className='w-[18px] theme-icon' alt='' />
          </button>
          <ThemeToggle className='hidden sm:flex'/>
          <div ref={accountMenu} className='relative' onBlur={(event)=>{if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false)}}>
            <button type='button' disabled={!token} onClick={()=> token ? setAccountOpen(!accountOpen) : navigate('/login')} className='icon-button h-10 w-10 sm:h-11 sm:w-11' aria-label='Account' aria-expanded={token ? accountOpen : undefined}>
              <img className='w-[18px] theme-icon' src={assets.profile_icon} alt='' />
            </button>
            {token && accountOpen && <div className='absolute right-0 top-full z-40 w-48 pt-2' onKeyDown={(e)=>{if(e.key === 'Escape') {setAccountOpen(false); accountMenu.current?.querySelector('button')?.focus()}}}>
              <div className='panel overflow-hidden p-2 text-sm'>
                <p className='px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400'>My account</p>
                <button type='button' onClick={()=>{navigate('/orders'); setAccountOpen(false)}} className='w-full rounded-lg px-3 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800'>Orders</button>
                <button type='button' onClick={()=>{logout(); setAccountOpen(false)}} className='w-full rounded-lg px-3 py-3 text-left text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'>Logout</button>
              </div>
            </div>}
          </div>
          <Link to='/cart' {...restrictedLinkProps} className='icon-button relative h-10 w-10 sm:h-11 sm:w-11' aria-label={'Cart, ' + getCartCount() + ' items'}>
            <img src={assets.cart_icon} className='w-[18px] theme-icon' alt='' />
            <span className='absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900 ring-2 ring-white dark:ring-slate-900'>{getCartCount()}</span>
          </Link>
          <button ref={menuButton} type='button' onClick={()=>setVisible(true)} className='icon-button h-10 w-10 sm:h-11 sm:w-11 lg:hidden' aria-label='Open navigation' aria-expanded={visible} aria-controls='mobile-navigation'>
            <img src={assets.menu_icon} className='w-[18px] theme-icon' alt='' />
          </button>
        </div>
      </div>
      {visible && <div className='fixed inset-0 z-50 bg-slate-950/40 lg:hidden' role='dialog' aria-modal='true' aria-label='Navigation'>
        <button type='button' className='absolute inset-0 h-full w-full' aria-label='Close navigation' onClick={()=>setVisible(false)} />
        <nav ref={mobilePanel} id='mobile-navigation' aria-label='Mobile navigation' className='absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900'>
          <div className='mb-8 flex items-center justify-between'>
            <span className='text-xl font-bold tracking-tight'>PAMO</span>
            <ThemeToggle className='sm:hidden'/>
            <button autoFocus type='button' onClick={()=>setVisible(false)} className='icon-button' aria-label='Close navigation'><img src={assets.cross_icon} className='w-4 theme-icon' alt='' /></button>
          </div>
          <p className='eyebrow mb-4'>Your campus essentials</p>
          {[['/', 'Home'], ['/collection', 'Collection'], ['/about', 'About'], ['/contact', 'Contact']].map(([path, label]) => (
            <NavLink key={path} onClick={()=>setVisible(false)} to={path} {...restrictedLinkProps} className={({isActive}) => 'mb-2 rounded-xl px-4 py-4 text-base ' + (isActive ? 'bg-amber-50 font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' : 'font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100')}>{label}</NavLink>
          ))}
          <div className='mt-6 border-t border-slate-200 pt-6 dark:border-slate-800'>
            <Link to={token ? '/orders' : '/login'} onClick={()=>setVisible(false)} {...restrictedLinkProps} className='btn-secondary w-full'>{token ? 'My orders' : 'Login / Create account'}</Link>
          </div>
          <p className='mt-auto pt-6 text-xs text-slate-500 dark:text-slate-400'>PAMO / SmartStock</p>
        </nav>
      </div>}
    </header>
  )
}

export default NavBar
