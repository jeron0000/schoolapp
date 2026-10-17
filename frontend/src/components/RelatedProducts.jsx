import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ShopContext } from '../context/shopContext'
import ProductItem from './ProductItem'
import '../pages/Collection.css'

const RelatedProducts = ({ category, subCategory, productId }) => {
  const { products } = useContext(ShopContext)
  const related = products.filter((item) => item._id !== productId && category === item.category && subCategory === item.subCategory).slice(0, 5)
  return <section className='product-related' aria-labelledby='product-related-heading'>
    <div className='product-related-heading'>
      <div><p className='product-eyebrow'>You may also like</p><h2 id='product-related-heading'>More from the collection</h2></div>
      <Link to='/collection' className='btn-secondary product-action'>View collection <ArrowRight size={18} strokeWidth={1.75} aria-hidden='true' /></Link>
    </div>
    {related.length ? <div className='product-related-grid'>
      {related.map((item) => <ProductItem key={item._id} id={item._id} name={item.name} image={item.image} price={item.price} category={item.category} subCategory={item.subCategory} collection />)}
    </div> : <p className='product-related-empty'>No other products are currently available in this classification. Browse the collection for more school essentials.</p>}
  </section>
}

export default RelatedProducts
