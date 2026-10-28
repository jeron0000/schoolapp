import { useContext } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ShopContext } from "../context/shopContext";
import {
  getAcademicProgramName,
  getProductAcademicPrograms,
  getProductCategoryName,
  getProductGenders,
  getProductGenderName,
  getProductMerchandiseCategoryCodes,
} from "../../../shared/productTaxonomy.js";
import ProductItem from "./ProductItem";
import { groupProductListings } from '../../../shared/productVariants.js';

const sectionClassName = [
  "mb-16 mt-14",
  "md:mb-20 md:mt-[72px]",
  "min-[1180px]:mb-24 min-[1180px]:mt-20",
].join(" ");

const actionClassName = [
  "btn-secondary inline-flex min-h-12 max-w-full items-center justify-center gap-2",
  "rounded-[7px] border border-[color:var(--pamo-color-border-input)]",
  "bg-[var(--pamo-color-surface-default)] px-[18px] py-3",
  "text-sm font-semibold leading-[1.5] text-[color:var(--pamo-color-text-primary)]",
].join(" ");

const productGridClassName = [
  "mt-7 grid grid-cols-2 gap-x-3 gap-y-5 max-[359px]:grid-cols-1",
  "md:grid-cols-3 md:gap-[26px]",
  "min-[1180px]:mt-[30px] min-[1180px]:grid-cols-4 min-[1180px]:gap-7",
  "[&_.collection-product-card]:h-full [&_.collection-product-card]:min-h-0",
  "[&_.collection-product-photo]:aspect-square [&_.collection-product-photo]:max-h-[280px] [&_.collection-product-photo]:w-full",
  "[&_.collection-product-copy]:px-1 [&_.collection-product-copy]:py-3.5",
  "[&_.collection-product-copy_h3]:mt-3",
  "[&_.collection-product-details]:gap-2 [&_.collection-product-details]:pt-3.5",
].join(" ");

const sharesAssignment = (left, right) => left.some(value => right.includes(value));

const RelatedProducts = ({
  category,
  subCategory,
  productCategoryCode,
  academicPrograms,
  genders,
  merchandiseCategoryCodes,
  productId,
}) => {
  const { products, productCategories = [] } = useContext(ShopContext);
  const currentProduct = {
    category,
    subCategory,
    productCategoryCode,
    academicPrograms,
    genders,
    merchandiseCategoryCodes,
  };
  const currentPrograms = getProductAcademicPrograms(currentProduct);
  const currentGenders = getProductGenders(currentProduct);
  const currentCategories = getProductMerchandiseCategoryCodes(currentProduct);
  const currentGroup = products.find(product => product._id === productId)?.variantGroupId;
  const eligibleProducts = products
    .filter((item) => {
      if (item._id === productId) return false;
      if (currentGroup && item.variantGroupId === currentGroup) return false;
      if (!sharesAssignment(currentGenders, getProductGenders(item))) return false;
      if (currentCategories.length > 0) {
        return sharesAssignment(currentCategories, getProductMerchandiseCategoryCodes(item));
      }
      return sharesAssignment(currentPrograms, getProductAcademicPrograms(item));
    });
  const relatedProducts = groupProductListings(eligibleProducts, products).slice(0, 5);

  return (
    <section
      className={sectionClassName}
      aria-labelledby="product-related-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]">
            You may also like
          </p>
          <h2
            id="product-related-heading"
            className="mt-4 font-display text-2xl font-semibold leading-[1.3] md:text-[28px]"
          >
            More from the collection
          </h2>
        </div>
        <Link to="/collection" className={actionClassName}>
          View collection
          <ArrowRight
            className="shrink-0"
            size={18}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Link>
      </div>

      {relatedProducts.length > 0 ? (
        <div className={productGridClassName}>
          {relatedProducts.map((item) => {
            const assignedPrograms = getProductAcademicPrograms(item);
            const assignedGenders = getProductGenders(item);
            const assignedCategories = getProductMerchandiseCategoryCodes(item);
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
                collection
              />
            );
          })}
        </div>
      ) : (
        <p className="py-6 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
          No other products are currently available in this classification.
          Browse the collection for more school essentials.
        </p>
      )}
    </section>
  );
};

export default RelatedProducts;
