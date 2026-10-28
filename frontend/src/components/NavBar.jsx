import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bell, Menu, ShoppingBag, UserRound, X } from 'lucide-react';
import { assets } from '../assets/assets';
import { ShopContext } from '../context/shopContext.js';
import { usePublicAnnouncements } from '../hooks/usePublicAnnouncements';
import {
  ANNOUNCEMENT_READ_EVENT,
  announcementStorageKey,
  readAnnouncementIds,
  unreadAnnouncementCount
} from '../utils/announcementReadState';
import ThemeToggle from './ThemeToggle';
import './StorefrontFoundation.css';

const navigationLinks = [
  ['/', 'Home'],
  ['/collection', 'Collection'],
  ['/about', 'About'],
  ['/contact', 'Contact']
];

const navbarClassName = [
  'storefront-navbar relative z-30 bg-[var(--pamo-color-surface-navy)]',
  'md:!bg-transparent',
  'min-[1180px]:px-[calc(var(--pamo-home-gutter)/2)] min-[1180px]:pb-5 min-[1180px]:pt-[22px]',
  '[&_:focus-visible]:outline-[var(--pamo-color-brand-yellow,#ffd100)]',
  'md:[&_:focus-visible]:outline-[var(--pamo-color-accent-text)]'
].join(' ');

const navbarShellClassName = [
  'mx-auto grid min-h-[69px] max-w-[var(--pamo-layout-max)] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-0 border-b border-slate-700 px-3 py-3',
  'max-[359px]:grid-cols-2 max-[359px]:gap-y-2 max-[359px]:px-2 max-[359px]:py-2',
  'md:flex md:min-h-[76px] md:flex-wrap md:justify-between md:gap-4 md:border-b md:!border-[color:var(--pamo-color-border-default)]',
  'md:!bg-[var(--pamo-color-surface-default)] md:px-6',
  'min-[1180px]:min-h-[84px] min-[1180px]:gap-6 min-[1180px]:rounded-[11px] min-[1180px]:border',
  'min-[1180px]:pb-4 min-[1180px]:pl-[18px] min-[1180px]:pr-6 min-[1180px]:pt-4'
].join(' ');

const navbarIconClassName = [
  'flex h-[var(--pamo-target)] w-[var(--pamo-target)] items-center justify-center',
  '[flex:0_0_var(--pamo-target)] rounded-md border border-slate-700 text-white',
  'hover:bg-slate-800',
  'md:rounded-[7px] md:!border-transparent md:!text-[color:var(--pamo-color-text-primary)]',
  'md:hover:!bg-[var(--pamo-color-surface-subtle)]'
].join(' ');

const accountActionClassName = [
  navbarIconClassName,
  'bg-transparent',
  'hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]',
  'active:bg-[color-mix(in_srgb,currentColor_14%,transparent)]',
  'aria-expanded:bg-[color-mix(in_srgb,currentColor_14%,transparent)]',
  'min-[1180px]:rounded-lg min-[1180px]:border-0'
].join(' ');

const cartActionClassName = [
  navbarIconClassName,
  'relative bg-transparent',
  'hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]',
  'active:bg-[color-mix(in_srgb,currentColor_14%,transparent)]',
  'min-[1180px]:rounded-lg min-[1180px]:border-0'
].join(' ');

const getAnnouncementActionClassName = ({ isActive }) => {
  const stateClassName = isActive
    ? '!text-[color:var(--pamo-color-accent-text)] bg-[color-mix(in_srgb,currentColor_10%,transparent)]'
    : '';
  return `${accountActionClassName} relative ${stateClassName}`;
};

const compactThemeToggleClassName = [
  '!h-[var(--pamo-target)] !w-12',
  '[&>span]:!h-6 [&>span]:!w-10 [&>span]:!shrink-0',
  '[&>span]:!ring-slate-300 dark:[&>span]:!ring-slate-600',
  '[&>span>span:first-child]:!left-1 [&>span>span:first-child]:!top-1',
  '[&>span>span:first-child]:!h-4 [&>span>span:first-child]:!w-4',
  '[&>span>span:first-child]:!translate-x-0',
  'dark:[&>span>span:first-child]:!translate-x-4',
  '[&_svg]:!h-3.5 [&_svg]:!w-3.5 [&_svg]:[stroke-width:1.75]'
].join(' ');

const getNavigationLinkClassName = ({ isActive }) => {
  const baseClassName = [
    'relative flex min-h-[var(--pamo-target)] items-center whitespace-nowrap rounded',
    'text-[13px] font-medium'
  ].join(' ');

  if (!isActive) {
    return [
      baseClassName,
      'text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-text-primary)]'
    ].join(' ');
  }

  return [
    baseClassName,
    'font-semibold text-[color:var(--pamo-color-accent-text)]',
    "after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:bg-[var(--pamo-color-brand-yellow)] after:content-['']"
  ].join(' ');
};

