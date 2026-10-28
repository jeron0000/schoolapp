import React from 'react'
import { Link } from 'react-router-dom'
import HomeSectionHeading from './HomeSectionHeading'
import { Ruler, Package, Headphones } from 'lucide-react'

const policySectionClass = [
  'mt-14 scroll-mt-6',
  'md:mt-[72px]',
].join(' ')

const policyGridClass = [
  'mt-6 grid items-stretch gap-4',
  'md:mt-7 md:grid-cols-3 md:gap-5',
].join(' ')

const policyCardClass = [
  'flex h-full min-w-0 scroll-mt-6 items-start gap-4 rounded-lg border p-5',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'transition-colors hover:border-[color:var(--pamo-color-border-input)] hover:bg-[var(--pamo-color-surface-subtle)]',
  'md:p-6',
].join(' ')

const policyMarkClass = [
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
  'bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)]',
].join(' ')

const policies = [
  ['exchange-information', Ruler, 'Uniform Size Guide', 'Compare measurements and find your size before ordering.'],
  ['return-information', Package, 'Order & Claiming Updates', 'Track your order from approval to payment and claiming.'],
  ['customer-support', Headphones, 'Customer Support', 'Contact our team for support with your order.']
]

const OurPolicy = () => {
  return (
    <section
      id='support-policies'
      className={policySectionClass}
      aria-labelledby='support-policies-heading'
    >
      <HomeSectionHeading
        id='support-policies-heading'
        eyebrow='Shopping assistance'
        title='Here when you need help'
      />
      <div className={policyGridClass}>
        {policies.map(([id, icon, title, copy]) => {
          const Icon = icon
          return (
            <Link id={id} key={id} to='/contact' className={policyCardClass}>
              <span className={policyMarkClass}>
                <Icon size={22} strokeWidth={1.75} aria-hidden='true' />
              </span>
              <div className='min-w-0'>
                <h3 className='text-[15px] font-semibold leading-[1.45] md:text-base'>{title}</h3>
                <p className='mt-2 text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]'>
                  {copy}
                </p>
              </div>
              <span className='sr-only'>Contact PAMO for assistance.</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default OurPolicy
