import React, { useContext, useEffect, useRef, useState } from 'react'
import { assets } from '../assets/assets'
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { ShopContext } from '../context/shopContext';
import ThemeToggle from './ThemeToggle';
import './StorefrontFoundation.css';
import { Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';


const NavBar = () => {

  const [visible,setVisible] = useState(false);
  const [accountOpen,setAccountOpen] = useState(false);
  const mobilePanel = useRef(null);
  const menuButton = useRef(null);
  const accountMenu = useRef(null);
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  const {search, setSearch, setShowSearch, getCartCount, navigate, token, setToken, setCartItems} = useContext(ShopContext);
  const revealSearch = () => {
    setShowSearch(true);
    if (location.pathname !== '/collection') navigate('/collection');
  };
  const changeSearch = event => {
    const value = event.target.value;
    setSearch(value);
    if (location.pathname === '/collection') setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('q', value);
      return next;
    }, { replace: true });
  };
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
      const controls = Array.from(mobilePanel.current?.querySelectorAll('a:not([aria-disabled="true"]), button:not(:disabled)') || [])
        .filter(control => control.getClientRects().length > 0);
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    const onResize = () => { if (window.innerWidth >= 768) setVisible(false); };
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
    setToken('')
    setCartItems({})
    


  }

  return (

    <header className={'storefront-navbar relative z-30' + (location.pathname === '/' ? ' storefront-home' : location.pathname === '/collection' ? ' storefront-collection' : location.pathname === '/about' ? ' storefront-about' : location.pathname === '/contact' ? ' storefront-contact' : location.pathname.startsWith('/product/') ? ' storefront-product' : location.pathname === '/cart' ? ' storefront-cart' : location.pathname === '/place-order' ? ' storefront-checkout' : location.pathname === '/orders' ? ' storefront-orders' : '')}>
      <a href='#main-content' className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 dark:focus:bg-slate-900'>Skip to content</a>
      <div className='storefront-navbar-shell'>
        <Link to='/' {...restrictedLinkProps} className='storefront-brand' aria-label='PAMO home'>
          <img src={assets.logo} className='storefront-logo' alt='' />
          <span className='storefront-brand-name'>PAMO<small className='storefront-brand-mobile-tagline'>SmartStock</small></span>
          <span className='storefront-brand-description'>School essentials<br/>SmartStock</span>
        </Link>
        <nav aria-label='Main navigation' className='storefront-main-nav'>
          {[['/', 'Home'], ['/collection', 'Collection'], ['/about', 'About'], ['/contact', 'Contact']].map(([path, label]) => (
            <NavLink key={path} to={path} {...restrictedLinkProps} className={({isActive}) => 'storefront-nav-link' + (isActive ? ' is-active' : '')}>{label}</NavLink>
          ))}
        </nav>
        <div className='storefront-nav-actions'>
          <div className='storefront-nav-search'>
            <Search size={18} strokeWidth={1.75} className='shrink-0 text-slate-600 dark:text-slate-300' aria-hidden='true' />
            <input type='search' value={search} disabled={!token} onFocus={revealSearch} onChange={changeSearch} placeholder='Search school essentials…' aria-label='Search collection' className='storefront-nav-query' />
          </div>
          <button type='button' disabled={!token} onClick={()=>{revealSearch(); if (location.pathname === '/collection') document.getElementById('collection-search')?.focus()}} className='storefront-nav-icon storefront-search-trigger' aria-label='Search collection'>
            <Search size={20} strokeWidth={1.75} aria-hidden='true' />
          </button>
          <ThemeToggle className='storefront-nav-theme'/>
          <div ref={accountMenu} className='relative' onBlur={(event)=>{if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false)}}>
            <button type='button' disabled={!token} onClick={()=> token ? setAccountOpen(!accountOpen) : navigate('/login')} className='storefront-nav-icon storefront-account-trigger' aria-label='Account' aria-expanded={token ? accountOpen : undefined}>
              <UserRound size={20} strokeWidth={1.75} aria-hidden='true' />
            </button>
            {token && accountOpen && <div className='absolute right-0 top-full z-40 w-48 pt-2' onKeyDown={(e)=>{if(e.key === 'Escape') {setAccountOpen(false); accountMenu.current?.querySelector('button')?.focus()}}}>
              <div className='panel overflow-hidden p-2 text-sm'>
                <p className='px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400'>My account</p>
                <button type='button' onClick={()=>{navigate('/orders'); setAccountOpen(false)}} className='w-full rounded-lg px-3 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800'>Orders</button>
                <button type='button' onClick={()=>{logout(); setAccountOpen(false)}} className='w-full rounded-lg px-3 py-3 text-left text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'>Logout</button>
              </div>
            </div>}
          </div>
          <Link to='/cart' {...restrictedLinkProps} className='storefront-nav-icon storefront-cart-link relative' aria-label={'Cart, ' + getCartCount() + ' items'}>
            <ShoppingBag size={20} strokeWidth={1.75} aria-hidden='true' />
            <span className='absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900 ring-2 ring-white dark:ring-slate-900'>{getCartCount()}</span>
          </Link>
          <button ref={menuButton} type='button' onClick={()=>setVisible(true)} className='storefront-nav-icon storefront-menu-trigger' aria-label='Open navigation' aria-expanded={visible} aria-controls='mobile-navigation'>
            <Menu size={20} strokeWidth={1.75} aria-hidden='true' />
          </button>
        </div>
      </div>
      {visible && <div className='fixed inset-0 z-50 bg-slate-950/40 md:hidden' role='dialog' aria-modal='true' aria-label='Navigation'>
        <button type='button' className='absolute inset-0 h-full w-full' aria-label='Close navigation' onClick={()=>setVisible(false)} />
        <nav ref={mobilePanel} id='mobile-navigation' aria-label='Mobile navigation' className='absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900'>
          <div className='mb-8 flex items-center justify-between'>
            <span className='text-xl font-bold tracking-tight'>PAMO</span>
            <ThemeToggle className='sm:hidden'/>
            <button autoFocus type='button' onClick={()=>setVisible(false)} className='icon-button' aria-label='Close navigation'><X size={20} strokeWidth={1.75} aria-hidden='true' /></button>
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
