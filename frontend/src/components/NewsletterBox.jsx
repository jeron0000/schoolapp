import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

const shoppingCtaClass = [
  'home-shopping-cta mt-12 flex flex-col gap-6 rounded-xl border border-l-4',
  'border-[color:var(--pamo-color-border-default)] border-l-[color:var(--pamo-color-brand-yellow)]',
  'bg-amber-50/70 px-6 py-7',
  'dark:bg-[var(--pamo-color-surface-navy)]',
  'max-[359px]:px-5',
  'md:mt-16 md:flex-row md:items-center md:justify-between md:gap-10 md:px-8 md:py-8',
  'min-[1180px]:px-10',
].join(' ')
const ctaEyebrowClass = [
  'home-eyebrow mb-3 text-[11px] text-[color:var(--pamo-color-accent-text)] before:hidden',
  'md:text-xs md:leading-[1.5]',
].join(' ')
const ctaHeadingClass = [
  'font-display text-2xl font-semibold leading-[1.3] text-[color:var(--pamo-color-text-primary)]',
  'md:text-[28px]',
].join(' ')
const ctaDescriptionClass = [
  'mt-3 max-w-[58ch] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]',
].join(' ')
const ctaActionClass = [
  'home-brand-action self-start',
  'md:min-h-[52px] md:min-w-[214px] md:shrink-0 md:self-auto md:text-sm',
].join(' ')

const NewsletterBox = ({ home = false }) => {
  const handleSubmit = event => {
    event.preventDefault()
  }

  if (home) {
    return (
      <section className={shoppingCtaClass} aria-labelledby='shopping-cta-heading'>
        <div className='min-w-0'>
          <p className={ctaEyebrowClass}>Ready for campus?</p>
          <h2 id='shopping-cta-heading' className={ctaHeadingClass}>Everything you need, in one place.</h2>
          <p className={ctaDescriptionClass}>
            Shop the collection, check sizes, and keep track of your order.
          </p>
        </div>
        <Link to='/collection' className={ctaActionClass}>
          Browse collection
          <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' />
        </Link>
      </section>
    )
  }

  return (
    <section className='rounded-3xl bg-slate-900 px-6 py-9 text-white sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10'>
      <div className='max-w-md'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-amber-300'>Campus updates</p>
        <h2 className='mt-3 font-display text-2xl font-semibold tracking-tight text-white'>Stay in the loop.</h2>
        <p className='mt-3 text-sm leading-6 text-slate-300'>Newsletter sign-up is currently unavailable. Browse the collection for the latest available essentials.</p>
      </div>
      <form onSubmit={handleSubmit} className='mt-6 w-full lg:mt-0 lg:max-w-md'>
        <label htmlFor='newsletter-email' className='mb-2 block text-sm font-medium text-slate-200'>Email address</label>
        <div className='flex flex-col gap-3 sm:flex-row'>
          <input id='newsletter-email' className='field flex-1' type='email' placeholder='you@example.com' required />
          <button type='submit' disabled className='min-h-12 shrink-0 cursor-not-allowed rounded-xl bg-slate-700 px-5 text-sm font-medium text-slate-300'>Unavailable</button>
        </div>
      </form>
    </section>
  )
}

export default NewsletterBox
