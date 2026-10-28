import axios from "axios";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import CartTotal from "../components/CartTotal";
import CheckoutImage from "../components/ImageWithFallback";
import { ShopContext } from "../context/shopContext";
import { getSizeStock } from "../../../shared/inventory";
import { formatMoney } from "../utils/orderPresentation";
import { phpItemsTotal, phpMinorUnits, sumPhp, tryPhpLineTotal } from '../../../shared/money.js';
import { createProductLookup } from '../../../shared/productLookup.js';
import { isOnlinePaymentMethod } from '../../../shared/orderCancellation.js';
import { getAcademicProgramName } from '../../../shared/productTaxonomy.js';
import {
  cartSelectionKey,
  readCartSelection,
  reconcileCartSelection,
  removePurchasedSelection,
  selectCartItems,
} from '../utils/cartSelection.js';
import "../components/StorefrontFoundation.css";
import "./PlaceOrder.css";

const paymentMethods = [
  ["cod", "Pay as you claim", "Pay at the school cashier as part of the claiming process."],
  ["stripe", "Stripe (TEST)", "Stripe test-card checkout. No real money is charged."],
  ["paypal", "PayPal (SANDBOX)", "PayPal sandbox checkout. Use a sandbox buyer account."],
];
const checkoutContainerClassName = [
  "mx-auto w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)]",
  "md:w-[calc(100%-60px)] min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]",
].join(" ");
const surfaceClassName =
  "border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]";
const eyebrowClassName =
  "text-xs font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]";
const sectionHeadingClassName =
  "text-[17px] font-semibold uppercase leading-[1.45] md:text-lg";
const markedHeadingClassName = [
  sectionHeadingClassName,
  "flex min-h-[50px] items-start border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4",
  "min-[1180px]:min-h-14",
].join(" ");
const sectionIntroClassName =
  "mt-4 text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]";
const actionClassName = [
  "inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-2",
  "rounded-[7px] px-4 py-2.5 text-[13px] font-medium leading-[1.5]",
  "disabled:cursor-not-allowed disabled:opacity-[0.65] aria-disabled:cursor-not-allowed aria-disabled:opacity-[0.65]",
].join(" ");
const secondaryActionClassName = [
  "btn-secondary",
  actionClassName,
  "border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]",
  "text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)]",
  "dark:border-[color:var(--pamo-color-border-input)] dark:bg-[var(--pamo-color-surface-default)]",
  "dark:text-[color:var(--pamo-color-text-primary)]",
].join(" ");
const brandActionClassName = [
  "btn-primary",
  actionClassName,
  "bg-[var(--pamo-color-brand-yellow)] font-semibold text-slate-950",
  "[&:not(:disabled):hover]:bg-[var(--pamo-color-brand-hover)]",
  "[&:not(:disabled):active]:bg-[var(--pamo-color-brand-pressed)]",
].join(" ");
const standalonePanelClassName = [
  surfaceClassName,
  "min-w-0 rounded-[10px] px-4 py-5 md:p-6 min-[1180px]:px-6 min-[1180px]:py-[26px]",
].join(" ");
const groupedPanelClassName = [
  "min-w-0",
  "md:rounded-none md:border-0 md:bg-transparent md:p-0",
].join(" ");
const panelGroupClassName = [
  "block min-w-0 rounded-[10px] border border-[color:var(--pamo-color-border-default)]",
  "bg-[var(--pamo-color-surface-default)] p-4 md:p-6",
  "min-[1180px]:px-6 min-[1180px]:py-[26px]",
].join(" ");
const errorTextClassName =
  "text-[13px] font-normal leading-[1.6] text-[color:var(--pamo-color-error-text)]";
const progressItemClassName =
  "relative min-w-0 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)] md:text-sm";
const progressControlClassName =
  "flex min-h-11 flex-wrap items-center justify-center gap-3 rounded-md px-1.5 py-2";
const progressArrowClassName =
  "absolute right-[-10px] top-[calc(50%-8px)] w-3";
const reviewItemClassName =
  "grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 rounded-lg bg-[var(--pamo-color-surface-subtle)] p-3 md:grid-cols-[84px_minmax(0,1fr)]";
