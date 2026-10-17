import React, { useLayoutEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { assets } from '../assets/assets'
import { ArrowRight } from 'lucide-react'

const exploreLinks = [['Home', '/'], ['Collection', '/collection'], ['About us', '/about'], ['Contact', '/contact']]

const Footer = () => {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isCollection = location.pathname === '/collection'
  const isAbout = location.pathname === '/about'
  const isContact = location.pathname === '/contact'
  const isProduct = location.pathname.startsWith('/product/')
  const isCart = location.pathname === '/cart'
  const isCheckout = location.pathname === '/place-order'
  const isOrders = location.pathname === '/orders'
  const foundationFooter = isHome || isCollection || isAbout || isContact || isProduct || isCart || isCheckout || isOrders
  const CustomerCare = foundationFooter ? 'nav' : 'div'
  const scrollAfterExplore = useRef(false)

  useLayoutEffect(() => {
    if (!scrollAfterExplore.current) return
    scrollAfterExplore.current = false
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.key])

  const onExploreClick = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    scrollAfterExplore.current = true
  }

  return (
    <footer className={foundationFooter ? 'home-footer relative isolate' + (isCollection ? ' collection-footer' : isAbout ? ' about-footer' : isContact ? ' contact-footer' : isProduct ? ' product-footer' : isCart ? ' cart-footer' : isCheckout ? ' checkout-footer' : isOrders ? ' orders-footer' : ' storefront-home') : 'relative isolate mt-16 overflow-hidden border-t border-slate-200 bg-white sm:mt-24 dark:border-slate-800 dark:bg-slate-950'}>
      <div className='pointer-events-none absolute -left-32 bottom-16 -z-10 h-64 w-64 rounded-full border-[36px] border-slate-100/70 dark:border-slate-900/60' aria-hidden='true'/>
      <div className='pointer-events-none absolute -right-40 bottom-8 -z-10 h-80 w-80 rounded-full border-[44px] border-slate-100/70 dark:border-slate-900/60' aria-hidden='true'/>
      <div className='home-footer-container content-container py-10 sm:py-12'>
        <div className='home-footer-columns grid gap-x-10 gap-y-10 pb-10 sm:grid-cols-2 sm:pb-12 lg:grid-cols-[1.4fr_0.8fr_1fr_1.2fr] lg:gap-x-12'>
          <div className='home-footer-brand'>
            <Link to='/' className='home-footer-brand-link inline-flex items-center gap-3 rounded-lg'>
              <img src={assets.logo} className='h-14 w-14 rounded-xl sm:h-16 sm:w-16' alt='PAMO home' />
              <div><p className='text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100'>{foundationFooter ? <><span className='home-footer-desktop-brand'>PAMO</span><span className='home-footer-small-brand'>PAMO / SmartStock</span></> : 'PAMO'}</p><p className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{foundationFooter ? <><span className='home-footer-desktop-brand'>SmartStock · </span>STI College Carmona</> : <>School essentials<br/>SmartStock</>}</p></div>
            </Link>
            <p className='mt-5 max-w-sm text-sm leading-7 text-slate-600 dark:text-slate-400'>School uniforms, made easier. Browse your school essentials, place an order, and keep track of it in one place.</p>
          </div>
          <nav aria-label='Footer navigation'>
            <h3 className='mb-4 text-sm font-semibold'>Explore</h3>
            <ul className='text-sm text-slate-600 dark:text-slate-400'>
              {exploreLinks.map(([label, path]) => <li key={path}><Link className='inline-flex min-h-10 items-center hover:text-amber-700 dark:hover:text-amber-300' to={path} onClick={onExploreClick}>{label}</Link></li>)}
            </ul>
          </nav>
          <CustomerCare aria-label={foundationFooter ? 'Customer care' : undefined}>
            <h3 className='mb-4 text-sm font-semibold'>Customer Care</h3>
            <ul className='text-sm text-slate-600 dark:text-slate-400'>
              <li><Link className='inline-flex min-h-10 items-center hover:text-amber-700 dark:hover:text-amber-300' to='/orders'>Order Tracking</Link></li>
              <li className='py-2.5'>{isHome ? <a href='#exchange-information'>Exchange information</a> : foundationFooter ? <Link to='/contact'>Exchange information</Link> : 'Easy Exchange Policy'}</li>
              <li className='py-2.5'>{isHome ? <a href='#return-information'>Return policy</a> : foundationFooter ? <Link to='/contact'>Return policy</Link> : '7 Days Return Policy'}</li>
              <li><Link className='inline-flex min-h-10 items-center hover:text-amber-700 dark:hover:text-amber-300' to='/contact'>Contact Support</Link></li>
            </ul>
          </CustomerCare>
          <div className='home-footer-contact min-w-0'>
            <h3 className='mb-5 text-sm font-semibold'>Get in touch</h3>
            <div className='home-footer-phone flex items-start gap-3'>
              <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900' aria-hidden='true'><img src={assets.support_img} className='theme-icon h-5 w-5 object-contain' alt=''/></span>
              <div className='min-w-0 text-sm leading-6 text-slate-600 dark:text-slate-400'><p>(046) 430-1661 / 1671</p><p>0918 680 4021</p></div>
            </div>
            <a href='https://www.sti.edu/campuses/carmona' target='_blank' rel='noopener noreferrer' className='home-footer-campus mt-5 flex items-center gap-3 border-t border-slate-200 pt-5 text-sm font-semibold text-slate-900 hover:text-amber-700 dark:border-slate-800 dark:text-slate-100 dark:hover:text-amber-300'>
              <img src={assets.footer_sti} className='h-11 w-11 shrink-0 rounded-lg object-contain' alt='STI' width='894' height='894'/>
              <span>STI College Carmona {foundationFooter ? <ArrowRight className='storefront-action-icon ml-1' size={18} strokeWidth={1.75} aria-hidden='true' /> : <span className='ml-1' aria-hidden='true'>→</span>}</span>
            </a>
          </div>
        </div>

        <div className='home-footer-bottom flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800'>
          <p className='text-xs leading-6 text-slate-500 dark:text-slate-400'>© 2026 PAMO / SmartStock. All rights reserved.</p>
          <ul aria-label='Payment methods and availability' className='home-footer-payments flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-300'>
            {['Stripe (Unavailable)', 'PayPal (Unavailable)', 'Pay as you claim'].map((method) => <li key={method} className='rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900'>{method}</li>)}
          </ul>
        </div>
      </div>
    </footer>
  )
}

export default Footer
