import React, { useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { assets } from '../assets/assets';

const exploreLinks = [['Home', '/'], ['Collection', '/collection'], ['About us', '/about'], ['Contact', '/contact']];
const standardFooterClass = 'relative isolate mt-16 overflow-hidden border-t border-slate-200 bg-white sm:mt-24 dark:border-slate-800 dark:bg-slate-950';
const foundationFooterClass = [
  'home-footer relative isolate mt-[45px] border-t',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'md:mt-[138px] min-[1180px]:mt-[126px]',
].join(' ');
const foundationContainerClass = [
  'home-footer-container content-container mx-auto w-[calc(100%-38px)] max-w-[1308px]',
  'px-0 pb-8 pt-[27px] md:w-[calc(100%-60px)] md:pb-[60px] md:pt-[41px]',
  'min-[1180px]:w-[calc(100%-clamp(60px,9.167vw,132px))]',
  'min-[1180px]:pb-[90px] min-[1180px]:pt-[43px]',
].join(' ');
const foundationColumnsClass = [
  'home-footer-columns grid grid-cols-[minmax(0,1fr)] gap-[18px] pb-7',
  'md:grid-cols-[1.4fr_1fr_1fr] md:gap-8 md:pb-[72px]',
  'min-[1180px]:grid-cols-[1.4fr_1fr_1fr_1.2fr] min-[1180px]:gap-12',
].join(' ');
const foundationBrandLinkClass = 'home-footer-brand-link flex items-center gap-3.5 rounded-lg';
const foundationLogoClass = [
  'hidden min-[1180px]:block min-[1180px]:h-[53px] min-[1180px]:w-[53px]',
  'min-[1180px]:rounded-[7px]',
].join(' ');
const foundationBrandDescriptionClass = [
  'hidden min-[1180px]:mt-6 min-[1180px]:block min-[1180px]:max-w-80',
  'min-[1180px]:text-[13px] min-[1180px]:leading-[1.8]',
  'min-[1180px]:text-[color:var(--pamo-color-text-secondary)]',
].join(' ');
const foundationNavigationTitleClass = [
  'absolute h-px w-px overflow-hidden text-sm font-semibold leading-5 [clip-path:inset(50%)]',
  'md:static md:mb-5 md:h-auto md:w-auto md:overflow-visible md:[clip-path:none]',
  'min-[1180px]:mb-5 min-[1180px]:mt-2.5 min-[1180px]:text-xs min-[1180px]:leading-5 min-[1180px]:uppercase',
  'min-[1180px]:text-[color:var(--pamo-color-text-primary)]',
].join(' ');
const foundationNavigationListClass = [
  'flex flex-wrap gap-x-4 text-[13px] leading-5 text-[color:var(--pamo-color-text-secondary)]',
  'md:block',
].join(' ');
const foundationNavigationLinkClass = [
  'inline-flex min-h-11 items-center text-[13px] leading-5 hover:text-amber-700',
  'dark:hover:text-amber-300 min-[1180px]:min-h-9',
].join(' ');
const standardNavigationLinkClass = 'inline-flex min-h-10 items-center hover:text-amber-700 dark:hover:text-amber-300';
const foundationContactClass = [
  'home-footer-contact col-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2',
  'text-[color:var(--pamo-color-text-secondary)] md:col-span-full',
  'min-[1180px]:col-auto min-[1180px]:flex-col min-[1180px]:items-start min-[1180px]:gap-0',
].join(' ');
const foundationContactTitleClass = [
  'hidden min-[1180px]:mb-5 min-[1180px]:mt-2.5 min-[1180px]:block',
  'min-[1180px]:text-xs min-[1180px]:font-semibold min-[1180px]:leading-5 min-[1180px]:uppercase',
  'min-[1180px]:text-[color:var(--pamo-color-text-primary)]',
].join(' ');
const foundationPhoneTextClass = 'text-xs leading-[1.8] min-[1180px]:text-[13px] min-[1180px]:leading-9';
const foundationCampusClass = [
  'home-footer-campus m-0 flex min-h-11 items-center gap-3 border-0 p-0',
  'text-xs font-medium leading-5 text-slate-900 hover:text-amber-700',
  'dark:text-slate-100 dark:hover:text-amber-300 min-[1180px]:min-h-9 min-[1180px]:text-[13px]',
].join(' ');
const foundationBottomClass = [
  'home-footer-bottom flex flex-col gap-3 border-t border-slate-200 pt-5',
  'md:flex-row md:items-center md:justify-between dark:border-slate-800',
  'min-[1180px]:pt-7',
].join(' ');
const foundationCopyrightClass = 'text-[11px] leading-6 text-[color:var(--pamo-color-text-secondary)] min-[1180px]:text-xs min-[1180px]:leading-6';
const foundationPaymentsClass = [
  'home-footer-payments flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-300',
  'min-[1180px]:relative min-[1180px]:pt-[25px] min-[1180px]:before:absolute',
  'min-[1180px]:before:left-0 min-[1180px]:before:top-0 min-[1180px]:before:text-[10px]',
  'min-[1180px]:before:font-bold min-[1180px]:before:uppercase',
  'min-[1180px]:before:text-[color:var(--pamo-color-text-secondary)]',
  "min-[1180px]:before:content-['Payment_methods']",
].join(' ');
const foundationRouteClasses = {
  '/': 'storefront-home',
  '/collection': 'collection-footer',
  '/about': 'about-footer',
  '/contact': 'contact-footer',
  '/cart': 'cart-footer',
  '/place-order': 'checkout-footer',
  '/orders': 'orders-footer'
};

const getFoundationRouteClass = pathname => {
  if (pathname.startsWith('/product/')) return 'product-footer';
  return foundationRouteClasses[pathname] || '';
};

const CustomerCareInformation = ({ home, foundation, fragment, label, fallback, className }) => {
  if (home) return <a className={className} href={fragment}>{label}</a>;
  if (foundation) return <Link className={className} to='/contact'>{label}</Link>;
  return fallback;
};

const FooterBrand = ({ foundation }) => {
  if (!foundation) {
    return <div><p className='text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100'>PAMO</p><p className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>School essentials<br/>SmartStock</p></div>;
  }

  return (
    <div>
      <p className='text-[17px] font-bold leading-7 tracking-tight text-slate-900 md:text-xl min-[1180px]:text-[23px] dark:text-slate-100'>
        <span className='home-footer-desktop-brand hidden min-[1180px]:inline'>PAMO</span>
        <span className='home-footer-small-brand min-[1180px]:hidden'>PAMO / SmartStock</span>
      </p>
      <p className='mt-0.5 text-xs leading-5 text-slate-500 min-[1180px]:mt-2.5 dark:text-slate-400'>
        <span className='home-footer-desktop-brand hidden min-[1180px]:inline'>SmartStock · </span>
        STI College Carmona
      </p>
    </div>
  );
};

const Footer = () => {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const foundationRouteClass = getFoundationRouteClass(location.pathname)
  const foundationFooter = Boolean(foundationRouteClass)
  const footerClass = foundationFooter
    ? `${foundationFooterClass} ${foundationRouteClass}`
    : standardFooterClass
  const CustomerCare = foundationFooter ? 'nav' : 'div'
  const decorationClass = foundationFooter ? 'hidden ' : ''
  const containerClass = foundationFooter
    ? foundationContainerClass
    : 'home-footer-container content-container py-10 sm:py-12'
  const columnsClass = foundationFooter
    ? foundationColumnsClass
    : 'home-footer-columns grid gap-x-10 gap-y-10 pb-10 sm:grid-cols-2 sm:pb-12 lg:grid-cols-[1.4fr_0.8fr_1fr_1.2fr] lg:gap-x-12'
  const brandLinkClass = foundationFooter
    ? foundationBrandLinkClass
    : 'home-footer-brand-link inline-flex items-center gap-3 rounded-lg'
  const logoClass = foundationFooter ? foundationLogoClass : 'h-14 w-14 rounded-xl sm:h-16 sm:w-16'
  const brandDescriptionClass = foundationFooter
    ? foundationBrandDescriptionClass
    : 'mt-5 max-w-sm text-sm leading-7 text-slate-600 dark:text-slate-400'
  const navigationTitleClass = foundationFooter ? foundationNavigationTitleClass : 'mb-4 text-sm font-semibold'
  const navigationListClass = foundationFooter
    ? foundationNavigationListClass
    : 'text-sm text-slate-600 dark:text-slate-400'
  const navigationLinkClass = foundationFooter ? foundationNavigationLinkClass : standardNavigationLinkClass
  const contactClass = foundationFooter ? foundationContactClass : 'home-footer-contact min-w-0'
  const contactTitleClass = foundationFooter ? foundationContactTitleClass : 'mb-5 text-sm font-semibold'
  const phoneClass = foundationFooter
    ? 'home-footer-phone order-1 flex items-start gap-3'
    : 'home-footer-phone flex items-start gap-3'
  const phoneIconClass = foundationFooter
    ? 'hidden'
    : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900'
  const campusClass = foundationFooter
    ? foundationCampusClass
    : 'home-footer-campus mt-5 flex items-center gap-3 border-t border-slate-200 pt-5 text-sm font-semibold text-slate-900 hover:text-amber-700 dark:border-slate-800 dark:text-slate-100 dark:hover:text-amber-300'
  const campusImageClass = foundationFooter ? 'hidden' : 'h-11 w-11 shrink-0 rounded-lg object-contain'
  const bottomClass = foundationFooter
    ? foundationBottomClass
    : 'home-footer-bottom flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800'
  const copyrightClass = foundationFooter
    ? foundationCopyrightClass
    : 'text-xs leading-6 text-slate-500 dark:text-slate-400'
  const paymentsClass = foundationFooter
    ? foundationPaymentsClass
    : 'home-footer-payments flex flex-wrap gap-2 text-xs font-medium text-slate-600 dark:text-slate-300'
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
    <footer className={footerClass}>
      <div className={`${decorationClass}pointer-events-none absolute -left-32 bottom-16 -z-10 h-64 w-64 rounded-full border-[36px] border-slate-100/70 dark:border-slate-900/60`} aria-hidden='true'/>
      <div className={`${decorationClass}pointer-events-none absolute -right-40 bottom-8 -z-10 h-80 w-80 rounded-full border-[44px] border-slate-100/70 dark:border-slate-900/60`} aria-hidden='true'/>
      <div className={containerClass}>
        <div className={columnsClass}>
          <div className='home-footer-brand'>
            <Link to='/' className={brandLinkClass}>
              <img src={assets.logo} className={logoClass} alt='PAMO home' />
              <FooterBrand foundation={foundationFooter} />
            </Link>
            <p className={brandDescriptionClass}>School uniforms, made easier. Browse your school essentials, place an order, and keep track of it in one place.</p>
          </div>
          <nav className={foundationFooter ? 'border-t border-[color:var(--pamo-color-border-default)] pt-3.5 md:border-0 md:pt-0' : undefined} aria-label='Footer navigation'>
            <h3 className={navigationTitleClass}>Explore</h3>
            <ul className={navigationListClass}>
              {exploreLinks.map(([label, path]) => <li key={path}><Link className={navigationLinkClass} to={path} onClick={onExploreClick}>{label}</Link></li>)}
            </ul>
          </nav>
          <CustomerCare aria-label={foundationFooter ? 'Customer care' : undefined}>
            <h3 className={navigationTitleClass}>Customer Care</h3>
            <ul className={navigationListClass}>
              <li><Link className={navigationLinkClass} to='/orders'>Order Tracking</Link></li>
              <li className={foundationFooter ? 'p-0' : 'py-2.5'}><CustomerCareInformation home={isHome} foundation={foundationFooter} fragment='#exchange-information' label='Exchange information' fallback='Easy Exchange Policy' className={navigationLinkClass} /></li>
              <li className={foundationFooter ? 'p-0' : 'py-2.5'}><CustomerCareInformation home={isHome} foundation={foundationFooter} fragment='#return-information' label='Return policy' fallback='7 Days Return Policy' className={navigationLinkClass} /></li>
              <li><Link className={navigationLinkClass} to='/contact'>Contact Support</Link></li>
            </ul>
          </CustomerCare>
          <div className={contactClass}>
            <h3 className={contactTitleClass}>Get in touch</h3>
            <div className={phoneClass}>
              <span className={phoneIconClass} aria-hidden='true'><img src={assets.support_img} className='theme-icon h-5 w-5 object-contain' alt=''/></span>
              <div className='min-w-0 text-slate-600 dark:text-slate-400'><p className={foundationFooter ? foundationPhoneTextClass : 'text-sm leading-6'}>(046) 430-1661 / 1671</p><p className={foundationFooter ? foundationPhoneTextClass : 'text-sm leading-6'}>0918 680 4021</p></div>
            </div>
            <a href='https://www.sti.edu/campuses/carmona' target='_blank' rel='noopener noreferrer' className={campusClass}>
              <img src={assets.footer_sti} className={campusImageClass} alt='STI' width='894' height='894'/>
              <span>STI College Carmona {foundationFooter ? <ArrowRight className='storefront-action-icon ml-1' size={18} strokeWidth={1.75} aria-hidden='true' /> : <span className='ml-1' aria-hidden='true'>→</span>}</span>
            </a>
          </div>
        </div>

        <div className={bottomClass}>
          <p className={copyrightClass}>© 2026 PAMO / SmartStock. All rights reserved.</p>
          <ul aria-label='Payment methods and availability' className={paymentsClass}>
            {['Stripe (TEST)', 'PayPal (SANDBOX)', 'Pay as you claim'].map((method, index) => {
              const separatorClass = foundationFooter && index > 0 ? "before:mr-2 before:content-['·']" : ''
              const paymentClass = foundationFooter
                ? `${separatorClass} border-0 bg-transparent p-0 text-[10px] leading-[1.5] min-[1180px]:text-xs min-[1180px]:leading-[1.5]`
                : 'rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900'

              return <li key={method} className={paymentClass}>{method}</li>
            })}
          </ul>
        </div>
      </div>
    </footer>
  )
}

export default Footer
