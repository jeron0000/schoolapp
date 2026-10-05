import React from 'react'
import Title from '../components/Title'
import { assets } from '../assets/assets'
import NewsletterBox from '../components/NewsletterBox'

const supportItems = [
  { title: 'Order Support', description: 'Have a question about your uniform order? Reach out using the contact details above.', icon: assets.cart_icon, accent: 'bg-amber-100 dark:bg-amber-400/10' },
  { title: 'General Inquiries', description: 'For questions about school essentials, contact STI College Carmona.', icon: assets.search_icon, accent: 'bg-blue-100 dark:bg-blue-500/15' },
  { title: 'Campus Concerns', description: 'For campus-related inquiries, reach out to STI College Carmona directly.', icon: assets.profile_icon, accent: 'bg-emerald-100 dark:bg-emerald-500/15' }
]

const Contact = () => {
  return (
    <section className='page-section pb-6 sm:pb-8 lg:pb-10'>
      <header>
        <p className='eyebrow mb-3'>We're here to help</p>
        <Title text1={'CONTACT'} text2={'US'}/>
        <p className='mt-3 max-w-xl text-sm leading-7 text-slate-600 dark:text-slate-400'>Have questions about school uniforms, orders, or your campus? Reach out using the contact details below.</p>
      </header>

      <div className='mt-7 grid items-stretch gap-5 lg:grid-cols-2'>
        <figure className='overflow-hidden rounded-2xl bg-[#ffff00] lg:relative'>
          <img className='block aspect-[7/6] w-full object-contain lg:absolute lg:inset-0 lg:h-full lg:aspect-auto' src={assets.contact_img} alt='STI logo on a yellow background' width='894' height='894'/>
        </figure>
        <section aria-labelledby='contact-campus-heading' className='panel flex min-w-0 flex-col gap-6 p-6 sm:p-8'>
          <div>
            <p className='eyebrow mb-3'>Visit or get in touch</p>
            <h2 id='contact-campus-heading' className='text-2xl font-semibold tracking-tight sm:text-3xl'>STI College Carmona</h2>
            <p className='mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400'>Visit our campus or reach us through the contact details below.</p>
          </div>
          <dl className='space-y-5 text-sm'>
            <div className='flex items-start gap-4'>
              <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' aria-hidden='true'>
                <svg className='h-6 w-6' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7'><path d='M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z'/><circle cx='12' cy='10' r='2.5'/></svg>
              </span>
              <div className='min-w-0'><dt className='font-semibold text-slate-900 dark:text-slate-100'>Address</dt><dd className='mt-1 leading-6 text-slate-600 dark:text-slate-400'>South Luzon Expressway, Maduya, Carmona, 4116 Cavite</dd></div>
            </div>
            <div className='flex items-start gap-4'>
              <span className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800' aria-hidden='true'><img className='theme-icon h-6 w-6 object-contain' src={assets.support_img} alt=''/></span>
              <div className='min-w-0'><dt className='font-semibold text-slate-900 dark:text-slate-100'>Contact details</dt><dd className='mt-1 break-words leading-6 text-slate-600 dark:text-slate-400'>Tel: (046) 430-1661 / 1671<br/>Mobile: 0918 680 4021</dd></div>
            </div>
          </dl>
          <div className='mt-auto border-t border-slate-200 pt-6 dark:border-slate-800'>
            <h3 className='text-base font-semibold'>Explore STI College Carmona</h3>
            <p className='mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400'>Learn more about STI College Carmona, its programs, admissions, and campus information.</p>
            <a href='https://www.sti.edu/campuses/carmona' target='_blank' rel='noopener noreferrer' className='btn-secondary mt-4'>Explore STI <span aria-hidden='true'>→</span></a>
          </div>
        </section>
      </div>

      <section aria-label='Contact support information' className='my-10 grid gap-5 sm:my-12 sm:gap-6 lg:my-16 lg:grid-cols-3'>
        {supportItems.map(({ title, description, icon, accent }) => (
          <article key={title} className='panel flex items-start gap-5 p-5 sm:p-6'>
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${accent}`} aria-hidden='true'><img src={icon} className='theme-icon h-6 w-6 object-contain' alt=''/></span>
            <div className='min-w-0'><h3 className='text-sm font-semibold'>{title}</h3><p className='mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400'>{description}</p></div>
          </article>
        ))}
      </section>

      <NewsletterBox/>
    </section>
  )
}

export default Contact
