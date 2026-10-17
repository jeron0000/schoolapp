import React from 'react'
import { Link } from 'react-router-dom'
import HeroCarousel from './HeroCarousel'
import { ArrowRight } from 'lucide-react'
import './StorefrontFoundation.css'

const Hero = () => {
  return (
    <section className='hero home-hero' aria-label='School uniforms, made easier.'>
      <div className='hero-layout'>
        <div className='hero-copy'>
          <p className='hero-kicker'><span aria-hidden='true'/>PAMO / SMARTSTOCK</p>
          <h1 className='hero-headline'><span>School uniforms,</span><span className='hero-headline-accent'>made easier.</span></h1>
          <p className='hero-description'>
            <span className='hero-description-desktop'>Browse, order, and claim your school essentials<br/>with less waiting. Everything for campus, in one place.</span>
            <span className='hero-description-tablet'>Browse essentials, choose the right size,<br/>and track every step.</span>
            <span className='hero-description-mobile'>Find, order, and track your campus essentials<br/>with less waiting and fewer steps.</span>
          </p>
          <div className='hero-actions'>
            <Link to='/collection' className='btn-primary'>Browse collection <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></Link>
            <Link to='/about' className='btn-secondary'>Learn more</Link>
          </div>
          <p className='hero-caption'>Official campus essentials</p>
        </div>
        <div className='hero-media'>
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}

export default Hero
