import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Title from './Title'
import ProductItem from './ProductItem'

const arrowButton = 'hidden h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition-colors hover:border-slate-500 disabled:cursor-default disabled:opacity-40 disabled:hover:border-slate-300 sm:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:disabled:hover:border-slate-700'

// Shared Home merchandising row: heading, View Collection, prev/next arrows and a scrollable product row.
const ProductShowcase = ({ eyebrow, text1, text2, description, products, prefer }) => {
  const row = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const updateEdges = useCallback(() => {
    const el = row.current
    if (!el) return
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    updateEdges()
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges, products])

  const scrollRow = (direction) => row.current?.scrollBy({
    left: direction * row.current.clientWidth * 0.85,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
  })

  return (
    <section className='mt-14 sm:mt-20' aria-label={text1 + ' ' + text2}>
      <div className='mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8'>
        <div>
          <p className='eyebrow mb-2'>{eyebrow}</p>
          <Title text1={text1} text2={text2}/>
          <p className='max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400'>{description}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Link to='/collection' className='mr-1 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-500 px-4 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-400/10'>View Collection <span aria-hidden='true'>→</span></Link>
          <button type='button' onClick={() => scrollRow(-1)} disabled={edges.start} aria-label={'Previous ' + text1 + ' ' + text2} className={arrowButton}><svg aria-hidden='true' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.8' className='h-3.5 w-3.5'><path d='m10 3-5 5 5 5'/></svg></button>
          <button type='button' onClick={() => scrollRow(1)} disabled={edges.end} aria-label={'Next ' + text1 + ' ' + text2} className={arrowButton}><svg aria-hidden='true' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.8' className='h-3.5 w-3.5'><path d='m6 3 5 5-5 5'/></svg></button>
        </div>
      </div>
      <ul ref={row} onScroll={updateEdges} className='-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:gap-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {products.map(item => (
          <li key={item._id} className='flex w-[200px] shrink-0 snap-start sm:w-[220px] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)]'>
            <ProductItem id={item._id} name={item.name} image={item.image} price={item.price} sizes={item.sizes} subCategory={item.subCategory} BestSeller={item.BestSeller} NewArrival={item.NewArrival} prefer={prefer} showAction/>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ProductShowcase