const routeClasses = {
  '/': 'storefront-home',
  '/collection': 'storefront-collection',
  '/about': 'storefront-about',
  '/contact': 'storefront-contact',
  '/cart': 'storefront-cart',
  '/place-order': 'storefront-checkout',
  '/orders': 'storefront-orders',
  '/account': 'storefront-account',
  '/announcements': 'storefront-announcements'
};

const getRouteClass = pathname => {
  if (pathname.startsWith('/product/')) return 'storefront-product';
  return routeClasses[pathname] || '';
};

const NavBar = () => {
  const [visible, setVisible] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const mobilePanel = useRef(null);
  const menuButton = useRef(null);
  const accountMenu = useRef(null);
  const location = useLocation();
  const { getCartCount, navigate, token, userId, setToken, setCartItems } = useContext(ShopContext);
  const { announcements } = usePublicAnnouncements({ enabled: Boolean(token) });
  const [, setReadStateVersion] = useState(0);
  const readAnnouncementIdsForUser = readAnnouncementIds(userId);
  const routeClass = getRouteClass(location.pathname);
  const navbarClass = [navbarClassName, routeClass].filter(Boolean).join(' ');
  const unreadCount = unreadAnnouncementCount(
    announcements,
    readAnnouncementIdsForUser
  );
  const displayedUnreadCount = unreadCount > 99 ? '99+' : unreadCount;
  const announcementLabel = unreadCount > 0
    ? `Announcements, ${unreadCount} unread`
    : 'Announcements';
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
    const onResize = () => {
      if (window.innerWidth >= 768) setVisible(false);
    };
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

  useEffect(() => {
    if (!userId) return undefined;
    const storageKey = announcementStorageKey(userId);
    const refreshReadState = event => {
      if (event.type === 'storage' && event.key !== storageKey) return;
      if (
        event.type === ANNOUNCEMENT_READ_EVENT
        && event.detail?.userId !== userId
      ) {
        return;
      }
      setReadStateVersion(version => version + 1);
    };
    window.addEventListener('storage', refreshReadState);
    window.addEventListener(ANNOUNCEMENT_READ_EVENT, refreshReadState);
    return () => {
      window.removeEventListener('storage', refreshReadState);
      window.removeEventListener(ANNOUNCEMENT_READ_EVENT, refreshReadState);
    };
  }, [userId]);

  const logout = () => {
    navigate('/login');
    setToken('');
    setCartItems({});
    setAccountOpen(false);
  };

  const openAccount = () => {
    if (!token) {
      navigate('/login');
      return;
    }
    setAccountOpen(open => !open);
  };

  const closeAccountOnBlur = event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
  };

  const handleAccountKeyDown = event => {
    if (event.key !== 'Escape') return;
    setAccountOpen(false);
    accountMenu.current?.querySelector('button')?.focus();
  };

  const viewOrders = () => {
    navigate('/orders');
    setAccountOpen(false);
  };

  const viewAccount = () => {
    navigate('/account');
    setAccountOpen(false);
  };

  const closeMobileNavigation = () => setVisible(false);

  return (

    <header className={navbarClass}>
      <a href='#main-content' className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 dark:focus:bg-slate-900'>Skip to content</a>
      <div className={navbarShellClassName}>
        <Link to='/' {...restrictedLinkProps} className='col-start-2 flex shrink-0 items-center justify-self-center gap-2 rounded-md text-white max-[359px]:col-span-2 max-[359px]:col-start-1 max-[359px]:row-start-2 md:order-1 md:justify-self-auto md:gap-2.5 md:!text-[color:var(--pamo-color-text-primary)] min-[1180px]:gap-3' aria-label='PAMO home'>
          <img src={assets.logo} className='h-11 w-11 rounded-md border border-slate-200 bg-white p-1 object-contain md:h-[38px] md:w-[38px] md:border-0 md:p-0 min-[1180px]:h-12 min-[1180px]:w-12 min-[1180px]:rounded-lg' alt='' />
          <span className='text-lg font-semibold leading-6 tracking-tight md:text-[19px] md:font-bold md:leading-[1.2] md:tracking-normal min-[1180px]:text-[22px]'>PAMO<small className='mt-0.5 hidden text-[11px] font-normal leading-4 tracking-normal text-slate-400 min-[430px]:block md:block md:!text-[color:var(--pamo-color-text-secondary)] min-[1280px]:hidden'>SmartStock</small></span>
          <span className='ml-1 hidden border-l border-[color:var(--pamo-color-border-default)] pl-3 text-[11px] font-normal leading-[1.65] text-[color:var(--pamo-color-text-secondary)] min-[1280px]:block'>School essentials<br/>SmartStock</span>
        </Link>
        <nav aria-label='Main navigation' className='order-2 hidden min-w-0 shrink flex-wrap items-center justify-center gap-5 md:mx-auto md:flex min-[1180px]:gap-7'>
          {navigationLinks.map(([path, label]) => (
            <NavLink key={path} to={path} {...restrictedLinkProps} className={getNavigationLinkClassName}>{label}</NavLink>
          ))}
        </nav>
        <div className='contents md:order-3 md:ml-auto md:flex md:min-w-0 md:max-w-full md:shrink-0 md:items-center md:gap-0.5 min-[1180px]:gap-4'>
          <div className='col-start-1 row-start-1 flex items-center justify-self-start gap-0 md:contents'>
            <NavLink to='/announcements' {...restrictedLinkProps} className={getAnnouncementActionClassName} aria-label={announcementLabel} title={announcementLabel}>
              <Bell size={20} strokeWidth={1.75} aria-hidden='true' />
              {unreadCount > 0 && (
                <span aria-hidden='true' className='absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[color:var(--pamo-color-surface-navy)] md:ring-[color:var(--pamo-color-surface-default)]'>
                  {displayedUnreadCount}
                </span>
              )}
            </NavLink>
            <ThemeToggle className={`${compactThemeToggleClassName} order-first md:order-none`}/>
          </div>
          <div className='col-start-3 row-start-1 flex items-center justify-self-end gap-0 max-[359px]:col-start-2 md:contents'>
            <div ref={accountMenu} className='relative' onBlur={closeAccountOnBlur}>
              <button type='button' disabled={!token} onClick={openAccount} className={accountActionClassName} aria-label='Account' aria-expanded={token ? accountOpen : undefined}>
                <UserRound size={20} strokeWidth={1.75} aria-hidden='true' />
              </button>
              {token && accountOpen && <div className='absolute right-0 top-full z-40 w-[min(12rem,calc(100vw-32px))] pt-2' onKeyDown={handleAccountKeyDown}>
                <div className='panel overflow-hidden p-2 text-sm'>
                  <p className='px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400'>My account</p>
                  <button type='button' onClick={viewAccount} className='w-full rounded-lg px-3 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800'>Profile</button>
                  <button type='button' onClick={viewOrders} className='w-full rounded-lg px-3 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800'>Orders</button>
                  <button type='button' onClick={logout} className='w-full rounded-lg px-3 py-3 text-left text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'>Logout</button>
                </div>
              </div>}
            </div>
            <Link to='/cart' {...restrictedLinkProps} className={cartActionClassName} aria-label={'Cart, ' + getCartCount() + ' items'}>
              <ShoppingBag size={20} strokeWidth={1.75} aria-hidden='true' />
              <span className='absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900 ring-2 ring-[color:var(--pamo-color-surface-navy)] md:ring-[color:var(--pamo-color-surface-default)]'>{getCartCount()}</span>
            </Link>
            <button ref={menuButton} type='button' onClick={()=>setVisible(true)} className={navbarIconClassName + ' md:hidden'} aria-label='Open navigation' aria-expanded={visible} aria-controls='mobile-navigation'>
              <Menu size={20} strokeWidth={1.75} aria-hidden='true' />
            </button>
          </div>
        </div>
      </div>
      {visible && <div className='fixed inset-0 z-50 bg-slate-950/40 md:hidden' role='dialog' aria-modal='true' aria-label='Navigation'>
        <button type='button' className='absolute inset-0 h-full w-full' aria-label='Close navigation' onClick={closeMobileNavigation} />
        <nav ref={mobilePanel} id='mobile-navigation' aria-label='Mobile navigation' className='absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900'>
          <div className='mb-8 flex items-center justify-between max-[339px]:flex-wrap max-[339px]:gap-2'>
            <span className='text-xl font-bold tracking-tight max-[339px]:basis-full'>PAMO</span>
            <ThemeToggle className='sm:hidden'/>
            <button autoFocus type='button' onClick={closeMobileNavigation} className='icon-button' aria-label='Close navigation'><X size={20} strokeWidth={1.75} aria-hidden='true' /></button>
          </div>
          <p className='eyebrow mb-4'>Your campus essentials</p>
          {navigationLinks.map(([path, label]) => (
            <NavLink key={path} onClick={closeMobileNavigation} to={path} {...restrictedLinkProps} className={({isActive}) => 'mb-2 rounded-xl px-4 py-4 text-base ' + (isActive ? 'bg-amber-50 font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300' : 'font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100')}>{label}</NavLink>
          ))}
          <div className='mt-6 border-t border-slate-200 pt-6 dark:border-slate-800'>
            {token && <Link to='/account' onClick={closeMobileNavigation} {...restrictedLinkProps} className='btn-secondary mb-3 w-full'>My profile</Link>}
            <Link to={token ? '/orders' : '/login'} onClick={closeMobileNavigation} {...restrictedLinkProps} className='btn-secondary w-full'>{token ? 'My orders' : 'Login / Create account'}</Link>
          </div>
          <p className='mt-auto pt-6 text-xs text-slate-500 dark:text-slate-400'>PAMO / SmartStock</p>
        </nav>
      </div>}
    </header>
  )
};

export default NavBar;
