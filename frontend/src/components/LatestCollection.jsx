import { useContext } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ShopContext } from '../context/shopContext'
import {
  getAcademicProgramName,
  getProductAcademicPrograms,
  getProductCategoryName,
  getProductGenders,
  getProductGenderName,
  getProductMerchandiseCategoryCodes,
} from '../../../shared/productTaxonomy.js'
import HomeSectionHeading from './HomeSectionHeading'
import ProductItem from './ProductItem'
import { groupProductListings } from '../../../shared/productVariants.js'

const latestSectionClass = 'mt-14 md:mt-16 min-[1180px]:mt-16'
const desktopActionClass = [
  'home-outline-action hidden shrink-0 md:inline-flex md:self-start md:mt-9',
  'min-[1180px]:mt-[31px]',
  'min-[1180px]:min-w-[199px]',
].join(' ')
const productGridClass = [
  'mt-7 grid grid-cols-2 gap-x-3 gap-y-[17px] max-[359px]:grid-cols-1',
  'md:mt-8 md:grid-cols-[repeat(2,minmax(0,320px))] md:justify-center',
  'md:gap-x-[clamp(24px,6.464vw,53px)] md:gap-y-[35px]',
  'min-[1180px]:mt-9 min-[1180px]:grid-cols-4 min-[1180px]:gap-6',
].join(' ')
const mobileActionClass = [
  'mx-auto mt-8 flex min-h-11 w-fit max-w-full items-center justify-center gap-3',
  'text-center text-sm font-semibold leading-[1.5] text-[color:var(--pamo-color-accent-text)]',
  'md:hidden',
].join(' ')

const LatestCollection = () => {
  const { products, productCategories = [] } = useContext(ShopContext)
  const latestProducts = groupProductListings(products).slice(0, 4)

  return (
    <section className={latestSectionClass} aria-labelledby='latest-collection-heading'>
      <HomeSectionHeading
        id='latest-collection-heading'
        eyebrow={
          <>
            <span className='home-copy-desktop'>Curated for campus</span>
            <span className='home-copy-nondesktop'>Latest collection</span>
          </>
        }
        title={
          <>
            <span className='home-copy-desktop'>Latest collection</span>
            <span className='home-copy-tablet'>Campus essentials</span>
            <span className='home-copy-mobile'>Campus essentials</span>
          </>
        }
        description={
          <>
            <span className='home-copy-desktop'>Uniforms, PE essentials, and everyday items to keep you campus-ready.</span>
            <span className='home-copy-tablet'>Uniforms and school merchandise for daily campus life.</span>
            <span className='home-copy-mobile'>Browse products and check sizes before ordering.</span>
          </>
        }
        action={
          <Link to='/collection' className={desktopActionClass}>
            View collection
            <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' />
          </Link>
        }
      />
      <div className={productGridClass}>
        {latestProducts.map(item => {
          const assignedPrograms = getProductAcademicPrograms(item)
          const assignedGenders = getProductGenders(item)
          const assignedCategories = getProductMerchandiseCategoryCodes(item)
          return (
            <ProductItem
              key={item._id}
              id={item._id}
              name={item.name}
              image={item.image}
              price={item.price}
              priceFrom={item.priceFrom}
              BestSeller={item.BestSeller}
              category={item.category}
              subCategory={item.subCategory}
              academicPrograms={assignedPrograms}
              genders={assignedGenders}
              genderNames={assignedGenders.map(value => (
                getProductGenderName(productCategories, value)
              ))}
              merchandiseCategoryCodes={assignedCategories}
              academicProgramNames={assignedPrograms.map(value => (
                getAcademicProgramName(productCategories, value)
              ))}
              productCategoryNames={assignedCategories.map(value => (
                getProductCategoryName(productCategories, value)
              ))}
              home
            />
          )
        })}
      </div>
      {latestProducts.length === 0 && (
        <p className='home-empty-state' role='status'>
          No essentials to display yet. Check the collection for available products.
        </p>
      )}
      <Link to='/collection' className={mobileActionClass}>
        View the full collection
        <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' />
      </Link>
    </section>
  )
}

export default LatestCollection
