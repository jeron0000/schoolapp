import React from 'react'
import { assets } from '../assets/assets'

const OurPolicy = () => {
  return (
    <section aria-label='Our policies' className='my-14 grid gap-4 sm:my-20 md:grid-cols-3'>
      {[
        [assets.exchange_icon, 'Easy Exchange Policy', 'We offer a hassle-free exchange policy.'],
        [assets.quality_icon, '7 Days Return Policy', 'We provide a 7-day free return policy.'],
        [assets.support_img, 'Best Customer Support', 'Contact our team for support with your order.']
      ].map(([icon, title, copy]) => (
        <div key={title} className='panel flex items-start gap-4 p-6 lg:flex-col lg:p-8'>
          <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10'><img src={icon} className='w-7 theme-icon' alt='' /></div>
          <div><h3 className='text-sm font-semibold'>{title}</h3><p className='mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400'>{copy}</p></div>
        </div>
      ))}
    </section>
  )
}

export default OurPolicy
