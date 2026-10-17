import React, { useContext } from 'react'
import { ShopContext } from '../context/shopContext'
import HomeSectionHeading from './HomeSectionHeading';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

const BestSeller = () => {
  
    const {products} = useContext(ShopContext);
    // BestSeller is the existing Admin merchandising flag, not a sales ranking.
    const featuredProducts = products.filter(item => item.BestSeller).slice(0,3);
    return (

    <section className='home-featured-picks' aria-labelledby='featured-picks-heading'>
      <HomeSectionHeading id='featured-picks-heading' eyebrow={<><span className='home-copy-desktop'>Explore more merchandise</span><span className='home-copy-tablet'>Featured picks</span><span className='home-copy-mobile'>Featured merchandise</span></>}
        title={<><span className='home-copy-desktop'>Featured picks</span><span className='home-copy-tablet'>A little more to explore</span><span className='home-copy-mobile'>A few more campus picks</span></>}
        description={<span className='home-copy-desktop'>Selected merchandise highlights. See the full catalog for more options.</span>}
        action={<Link to='/collection' className='home-outline-action home-featured-all-action'>Explore all items <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></Link>} />
      <div className='home-featured-panel'>
        <div className='home-featured-grid'>
          {featuredProducts.map((item, index) => <Link key={item._id} to={`/product/${item._id}`} className='home-featured-card'>
            <span className='home-featured-number' aria-hidden='true'>{String(index + 1).padStart(2, '0')}</span>
            <p className='home-featured-category'>{[item.subCategory, item.category].filter(Boolean).join(' / ') || 'School essentials'}</p>
            <h3>{item.name}</h3>
            <p className='home-featured-description'>Explore product details and sizes.</p>
            <span className='home-featured-link'>View details <ArrowUpRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></span>
          </Link>)}
          {featuredProducts.length === 0 && <p className='home-empty-state'>No featured selections at the moment. Explore the full collection.</p>}
        </div>
        <div className='home-featured-mobile-preview'>
          <h3>Selected highlights</h3>
          <p>{featuredProducts.length ? 'Discover more uniforms and campus essentials. Featured selections may change.' : 'No featured selections at the moment. Explore the full collection.'}</p>
          <Link to={featuredProducts.length ? '/collection?featured=true' : '/collection'} className='home-outline-action'>{featuredProducts.length ? 'Browse featured' : 'Browse collection'} <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></Link>
        </div>
      </div>
    </section>
  )
}

export default BestSeller