const reviewImageClassName = [
  "flex aspect-[84/100] w-full items-center justify-center overflow-hidden rounded-[5px] border p-1.5",
  "border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]",
  "[&>img]:h-full [&>img]:w-full [&>img]:object-contain",
  "[&>span]:text-center [&>span]:text-xs [&>span]:leading-[1.5]",
  "[&>span]:text-[color:var(--pamo-color-text-secondary)]",
].join(" ");
const paymentOptionBaseClassName =
  "flex min-h-[68px] items-center gap-3.5 rounded-[7px] border px-3 py-3 md:min-h-20 md:py-4";

const hasSamePhpPrice = (displayedProduct, currentProduct) => {
  if (!displayedProduct || !currentProduct) {
    return false;
  }
  try {
    return phpMinorUnits(displayedProduct.price) === phpMinorUnits(currentProduct.price);
  } catch {
    return false;
  }
};

const getPaymentOptionClassName = (selected, disabled) => {
  let className = paymentOptionBaseClassName;
  if (selected) {
    className +=
      " border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)]";
  } else {
    className += " border-[color:var(--pamo-color-border-default)]";
  }
  className += disabled
    ? " cursor-not-allowed opacity-70"
    : " cursor-pointer";
  return className;
};
const renderCheckoutReviewItem = (item, currency) => {
  const product = item.product;
  const imageName = product?.name || "Product unavailable";
  const productTitle = product ? product.name : "Product unavailable";
  const unitPrice = product ? formatMoney(product.price, currency) : "Unavailable";
  const lineTotal = product
    ? formatMoney(tryPhpLineTotal(product.price, item.quantity), currency)
    : "Unavailable";

  return (
    <li className={reviewItemClassName} key={JSON.stringify([item.id, item.size])}>
      <div className={reviewImageClassName}>
        <CheckoutImage
          key={product?.image?.[0] || "missing"}
          src={product?.image?.[0]}
          name={imageName}
        />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-[1.5]">{product ? <Link className="inline-flex min-h-11 items-center" to={"/product/" + item.id}>{productTitle}</Link> : productTitle}</h3>
        <p className="mt-1.5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">Size {item.size} · Qty {item.quantity}</p>
        {product?.optionLabel && <p className='mt-1.5 text-xs'>Item · {product.optionLabel}</p>}
        {!product?.optionLabel && product?.colorLabel && <p className='mt-1.5 text-xs'>Color · {product.colorLabel}</p>}
        <p className="mt-1.5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">Unit price · {unitPrice}</p>
        <strong className="mt-3 block text-right text-sm font-semibold leading-[1.5]">Line total · {lineTotal}</strong>
      </div>
    </li>
  );
};

