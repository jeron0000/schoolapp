import React, { useContext } from 'react'
import { ShopContext } from '../context/shopContext'
import Title from './Title';
import { Link } from 'react-router-dom';
import ProductItem from './ProductItem';

const BestSeller = () => {
  
    const {products} = useContext(ShopContext);
    const BestSeller = products.filter((item) => item.BestSeller).slice(0,5);
    return (

    <section className='mt-14 sm:mt-20'>
      <div className='mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div><Title text1={'BEST'} text2={'SELLERS'}/><p className='max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400'>Take a closer look at the featured picks from our collection.</p></div>
        <Link to='/collection' className='inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100'>View collection <span aria-hidden='true'>→</span></Link>
      </div>
      <div className='product-grid'>
        {BestSeller.map((item,index)=>(<ProductItem key={index} id={item._id} name={item.name} image={item.image} price={item.price}/>))}
      </div>
    </section>
  )
}

export default BestSeller
