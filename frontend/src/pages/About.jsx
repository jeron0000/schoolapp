import React from 'react'
import { Link } from 'react-router-dom'
import Title from '../components/Title'
import { assets } from '../assets/assets'
import NewsletterBox from '../components/NewsletterBox'

const introduction = 'PAMO / SmartStock is a school uniform ordering and inventory management platform designed to make purchasing school essentials simpler, faster, and more organized for students and school staff.'

const values = [
  ['Students First', 'Convenient and reliable ordering experience'],
  ['Organized System', 'Clear product, inventory, and order tracking'],
  ['Reliable Workflow', 'Built to support a smoother school uniform process']
]

const capabilities = [
  'Product Browsing & Ordering',
  'Inventory Tracking',
  'Payment Coordination',
  'Order Monitoring'
]

const reasons = [
  {
    label: '01 / QUALITY',
    title: 'Quality Assurance',
    icon: assets.quality_icon,
    description: 'PAMO / SmartStock helps students browse school essentials with clear product information, available sizes, and organized inventory records so they can make better-informed orders.'
  },
  {
    label: '02 / SIMPLICITY',
    title: 'Convenience',
    icon: assets.cart_icon,
    description: 'Students can browse products, place orders, and monitor their order progress in one place, reducing unnecessary steps and making the uniform-ordering process easier to follow.'
  },
  {
    label: '03 / SUPPORT',
    title: 'Organized Support',
    icon: assets.support_img,
    description: 'The system gives PAMO staff a clearer view of products, inventory, and orders, helping them respond to student needs and manage transactions in a more organized way.'
  }
]

const About = () => {
  return (
    <div className='page-section pb-0'>
      <section aria-labelledby='about-heading' className='grid gap-8 lg:grid-cols-2 lg:grid-rows-[1fr_auto] lg:items-start lg:gap-x-16 lg:gap-y-10'>
        <div>
          <p className='eyebrow mb-4'>SCHOOL ESSENTIALS, SIMPLIFIED</p>
          <h1 id='about-heading' className='border-l-4 border-amber-500 pl-4 text-4xl font-semibold tracking-tight sm:text-5xl'>ABOUT <span className='text-amber-600 dark:text-amber-400'>US</span></h1>
          <p className='mt-6 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300'>{introduction}</p>
          <p className='mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300'>The platform brings product browsing, ordering, inventory tracking, payment coordination, and order monitoring into one centralized workflow so students can follow their orders more easily while PAMO staff manage products, stock, and transactions more efficiently.</p>
          <div className='mt-7 flex flex-wrap gap-3'>
            <Link to='/collection' className='btn-primary bg-amber-400 text-slate-950 hover:bg-amber-300 active:bg-amber-500 dark:bg-amber-400 dark:hover:bg-amber-300 dark:active:bg-amber-500'>Explore Collection <span aria-hidden='true'>→</span></Link>
            <Link to='/contact' className='btn-secondary'>Contact Us</Link>
          </div>
        </div>
        <figure className='mx-auto aspect-[7/8] w-[75%] max-w-[595px] overflow-hidden rounded-2xl lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center'>
          <img className='block h-full w-full object-cover object-bottom' src={assets.about_img} alt='STI students in school uniforms with sports, music, and campus activity essentials' width='728' height= '1098' />
        </figure>
        <dl className='grid gap-5 border-t border-slate-200 pt-6 sm:grid-cols-3 lg:col-start-1 lg:row-start-2 dark:border-slate-800'>
          {values.map(([title, description]) => (
            <div key={title} className='sm:border-l sm:border-slate-200 sm:pl-4 sm:first:border-0 sm:first:pl-0 dark:sm:border-slate-800'>
              <dt className='text-sm font-semibold text-slate-900 dark:text-slate-100'>{title}</dt>
              <dd className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby='about-platform-heading' className='panel mt-12 grid gap-8 p-6 sm:mt-16 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12'>
        <div>
          <h2 id='about-platform-heading' className='border-l-4 border-amber-500 pl-4 text-xl font-semibold tracking-tight sm:text-2xl'>What is PAMO / SmartStock?</h2>
          <div className='mt-5 space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300'>
            <p>{introduction}</p>
            <p>The system brings product browsing, ordering, inventory tracking, payment coordination, and order monitoring into one centralized platform. Students can easily find the uniforms they need, place orders, and track their progress, while PAMO staff can manage products, stock, and transactions more efficiently.</p>
          </div>
        </div>
        <ul className='grid gap-3 sm:grid-cols-2 lg:content-center'>
          {capabilities.map((capability, index) => (
            <li key={capability} className='flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:block sm:p-5 dark:border-slate-800 dark:bg-slate-950/50'>
              <span className='shrink-0 text-xs font-medium leading-6 text-amber-700 dark:text-amber-300'>0{index + 1}</span>
              <h3 className='text-sm font-semibold leading-6 sm:mt-3'>{capability}</h3>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby='about-mission-heading' className='my-12 grid gap-5 border-y border-slate-200 py-8 sm:my-16 sm:py-10 lg:grid-cols-[0.6fr_1.4fr] lg:gap-12 dark:border-slate-800'>
        <h2 id='about-mission-heading' className='self-start border-l-4 border-amber-500 pl-4 text-2xl font-semibold tracking-tight'>Our Mission</h2>
        <p className='max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300'>Our mission is to create a reliable, transparent, and efficient digital workflow for school uniform ordering. PAMO / SmartStock aims to reduce unnecessary waiting, improve inventory and order tracking, and connect each stage of the process—from browsing and ordering to payment, preparation, and claiming—within one organized system.</p>
      </section>

      <section aria-label='Why choose us' className='mb-12 sm:mb-16'>
        <Title text1={'WHY'} text2={'CHOOSE US'}/>
        <div className='mt-6 grid gap-5 md:grid-cols-3'>
          {reasons.map(({label, title, icon, description}) => (
            <article key={title} className='panel p-6 lg:p-7'>
              <div className='flex items-center gap-3'>
                <img src={icon} className='theme-icon h-7 w-7 object-contain' alt='' />
                <p className='text-xs font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300'>{label}</p>
              </div>
              <h3 className='mt-5 text-base font-semibold'>{title}</h3>
              <p className='mt-3 text-sm leading-7 text-slate-500 dark:text-slate-400'>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <NewsletterBox/>
    </div>
  )
}

export default About
