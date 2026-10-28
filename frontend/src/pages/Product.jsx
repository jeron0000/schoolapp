import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ShopContext } from "../context/shopContext";
import RelatedProducts from "../components/RelatedProducts";
import SizeGuideDialog from "../components/SizeGuideDialog";
import BestSellerBadge from "../components/BestSellerBadge";
import {
  getInventorySizes,
  getSizeStock,
  getTotalStock,
} from "../../../shared/inventory";
import { formatPhp } from "../../../shared/money.js";
import { editableSizeGuide } from "../../../shared/productMeasurements.js";
import { getRestockPresentation } from "../utils/productRestock.js";
import { getProductOptionLabel } from "../../../shared/productVariants.js";
import {
  getAcademicProgramName,
  getProductAcademicPrograms,
  getProductCategoryName,
  getProductGenders,
  getProductGenderName,
  getProductMerchandiseCategoryCodes,
} from "../../../shared/productTaxonomy.js";
import "../components/StorefrontFoundation.css";
import "./Product.css";

const productContainerClassName = [
  "mx-auto w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)]",
  "md:w-[calc(100%-60px)]",
  "min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]",
].join(" ");

const productEyebrowClassName =
  "text-xs font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]";

const surfacePanelClassName =
  "rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]";

const actionClassName = [
  "product-action inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-[7px] px-[18px] py-3",
  "text-sm font-semibold leading-[1.5]",
].join(" ");

const secondaryActionClassName = [
  "btn-secondary",
  actionClassName,
  "border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]",
  "text-[color:var(--pamo-color-text-primary)]",
].join(" ");

const stockPanelClassName =
  "mt-4 rounded border-l-[3px] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-3";

const galleryArrowClassName =
  "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)]";

const supportCardClassName =
  "flex flex-col min-[1180px]:rounded-[9px] min-[1180px]:border min-[1180px]:border-[color:var(--pamo-color-border-default)] min-[1180px]:bg-[var(--pamo-color-surface-default)] min-[1180px]:p-5";

const supportEyebrowClassName = `${productEyebrowClassName} hidden min-[1180px]:block`;
const supportHeadingClassName =
  "hidden text-base font-semibold leading-[1.5] min-[1180px]:mt-5 min-[1180px]:block min-[1180px]:text-lg";
const supportDetailClassName =
  "mt-2 hidden text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:block";
const supportLinkClassName =
  "inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium leading-[1.5] text-[color:var(--pamo-color-accent-text)] min-[1180px]:mt-auto min-[1180px]:self-start min-[1180px]:pt-3";

const getSizeAvailability = stock => {
  if (stock === 0) {
    return {
      status: "OUT OF STOCK",
      detail: "Currently unavailable",
      sizeLabel: "OUT OF STOCK",
      ariaLabel: "out of stock",
      panelAccentClassName: "border-l-[color:var(--pamo-color-error-text)]",
      statusClassName: "text-[color:var(--pamo-color-error-text)]",
      selectedStatusClassName: "text-red-800",
    };
  }
  if (stock < 10) {
    return {
      status: "LOW STOCK",
      detail: `Only ${stock} left for this size`,
      sizeLabel: `LOW STOCK · ${stock}`,
      ariaLabel: `low stock, ${stock} available`,
      panelAccentClassName: "border-l-amber-600 dark:border-l-amber-400",
      statusClassName: "text-amber-700 dark:text-amber-300",
      selectedStatusClassName: "text-amber-900",
    };
  }
  return {
    status: "IN STOCK",
    detail: `${stock} available for this size`,
    sizeLabel: `IN STOCK · ${stock}`,
    ariaLabel: `in stock, ${stock} available`,
    panelAccentClassName: "border-l-[color:var(--pamo-color-success-text)]",
    statusClassName: "text-[color:var(--pamo-color-success-text)]",
    selectedStatusClassName: "text-green-800",
  };
};

const summarizeClassification = values => {
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
};

