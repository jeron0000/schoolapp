import React, { useContext } from 'react'
import { ShopContext } from '../context/ShopContext';
import { Link } from 'react-router-dom';


const ProductItem = ({id,image,name,price}) => {
  
    const {currency} = useContext(ShopContext);
    

    return (

    <Link className='group min-w-0 rounded-2xl border border-slate-200 bg-white p-2 transition-colors hover:border-slate-400 sm:p-3 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 duration-[250ms]' to={`/product/${id}`}>
      <div className='aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800'>
        <img className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]' src={image[0]} alt={name} loading='lazy' />
      </div>
      <div className='px-1 pb-2 pt-4'>
        <h3 className='min-h-10 text-sm font-medium leading-5 group-hover:text-slate-600 dark:group-hover:text-slate-400'>{name}</h3>
        <p className='mt-2 break-words text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100'>{currency}{price}</p>
      </div>
    </Link>
  )
}

export default ProductItem
