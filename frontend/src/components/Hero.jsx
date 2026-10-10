import React from 'react'
import { Link } from 'react-router-dom'
import HeroCarousel from './HeroCarousel'

const Hero = () => {
  return (
    <section className='hero relative isolate overflow-hidden bg-slate-900 dark:bg-slate-950' aria-label='School uniforms, made easier.'>
      <div className='relative mx-auto max-w-[1920px]'>
        <div className='hero-copy relative z-10 flex min-w-0 flex-col justify-center px-4 py-10 sm:px-6 sm:py-12'>
          <p className='mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100 sm:text-sm'><span className='h-2 w-2 rounded-full bg-amber-400' aria-hidden='true'/>PAMO / SMARTSTOCK</p>
          <h1 className='hero-headline text-[2rem] font-bold leading-[1.12] tracking-tight text-white min-[375px]:text-4xl sm:text-5xl lg:whitespace-nowrap lg:text-[clamp(2.25rem,3.6vw,4rem)] dark:text-white'>School uniforms,<br/><span className='text-amber-400'>made easier.</span></h1>
          <p className='hero-description mt-5 max-w-[520px] text-base leading-7 text-slate-200 lg:max-w-[min(28vw,32rem)] lg:text-[clamp(1rem,1.1vw,1.25rem)] lg:leading-relaxed'>Browse, order, and claim your school essentials with less waiting. Get ready for campus, all in one place.</p>
          <div className='hero-actions mt-7 flex flex-wrap gap-3 lg:max-w-[min(28vw,32rem)]'>
            <Link to='/collection' className='btn-primary rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 active:bg-amber-500 focus-visible:outline-amber-300 xl:min-h-14 xl:px-7 xl:text-base dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-300 dark:active:bg-amber-500'>Browse collection <span aria-hidden='true'>→</span></Link>
            <Link to='/about' className='btn-secondary rounded-lg border-slate-300 bg-transparent text-white hover:border-white hover:bg-white/10 focus-visible:outline-amber-300 xl:min-h-14 xl:px-7 xl:text-base dark:border-slate-300 dark:bg-transparent dark:text-white dark:hover:border-white dark:hover:bg-white/10'>Learn more</Link>
          </div>
        </div>
        <div className='hero-media relative aspect-[2412/1752] overflow-hidden'>
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}

export default Hero
