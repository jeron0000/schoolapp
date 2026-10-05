import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import Title from './Title';
import { Link } from 'react-router-dom';
import ProductItem from './ProductItem';

const RelatedProducts = ({category,subCategory}) => {
  
    const {products} = useContext(ShopContext);
    const [related,setRelated] = useState([]);

    useEffect(() => {
  
    if(products.length > 0) {

        let productsCopy = products.slice();

        productsCopy = productsCopy.filter((item) => category === item.category);
        productsCopy = productsCopy.filter((item) => subCategory === item.subCategory);

        setRelated(productsCopy.slice(0,5));
    }
    
    },[products])

    return (

    <section className='mt-14 sm:mt-20'>
      <div className='mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div><Title text1={'YOU MAY'} text2={'ALSO LIKE'}/><p className='max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400'>Explore more from the same collection.</p></div>
        <Link to='/collection' className='inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100'>View collection <span aria-hidden='true'>→</span></Link>
      </div>
      <div className='product-grid'>
        {related.map((item,index)=>(<ProductItem key={index} id={item._id} name={item.name} image={item.image} price={item.price}/>))}
      </div>
    </section>
  )
}

export default RelatedProducts
