import React, { useContext, useEffect, useRef, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import { assets } from '../assets/assets';
import CartTotal from '../components/CartTotal';

const itemKey = (item) => JSON.stringify([item._id, item.size]);

const CartItem = ({ item, productData, currency, selected, onSelection, updateQuantity, disabled }) => (
  <article className='grid min-w-0 grid-cols-[1.25rem_4rem_minmax(0,1fr)] gap-x-3 rounded-xl border border-slate-100 bg-white p-3 sm:grid-cols-[1.25rem_5.5rem_minmax(0,1fr)] sm:gap-x-4 sm:p-4 dark:border-slate-800 dark:bg-slate-900/60'>
    <label className='flex min-h-11 cursor-pointer items-center justify-center self-center sm:row-span-2'><input type='checkbox' checked={selected} onChange={onSelection} disabled={disabled} aria-label={'Select ' + productData.name + ', size ' + item.size} className='h-4 w-4 rounded !accent-amber-400'/></label>
    <img className='h-24 w-16 rounded-lg bg-slate-50 object-contain sm:row-span-2 sm:h-28 sm:w-[5.5rem] dark:bg-slate-800' src={productData.image[0]} alt={productData.name}/>
    <div className='min-w-0'>
      <h3 className='text-sm font-semibold leading-5'>{productData.name}</h3>
      <p className='mt-2 break-words text-sm font-semibold'>{currency}{Number(productData.price).toFixed(2)}</p>
      <p className='mt-2 inline-block rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400'>Size: {item.size}</p>
    </div>
    <div className='col-span-3 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-1 sm:col-start-3'>
      <div className='inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40'>
        <button type='button' disabled={disabled || item.quantity <= 1} onClick={()=>updateQuantity(item._id,item.size,item.quantity - 1)} aria-label={'Decrease quantity for ' + productData.name + ', size ' + item.size} className='h-11 w-11 text-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800'>−</button>
        <input aria-label={'Quantity for ' + productData.name + ', size ' + item.size} onChange={(e)=>{const quantity=Number(e.target.value); if(Number.isInteger(quantity) && quantity >= 1) updateQuantity(item._id,item.size,quantity)}} disabled={disabled} className='h-11 w-9 bg-transparent text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' type='number' min={1} step={1} value={item.quantity}/>
        <button type='button' disabled={disabled} onClick={()=>updateQuantity(item._id,item.size,item.quantity + 1)} aria-label={'Increase quantity for ' + productData.name + ', size ' + item.size} className='h-11 w-11 text-lg text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800'>+</button>
      </div>
      <p className='break-all text-sm font-semibold'>{currency}{(productData.price * item.quantity).toFixed(2)}</p>
      <button type='button' disabled={disabled} onClick={()=>updateQuantity(item._id,item.size,0)} className='ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10' aria-label={'Remove ' + productData.name + ', size ' + item.size}><img src={assets.bin_icon} className='w-3.5 theme-icon' alt=''/>Remove</button>
    </div>
  </article>
);

const Cart = () => {

  const { products, currency, cartItems, updateQuantity, navigate } = useContext(ShopContext);

  const [cartData, setCartData] = useState([]);
  const [unselectedItems, setUnselectedItems] = useState(new Set());
  const [removing, setRemoving] = useState(false);
  const latestUpdateQuantity = useRef(updateQuantity);

  useEffect(() => { latestUpdateQuantity.current = updateQuantity; }, [updateQuantity]);

  const selectedItems = cartData.filter((item)=>!unselectedItems.has(itemKey(item)));
  const allSelected = cartData.length > 0 && selectedItems.length === cartData.length;

  const toggleSelection = (item) => {
    setUnselectedItems((previous)=>{
      const next = new Set(previous);
      const key = itemKey(item);
      if(next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const removeItems = async (items) => {
    if(removing || items.length === 0) return;
    setRemoving(true);
    try {
      for(const item of items) {
        await latestUpdateQuantity.current(item._id,item.size,0);
        // Let ShopContext's optimistic state commit before removing the next item.
        await new Promise((resolve)=>window.setTimeout(resolve,0));
      }
    } finally {
      setRemoving(false);
    }
  };


  useEffect(() => {

    if (products.length > 0) {
      const tempData = [];
      for (const items in cartItems) {
        for (const item in cartItems[items]) {
          if (cartItems[items][item] > 0) {
            tempData.push({
              _id: items,
              size: item,
              quantity: cartItems[items][item]
            })
          }
        }
      }
      setCartData(tempData);
    }
  }, [cartItems, products])

  return (
    <section className='page-section'>
      <div className='mb-7 flex flex-wrap items-start justify-between gap-4 sm:mb-8'>
        <div><p className='eyebrow mb-3'>A step closer to campus-ready</p><h1 className='flex items-center gap-3 text-3xl tracking-tight'><span aria-hidden='true' className='h-7 w-1 shrink-0 rounded-full bg-amber-500'/><span className='font-normal'>YOUR <span className='font-bold text-amber-500 dark:text-amber-400'>CART</span></span></h1><p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>Review your essentials and sizes before checkout.</p></div>
        <nav aria-label='Breadcrumb' className='flex min-h-11 items-center gap-2 text-xs text-slate-500 sm:pt-5 dark:text-slate-400'><button type='button' onClick={()=>navigate('/')} className='min-h-11 rounded-md hover:text-slate-900 dark:hover:text-slate-100'>Home</button><span aria-hidden='true'>›</span><span aria-current='page' className='font-medium text-amber-600 dark:text-amber-400'>Cart</span></nav>
      </div>
      {cartData.length === 0 ? <div className='panel flex flex-col items-center px-5 py-16 text-center'>
        <div className='mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-500/10'><img src={assets.cart_icon} className='w-7 theme-icon' alt=''/></div>
        <h3 className='text-xl font-semibold'>Your cart is waiting for you</h3><p className='mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400'>Find your school essentials and choose a size to get started.</p><button type='button' onClick={()=>navigate('/collection')} className='btn-primary mt-6'>Browse collection <span aria-hidden='true'>→</span></button>
      </div> : <div className='grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]'>
        <div className='panel min-w-0 p-3 sm:p-4'>
          <div className='mb-2 flex flex-wrap items-center justify-between gap-x-4'>
            <label className='flex min-h-11 cursor-pointer items-center gap-3 text-xs text-slate-600 dark:text-slate-400'><input type='checkbox' checked={allSelected} ref={(element)=>{if(element) element.indeterminate=selectedItems.length > 0 && !allSelected}} onChange={()=>setUnselectedItems(allSelected ? new Set(cartData.map(itemKey)) : new Set())} disabled={removing} className='h-4 w-4 rounded !accent-amber-400'/>Select all ({cartData.length} {cartData.length === 1 ? 'item' : 'items'})</label>
            <button type='button' onClick={()=>removeItems(selectedItems)} disabled={removing || selectedItems.length === 0} className='inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-500/10'><img src={assets.bin_icon} className='w-3.5 theme-icon' alt=''/>Remove selected</button>
          </div>
          <p className='mb-4 text-xs leading-5 text-slate-500 dark:text-slate-400'>Selection is for removal. Checkout includes all cart items.</p>
          <div className='space-y-3' aria-busy={removing}>
          {cartData.map((item)=>{
            const productData = products.find((product)=>product._id === item._id);
            return (
              <CartItem key={itemKey(item)} item={item} productData={productData} currency={currency} selected={!unselectedItems.has(itemKey(item))} onSelection={()=>toggleSelection(item)} updateQuantity={updateQuantity} disabled={removing}/>
            )
          })}
          </div>
          <div className='mt-4 flex flex-wrap items-center justify-between gap-3'>
            <button type='button' disabled={removing} onClick={()=>{if(window.confirm('Remove all items from your cart?')) removeItems(cartData)}} className='inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-4 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-400/30 dark:text-red-400 dark:hover:bg-red-500/10'><img src={assets.bin_icon} className='w-3.5 theme-icon' alt=''/>Clear cart</button>
            <button type='button' onClick={()=>navigate('/collection')} className='btn-secondary min-h-11 rounded-lg px-4 text-xs'><span aria-hidden='true'>←</span> Continue shopping</button>
          </div>
        </div>
        <aside className='min-w-0 space-y-4'>
          <CartTotal cartView itemCount={cartData.length}/>
          <div className='panel p-4 sm:p-5'>
            <button type='button' disabled={removing} onClick={()=>navigate('/place-order')} className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50'>Proceed to checkout <span aria-hidden='true'>→</span></button>
            <p className='mt-3 text-center text-xs leading-5 text-slate-500 dark:text-slate-400'>Review your information and payment method next.</p>
          </div>
          <ul className='panel space-y-5 p-5'>
            {[
              [assets.cart_icon, 'Organized checkout', 'A clear checkout process, all in one place.'],
              [assets.exchange_icon, 'Order & claim', 'Order your essentials and get ready for campus.'],
              [assets.quality_icon, 'School Essentials', 'Browse available uniforms and school essentials.'],
              [assets.support_img, 'Need Help?', 'Contact support for assistance.']
            ].map(([icon,title,copy])=><li key={title} className='flex items-start gap-3'><span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-400/10'><img src={icon} className='w-5 theme-icon' alt=''/></span><div className='min-w-0'>{title === 'Need Help?' ? <button type='button' onClick={()=>navigate('/contact')} className='min-h-6 rounded text-left text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100'>{title}</button> : <p className='text-sm font-semibold text-slate-900 dark:text-slate-100'>{title}</p>}<p className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{copy}</p></div></li>)}
          </ul>
        </aside>
      </div>}
    </section>
  )
}

export default Cart
