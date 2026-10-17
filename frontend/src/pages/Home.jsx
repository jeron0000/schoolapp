import React from 'react'
import Hero from '../components/Hero'
import LatestCollection from '../components/LatestCollection'
import BestSeller from '../components/BestSeller'
import OurPolicy from '../components/OurPolicy'
import NewsletterBox from '../components/NewsletterBox'
import ProgramFinder from '../components/ProgramFinder'
import OrderingGuide from '../components/OrderingGuide'
import '../components/HomePage.css'

const Home = () => {
  return (
    <div className='home-page'>
      <Hero/>
      <div className='home-content'>
      <ProgramFinder/>
      <LatestCollection/>
      <BestSeller/>
      <OrderingGuide/>
      <OurPolicy/>
      <NewsletterBox home/>
      </div>
    </div>
  )
}

export default Home
