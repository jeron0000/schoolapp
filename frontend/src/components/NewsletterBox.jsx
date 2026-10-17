import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
    
    const NewsletterBox = ({ home = false }) => {

        const onSubmitHandler = (event) => {
            event.preventDefault();
        }
        if (home) return (
          <section className='home-shopping-cta' aria-labelledby='shopping-cta-heading'>
            <div>
              <p className='home-eyebrow'><span className='home-copy-desktop'>Ready for the next school day?</span><span className='home-copy-tablet'>Everything you need in one place</span><span className='home-copy-mobile'>Ready for campus?</span></p>
              <h2 id='shopping-cta-heading'><span className='home-copy-desktop'>Everything you need, in one place.</span><span className='home-copy-tablet'>Get ready for campus.</span><span className='home-copy-mobile'>Everything in one place.</span></h2>
              <p className='home-copy-desktop'>Shop the collection, check sizes, and keep track of your order.</p>
            </div>
            <Link to='/collection' className='home-brand-action'>Browse collection <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></Link>
          </section>
        )

      return (

    <section className='rounded-3xl bg-slate-900 px-6 py-9 text-white sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10'>
      <div className='max-w-md'>
        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-amber-300'>Campus updates</p>
        <h2 className='mt-3 text-2xl font-semibold tracking-tight text-white'>Stay in the loop.</h2>
        <p className='mt-3 text-sm leading-6 text-slate-300'>Newsletter sign-up is currently unavailable. Browse the collection for the latest available essentials.</p>
      </div>
      <form onSubmit={onSubmitHandler} className='mt-6 w-full lg:mt-0 lg:max-w-md'>
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
