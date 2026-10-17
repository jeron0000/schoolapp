import React, { useContext } from 'react'
import { ShopContext } from '../context/shopContext';
import HomeSectionHeading from './HomeSectionHeading';
import { Link } from 'react-router-dom';
import ProductItem from './ProductItem';
import { ArrowRight } from 'lucide-react';


const LatestCollection = () => {
  
    const { products } = useContext(ShopContext);
    const latestProducts = products.slice(0,4);

    return (

    <section className='home-latest-collection' aria-labelledby='latest-collection-heading'>
      <HomeSectionHeading id='latest-collection-heading' eyebrow={<><span className='home-copy-desktop'>Curated for campus</span><span className='home-copy-nondesktop'>Latest collection</span></>}
        title={<><span className='home-copy-desktop'>Latest collection</span><span className='home-copy-tablet'>Campus essentials</span><span className='home-copy-mobile'>Campus essentials</span></>}
        description={<><span className='home-copy-desktop'>Uniforms, PE essentials, and everyday items to keep you campus-ready.</span><span className='home-copy-tablet'>Uniforms and school merchandise for daily campus life.</span><span className='home-copy-mobile'>Browse products and check sizes before ordering.</span></>}
        action={<Link to='/collection' className='home-outline-action home-latest-desktop-action'>View collection <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></Link>} />
      <div className='home-product-grid'>
        {latestProducts.map(item => <ProductItem key={item._id} id={item._id} name={item.name} image={item.image} price={item.price} category={item.category} subCategory={item.subCategory} home/>)}
      </div>
      {latestProducts.length === 0 && <p className='home-empty-state' role='status'>No essentials to display yet. Check the collection for available products.</p>}
      <Link to='/collection' className='home-latest-mobile-action'>View the full collection <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' /></Link>
    </section>
  )
}

export default LatestCollection
