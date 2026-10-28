import { useContext } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getAcademicProgramName,
  getProductAcademicPrograms,
  getProductCategoryName,
  getProductGenders,
  getProductGenderName,
  getProductMerchandiseCategoryCodes,
} from '../../../shared/productTaxonomy.js'
import { ShopContext } from '../context/shopContext.js'
import { getProgramRecommendations } from '../utils/programRecommendations.js'
import HomeSectionHeading from './HomeSectionHeading.jsx'
import ProductItem from './ProductItem.jsx'

const sectionClass = [
  'mt-14 border-t border-[color:var(--pamo-color-border-default)] pt-10',
  'md:mt-16 md:pt-12 min-[1180px]:pt-14',
].join(' ')
const desktopActionClass = [
  'home-outline-action hidden shrink-0 md:inline-flex md:self-start md:mt-9',
  'min-[1180px]:mt-[31px]',
].join(' ')
const productGridClass = [
  'mt-7 grid grid-cols-2 gap-x-3 gap-y-[17px] max-[359px]:grid-cols-1',
  'md:mt-8 md:grid-cols-[repeat(2,minmax(0,320px))] md:justify-center',
  'md:gap-x-[clamp(24px,6.464vw,53px)] md:gap-y-[35px]',
  'min-[1180px]:mt-9 min-[1180px]:grid-cols-4 min-[1180px]:gap-6',
].join(' ')
const mobileActionClass = [
  'home-outline-action mx-auto mt-8 flex w-fit max-w-full md:hidden',
].join(' ')

const ProgramRecommendations = () => {
  const {
    products = [],
    productsLoading = false,
    productCategories = [],
    categoriesLoading = false,
    token,
    studentProfile,
    profileLoading = false,
  } = useContext(ShopContext)

  const academicProgram = studentProfile?.academicProgram
  if (
    !token
    || profileLoading
    || productsLoading
    || categoriesLoading
    || !academicProgram
  ) return null

  const recommendations = getProgramRecommendations(products, academicProgram)
  if (recommendations.length === 0) return null

  const programName = getAcademicProgramName(productCategories, academicProgram)
  const collectionUrl = `/collection?program=${encodeURIComponent(academicProgram)}`

  return (
    <section className={sectionClass} aria-labelledby='program-recommendations-heading'>
      <HomeSectionHeading
        id='program-recommendations-heading'
        eyebrow='Recommended for your program'
        title={`Essentials for your ${programName} program`}
        description='Discover school essentials relevant to your course.'
        action={
          <Link to={collectionUrl} className={desktopActionClass}>
            View more {programName} essentials
            <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' />
          </Link>
        }
      />
      <div className={productGridClass}>
        {recommendations.map(({ product, stockLabel }) => {
          const assignedPrograms = getProductAcademicPrograms(product)
          const assignedGenders = getProductGenders(product)
          const assignedCategories = getProductMerchandiseCategoryCodes(product)
          return (
            <ProductItem
              key={product._id}
              id={product._id}
              name={product.name}
              image={product.image}
              price={product.price}
              priceFrom={product.priceFrom}
              BestSeller={product.BestSeller}
              category={product.category}
              subCategory={product.subCategory}
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
              stockLabel={stockLabel}
              home
            />
          )
        })}
      </div>
      <Link to={collectionUrl} className={mobileActionClass}>
        View more {programName} essentials
        <ArrowRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' />
      </Link>
    </section>
  )
}

export default ProgramRecommendations