const getStockPresentation = (size, stock, totalStock) => {
  if (size) {
    const availability = getSizeAvailability(stock);
    return {
      className: `${stockPanelClassName} ${availability.panelAccentClassName}`,
      statusClassName: availability.statusClassName,
      status: `SIZE ${size} · ${availability.status}`,
      detail: availability.detail,
    };
  }
  if (totalStock === 0) {
    return {
      className: `${stockPanelClassName} border-l-[color:var(--pamo-color-error-text)]`,
      statusClassName: "text-[color:var(--pamo-color-error-text)]",
      status: "OUT OF STOCK",
      detail: "No sizes are currently available.",
    };
  }
  return {
    className: `${stockPanelClassName} border-l-[color:var(--pamo-color-brand-yellow)]`,
    statusClassName: "text-[color:var(--pamo-color-text-secondary)]",
    status: "Size-specific availability",
    detail: "Select a size to see its available stock.",
  };
};

const getAddButtonLabel = (adding, totalStock, cartLimitReached) => {
  if (adding) {
    return "Adding to cart…";
  }
  if (totalStock === 0) {
    return "Out of stock";
  }
  if (cartLimitReached) {
    return "Available stock already in cart";
  }
  return "Add to Cart";
};

// Keyed by its source so each new photograph gets a fresh load state.
const ProductPhoto = ({
  src,
  alt,
  imageClassName,
  statusClassName,
  thumbnail = false,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const photoStatus = !src || failed ? "Image unavailable" : "Loading image…";

  return (
    <>
      {src && !failed && (
        <img
          src={src}
          alt={alt}
          className={imageClassName}
          loading={thumbnail ? "lazy" : "eager"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {(!src || failed || !loaded) && (
        <span className={statusClassName}>{photoStatus}</span>
      )}
    </>
  );
};

const Product = () => {
  const { productId } = useParams();
  const itemNavigation = useRef(false);
  useLayoutEffect(() => {
    if (!itemNavigation.current) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    itemNavigation.current = false;
  }, [productId]);
  const {
    products,
    addToCart,
    cartItems,
    getProductsData,
    productsLoading,
    productError,
    productCategories = [],
  } = useContext(ShopContext);
  useEffect(() => {
    getProductsData();
  }, [productId, getProductsData]);
  const productData = products.find((item) => item._id === productId);
  const groupAnchor = products.find(item => item._id === productData?.variantGroupId);
  const listingItems = groupAnchor ? products.filter(item => item.variantGroupId === groupAnchor._id && getProductOptionLabel(item)) : [];
  const [selectedImage, setSelectedImage] = useState({ productId, index: 0 });
  const [selectedSize, setSelectedSize] = useState({ productId, value: "" });
  const [feedback, setFeedback] = useState({ productId, message: "" });
  const [adding, setAdding] = useState(false);
  const [sizeGuideProductId, setSizeGuideProductId] = useState(null);
  const addingRef = useRef(false);
  const firstAvailableSize = useRef(null);
  const images = Array.isArray(productData?.image)
    ? productData.image.filter(Boolean)
    : [];
  const imageIndex =
    selectedImage.productId === productId && selectedImage.index < images.length
      ? selectedImage.index
      : 0;
  const size = selectedSize.productId === productId ? selectedSize.value : "";
  const message = feedback.productId === productId ? feedback.message : "";
  const selectImage = (index) => setSelectedImage({ productId, index });
  const moveImage = (direction) =>
    selectImage((imageIndex + direction + images.length) % images.length);

  const changeItem = nextProductId => {
    if (nextProductId === productId) return;
    itemNavigation.current = true;
    setSelectedSize({ productId: nextProductId, value: "" });
    setSelectedImage({ productId: nextProductId, index: 0 });
    setFeedback({ productId: nextProductId, message: "" });
    setSizeGuideProductId(null);
  };

  const handleAddToCart = async () => {
    if (addingRef.current) {
      return;
    }
    if (!size) {
      setFeedback({ productId, message: "Please select an available size." });
      firstAvailableSize.current?.focus();
      return;
    }
    addingRef.current = true;
    setAdding(true);
    setFeedback({ productId, message: "" });
    try {
      // The existing handler owns validation, optimistic updates and API feedback.
      // It returns no success result; do not infer server success here.
      await addToCart(productData._id, size);
    } catch {
      setFeedback({
        productId,
        message: "Could not add this item. Please try again.",
      });
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  };

  if (!productData) {
    if (productsLoading) {
      return (
        <section className="product-page text-[color:var(--pamo-color-text-primary)]">
          <div className={`${productContainerClassName} py-12`}>
            <p role="status">Loading product…</p>
          </div>
        </section>
      );
    }

    const emptyTitle = productError
      ? "Unable to load this product"
      : "Product not found";
    const emptyMessage = productError
      ? "Please try again or browse the collection."
      : "This product may no longer be available.";

    return (
      <section className="product-page text-[color:var(--pamo-color-text-primary)]">
        <div className={`${productContainerClassName} py-12`}>
          <h1 className="text-[26px] font-semibold">{emptyTitle}</h1>
          <p className="mb-6 leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
            {emptyMessage}
          </p>
          {productError && (
            <button
              type="button"
              className={`${secondaryActionClassName} mr-3 mt-2`}
              onClick={getProductsData}
            >
              Try again
            </button>
          )}
          <Link
            to="/collection"
            className={`${secondaryActionClassName} mr-3 mt-2`}
          >
            Browse collection <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  const sizes = getInventorySizes(productData);
  const sizeGuide = editableSizeGuide(productData.sizeGuide);
  const measurementRows = sizes.map(value => ({
    size: value,
    values: sizeGuide.measurements.find(entry => entry.size === value)?.values || {},
  }));
  const hasMeasurements = measurementRows.some(row => sizeGuide.fields.some(field => (
    Number.isFinite(row.values[field.key])
  )));
  const selectedMeasurements = measurementRows.find(row => row.size === size)?.values || {};
  const stock = getSizeStock(productData, size);
  const totalStock = getTotalStock(productData);
  const cartLimitReached =
    Boolean(size) && stock <= (cartItems[productId]?.[size] || 0);
  const firstAvailable = sizes.find(
    (value) => getSizeStock(productData, value) > 0,
  );
  const stockPresentation = getStockPresentation(size, stock, totalStock);
  const restockPresentation = getRestockPresentation(productData, sizes);
  const addButtonLabel = getAddButtonLabel(
    adding,
    totalStock,
    cartLimitReached,
  );
  const imageCount = images.length
    ? `${String(imageIndex + 1).padStart(2, "0")} / ${String(images.length).padStart(2, "0")}`
    : "No product images";
  const assignedPrograms = getProductAcademicPrograms(productData);
  const assignedGenders = getProductGenders(productData);
  const assignedMerchandiseCategories = getProductMerchandiseCategoryCodes(productData);
  const assignedProgramNames = [...new Set(assignedPrograms.map(value => (
    getAcademicProgramName(productCategories, value)
  )).filter(Boolean))];
  const assignedGenderNames = [...new Set(assignedGenders.map(value => (
    getProductGenderName(productCategories, value)
  )).filter(Boolean))];
  const assignedMerchandiseNames = [...new Set(assignedMerchandiseCategories.map(value => (
    getProductCategoryName(productCategories, value)
  )).filter(Boolean))];
  const productClassificationLabel = [
    summarizeClassification(assignedGenderNames),
    summarizeClassification(assignedProgramNames),
    summarizeClassification(assignedMerchandiseNames),
  ].filter(Boolean).join(" / ") || "School merchandise";

  return (
    <section className="product-page text-[color:var(--pamo-color-text-primary)]">
      <div className={productContainerClassName}>
        <nav
          aria-label="Breadcrumb"
          className="border-b border-[color:var(--pamo-color-border-default)] py-1 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)] sm:py-2 md:py-6 min-[1180px]:py-[18px]"
        >
          <ol className="flex min-w-0 flex-nowrap items-center gap-x-2 overflow-hidden sm:gap-x-3">
            <li className="hidden min-w-0 items-center gap-2.5 sm:flex">
              <Link
                to="/"
                className="inline-flex min-h-11 min-w-11 items-center justify-center"
              >
                Home
              </Link>
            </li>
            <li className="flex shrink-0 items-center gap-2 sm:min-w-0 sm:gap-2.5">
              <ChevronRight className="shrink-0" size={14} aria-hidden="true" />
              <Link
                to="/collection"
                className="inline-flex min-h-11 min-w-11 items-center justify-center"
              >
                Collection
              </Link>
            </li>
            <li className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <ChevronRight className="shrink-0" size={14} aria-hidden="true" />
              <span className="truncate" aria-current="page">{productData.name}</span>
            </li>
          </ol>
        </nav>

        <div className="mt-4 grid gap-5 [grid-template-areas:'summary'_'gallery'_'purchase'] sm:mt-6 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] sm:gap-x-6 sm:gap-y-8 sm:[grid-template-areas:'gallery_summary'_'purchase_purchase'] md:mt-8 md:grid-cols-[1.1fr_1fr] md:gap-x-7 md:gap-y-10 min-[1180px]:mt-[38px] min-[1180px]:grid-cols-2 min-[1180px]:grid-rows-[max-content_1fr] min-[1180px]:items-start min-[1180px]:gap-x-[38px] min-[1180px]:gap-y-7 min-[1180px]:[grid-template-areas:'gallery_summary'_'gallery_purchase']">
          <section
            className="min-w-0 [grid-area:gallery]"
            aria-label="Product image gallery"
          >
            <div className="rounded-[10px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-2 sm:p-3 md:p-3.5 min-[1180px]:p-4">
              <div className="relative flex h-[clamp(240px,78vw,320px)] min-w-0 items-center justify-center rounded-[7px] bg-[var(--pamo-color-surface-subtle)] sm:h-auto sm:aspect-[364/360] min-[1180px]:aspect-[590/560] min-[1180px]:max-h-[560px]">
                <p className="absolute left-3 top-3 z-[1] text-[11px] font-semibold leading-[1.5] text-[color:var(--pamo-color-text-secondary)] sm:left-4 sm:top-4 sm:text-xs">
                  {imageCount}
                </p>
                <ProductPhoto
                  key={images[imageIndex] || "missing"}
                  src={images[imageIndex]}
                  alt={`${productData.name}, view ${imageIndex + 1}`}
                  imageClassName="absolute inset-x-3 bottom-3 top-10 h-[calc(100%-52px)] w-[calc(100%-24px)] object-contain sm:bottom-4 sm:top-12 sm:h-[calc(100%-64px)]"
                  statusClassName="relative p-3 text-center text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]"
                />
                {images.length > 1 && (
                  <div className="pointer-events-none absolute inset-x-2.5 top-1/2 flex -translate-y-1/2 justify-between">
                    <button
                      type="button"
                      className={galleryArrowClassName}
                      onClick={() => moveImage(-1)}
                      aria-label="Previous product image"
                    >
                      <ChevronLeft
                        size={20}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      className={galleryArrowClassName}
                      onClick={() => moveImage(1)}
                      aria-label="Next product image"
                    >
                      <ChevronRight
                        size={20}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {images.length > 1 && (
              <div
                className="mt-1.5 flex gap-2 overflow-x-auto p-1.5 sm:mt-2 sm:gap-2.5 sm:p-2 min-[1180px]:mt-3 min-[1180px]:gap-3"
                aria-label="Choose a product image"
              >
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => selectImage(index)}
                    aria-label={`View product image ${index + 1}`}
                    aria-pressed={imageIndex === index}
                    className="relative flex h-14 basis-14 shrink-0 items-center justify-center rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-1 pb-1 pt-3.5 aria-pressed:border-2 aria-pressed:border-[color:var(--pamo-color-brand-yellow)] sm:h-16 sm:basis-16 md:basis-[76px] min-[1180px]:h-[90px] min-[1180px]:basis-24"
                  >
                    <span
                      className="absolute left-1.5 top-[3px] text-[10px] text-[color:var(--pamo-color-text-secondary)]"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <ProductPhoto
                      key={image}
                      src={image}
                      alt=""
                      imageClassName="h-full w-full object-contain"
                      statusClassName="p-0 text-center text-[10px] leading-[1.5] text-[color:var(--pamo-color-text-secondary)]"
                      thumbnail
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="flex min-w-0 flex-col [grid-area:summary]">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className={productEyebrowClassName}>
                {productClassificationLabel}
              </p>
              <BestSellerBadge BestSeller={productData.BestSeller} />
            </div>
            <h1 className="mt-3.5 text-[clamp(24px,6.6vw,28px)] font-semibold leading-[1.25] tracking-[-0.015em] md:text-[30px] min-[1180px]:mt-[26px] min-[1180px]:text-[34px]">
              {productData.name}
            </h1>
            <p className="order-4 mt-3 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[960px]:order-none min-[960px]:mt-3.5 min-[1180px]:mt-5">
              Select a size to check stock before adding this item to your cart.
            </p>
            <p className="order-3 mt-4 text-[30px] font-semibold leading-[1.2] min-[960px]:order-none min-[960px]:mt-[30px] min-[960px]:text-[34px]">
              {formatPhp(productData.price)}
            </p>
            <a
              className="order-5 mt-5 flex min-h-11 items-center justify-between gap-3 border-t border-[color:var(--pamo-color-border-default)] pt-3 text-sm font-medium text-[color:var(--pamo-color-text-primary)] sm:mt-6 min-[960px]:order-none min-[960px]:mt-9 min-[960px]:pt-4 min-[1180px]:hidden"
              href="#product-sizes"
            >
              Choose size <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>

          <div className="min-w-0 [grid-area:purchase]">
            {listingItems.length > 0 && (
              <fieldset className='mb-4 min-w-0'>
                <legend className='mb-2 text-sm font-semibold'>Select item · {getProductOptionLabel(productData)}</legend>
                <div className='flex flex-wrap gap-2'>
                  {listingItems.map(variant => (
                    <Link key={variant._id} to={`/product/${variant._id}`} aria-current={variant._id === productId ? 'true' : undefined}
                      onClick={() => changeItem(variant._id)}
                      className='inline-flex min-h-11 items-center rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-4 py-2 text-sm font-medium aria-[current=true]:border-[color:var(--pamo-color-brand-yellow)] aria-[current=true]:bg-[var(--pamo-color-brand-yellow)] aria-[current=true]:text-slate-950'>
                      {getProductOptionLabel(variant)}
                    </Link>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset
              className={`${surfacePanelClassName} min-w-0 scroll-mt-6 px-3.5 py-[18px] md:p-6 min-[1180px]:rounded-none min-[1180px]:border-x-0 min-[1180px]:border-b-0 min-[1180px]:bg-transparent min-[1180px]:px-0 min-[1180px]:pb-0 min-[1180px]:pt-[22px]`}
              id="product-sizes"
            >
              <legend className="sr-only">Select your size</legend>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <p className="text-xs font-semibold uppercase">
                    Select your size
                  </p>
                  {hasMeasurements && (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-controls="product-size-guide"
                      onClick={() => setSizeGuideProductId(productId)}
                      className="inline-flex min-h-11 items-center text-[13px] font-medium underline decoration-[color:var(--pamo-color-border-input)] underline-offset-4 hover:text-[color:var(--pamo-color-accent-text)]"
                    >
                      Size Guide
                    </button>
                  )}
                </div>
                <span className="text-[13px] font-medium text-[color:var(--pamo-color-accent-text)]">
                  {size ? `Selected: ${size}` : "Choose a size"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 max-[359px]:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(90px,1fr))] min-[1180px]:grid-cols-[repeat(auto-fit,minmax(84px,1fr))]">
                {sizes.map((value) => {
                  const available = getSizeStock(productData, value);
                  const availability = getSizeAvailability(available);
                  const isFirstAvailable = value === firstAvailable;
                  const sizeNameClassName =
                    available === 0
                      ? "text-base font-semibold leading-[1.5] line-through text-[color:var(--pamo-color-text-secondary)]"
                      : "text-base font-semibold leading-[1.5]";
                  let stockLabelClassName = availability.statusClassName;
                  if (size === value) {
                    stockLabelClassName = availability.selectedStatusClassName;
                  }
                  return (
                    <button
                      type="button"
                      key={value}
                      ref={isFirstAvailable ? firstAvailableSize : undefined}
                      disabled={available === 0 || adding}
                      aria-label={`${value}, ${availability.ariaLabel}`}
                      aria-pressed={size === value}
                      className="flex min-h-20 min-w-0 flex-col items-center justify-between gap-3 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-1.5 py-3 text-[color:var(--pamo-color-text-primary)] enabled:hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed aria-pressed:border-[color:var(--pamo-color-brand-yellow)] aria-pressed:!bg-[var(--pamo-color-brand-yellow)] aria-pressed:text-slate-950 min-[1180px]:bg-[var(--pamo-color-surface-default)]"
                      onClick={() => {
                        setSelectedSize({ productId, value });
                        setFeedback({ productId, message: "" });
                      }}
                    >
                      <strong className={sizeNameClassName}>{value}</strong>
                      <span className={`text-xs font-semibold leading-[1.5] ${stockLabelClassName}`}>
                        {availability.sizeLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              {hasMeasurements && size && (
                <section aria-label={`Measurements for size ${size}`} className="mt-4 border-t border-[color:var(--pamo-color-border-default)] pt-3">
                  <h3 className="text-xs font-semibold">Size {size} · Garment measurements (cm)</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs leading-relaxed max-[359px]:grid-cols-1">
                    {sizeGuide.fields.map(field => (
                      <div key={field.key} className="min-w-0">
                        <dt className="text-[color:var(--pamo-color-text-secondary)]">{field.label}</dt>
                        <dd className="font-medium tabular-nums">{selectedMeasurements[field.key] ?? '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              <div className={stockPresentation.className} role="status">
                <p
                  className={`${stockPresentation.statusClassName} text-xs font-semibold uppercase leading-[1.5]`}
                >
                  {stockPresentation.status}
                </p>
                <strong className="mt-1 block text-[15px] font-semibold leading-[1.5]">
                  {stockPresentation.detail}
                </strong>
              </div>
              {restockPresentation && (
                <div className={`${stockPanelClassName} border-l-[color:var(--pamo-color-brand-yellow)]`} role="status" aria-label="Restock information">
                  <p className="text-xs font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]">{restockPresentation.title}</p>
                  <p className="mt-1 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">{restockPresentation.detail}</p>
                </div>
              )}
            </fieldset>
            <div
              className={`${surfacePanelClassName} mt-5 px-3.5 py-[18px] md:px-6 md:py-5 min-[1180px]:mt-6 min-[1180px]:border-0 min-[1180px]:bg-transparent min-[1180px]:p-0`}
            >
              <button
                type="button"
                disabled={adding || totalStock === 0 || cartLimitReached}
                aria-busy={adding}
                onClick={handleAddToCart}
                className={`btn-primary ${actionClassName} w-full bg-[var(--pamo-color-brand-yellow)] text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)] enabled:active:bg-[var(--pamo-color-brand-pressed)] disabled:cursor-not-allowed disabled:opacity-[0.65]`}
              >
                {addButtonLabel}
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {message && (
                <p
                  className="mt-4 text-xs leading-[1.6] text-[color:var(--pamo-color-error-text)]"
                  role="alert"
                >
                  {message}
                </p>
              )}
              <p className="mt-4 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                Stock is checked again when your order is created.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                <Link
                  to="/cart"
                  className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium leading-[1.5] text-[color:var(--pamo-color-accent-text)]"
                >
                  View cart <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium leading-[1.5] text-[color:var(--pamo-color-accent-text)]"
                >
                  Contact support <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <section
          className={`${surfacePanelClassName} mt-10 px-4 py-5 md:mt-11 md:p-6 min-[1180px]:mt-[72px] min-[1180px]:p-[26px]`}
          aria-labelledby="product-information-heading"
        >
          <h2
            id="product-information-heading"
            className="flex min-h-[50px] items-center border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4 text-[17px] font-semibold uppercase leading-[1.4] md:text-[21px] min-[1180px]:min-h-[59px] min-[1180px]:text-[22px]"
          >
            Product information
          </h2>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-[1.7] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:text-[15px]">
            {productData.description?.trim() ||
              "No description is currently available for this product."}
          </p>
          {[...assignedGenderNames, ...assignedProgramNames, ...assignedMerchandiseNames].filter(Boolean)
            .length > 0 && (
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-[18px] border-t border-[color:var(--pamo-color-border-default)] pt-[18px] text-[13px] leading-[1.6]">
              {assignedGenderNames.length > 0 && (
                <div>
                  <dt className="text-[color:var(--pamo-color-text-secondary)]">
                    Gender applicability
                  </dt>
                  <dd className="mt-1 font-medium">{assignedGenderNames.join(", ")}</dd>
                </div>
              )}
              {assignedProgramNames.length > 0 && (
                <div>
                  <dt className="text-[color:var(--pamo-color-text-secondary)]">
                    Academic programs
                  </dt>
                  <dd className="mt-1 break-words font-medium">
                    {assignedProgramNames.join(", ")}
                  </dd>
                </div>
              )}
              {assignedMerchandiseNames.length > 0 && (
                <div>
                  <dt className="text-[color:var(--pamo-color-text-secondary)]">
                    Merchandise categories
                  </dt>
                  <dd className="mt-1 break-words font-medium">{assignedMerchandiseNames.join(", ")}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
        <section
          className={`${surfacePanelClassName} product-support mt-10 px-4 py-5 md:p-6 min-[1180px]:mt-[72px] min-[1180px]:rounded-none min-[1180px]:border-0 min-[1180px]:bg-transparent min-[1180px]:p-0`}
          aria-labelledby="product-support-heading"
        >
          <p className={productEyebrowClassName}>Ordering &amp; support</p>
          <h2
            id="product-support-heading"
            className="mt-3.5 font-display text-xl font-semibold leading-[1.35] min-[1180px]:text-[27px]"
          >
            Useful information before you order
          </h2>
          <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-1 min-[1180px]:mt-[30px] min-[1180px]:grid min-[1180px]:grid-cols-3 min-[1180px]:gap-7">
            <li
              className={`${supportCardClassName} basis-full min-[1180px]:basis-auto`}
            >
              <p className={supportEyebrowClassName}>01 / Availability</p>
              <h3 className={supportHeadingClassName}>Size-specific stock</h3>
              <p className="mt-2 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                Check your selected size and availability before ordering.
              </p>
              <a href="#product-sizes" className={supportLinkClassName}>
                Check sizes <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
            <li className={supportCardClassName}>
              <p className={supportEyebrowClassName}>02 / Order tracking</p>
              <h3 className={supportHeadingClassName}>Order updates</h3>
              <p className={supportDetailClassName}>
                Follow your order’s status in My Orders.
              </p>
              <Link to="/orders" className={supportLinkClassName}>
                My Orders <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li className={supportCardClassName}>
              <p className={supportEyebrowClassName}>03 / Support</p>
              <h3 className={supportHeadingClassName}>Need assistance?</h3>
              <p className={supportDetailClassName}>
                Contact STI College Carmona about sizing or ordering.
              </p>
              <Link to="/contact" className={supportLinkClassName}>
                Contact support <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          </ol>
        </section>
        <RelatedProducts
          category={productData.category}
          subCategory={productData.subCategory}
          productCategoryCode={productData.productCategoryCode}
          academicPrograms={assignedPrograms}
          genders={assignedGenders}
          merchandiseCategoryCodes={assignedMerchandiseCategories}
          productId={productData._id}
        />
      </div>
      {hasMeasurements && sizeGuideProductId === productId && (
        <SizeGuideDialog
          key={productId}
          productName={productData.name}
          fields={sizeGuide.fields}
          rows={measurementRows}
          selectedSize={size}
          onClose={() => setSizeGuideProductId(null)}
        />
      )}
    </section>
  );
};

export default Product;
