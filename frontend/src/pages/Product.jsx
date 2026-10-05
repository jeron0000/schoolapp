import React, {  useContext, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext';
import { assets, products } from '../assets/assets';
import RelatedProducts from '../components/RelatedProducts';

const Product = () => {

  const { productId } = useParams();
  const { products, currency, addToCart } = useContext(ShopContext);
  const [productData, setProductData] = useState(false);
  const [image,setImage] = useState('');
  const [size,setSize] = useState('');

  const fetchProductData = async () => {

    products.map((item) => {
      if (item._id === productId) { 
        setProductData(item)
        setImage(item.image[0])
        return null;
      }
    })
  }
  useEffect(() => {
    fetchProductData();
  }, [productId, products])

  return productData ? (

    <section className='page-section'>
      <p className='eyebrow mb-6'>{productData.category} / {productData.subCategory}</p>
      <div className='grid min-w-0 gap-8 lg:grid-cols-2 lg:gap-14'>
        <div className='min-w-0'>
          <div className='panel overflow-hidden p-3'><img className='aspect-square w-full rounded-xl bg-slate-100 object-cover dark:bg-slate-800' src={image} alt={productData.name}/></div>
          <div className='mt-4 flex gap-3 overflow-x-auto pb-2' aria-label='Product images'>
            {productData.image.map((item,index)=>(
              <button type='button' onClick={()=>setImage(item)} key={index} aria-label={'View product image ' + (index + 1)} aria-pressed={image === item} className={'w-20 shrink-0 overflow-hidden rounded-xl border-2 p-1 transition-colors duration-[250ms] ' + (image === item ? 'border-slate-900 bg-white dark:border-slate-400 dark:bg-slate-900' : 'border-transparent bg-slate-100 hover:border-slate-300 dark:bg-slate-800 dark:hover:border-slate-700')}>
                <img src={item} className='aspect-square w-full rounded-lg object-cover' alt={productData.name + ', view ' + (index + 1)}/>
              </button>
            ))}
          </div>
        </div>
        <div className='min-w-0 lg:py-4'>
          <h1 className='text-2xl font-semibold leading-snug tracking-tight sm:text-3xl'>{productData.name}</h1>
          <div className='mt-4 flex items-center gap-1' aria-label='4 out of 5 stars, 122 reviews'>
            {[0,1,2,3].map(star => <img key={star} src={assets.star_icon} alt='' className='w-4'/>)}<img src={assets.star_dull_icon} alt='' className='w-4'/><span className='ml-2 text-xs text-slate-500 dark:text-slate-400'>(122)</span>
          </div>
          <p className='mt-6 break-words text-3xl font-bold text-slate-900 dark:text-slate-100'>{currency}{productData.price}</p>
          <p className='mt-5 text-sm leading-7 text-slate-500 dark:text-slate-400'>{productData.description}</p>
          <div className='my-8 border-t border-slate-200 pt-6 dark:border-slate-800'>
            <p className='mb-4 text-sm font-semibold'>Select size <span className='ml-2 font-normal text-slate-500 dark:text-slate-400'>{size ? '— ' + size : ''}</span></p>
            <div className='flex flex-wrap gap-2'>
              {productData.sizes.map((item,index)=>(<button type='button' onClick={()=>setSize(item)} aria-pressed={item === size} className={'min-h-12 min-w-12 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors duration-[250ms] ' + (item === size ? 'border-slate-900 bg-slate-900 text-white dark:border-amber-400 dark:bg-amber-400 dark:text-slate-950' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-400')} key={index}>{item}</button>))}
            </div>
          </div>
          <button type='button' onClick={()=>addToCart(productData._id,size)} className='btn-primary w-full sm:max-w-sm'><img src={assets.cart_icon} className='w-4 brightness-0 invert dark:invert-0 transition-[filter] duration-[250ms]' alt=''/>Add to cart</button>
          <div className='mt-8 space-y-3 border-t border-slate-200 pt-6 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400'>
            <p>100% Original product.</p><p>Cash On Delivery is available on this product.</p><p>Easy to return and exchange policy within 7 days.</p>
          </div>
        </div>
      </div>
      <div className='panel mt-12 overflow-hidden sm:mt-16'>
        <div className='flex flex-wrap gap-6 border-b border-slate-200 px-6 py-4 text-sm dark:border-slate-800'><h2 className='font-semibold'>Description</h2><p className='text-slate-500 dark:text-slate-400'>Reviews (122)</p></div>
        <div className='px-6 py-6 text-sm leading-7 text-slate-500 dark:text-slate-400'><p>{productData.description}</p><p className='mt-3'>Choose from the available sizes above to add this item to your cart.</p></div>
      </div>
      <RelatedProducts category={productData.category} subCategory={productData.subCategory}/>
    </section>
  ) : <div className='page-section text-sm text-slate-500 dark:text-slate-400' role='status'>Loading product…</div>
}

export default Product
