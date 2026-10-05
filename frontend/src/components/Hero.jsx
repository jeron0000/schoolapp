import React from 'react'
import { Link } from 'react-router-dom'
import { assets } from '../assets/assets'

const steps = [
  { number: '01', title: 'Browse essentials', description: 'Explore uniforms and everyday items.' },
  { number: '02', title: 'Choose your size', description: 'Check details and find the right fit.' },
  { number: '03', title: 'Order & claim', description: 'Place your order and get ready for campus.' }
]

const Hero = () => {
  return (
    <section className='relative isolate overflow-hidden bg-slate-50 dark:bg-slate-950' aria-label='School uniforms, made easier.'>
      <div className='relative mx-auto max-w-[1920px]'>
        <div className='pointer-events-none absolute bottom-24 left-0 hidden h-64 w-40 bg-amber-100/60 [clip-path:polygon(0_55%,100%_0,35%_100%,0_100%)] lg:block dark:bg-amber-400/10' aria-hidden='true'/>
        <div className='relative aspect-[2412/1752] lg:absolute lg:inset-y-0 lg:right-0 lg:w-[66%] lg:aspect-auto lg:[clip-path:polygon(12%_0,100%_0,100%_100%,0_100%)]'>
          <img className='absolute inset-0 h-full w-full object-cover object-top' src={assets.hero_img} alt='STI students in campus uniforms gathered behind large yellow STI letters' fetchPriority='high' width='2412' height='1752' />
          <div className='pointer-events-none absolute inset-0 hidden bg-[linear-gradient(105deg,#f8fafc_0%,transparent_28%)] lg:block dark:bg-[linear-gradient(105deg,#020617_0%,transparent_28%)]' aria-hidden='true'/>
          <div className='pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-slate-50/60 to-transparent dark:from-slate-950/60' aria-hidden='true'/>
          <div className='pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-slate-50 via-slate-50/80 to-transparent lg:h-56 dark:from-slate-950 dark:via-slate-950/80' aria-hidden='true'/>
          <div className='pointer-events-none absolute right-0 top-0 hidden h-64 w-24 bg-amber-400/30 [clip-path:polygon(100%_15%,100%_65%,0_100%)] lg:block' aria-hidden='true'/>
          <div className='absolute bottom-6 right-4 z-10 text-right sm:right-6 lg:bottom-16 lg:right-10 xl:right-12'>
            <p className='text-xs font-semibold italic tracking-[0.12em] text-slate-900 dark:text-slate-100'>READY FOR THE SCHOOL DAY</p>
            <span className='ml-auto mt-3 block h-0.5 w-28 -rotate-6 bg-amber-500' aria-hidden='true'/>
            <p className='mt-4 text-xs text-slate-600 dark:text-slate-300'>Your everyday campus essentials.</p>
          </div>
        </div>
        <div className='content-container relative z-10 flex flex-col gap-10 pb-12 pt-8 sm:gap-12 lg:min-h-[600px] lg:justify-between lg:py-14 xl:min-h-[640px] xl:py-16'>
          <div className='max-w-[480px] lg:w-[43%]'>
            <p className='mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300'><span className='h-2 w-2 rounded-full bg-amber-500' aria-hidden='true'/>PAMO / SMARTSTOCK</p>
            <h1 className='text-[2rem] font-bold leading-[1.12] tracking-tight text-slate-900 min-[375px]:text-4xl sm:text-5xl lg:text-[2.75rem] xl:text-[3.25rem] dark:text-slate-100'>School uniforms,<br/><span className='text-amber-500 dark:text-amber-400'>made easier.</span></h1>
            <p className='mt-5 max-w-[430px] text-base leading-7 text-slate-600 dark:text-slate-300'>Browse, order, and claim your school essentials with less waiting. Get ready for campus, all in one place.</p>
            <div className='mt-7 flex flex-wrap gap-3'>
              <Link to='/collection' className='btn-primary rounded-lg bg-amber-400 text-slate-950 hover:bg-amber-300 active:bg-amber-500 dark:bg-amber-400 dark:text-slate-950 dark:hover:bg-amber-300 dark:active:bg-amber-500'>Browse collection <span aria-hidden='true'>→</span></Link>
              <Link to='/about' className='btn-secondary rounded-lg bg-transparent dark:bg-transparent'>Learn more</Link>
            </div>
          </div>
          <ol className='grid gap-5 sm:grid-cols-3 sm:gap-4 lg:max-w-[76%]'>
            {steps.map((step, index) => (
              <li key={step.number} className={`flex items-start gap-3 ${index > 0 ? 'sm:border-l sm:border-slate-200 sm:pl-4 dark:sm:border-slate-700' : ''}`}>
                <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100'>{step.number}</span>
                <div className='pt-0.5'>
                  <p className='text-sm font-semibold text-slate-900 dark:text-slate-100'>{step.title}</p>
                  <p className='mt-1 max-w-[170px] text-xs leading-5 text-slate-600 dark:text-slate-400'>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

export default Hero
