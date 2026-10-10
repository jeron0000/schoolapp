import { useContext, useEffect, useLayoutEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShopContext } from '../context/shopContext'
import { assets } from '../assets/assets'
import RelatedProducts from '../components/RelatedProducts'
import { getInventorySizes, getSizeStock, getTotalStock } from '../../../shared/inventory'

const Product = () => {
  const { productId } = useParams()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [productId])

  const { products, currency, addToCart, cartItems, getProductsData } = useContext(ShopContext)
  useEffect(() => { getProductsData() }, [productId, getProductsData])
  const productData = products.find((item) => item._id === productId)
  const [selectedImage, setSelectedImage] = useState({ productId, index: 0 })
  const [selectedSize, setSelectedSize] = useState({ productId, value: '' })
  const images = productData?.image || []
  const imageIndex = selectedImage.productId === productId && selectedImage.index < images.length ? selectedImage.index : 0
  const size = selectedSize.productId === productId ? selectedSize.value : ''
  const selectImage = (index) => setSelectedImage({ productId, index })
  const moveImage = (direction) => selectImage((imageIndex + direction + images.length) % images.length)

  if (!productData) return <div className='page-section text-sm text-slate-500 dark:text-slate-400' role='status'>Loading product…</div>

  return (
    <section className='page-section min-w-0'>
      <nav aria-label='Breadcrumb' className='mb-6 text-xs text-slate-500 sm:mb-8 sm:text-sm dark:text-slate-400'>
        <ol className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <li><Link to='/' className='hover:text-slate-900 dark:hover:text-white'>Home</Link></li>
          {[productData.category, productData.subCategory].filter(Boolean).map((value, index) => (
            <li key={index} className='flex items-center gap-3'><span aria-hidden='true'>›</span><Link to='/collection' className='hover:text-slate-900 dark:hover:text-white'>{value}</Link></li>
          ))}
          <li className='flex min-w-0 items-center gap-3'><span aria-hidden='true'>›</span><span aria-current='page' className='break-words text-slate-900 dark:text-slate-100'>{productData.name}</span></li>
        </ol>
      </nav>

      <div className='grid min-w-0 gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-9 xl:gap-10'>
        <div className='flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:gap-4'>
          <div className='order-2 flex min-w-0 gap-3 overflow-x-auto pb-1 lg:order-1 lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-x-visible' aria-label='Product images'>
            {images.map((image, index) => (
              <button type='button' key={index} onClick={() => selectImage(index)} aria-label={'View product image ' + (index + 1)} aria-pressed={imageIndex === index} className={'h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 p-1 ' + (imageIndex === index ? 'border-amber-400 bg-amber-50 dark:bg-slate-800' : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-500')}>
                <img src={image} alt={productData.name + ', view ' + (index + 1)} className='h-full w-full rounded object-contain'/>
              </button>
            ))}
          </div>
          <div className='relative order-1 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-300 bg-white lg:order-2 dark:border-slate-700 dark:bg-slate-900'>
            <img src={images[imageIndex]} alt={productData.name} className='aspect-[6/5] w-full object-contain lg:aspect-[4/3]'/>
            {images.length > 1 && (
              <div className='pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between'>
                {[-1, 1].map((direction) => (
                  <button type='button' key={direction} onClick={() => moveImage(direction)} aria-label={direction === -1 ? 'Previous product image' : 'Next product image'} className='pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-800 hover:bg-white dark:border-slate-500 dark:bg-slate-800/90 dark:text-white dark:hover:bg-slate-700'>
                    <svg aria-hidden='true' className='h-5 w-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.8'><path d={direction === -1 ? 'm14 5-7 7 7 7' : 'm10 5 7 7-7 7'}/></svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400'>
            {productData.category && <span className='rounded-md border border-amber-500 px-3 py-1 font-semibold uppercase text-amber-700 dark:text-amber-400'>{productData.category}</span>}
            {productData.subCategory && <span>{productData.subCategory}</span>}
          </div>
          <h1 className='mt-3 break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl'>{productData.name}</h1>
          <p className='mt-5 break-words text-3xl font-bold text-slate-900 dark:text-slate-100'>{currency}{Number(productData.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <fieldset className='mt-6 border-t border-slate-200 pt-6 dark:border-slate-800'>
            <legend className='sr-only'>Available sizes</legend>
            <p className='mb-4 text-sm font-semibold'>Size</p>
            <div className='flex flex-wrap gap-3'>
              {getInventorySizes(productData).map((value) => (
                <button type='button' key={value} disabled={getSizeStock(productData, value) === 0} aria-label={value + (getSizeStock(productData, value) === 0 ? ' — Out of stock' : '')} onClick={() => setSelectedSize({ productId, value })} aria-pressed={size === value} className={'min-h-12 min-w-[3.5rem] rounded-lg border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ' + (size === value ? 'border-amber-500 bg-amber-50 text-slate-900 ring-1 ring-amber-500 dark:border-amber-400 dark:bg-amber-400/10 dark:text-white dark:ring-amber-400' : 'border-slate-200 bg-white text-slate-700 hover:border-amber-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-amber-400')}>{value}</button>
              ))}
            </div>
          </fieldset>
          <p role='status' className='mt-3 border-l-2 border-amber-400 pl-3 text-sm font-medium leading-6 text-slate-700 dark:border-amber-400/60 dark:text-slate-300'>{size ? `${getSizeStock(productData, size)} available in ${size}` : getTotalStock(productData) === 0 ? 'Out of stock' : 'Choose an available size. Crossed-out sizes are out of stock.'}</p>
          <button type='button' disabled={getTotalStock(productData) === 0 || (Boolean(size) && getSizeStock(productData, size) <= (cartItems[productId]?.[size] || 0))} onClick={() => addToCart(productData._id, size)} className='mt-6 flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300 active:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50'>
            <img src={assets.cart_icon} className='h-5 w-5 object-contain brightness-0' alt=''/>Add to Cart
          </button>
          <div className='mt-5 grid gap-3 sm:grid-cols-3' aria-label='Product services'>
            {[
              [assets.exchange_icon, 'Easy Exchange', 'Hassle-free exchange policy'],
              [assets.quality_icon, '7 Days Return', '7-day free return policy'],
              [assets.cart_icon, 'Pay as You Claim', 'Pay when you claim your order']
            ].map(([icon, title, copy]) => (
              <div key={title} className='flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900'>
                <img src={icon} alt='' className='h-5 w-5 shrink-0 object-contain theme-icon'/>
                <div className='min-w-0'><p className='text-xs font-medium'>{title}</p><p className='mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400'>{copy}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className='mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white sm:mt-10 dark:border-slate-800 dark:bg-slate-900'>
        <div className='border-b border-slate-200 px-5 dark:border-slate-800 sm:px-6'><h2 className='inline-block border-b-2 border-amber-400 py-4 text-sm font-semibold'>Description</h2></div>
        <div className='px-5 py-6 text-sm leading-7 text-slate-500 sm:px-6 dark:text-slate-400'><p className='whitespace-pre-wrap break-words'>{productData.description}</p><p className='mt-2'>Choose from the available sizes above to add this item to your cart.</p></div>
      </div>
      <RelatedProducts category={productData.category} subCategory={productData.subCategory} productId={productData._id}/>
    </section>
  )
}

export default Product
