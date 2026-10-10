import React, { useContext } from 'react'
import { ShopContext } from '../context/shopContext'
import Title from './Title';

const CartTotal = ({ cartView = false, itemCount }) => {
  
  const {currency,delivery_fee,getCartAmount} = useContext(ShopContext);
  
  return (

    <div className='panel w-full p-5 sm:p-6'>
      {cartView ? <h2 className='flex items-center gap-3 text-xl font-semibold tracking-tight'><span aria-hidden='true' className='h-6 w-1 shrink-0 rounded-full bg-amber-500'/>ORDER SUMMARY</h2> : <Title text1={'ORDER'} text2={'SUMMARY'}/>}
      <div className='mt-6 flex flex-col gap-4 text-sm'>
        <div className='flex justify-between gap-4 text-slate-600 dark:text-slate-400'>
          <p>Subtotal{cartView && ` (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`}</p><p className='break-all text-right font-medium text-slate-900 dark:text-slate-100'>{currency} {cartView ? getCartAmount().toFixed(2) : `${getCartAmount()}.00`}</p>
        </div>
        <div className='flex justify-between gap-4 text-slate-600 dark:text-slate-400'>
          <p>{cartView ? 'Processing fee' : 'Shipping fee'}</p><p className='font-medium text-slate-900 dark:text-slate-100'>{currency} {delivery_fee}.00</p>
        </div>
        <div className='flex justify-between gap-4 border-t border-slate-200 pt-5 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100'>
          <p>Total</p><p className={'break-all text-right ' + (cartView ? 'text-xl text-amber-600 dark:text-amber-400' : '')}>{currency} {cartView ? (getCartAmount() === 0 ? 0 : getCartAmount() + delivery_fee).toFixed(2) : `${getCartAmount() === 0 ? 0 : getCartAmount() + delivery_fee}.00`}</p>
        </div>
      </div>
    </div>
  )
}

export default CartTotal
