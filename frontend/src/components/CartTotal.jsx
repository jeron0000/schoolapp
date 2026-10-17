import React, { useContext } from 'react'
import { ShopContext } from '../context/shopContext'
import Title from './Title';
import { formatPhp, sumPhp } from '../../../shared/money.js';

const CartTotal = ({ cartView = false, checkoutView = false, itemCount, unitCount, children }) => {
  
  const {delivery_fee,getCartAmount} = useContext(ShopContext);
  const subtotal = getCartAmount();
  let total = NaN;
  try { total = sumPhp(subtotal, delivery_fee); } catch { /* Display unavailable rather than rounding invalid prices. */ }
  const amount = formatPhp;

  if (cartView || checkoutView) {
    if (checkoutView) return <div className='checkout-totals'>
      <dl>
        <div><dt>Subtotal</dt><dd>{amount(subtotal)}</dd></div>
        <div><dt>Processing fee</dt><dd>{amount(delivery_fee)}</dd></div>
        <div className='checkout-grand-total'><dt>Total</dt><dd>{amount(total)}</dd></div>
      </dl>
    </div>;
    return <section className='cart-summary' aria-labelledby='cart-summary-heading'>
      <h2 id='cart-summary-heading'>Order summary</h2>
      <p className='cart-summary-count'>{itemCount} {itemCount === 1 ? 'product variant' : 'product variants'} · {unitCount} total {unitCount === 1 ? 'unit' : 'units'}</p>
      <dl className='cart-summary-values'>
        <div><dt>Subtotal ({unitCount} {unitCount === 1 ? 'unit' : 'units'})</dt><dd>{amount(subtotal)}</dd></div>
        <div><dt>Processing fee</dt><dd>{amount(delivery_fee)}</dd></div>
        <div className='cart-summary-total'><dt>Total</dt><dd>{amount(total)}</dd></div>
      </dl>
      {children}
    </section>;
  }
  
  return (

    <div className='panel w-full p-5 sm:p-6'>
      {cartView ? <h2 className='flex items-center gap-3 text-xl font-semibold tracking-tight'><span aria-hidden='true' className='h-6 w-1 shrink-0 rounded-full bg-amber-500'/>ORDER SUMMARY</h2> : <Title text1={'ORDER'} text2={'SUMMARY'}/>}
      <div className='mt-6 flex flex-col gap-4 text-sm'>
        <div className='flex justify-between gap-4 text-slate-600 dark:text-slate-400'>
          <p>Subtotal{cartView && ` (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`}</p><p className='break-all text-right font-medium text-slate-900 dark:text-slate-100'>{amount(subtotal)}</p>
        </div>
        <div className='flex justify-between gap-4 text-slate-600 dark:text-slate-400'>
          <p>{cartView ? 'Processing fee' : 'Shipping fee'}</p><p className='font-medium text-slate-900 dark:text-slate-100'>{amount(delivery_fee)}</p>
        </div>
        <div className='flex justify-between gap-4 border-t border-slate-200 pt-5 text-base font-bold text-slate-900 dark:border-slate-800 dark:text-slate-100'>
          <p>Total</p><p className={'break-all text-right ' + (cartView ? 'text-xl text-amber-600 dark:text-amber-400' : '')}>{amount(total)}</p>
        </div>
      </div>
    </div>
  )
}

export default CartTotal