const PlaceOrder = () => {
  const [method, setMethod] = useState("cod");
  const [providerAvailability, setPaymentMethods] = useState({ stripe: false, paypal: false });
  const {
    navigate,
    backendUrl,
    token,
    cartItems,
    delivery_fee,
    products,
    getProductsData,
    currency,
    productsLoading,
    productError,
    beginCartCheckout,
    studentProfile,
    profileLoading,
    profileError,
    userId,
    productCategories = [],
  } = useContext(ShopContext);
  const academicProgramName = getAcademicProgramName(
    productCategories,
    studentProfile?.academicProgram,
  );
  const findProduct = useMemo(() => createProductLookup(products), [products]);
  const pending = useRef(false);
  const checkoutRequest = useRef(null);
  useEffect(() => {
    let active = true;
    setPaymentMethods({ stripe: false, paypal: false });
    if (token) {
      axios.get(backendUrl + '/api/order/payment/options', { headers: { token } })
        .then(({ data }) => {
          if (active) setPaymentMethods({ stripe: data.success === true && data.methods?.stripe === true,
            paypal: data.success === true && data.methods?.paypal === true });
        })
        .catch(() => { if (active) setPaymentMethods({ stripe: false, paypal: false }); });
    }
    return () => { active = false; };
  }, [backendUrl, token]);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [pricesChanged, setPricesChanged] = useState(false);
  const checkoutSelection = reconcileCartSelection(
    cartItems,
    readCartSelection(userId),
  );
  const selectedKeys = new Set(checkoutSelection.selected);
  const selectedCartItems = selectCartItems(cartItems, selectedKeys);

  const reportSubmissionError = (message, hasPriceChange = false) => {
    const text =
      message ||
      "Order submission could not be confirmed. Check My Orders before trying again.";
    setSubmissionError(text);
    setPricesChanged(hasPriceChange);
    toast.error(text);
  };

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    if (pending.current) {
      return;
    }
    if (method !== "cod" && !providerAvailability[method]) {
      reportSubmissionError(
        "Online payments are temporarily unavailable. Please use Pay as you claim.",
      );
      return;
    }
    if (profileLoading || profileError || !studentProfile) {
      reportSubmissionError("Your student profile could not be verified. Review My Account before checkout.");
      return;
    }
    if (!studentProfile.academicProgram) {
      reportSubmissionError("Add your academic program in My Account before checkout.");
      return;
    }
    setSubmissionError("");
    setPricesChanged(false);
    let cartCheckout;
    let submitted = false;
    try {
      cartCheckout = beginCartCheckout?.();
    } catch (error) {
      reportSubmissionError(error.message);
      return;
    }
    pending.current = true;
    setSubmitting(true);
    try {
      const refreshedProducts = await getProductsData();
      if (cartCheckout && !cartCheckout.isCurrent()) {
        return;
      }
      if (!Array.isArray(refreshedProducts)) {
        throw new Error("Product prices could not be refreshed. Try again before placing your order.");
      }

      const findCurrentProduct = createProductLookup(refreshedProducts);
      const orderItems = [];
      const checkoutCartItems = cartCheckout?.snapshot?.cartData || cartItems;
      const checkoutItems = selectCartItems(checkoutCartItems, selectedKeys);
      let priceChanged = false;

      for (const productId in checkoutItems) {
        for (const size in checkoutItems[productId]) {
          const quantity = checkoutItems[productId][size];
          if (quantity <= 0) {
            continue;
          }

          const displayedProduct = findProduct(productId);
          const currentProduct = findCurrentProduct(productId);
          const itemInfo = structuredClone(currentProduct);
          if (!itemInfo) {
            throw new Error("A product is no longer available. Review your cart.");
          }
          if (!hasSamePhpPrice(displayedProduct, currentProduct)) {
            priceChanged = true;
          }
          itemInfo.size = size;
          itemInfo.quantity = quantity;
          orderItems.push(itemInfo);
        }
      }

      if (!orderItems.length) {
        throw new Error("Select at least one cart item before checkout.");
      }
      if (priceChanged) {
        reportSubmissionError(
          "Product prices changed. Review the updated totals before placing your order.",
          true,
        );
        return;
      }
      const signature = JSON.stringify({
        items: orderItems.map((item) => [item._id, item.size, item.quantity]),
        method,
        checkoutCart: cartCheckout?.snapshot,
      });
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(signature),
      );
      if (cartCheckout && !cartCheckout.isCurrent()) {
        return;
      }
      const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      try {
        checkoutRequest.current =
          JSON.parse(sessionStorage.getItem("pamo-checkout-request")) ||
          checkoutRequest.current;
      } catch {
        /* In-memory retries still work when storage is unavailable. */
      }
      if (checkoutRequest.current?.fingerprint !== fingerprint) {
        checkoutRequest.current = {
          fingerprint,
          requestId: crypto.randomUUID(),
        };
      }
      try {
        sessionStorage.setItem(
          "pamo-checkout-request",
          JSON.stringify(checkoutRequest.current),
        );
      } catch {
        /* Keep the current request in memory. */
      }

      const orderData = {
        items: orderItems,
        pricingQuote: orderItems.map((item) => ({
          _id: item._id,
          size: item.size,
          price: item.price,
        })),
        amount: sumPhp(phpItemsTotal(orderItems), delivery_fee),
        requestId: checkoutRequest.current.requestId,
        checkoutCart: cartCheckout?.snapshot,
      };
      let endpoint = '/api/order/place';
      if (method !== 'cod') {
        endpoint = method === 'stripe' ? '/api/order/Stripe' : '/api/order/Paypal';
      }

      submitted = true;
      const response = await axios.post(
        backendUrl + endpoint,
        orderData,
        { headers: { token } },
      );
      if (cartCheckout && !cartCheckout.isCurrent()) {
        return;
      }
      if (response.data.success) {
        if (method !== 'cod') {
          window.location.assign(response.data.session_url);
          return;
        }
        await cartCheckout?.complete(response.data.cartCleanupPending);
        if (cartCheckout && !cartCheckout.isCurrent()) {
          return;
        }
        checkoutRequest.current = null;
        try {
          sessionStorage.removeItem("pamo-checkout-request");
        } catch {
          /* Optional persistence. */
        }
        removePurchasedSelection(
          userId,
          checkoutCartItems,
          orderItems.map(item => cartSelectionKey(item._id, item.size)),
        );
        navigate("/orders");
      } else {
        reportSubmissionError(
          response.data.message,
          response.data.code === "STALE_PRODUCT_PRICE",
        );
      }
    } catch (error) {
      if (cartCheckout && !cartCheckout.isCurrent()) {
        return;
      }
      const responseData = error.response?.data;
      reportSubmissionError(
        responseData?.message ||
          "Order submission could not be confirmed. Check My Orders before trying again.",
        responseData?.code === "STALE_PRODUCT_PRICE",
      );
    } finally {
      cartCheckout?.finish();
      try {
        if (submitted) {
          await getProductsData();
        }
      } finally {
        pending.current = false;
        setSubmitting(false);
      }
    }
  };

  const reviewItems = Object.entries(selectedCartItems).flatMap(([id, sizes]) =>
    Object.entries(sizes || {})
      .filter(([, quantity]) => quantity > 0)
      .map(([size, quantity]) => ({
        id,
        size,
        quantity,
        product: findProduct(id),
      })),
  );
  const unitCount = reviewItems.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  const selectedSubtotal = phpItemsTotal(reviewItems
    .filter(item => item.product)
    .map(item => ({ price: item.product.price, quantity: item.quantity })));
  const loading = productsLoading && products.length === 0;
  const unavailable = reviewItems.some(
    (item) =>
      !item.product ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity > getSizeStock(item.product, item.size),
  );
  // A previous request may already have reserved stock; its idempotent retry must
  // still reach the server, which owns availability and reservation validation.
  const cannotSubmit =
    submitting || loading || !reviewItems.length || Boolean(productError) ||
    profileLoading || Boolean(profileError) || !studentProfile?.academicProgram;
  const showEmptyCheckout = !loading && !reviewItems.length;
  const showCheckoutForm = !showEmptyCheckout;
  const itemVariantLabel = reviewItems.length === 1 ? "product variant" : "product variants";
  const unitLabel = unitCount === 1 ? "unit" : "units";
  let submitLabel = 'Place order';
  if (method !== 'cod') submitLabel = 'Continue to test payment';
  if (submitting) submitLabel = 'Placing your order…';

  const selectPaymentMethod = (value) => {
    if (value === "cod" || (providerAvailability[value] && isOnlinePaymentMethod(value))) {
      setMethod(value);
    }
  };
  const preventNavigationWhileSubmitting = (event) => {
    if (submitting) {
      event.preventDefault();
    }
  };
  return (
    <section className="checkout-page text-[color:var(--pamo-color-text-primary)]">
      <div className={checkoutContainerClassName}>
        <header className="pb-6 pt-5 md:pb-10 md:pt-9">
          <p className={eyebrowClassName}>Complete your order</p>
          <h1 className="mt-3 text-[31px] font-bold leading-[1.2] md:mt-[18px] md:text-4xl min-[1180px]:text-[42px]">Checkout</h1>
          <p className="mt-3 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)] md:mt-[18px] min-[1180px]:text-[15px]">
            Confirm your student profile, review the items, and place your campus pickup order.
          </p>
          <div className="mt-5 md:mt-7 min-[1180px]:mt-[30px] min-[1180px]:flex min-[1180px]:flex-wrap min-[1180px]:items-center min-[1180px]:justify-between min-[1180px]:gap-5">
            <nav className="min-[1180px]:w-[606px] min-[1180px]:max-w-full" aria-label="Checkout progress">
              <ol className="grid grid-cols-3 gap-1 rounded-[7px] bg-[var(--pamo-color-surface-default)] p-1 min-[1180px]:bg-transparent">
                <li className={progressItemClassName}>
                  <Link className={progressControlClassName} to="/cart">
                    <span className="hidden text-xs md:inline" aria-hidden="true">
                      01
                    </span>
                    Cart
                  </Link>
                  <ChevronRight className={progressArrowClassName} size={16} aria-hidden="true" />
                </li>
                <li className={`${progressItemClassName} font-semibold text-[color:var(--pamo-color-accent-text)] min-[1180px]:rounded-md min-[1180px]:border min-[1180px]:border-[color:var(--pamo-color-border-default)] min-[1180px]:bg-[var(--pamo-color-surface-default)]`} aria-current="step">
                  <span className={progressControlClassName}>
                    <span className="hidden text-xs md:inline" aria-hidden="true">
                      02
                    </span>
                    Checkout
                  </span>
                  <ChevronRight className={progressArrowClassName} size={16} aria-hidden="true" />
                </li>
                <li className={progressItemClassName}>
                  <span className={progressControlClassName}>
                    <span className="hidden text-xs md:inline" aria-hidden="true">
                      03
                    </span>
                    Confirmation
                  </span>
                </li>
              </ol>
            </nav>
            <p className="mt-3.5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)] min-[1180px]:m-0">Confirmation and order updates appear in My Orders.</p>
          </div>
        </header>
        {productError && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3.5 rounded-lg border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] p-[18px] text-sm leading-[1.6]" role="alert">
            <p>
              Product availability could not be refreshed. Please try again
              before placing your order.
            </p>
            <button
              type="button"
              className={secondaryActionClassName}
              disabled={submitting}
              onClick={getProductsData}
            >
              Try again
            </button>
          </div>
        )}
        {showEmptyCheckout && (
          <div className={`${standalonePanelClassName} flex flex-col items-center gap-[22px] py-12 text-center`}>
            <ShoppingBag className="text-[color:var(--pamo-color-accent-text)]" size={36} strokeWidth={1.75} aria-hidden="true" />
            <h2 className="text-2xl font-semibold leading-[1.45]">
              {Object.keys(cartItems).length ? "No items selected" : "Your cart is empty"}
            </h2>
            <p className="text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
              {Object.keys(cartItems).length
                ? "Return to your cart and select at least one item for checkout."
                : "Choose your school essentials and a size before checkout."}
            </p>
            <Link
              to={Object.keys(cartItems).length ? "/cart" : "/collection"}
              className={brandActionClassName}
            >
              {Object.keys(cartItems).length ? "Return to cart" : "Browse collection"} <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        )}
        {showCheckoutForm && (
          <form
            className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:gap-6 min-[1180px]:grid-cols-[minmax(0,1.63fr)_minmax(0,1fr)] min-[1180px]:gap-[26px]"
            onSubmit={onSubmitHandler}
            aria-busy={submitting}
          >
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 md:gap-6">
              <div className={panelGroupClassName}>
                <section
                  className={groupedPanelClassName}
                  aria-labelledby="checkout-student-heading"
                >
                  <h2
                    id="checkout-student-heading"
                    className={markedHeadingClassName}
                  >
                    Student information
                  </h2>
                  <p className={sectionIntroClassName}>
                    These details come from your authenticated student account and are saved with this order.
                  </p>
                  {profileLoading && (
                    <p className="mt-6 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]" role="status">Loading your student profile...</p>
                  )}
                  {!profileLoading && profileError && (
                    <div className="mt-6 rounded-lg border border-[color:var(--pamo-color-error-text)] bg-[var(--pamo-color-surface-subtle)] p-4 text-sm leading-[1.6]" role="alert">
                      <p>{profileError}</p>
                      <Link className="mt-3 inline-flex min-h-11 items-center font-medium text-[color:var(--pamo-color-accent-text)]" to="/account">Review My Account</Link>
                    </div>
                  )}
                  {!profileLoading && studentProfile && (
                    <>
                      <dl className="mt-4 grid min-w-0 gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 sm:p-4">
                        <div className="min-w-0">
                          <dt className={eyebrowClassName}>Full name</dt>
                          <dd className="mt-2 break-words text-sm font-semibold leading-[1.5]">{studentProfile.name}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className={eyebrowClassName}>Email address</dt>
                          <dd className="mt-2 break-words text-sm font-semibold leading-[1.5]">{studentProfile.email}</dd>
                        </div>
                        <div className="min-w-0 sm:col-span-2">
                          <dt className={eyebrowClassName}>Academic program</dt>
                          <dd className="mt-2 break-words text-sm font-semibold leading-[1.5]">{academicProgramName || "Not added"}</dd>
                        </div>
                      </dl>
                      {!studentProfile.academicProgram && (
                        <div className="mt-5 rounded-lg border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] p-4 text-sm leading-[1.6]" role="alert">
                          <p>Add your academic program before placing an order.</p>
                          <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-[color:var(--pamo-color-accent-text)]" to="/account">Complete My Account <ArrowUpRight className="ml-2" size={16} aria-hidden="true" /></Link>
                        </div>
                      )}
                      {studentProfile.academicProgram && (
                        <Link className="mt-4 inline-flex min-h-11 items-center text-[13px] font-medium text-[color:var(--pamo-color-accent-text)]" to="/account">Correct these details in My Account <ArrowUpRight className="ml-2" size={16} aria-hidden="true" /></Link>
                      )}
                    </>
                  )}
                </section>
                <section
                  className={`${groupedPanelClassName} mt-5 border-t border-[color:var(--pamo-color-border-default)] pt-5 md:mt-7 md:rounded-none md:border-x-0 md:border-b-0 md:!border-t md:pt-6`}
                  aria-labelledby="checkout-fulfillment-heading"
                >
                  <h2
                    id="checkout-fulfillment-heading"
                    className={eyebrowClassName}
                  >
                    Order fulfillment
                  </h2>
                  <div className="mt-4 flex items-start gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] px-3 py-3 md:mt-5 md:py-4">
                    <CheckCircle2 className="mt-0.5 text-[color:var(--pamo-color-accent-text)]" size={20} aria-hidden="true" />
                    <div>
                      <h3 className="text-[15px] font-semibold leading-[1.5]">Campus pickup</h3>
                      <p className="mt-2 text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                        No shipping address is needed. Follow the school approval process, pay through the school cashier when instructed, and check My Orders for release updates.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
              <section
                className={standalonePanelClassName}
                aria-labelledby="checkout-payment-heading"
              >
                <h2 id="checkout-payment-heading" className={sectionHeadingClassName}>Payment method</h2>
                <p className={sectionIntroClassName}>
                  Select one method to continue.
                </p>
                <fieldset className="mt-4 grid min-w-0 gap-2 md:mt-6 md:gap-3">
                  <legend className="sr-only">Choose a payment method</legend>
                  {paymentMethods.map(([value, label, copy]) => (
                    <label
                      key={value}
                      className={getPaymentOptionClassName(
                        method === value,
                        submitting || (value !== "cod" && !providerAvailability[value]),
                      )}
                    >
                      <input
                        className="h-5 w-5 shrink-0 accent-[var(--pamo-color-brand-yellow)]"
                        type="radio"
                        name="payment-method"
                        value={value}
                        checked={method === value}
                        disabled={submitting || (value !== "cod" && !providerAvailability[value])}
                        onChange={() => selectPaymentMethod(value)}
                      />
                      <span className="grid min-w-0 gap-1.5">
                        <strong className="text-sm font-semibold leading-[1.5]">{label}</strong>
                        <span className="text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">{copy}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {isOnlinePaymentMethod(method) && (
                  <p className='mt-4 text-sm leading-relaxed text-[color:var(--pamo-color-text-secondary)]'>
                    After online payment, orders cannot be cancelled directly through PAMO. Contact PAMO Support for payment issues, unavailable items, or refund concerns.{' '}
                    <Link to='/contact' className='font-semibold underline underline-offset-4'>Contact Support</Link>
                  </p>
                )}
                <p className="mt-5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                  Test payments only. No real money is charged. Stripe requires a test card; PayPal requires a sandbox buyer account. No official cashier receipt is issued.
                </p>
              </section>
            </div>
            <aside
              className={panelGroupClassName}
              aria-label="Final order review"
            >
              <section
                className={groupedPanelClassName}
                aria-labelledby="checkout-review-heading"
              >
                <h2
                  id="checkout-review-heading"
                  className={markedHeadingClassName}
                >
                  Order review
                </h2>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--pamo-color-border-default)] pb-5">
                  <p className="text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                    {reviewItems.length} {itemVariantLabel} · {unitCount} total {unitLabel}
                  </p>
                  <Link
                    to="/cart"
                    className={secondaryActionClassName}
                    aria-disabled={submitting}
                    onClick={preventNavigationWhileSubmitting}
                  >
                    Edit cart <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                {loading ? (
                  <p className="py-6 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]" role="status">
                    Loading your order items…
                  </p>
                ) : (
                  <ul className="mt-[22px] grid gap-3.5">
                    {reviewItems.map((item) => renderCheckoutReviewItem(item, currency))}
                  </ul>
                )}
                <CartTotal checkoutView subtotal={selectedSubtotal} />
                <div className="mt-7 rounded-[7px] bg-[var(--pamo-color-surface-subtle)] p-4">
                  <p className={eyebrowClassName}>Order check</p>
                  <p className="mt-2.5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                    Sizes and quantities are checked again when the order is
                    submitted.
                  </p>
                </div>
                {unavailable && (
                  <p className={`${errorTextClassName} mt-5`}>
                    Review product availability, sizes and quantities in your
                    cart. If you recently submitted an order, check My Orders
                    before trying again.{" "}
                    <Link className="inline-flex min-h-11 items-center font-medium" to="/orders">Check My Orders.</Link>
                  </p>
                )}
              </section>
              <div className={`${groupedPanelClassName} mt-5 border-t border-[color:var(--pamo-color-border-default)] pt-5 md:mt-7 md:border-0 md:pt-0`}>
                <button
                  type="submit"
                  className={`${brandActionClassName} min-h-[55px] w-full`}
                  disabled={cannotSubmit}
                  aria-busy={submitting}
                >
                  {submitLabel}{" "}
                  {!submitting && <ArrowRight size={18} aria-hidden="true" />}
                </button>
                {submitting && (
                  <p role="status" className="mt-[18px] text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                    Please wait. Your order request is being processed.
                  </p>
                )}
                {submissionError && (
                  <div className="mt-5 rounded-[7px] border border-[color:var(--pamo-color-border-input)] p-4 text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-primary)]" role="alert">
                    <p>{submissionError}</p>
                    {pricesChanged && (
                      <p className="mt-2.5 text-[color:var(--pamo-color-accent-text)]">
                        Updated prices are now shown above. Review them, then place your order again.
                      </p>
                    )}
                    {!pricesChanged && (
                      <Link className="mt-2.5 inline-flex min-h-11 flex-wrap items-center gap-2 text-[color:var(--pamo-color-accent-text)]" to="/orders">
                        Check My Orders before retrying{" "}
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                )}
                <p className="mt-[18px] text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                  Review your student information, items, and payment arrangement before confirming.
                </p>
                <p className="mt-[18px] text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                  Pay as you claim continues to My Orders after submission.
                  Online methods continue to Stripe TEST or PayPal SANDBOX when configured.
                </p>
              </div>
            </aside>
            {!submitting && (
              <aside
                className="checkout-mobile-review fixed inset-x-0 bottom-0 z-20 border-t border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-[19px] pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(2,6,23,0.12)] min-[960px]:hidden"
                aria-label="Mobile order review shortcut"
              >
                <div className="mx-auto flex w-full max-w-[var(--pamo-layout-max)] items-center gap-3">
                  <p className="min-w-0 flex-1 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]">
                    {unitCount} {unitLabel} to review
                  </p>
                  <a
                    className={`${brandActionClassName} min-h-12 shrink-0 px-5`}
                    href="#checkout-review-heading"
                  >
                    Review order
                    <ArrowRight size={18} aria-hidden="true" />
                  </a>
                </div>
              </aside>
            )}
          </form>
        )}
        <section
          className="my-8 flex flex-wrap items-center justify-between gap-6 rounded-[7px] bg-[var(--pamo-color-surface-navy)] px-[18px] py-[22px] md:my-10 md:mb-16 min-[1180px]:mt-[42px]"
          aria-labelledby="checkout-support-heading"
        >
          <div className="flex-[1_1_260px] border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4">
            <h2 id="checkout-support-heading" className="text-base font-semibold leading-[1.45] !text-white">
              Need assistance with your order?
            </h2>
            <p className="mt-2.5 text-[13px] leading-[1.6] text-slate-400">
              Review your cart or contact STI College Carmona before confirming.
            </p>
          </div>
          <Link to="/contact" className={secondaryActionClassName}>
            Contact support <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </section>
  );
};

export default PlaceOrder;
