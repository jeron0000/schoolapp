import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatPhp } from '../../../shared/money.js';
import { legacyMerchandiseCategories } from '../../../shared/productTaxonomy.js';
import BestSellerBadge from './BestSellerBadge';

const homeProductCardClass = [
  'flex min-h-[311px] min-w-0 flex-col rounded-lg border p-[7px]',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'hover:border-[color:var(--pamo-color-border-input)]',
  'md:min-h-[425px] md:p-[11px]',
].join(' ');
const homeProductPhotoClass = [
  'flex aspect-[155/175] items-center justify-center overflow-hidden rounded-md',
  'bg-[var(--pamo-color-surface-subtle)] max-[359px]:aspect-[296/254] md:aspect-[296/254]',
].join(' ');
const homeProductCopyClass = [
  'flex min-w-0 flex-1 flex-col px-0.5 pb-2.5 pt-3.5',
  'md:px-1.5 md:pb-[22px] md:pt-[21px]',
].join(' ');
const homeProductCategoryClass = [
  'border-l-[3px] border-[color:var(--pamo-color-brand-yellow)] pl-[7px]',
  'text-[11px] font-medium uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]',
].join(' ');
const homeProductNameClass = [
  'mt-3 min-h-[42px] text-sm font-semibold leading-[1.5]',
  'md:min-h-[26px] md:text-lg md:leading-[1.5]',
].join(' ');
const homeProductStockClass = [
  'mt-2 text-xs font-medium leading-[1.5]',
  'text-[color:var(--pamo-color-text-secondary)]',
].join(' ');
const homeProductDetailsClass = [
  'mt-auto flex flex-wrap items-baseline justify-between gap-2 pt-2.5',
  'md:pt-7',
].join(' ');
const homeProductPriceClass = [
  'min-w-0 text-[17px] font-semibold leading-[1.45] tabular-nums [overflow-wrap:anywhere]',
  'md:text-[21px] md:leading-[1.45]',
].join(' ');
const homeProductLinkClass = [
  'ml-auto inline-flex items-center gap-1 text-xs font-medium leading-[1.5]',
  'text-[color:var(--pamo-color-text-secondary)]',
].join(' ');
const collectionProductCardClass = [
  'collection-product-card flex min-h-[351px] min-w-0 flex-col rounded-lg border p-[7px]',
  'border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]',
  'hover:border-[color:var(--pamo-color-border-input)]',
  'md:min-h-[397px] md:rounded-[9px] md:p-2.5',
  'min-[1180px]:min-h-[420px] min-[1180px]:p-[11px]'
].join(' ');
const collectionProductPhotoClass = [
  'collection-product-photo flex aspect-[155/190] items-center justify-center overflow-hidden rounded-md',
  'bg-[var(--pamo-color-surface-subtle)] max-[359px]:aspect-[226/242] md:aspect-[226/242]'
].join(' ');
const collectionProductCopyClass = [
  'collection-product-copy flex min-w-0 flex-1 flex-col px-[3px] pb-1.5 pt-2.5',
  'md:px-1 md:pb-[18px] md:pt-[18px]',
  'min-[1180px]:pb-[22px]'
].join(' ');
const collectionProductCategoryClass = [
  'line-clamp-2 text-[11px] font-medium uppercase leading-[1.5]',
  'text-[color:var(--pamo-color-accent-text)]'
].join(' ');
const collectionProductNameClass = [
  'mt-3.5 min-h-[42px] text-sm font-semibold leading-[1.5]',
  'md:mt-[15px] md:min-h-[45px] md:text-[15px]',
  'min-[1180px]:text-base'
].join(' ');
const collectionProductDetailsClass = [
  'collection-product-details mt-auto flex flex-col items-start gap-1.5 pt-[17px]',
  'md:flex-row md:flex-wrap md:items-baseline md:justify-between md:gap-3 md:pt-[18px]',
  'min-[1180px]:pt-5'
].join(' ');
const collectionProductPriceClass = [
  'text-[17px] font-semibold leading-[1.5] tabular-nums [overflow-wrap:anywhere]',
  'md:text-[19px] min-[1180px]:text-xl'
].join(' ');
const collectionProductLinkClass = [
  'inline-flex items-center self-end gap-1 text-right text-xs font-medium leading-[1.5]',
  'text-[color:var(--pamo-color-text-secondary)] md:ml-auto'
].join(' ');

const uniqueLabels = values => [...new Set(values.filter(Boolean))];

