import React from 'react'
import { Link } from 'react-router-dom'
import HomeSectionHeading from './HomeSectionHeading'
import { ArrowLeftRight, CalendarDays, Headphones } from 'lucide-react'

const OurPolicy = () => {
  return (
    <section
      id='support-policies'
      className='home-support-policies'
      aria-labelledby='support-policies-heading'
    >
      <HomeSectionHeading
        id='support-policies-heading'
        eyebrow={
          <>
            <span className='home-copy-tablet'>Student services</span>
            <span className='home-copy-desktop'>Support &amp; policies</span>
            <span className='home-copy-mobile'>Support &amp; policies</span>
          </>
        }
        title={
          <>
            <span className='home-copy-desktop'>Here to help throughout your order</span>
            <span className='home-copy-tablet'>Support when you need it</span>
            <span className='home-copy-mobile'>Here when you need help</span>
          </>
        }
      />
      <div className='home-policy-grid'>
        {[
          [
            'exchange-information',
            ArrowLeftRight,
            'Easy Exchange Policy',
            'Exchange information',
            'We offer a hassle-free exchange policy.'
          ],
          [
            'return-information',
            CalendarDays,
            '7 Days Return Policy',
            'Return information',
            'We provide a 7-day free return policy.'
          ],
          [
            'customer-support',
            Headphones,
            'Customer Support',
            'Contact the team',
            'Contact our team for support with your order.'
          ]
        ].map(([id, icon, title, tabletTitle, copy]) => {
          const Icon = icon
          return (
            <Link id={id} key={id} to='/contact' className='home-policy-card'>
              <span className='home-policy-mark'>
                <Icon size={22} strokeWidth={1.75} aria-hidden='true' />
              </span>
              <div>
                <h3>
                  <span className='home-copy-desktop'>{title}</span>
                  <span className='home-copy-tablet'>{tabletTitle}</span>
                  <span className='home-copy-mobile'>
                    {id === 'exchange-information'
                      ? 'Exchange information'
                      : id === 'return-information'
                        ? 'Return policy'
                        : 'Customer support'}
                  </span>
                </h3>
                <p>{copy}</p>
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
