import React, { useContext, useMemo, useRef, useState } from 'react'
import { ShopContext } from '../context/shopContext'
import { assets } from '../assets/assets';
import Title from '../components/Title';
import ProductItem from '../components/ProductItem';
import { productGenders, productPrograms } from '../../../shared/productTaxonomy';

const Collection = () => {
  
  const { products , search , showSearch } = useContext(ShopContext);
  const [showFilter, setShowFilter] = useState(false);
  const [category,setCategory] = useState([]);
  const [subCategory,setSubCategory] = useState([]);
  const [sortType,setSortType] = useState('relevant');
  const productResultsRef = useRef(null);

  const scrollToProducts = () => {
    productResultsRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start'
    });
  }

  const toggleCategory = (e) => { 
    
    if (category.includes(e.target.value)) {
      setCategory(prev=> prev.filter(item => item !== e.target.value))
    }
    else {
      setCategory(prev=> [...prev,e.target.value])
    }

  }

  const toggleSubCategory = (e) => {

    if (subCategory.includes(e.target.value)) {
      setSubCategory(prev=> prev.filter(item => item !== e.target.value))
    }
    else {
      setSubCategory(prev=> [...prev,e.target.value])
    }
    
  }

  const filterProducts = useMemo(() => {
    
    let productsCopy = products.slice();

    if (showSearch && search) {
      productsCopy =productsCopy.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
    }

    if (category.length > 0) {
      productsCopy = productsCopy.filter(item => category.includes(item.category));
  }

  if(subCategory.length > 0) {
    productsCopy = productsCopy.filter(item => subCategory.includes(item.subCategory));
  }

     switch (sortType) {
       case 'low-high':
       productsCopy.sort((a, b) => a.price - b.price);
      break;

      case 'high-low':
       productsCopy.sort((a, b) => b.price - a.price);
      break;

      default:
         break;
   }
   return productsCopy;
  }, [category, subCategory, search, showSearch, products, sortType]);

  return (

    <section className='page-section grid grid-cols-1 gap-5 pt-6 sm:pt-8 lg:grid-cols-[11rem_10rem_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-4 lg:pt-6 xl:grid-cols-[11rem_13rem_minmax(0,1fr)]'>
      <div className='min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1'>
        <p className='eyebrow mb-3'>Find your campus essentials</p>
        <Title text1={'THE'} text2={<span className='text-amber-500 dark:text-amber-400'>COLLECTION</span>}/>
        <p className='max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400'>Browse by category, choose your essentials, and find your fit.</p>
      </div>
      <div className='relative h-44 min-w-0 overflow-hidden rounded-xl bg-slate-100 sm:h-40 lg:col-start-3 lg:row-start-1 lg:h-36 dark:bg-slate-900'>
        {/* Trim the image's white frame and focus the short crop on the students. */}
        <img src={assets.collection_banner} alt='Students wearing school uniforms with campus essentials' width='1950' height='807' className='absolute left-[-2%] top-[-6%] h-[112%] w-[104%] max-w-none object-cover object-[65%_10%]' />
        <div aria-hidden='true' className='absolute inset-0 bg-gradient-to-r from-slate-100 from-45% via-slate-100/95 via-60% to-transparent to-95% sm:from-35% sm:via-[38%] sm:to-[52%] dark:from-slate-900 dark:via-slate-900/95' />
        <div className='relative flex h-full max-w-[240px] flex-col items-start justify-center px-4 sm:max-w-[260px] sm:px-6'>
          <h2 className='text-lg font-semibold leading-5 tracking-tight'>Complete<br/>Your School Look</h2>
          <p className='mt-1 text-xs leading-4 text-slate-600 dark:text-slate-400'>Quality uniforms and accessories<br className='hidden sm:block'/> for a better school life.</p>
          <button type='button' onClick={scrollToProducts} className='mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-300 focus-visible:outline-amber-600'>
            Shop Now <span aria-hidden='true'>→</span>
          </button>
        </div>
      </div>
      <aside className='min-w-0 self-start lg:col-start-1 lg:row-start-2'>
          <div className='panel overflow-hidden rounded-xl p-4'>
            <button type='button' onClick={()=>setShowFilter(!showFilter)} className='flex min-h-11 w-full items-center justify-between gap-2 text-sm font-semibold lg:min-h-6 lg:text-xs' aria-expanded={showFilter} aria-controls='catalog-filters'>
              Filters <img className={'h-3 lg:hidden theme-icon ' + (showFilter ? 'rotate-90' : '')} src={assets.dropdown_icon} alt='' />
            </button>
            <div id='catalog-filters' className={(showFilter ? 'block' : 'hidden') + ' lg:block'}>
              <fieldset className='mt-3 border-t border-slate-200 pt-3 dark:border-slate-800'>
                <legend className='sr-only'>Gender</legend><p className='eyebrow mb-2 lg:text-[10px] lg:tracking-[0.08em]'>GENDER</p>
                {productGenders.map(value => <label key={value} className='flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-600 hover:text-slate-900 lg:min-h-8 lg:text-xs dark:text-slate-400 dark:hover:text-slate-100'><input className='h-4 w-4 rounded accent-amber-500 dark:accent-amber-400' type='checkbox' value={value} checked={category.includes(value)} onChange={toggleCategory}/>{value}</label>)}
              </fieldset>
              <fieldset className='mt-3 border-t border-slate-200 pt-3 dark:border-slate-800'>
                <legend className='sr-only'>Program</legend><p className='eyebrow mb-2 lg:text-[10px] lg:tracking-[0.08em]'>PROGRAM</p>
                {productPrograms.map(value => <label key={value} className='flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-600 hover:text-slate-900 lg:min-h-8 lg:text-xs dark:text-slate-400 dark:hover:text-slate-100'><input className='h-4 w-4 rounded accent-amber-500 dark:accent-amber-400' type='checkbox' value={value} checked={subCategory.includes(value)} onChange={toggleSubCategory}/>{value}</label>)}
              </fieldset>
            </div>
          </div>
      </aside>
      <div ref={productResultsRef} className='min-w-0 scroll-mt-6 lg:col-span-2 lg:col-start-2 lg:row-start-2'>
          <div className='mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center'>
            <p className='text-xs text-slate-500 dark:text-slate-400'><span className='font-semibold text-slate-900 dark:text-slate-100'>{filterProducts.length}</span> {filterProducts.length === 1 ? 'essential' : 'essentials'} found</p>
            <label className='flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400'>Sort by
              <select aria-label='Sort products' value={sortType} onChange={(e)=>setSortType(e.target.value)} className='field min-h-11 w-auto flex-1 rounded-lg px-3 py-2 text-xs sm:max-w-48 sm:flex-none lg:min-h-9'>
                <option value='relevant'>Relevant</option><option value='low-high'>Price: Low to High</option><option value='high-low'>Price: High to Low</option>
              </select>
            </label>
          </div>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 [&>a]:rounded-xl [&>a]:p-2 [&>a>div:last-child]:pb-1 [&>a>div:last-child]:pt-2 [&_h3]:line-clamp-2 [&_h3]:h-8 [&_h3]:min-h-8 [&_h3]:text-xs [&_h3]:leading-4 [&_img]:object-contain [&_p]:text-sm'>
            {filterProducts.map((item,index)=>(<ProductItem key={index} name={item.name} id={item._id} price={item.price} image={item.image}/>))}
          </div>
          {filterProducts.length === 0 && <div className='panel px-5 py-16 text-center'><img src={assets.search_icon} className='mx-auto mb-5 w-7 opacity-40 theme-icon' alt=''/><h3 className='text-lg font-semibold'>No matching essentials</h3><p className='mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500 dark:text-slate-400'>Try another search or adjust your gender and program filters.</p></div>}
      </div>
    </section>
  )
}

export default Collection