const summarizeLabels = values => {
  if (values.length <= 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
};

const getCategoryPresentation = ({
  collection,
  category,
  subCategory,
  productCategoryName,
  academicProgramName,
  genders,
  academicPrograms,
  merchandiseCategoryCodes,
  academicProgramNames,
  genderNames,
  productCategoryNames,
}) => {
  const legacyMerchandise = legacyMerchandiseCategories.includes(subCategory);
  let genderValues = genderNames;
  if (!Array.isArray(genderValues)) {
    genderValues = Array.isArray(genders) ? genders : [category];
  }
  const genderLabels = uniqueLabels(genderValues);
  let programLabels = academicProgramNames;
  if (!Array.isArray(programLabels)) {
    let program = academicProgramName;
    if (program === undefined) {
      program = legacyMerchandise ? '' : subCategory;
    }
    programLabels = Array.isArray(academicPrograms) ? academicPrograms : [program];
  }
  let merchandiseLabels = productCategoryNames;
  if (!Array.isArray(merchandiseLabels)) {
    const merchandise = productCategoryName || (legacyMerchandise ? subCategory : '');
    merchandiseLabels = Array.isArray(merchandiseCategoryCodes)
      ? merchandiseCategoryCodes
      : [merchandise];
  }
  programLabels = uniqueLabels(programLabels);
  merchandiseLabels = uniqueLabels(merchandiseLabels);
  const fullGroups = collection
    ? [genderLabels, programLabels, merchandiseLabels]
    : [programLabels, merchandiseLabels, genderLabels];
  const summarizedGroups = fullGroups.map(summarizeLabels).filter(Boolean);
  const fullLabels = fullGroups.flat();
  const separator = collection ? ' · ' : ' / ';
  const label = summarizedGroups.join(separator);

  if (label) {
    return { label, title: fullLabels.join(separator) };
  }
  const fallback = collection ? 'School merchandise' : 'School essentials';
  return { label: fallback, title: fallback };
};

const ProductItem = ({
  id,
  image,
  name,
  price,
  priceFrom = false,
  category,
  subCategory,
  academicPrograms,
  genders,
  merchandiseCategoryCodes,
  academicProgramName,
  academicProgramNames,
  genderNames,
  productCategoryName,
  productCategoryNames,
  stockLabel,
  BestSeller,
  compact = false,
  home = false,
  collection = false,
}) => {
  if (home || collection) {
    const categoryPresentation = getCategoryPresentation({
      collection,
      category,
      subCategory,
      productCategoryName,
      academicProgramName,
      genders,
      academicPrograms,
      merchandiseCategoryCodes,
      academicProgramNames,
      genderNames,
      productCategoryNames,
    });
    const cardClass = home ? homeProductCardClass : collectionProductCardClass;
    const photoClass = home ? homeProductPhotoClass : collectionProductPhotoClass;
    const copyClass = home ? homeProductCopyClass : collectionProductCopyClass;
    const categoryClass = home ? homeProductCategoryClass : collectionProductCategoryClass;
    const nameClass = home ? homeProductNameClass : collectionProductNameClass;
    const detailsClass = home ? homeProductDetailsClass : collectionProductDetailsClass;
    const priceClass = home ? homeProductPriceClass : collectionProductPriceClass;
    const detailsLinkClass = home ? homeProductLinkClass : collectionProductLinkClass;
    const imageClass = 'block h-full w-full object-contain';
    const fallbackClass = home
      ? 'p-3 text-xs text-[color:var(--pamo-color-text-secondary)]'
      : 'p-3 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]';

    return (
      <Link className={cardClass} to={`/product/${id}`}>
        <div className={photoClass}>
          {image?.[0] ? (
            <img className={imageClass} src={image[0]} alt={name} loading='lazy' />
          ) : (
            <span className={fallbackClass}>
              Image unavailable
            </span>
          )}
        </div>
        <div className={copyClass}>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>
            <p className={categoryClass + ' min-w-0 [overflow-wrap:anywhere]'} title={categoryPresentation.title}>{categoryPresentation.label}</p>
            <BestSellerBadge BestSeller={BestSeller} />
          </div>
          <h3 className={nameClass}>{name}</h3>
          {home && stockLabel && (
            <p className={homeProductStockClass}>{stockLabel}</p>
          )}
          <div className={detailsClass}>
            <p className={priceClass}>{priceFrom && 'From '}{formatPhp(price)}</p>
            <span className={detailsLinkClass}>
              View details
              <ArrowUpRight className='storefront-action-icon' size={18} strokeWidth={1.75} aria-hidden='true' />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  const cardClass = compact
    ? 'group flex min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600'
    : 'group min-w-0 rounded-2xl border border-slate-200 bg-white p-2 transition-colors hover:border-slate-400 sm:p-3 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 duration-[250ms]';
  const imageClass = compact
    ? 'h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800'
    : 'aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800';
  const imageContentClass = compact
    ? 'h-full w-full object-contain'
    : 'h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]';
  const copyClass = compact ? 'min-w-0 flex-1' : 'px-1 pb-2 pt-4';
  const nameClass = `text-sm font-medium leading-5 group-hover:text-slate-600 dark:group-hover:text-slate-400 ${compact ? 'break-words' : 'min-h-10'}`;

  return (
    <Link className={cardClass} to={`/product/${id}`}>
      <div className={imageClass}>
        <img className={imageContentClass} src={image[0]} alt={name} loading='lazy' />
      </div>
      <div className={copyClass}>
        <BestSellerBadge BestSeller={BestSeller} className='mb-2' />
        <h3 className={nameClass}>{name}</h3>
        <p className='mt-2 text-sm font-bold tabular-nums text-slate-900 [overflow-wrap:anywhere] sm:text-base dark:text-slate-100'>{priceFrom && 'From '}{formatPhp(price)}</p>
      </div>
    </Link>
  );
};

export default ProductItem;
