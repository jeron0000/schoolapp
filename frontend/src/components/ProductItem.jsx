import React, { useContext } from 'react'
import { ShopContext } from '../context/shopContext';
import { Link } from 'react-router-dom';


const ProductItem = ({id,image,name,price,compact = false}) => {
  
    const {currency} = useContext(ShopContext);
    

    return (

    <Link className={compact ? 'group flex min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600' : 'group min-w-0 rounded-2xl border border-slate-200 bg-white p-2 transition-colors hover:border-slate-400 sm:p-3 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 duration-[250ms]'} to={`/product/${id}`}>
      <div className={compact ? 'h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800' : 'aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800'}>
        <img className={compact ? 'h-full w-full object-contain' : 'h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]'} src={image[0]} alt={name} loading='lazy' />
      </div>
      <div className={compact ? 'min-w-0 flex-1' : 'px-1 pb-2 pt-4'}>
        <h3 className={'text-sm font-medium leading-5 group-hover:text-slate-600 dark:group-hover:text-slate-400 ' + (compact ? 'break-words' : 'min-h-10')}>{name}</h3>
        <p className='mt-2 break-words text-sm font-bold text-slate-900 sm:text-base dark:text-slate-100'>{currency}{compact ? Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : price}</p>
      </div>
    </Link>
  )
}

export default ProductItem
