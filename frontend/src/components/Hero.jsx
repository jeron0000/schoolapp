import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import HeroCarousel from './HeroCarousel'
import './StorefrontFoundation.css'

const heroClass = [
  'home-hero mx-auto mt-4 w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)] overflow-hidden',
  'bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-primary)]',
  'dark:bg-[var(--pamo-color-surface-navy)]',
  'md:mt-6 md:w-[calc(100%-60px)] min-[960px]:mt-8',
  'min-[1180px]:mt-10 min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]',
].join(' ')

const heroLayoutClass = [
  'grid min-w-0 items-center gap-5 py-4',
  'md:gap-7 md:py-6',
  'min-[960px]:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]',
  'min-[960px]:gap-12 min-[960px]:py-10',
  'min-[1440px]:gap-16 min-[1440px]:py-12',
].join(' ')

const heroCopyClass = 'min-w-0 py-1 text-center sm:text-left min-[960px]:py-6'

const heroKickerClass = [
  'mb-4 flex items-center justify-center gap-3 text-[11px] font-bold uppercase leading-5 tracking-[0.08em]',
  'sm:justify-start',
  'text-[color:var(--pamo-color-text-primary)] md:mb-5 md:text-xs min-[960px]:mb-7',
].join(' ')

const headlineClass = [
  'mx-auto max-w-[12ch] font-display text-[clamp(2rem,9.5vw,3.2rem)] font-bold leading-[1.04] sm:mx-0',
  'tracking-[-0.045em] text-[color:var(--pamo-color-text-primary)] [overflow-wrap:anywhere]',
  'min-[960px]:text-[clamp(3.5rem,4.55vw,4.5rem)]',
].join(' ')

const descriptionClass = [
  'mx-auto mt-6 max-w-[38ch] text-[15px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]',
  'sm:mx-0 sm:max-w-[48ch]',
  'md:mt-7 md:text-base min-[960px]:mt-8 min-[1180px]:mt-9 min-[1180px]:text-[17px]',
].join(' ')

const actionsClass = [
  'mx-auto mt-6 flex max-w-[32rem] flex-wrap items-center justify-center gap-x-4 gap-y-2',
  'sm:mx-0 sm:max-w-none sm:justify-start',
  'max-[359px]:w-full max-[359px]:flex-col max-[359px]:items-stretch max-[359px]:gap-1.5',
  'md:mt-7 min-[960px]:mt-8 min-[1180px]:mt-9',
].join(' ')

const primaryActionClass = [
  'inline-flex min-h-12 max-w-full items-center justify-center gap-3 rounded-lg',
  'bg-[var(--pamo-color-brand-yellow)] px-5 py-3 text-sm font-semibold text-slate-950',
  'transition-colors hover:bg-[var(--pamo-color-brand-hover)] active:bg-[var(--pamo-color-brand-pressed)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4',
  'focus-visible:outline-[color:var(--pamo-color-accent-text)]',
  'max-[359px]:w-full max-[359px]:gap-2 max-[359px]:px-3 max-[359px]:text-[13px]',
].join(' ')

const secondaryActionClass = [
  'inline-flex min-h-12 max-w-full items-center justify-center gap-2 px-1 py-3 text-sm font-semibold',
  'text-[color:var(--pamo-color-text-primary)] transition-colors',
  'hover:text-[color:var(--pamo-color-accent-text)] active:text-[color:var(--pamo-color-brand-pressed)]',
  'focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4',
  'focus-visible:outline-[color:var(--pamo-color-accent-text)] max-[359px]:self-center',
].join(' ')

const heroMediaClass = [
  'relative aspect-[3/2] min-w-0 overflow-hidden rounded-xl border',
  'md:aspect-[16/9] min-[960px]:aspect-[2412/1752]',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] [container:hero-photo_/_inline-size]',
].join(' ')

const Hero = () => {
  return (
    <section className={heroClass} aria-labelledby='home-hero-heading'>
      <div className={heroLayoutClass}>
        <div className={heroCopyClass}>
          <p className={heroKickerClass}>
            <span
              className='h-[3px] w-10 shrink-0 rounded-full bg-[var(--pamo-color-brand-yellow)]'
              aria-hidden='true'
            />
            School essentials · Campus pickup
          </p>
          <h1 id='home-hero-heading' className={headlineClass}>
            <span className='block'>School uniforms,</span>
            <span className='mt-1 inline-block pb-3'>made easier.</span>
          </h1>
          <p className={descriptionClass}>
            Browse, order, and claim your school essentials with less waiting. Everything for campus, in one place.
          </p>
          <div className={actionsClass}>
            <Link to='/collection' className={primaryActionClass}>
              Browse Collection
              <ArrowRight size={19} strokeWidth={1.8} aria-hidden='true' />
            </Link>
            <Link to='/about' className={secondaryActionClass}>
              Learn More
              <ArrowRight size={17} strokeWidth={1.8} aria-hidden='true' />
            </Link>
          </div>
          <p className='mt-7 hidden items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--pamo-color-text-secondary)] min-[960px]:flex'>
            <ShieldCheck size={20} strokeWidth={1.7} aria-hidden='true' />
            Official campus essentials
          </p>
        </div>
        <div className={heroMediaClass}>
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}

export default Hero
