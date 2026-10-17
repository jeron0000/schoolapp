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
import {
  getInventorySizes,
  getSizeStock,
  getTotalStock,
} from "../../../shared/inventory";
import "../components/StorefrontFoundation.css";
import "./Product.css";
import { formatPhp } from '../../../shared/money.js';

// Keyed by its source so each new photograph gets a fresh load state.
const ProductPhoto = ({ src, alt, thumbnail = false }) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {src && !failed && (
        <img
          src={src}
          alt={alt}
          loading={thumbnail ? "lazy" : "eager"}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {(!src || failed || !loaded) && (
        <span className="product-photo-status">
          {!src || failed ? "Image unavailable" : "Loading image…"}
        </span>
      )}
    </>
  );
};

const Product = () => {
  const { productId } = useParams();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [productId]);
  const {
    products,
    addToCart,
    cartItems,
    getProductsData,
    productsLoading,
    productError,
  } = useContext(ShopContext);
  useEffect(() => {
    getProductsData();
  }, [productId, getProductsData]);
  const productData = products.find((item) => item._id === productId);
  const [selectedImage, setSelectedImage] = useState({ productId, index: 0 });
  const [selectedSize, setSelectedSize] = useState({ productId, value: "" });
  const [feedback, setFeedback] = useState({ productId, message: "" });
  const [adding, setAdding] = useState(false);
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

  const handleAddToCart = async () => {
    if (addingRef.current) return;
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

  if (!productData)
    return (
      <section className="product-page">
        <div className="product-container product-empty">
          {productsLoading ? (
            <p role="status">Loading product…</p>
          ) : (
            <>
              <h1>
                {productError
                  ? "Unable to load this product"
                  : "Product not found"}
              </h1>
              <p>
                {productError
                  ? "Please try again or browse the collection."
                  : "This product may no longer be available."}
              </p>
              {productError && (
                <button
                  type="button"
                  className="btn-secondary product-action"
                  onClick={getProductsData}
                >
                  Try again
                </button>
              )}
              <Link to="/collection" className="btn-secondary product-action">
                Browse collection <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      </section>
    );

  const sizes = getInventorySizes(productData);
  const stock = getSizeStock(productData, size);
  const totalStock = getTotalStock(productData);
  const cartLimitReached =
    Boolean(size) && stock <= (cartItems[productId]?.[size] || 0);
  const firstAvailable = sizes.find(
    (value) => getSizeStock(productData, value) > 0,
  );

  return (
    <section className="product-page">
      <div className="product-container">
        <nav aria-label="Breadcrumb" className="product-breadcrumb">
          <ol>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <ChevronRight size={14} aria-hidden="true" />
              <Link to="/collection">Collection</Link>
            </li>
            <li>
              <ChevronRight size={14} aria-hidden="true" />
              <span aria-current="page">{productData.name}</span>
            </li>
          </ol>
        </nav>

        <div className="product-layout">
          <section
            className="product-gallery"
            aria-label="Product image gallery"
          >
            <div className="product-gallery-frame">
              <div className="product-main-photo">
                <p className="product-image-count">
                  {images.length
                    ? `${String(imageIndex + 1).padStart(2, "0")} / ${String(images.length).padStart(2, "0")}`
                    : "No product images"}
                </p>
                <ProductPhoto
                  key={images[imageIndex] || "missing"}
                  src={images[imageIndex]}
                  alt={`${productData.name}, view ${imageIndex + 1}`}
                />
                {images.length > 1 && (
                  <div className="product-gallery-arrows">
                    <button
                      type="button"
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
                className="product-thumbnails"
                aria-label="Choose a product image"
              >
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => selectImage(index)}
                    aria-label={`View product image ${index + 1}`}
                    aria-pressed={imageIndex === index}
                  >
                    <span
                      className="product-thumbnail-number"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <ProductPhoto key={image} src={image} alt="" thumbnail />
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="product-summary">
            <p className="product-eyebrow">
              {[productData.category, productData.subCategory]
                .filter(Boolean)
                .join(" / ") || "School merchandise"}
            </p>
            <h1>{productData.name}</h1>
            <p className="product-summary-note">
              Select a size to check stock before adding this item to your cart.
            </p>
            <p className="product-price">
              {formatPhp(productData.price)}
            </p>
            <a className="product-size-link" href="#product-sizes">
              Available sizes <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>

          <div className="product-purchase">
            <fieldset className="product-size-picker" id="product-sizes">
              <legend className="sr-only">Select your size</legend>
              <div className="product-size-heading">
                <p>Select your size</p>
                <span>{size ? `Selected: ${size}` : "Choose a size"}</span>
              </div>
              <div className="product-size-options">
                {sizes.map((value) => {
                  const available = getSizeStock(productData, value);
                  return (
                    <button
                      type="button"
                      key={value}
                      ref={
                        value === firstAvailable
                          ? firstAvailableSize
                          : undefined
                      }
                      disabled={available === 0 || adding}
                      aria-label={`${value}, ${available === 0 ? "out of stock" : `${available} in stock`}`}
                      aria-pressed={size === value}
                      onClick={() => {
                        setSelectedSize({ productId, value });
                        setFeedback({ productId, message: "" });
                      }}
                    >
                      <strong>{value}</strong>
                      <span>
                        {available === 0
                          ? "Out of stock"
                          : `${available} in stock`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div
                className={
                  "product-stock" +
                  (size && stock > 0
                    ? " is-available"
                    : totalStock === 0 || (size && stock === 0)
                      ? " is-unavailable"
                      : "")
                }
                role="status"
              >
                <p>
                  {size
                    ? `Size ${size} · ${stock > 0 ? "In stock" : "Out of stock"}`
                    : totalStock === 0
                      ? "Out of stock"
                      : "Size-specific availability"}
                </p>
                <strong>
                  {size
                    ? `${stock} available for this size`
                    : totalStock === 0
                      ? "No sizes are currently available."
                      : "Select a size to see its available stock."}
                </strong>
              </div>
            </fieldset>
            <div className="product-cart-controls">
              <button
                type="button"
                disabled={adding || totalStock === 0 || cartLimitReached}
                aria-busy={adding}
                onClick={handleAddToCart}
                className="btn-primary product-action product-add-to-cart"
              >
                {adding
                  ? "Adding to cart…"
                  : totalStock === 0
                    ? "Out of stock"
                    : cartLimitReached
                      ? "Available stock already in cart"
                      : "Add to Cart"}
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {message && (
                <p className="product-feedback" role="alert">
                  {message}
                </p>
              )}
              <p>Stock is checked again when your order is created.</p>
              <div className="product-purchase-links">
                <Link to="/cart">
                  View cart <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link to="/contact">
                  Contact support <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <section
          className="product-information"
          aria-labelledby="product-information-heading"
        >
          <h2 id="product-information-heading">Product information</h2>
          <p className="product-description">
            {productData.description?.trim() ||
              "No description is currently available for this product."}
          </p>
          {[productData.category, productData.subCategory].filter(Boolean)
            .length > 0 && (
            <dl className="product-classification">
              {productData.category && (
                <div>
                  <dt>Category</dt>
                  <dd>{productData.category}</dd>
                </div>
              )}
              {productData.subCategory && (
                <div>
                  <dt>Program / classification</dt>
                  <dd>{productData.subCategory}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
        <section
          className="product-support"
          aria-labelledby="product-support-heading"
        >
          <p className="product-eyebrow">Ordering &amp; support</p>
          <h2 id="product-support-heading">
            Useful information before you order
          </h2>
          <ol>
            <li>
              <p className="product-eyebrow">01 / Availability</p>
              <h3>Size-specific stock</h3>
              <p>Check your selected size and availability before ordering.</p>
              <a href="#product-sizes">
                Check sizes <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
            <li>
              <p className="product-eyebrow">02 / Order tracking</p>
              <h3>Order updates</h3>
              <p>Follow your order’s status in My Orders.</p>
              <Link to="/orders">
                My Orders <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <p className="product-eyebrow">03 / Support</p>
              <h3>Need assistance?</h3>
              <p>Contact STI College Carmona about sizing or ordering.</p>
              <Link to="/contact">
                Contact support <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </li>
          </ol>
        </section>
        <RelatedProducts
          category={productData.category}
          subCategory={productData.subCategory}
          productId={productData._id}
        />
      </div>
    </section>
  );
};

export default Product;
