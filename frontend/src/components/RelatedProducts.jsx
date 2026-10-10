import { useContext } from 'react'
import { ShopContext } from '../context/shopContext';
import { Link } from 'react-router-dom';
import ProductItem from './ProductItem';

const RelatedProducts = ({category,subCategory,productId}) => {
  
    const {products} = useContext(ShopContext);
    const related = products.filter((item) => item._id !== productId && category === item.category && subCategory === item.subCategory).slice(0,5);

    return (

    <section className='mt-10 sm:mt-12'>
      <div className='mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div><h2 className='mb-2 flex items-center gap-3 text-xl font-bold tracking-tight sm:text-2xl'><span className='h-6 w-1 shrink-0 rounded bg-amber-400' aria-hidden='true'/>YOU MAY ALSO LIKE</h2><p className='max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400'>Explore more from the same collection.</p></div>
        <Link to='/collection' className='inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100'>View collection <span aria-hidden='true'>→</span></Link>
      </div>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {related.map((item)=>(<ProductItem key={item._id} id={item._id} name={item.name} image={item.image} price={item.price} compact/>))}
      </div>
    </section>
  )
}

export default RelatedProducts
