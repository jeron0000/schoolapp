import { useContext, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
import { phpItemsTotal, sumPhp, tryPhpLineTotal } from '../../../shared/money.js';
import { createProductLookup } from '../../../shared/productLookup.js';
import axios from "axios";
import { toast } from "react-toastify";
import "../components/StorefrontFoundation.css";
import "./PlaceOrder.css";

const contactFields = [
  ["firstName", "First name", "text", "given-name"],
  ["lastName", "Last name", "text", "family-name"],
  ["email", "Email address", "email", "email"],
  ["phone", "Mobile number", "number", "tel"],
];
const addressFields = [
  ["street", "Street address", "text", "street-address"],
  ["city", "City", "text", "address-level2"],
  ["state", "State / Province", "text", "address-level1"],
  ["zipcode", "Zipcode", "number", "postal-code"],
  ["country", "Country", "text", "country-name"],
];
const paymentMethods = [
  ["cod", "Pay as you claim", "Pay through the school claiming process."],
  ["stripe", "Stripe · Card", "Temporarily unavailable."],
  ["paypal", "PayPal", "Temporarily unavailable."],
];
const validationError = (input) => {
  const label =
    [...contactFields, ...addressFields].find(
      ([name]) => name === input.name,
    )?.[1] || "field";
  if (input.validity.valueMissing)
    return "Enter your " + label.toLowerCase() + ".";
  if (input.name === "email") return "Enter a valid email address.";
  return "Enter a valid " + label.toLowerCase() + ".";
};

const PlaceOrder = () => {
  const [method, setMethod] = useState("cod");
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
  } = useContext(ShopContext);
  const findProduct = useMemo(() => createProductLookup(products), [products]);
  const pending = useRef(false);
  const checkoutRequest = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submissionError, setSubmissionError] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    street: "",
    city: "",
    state: "",
    zipcode: "",
    country: "",
    phone: "",
  });

  const onChangeHandler = (event) => {
    const name = event.target.name;
    const value = event.target.value;

    setFormData((data) => ({ ...data, [name]: value }));
    if (fieldErrors[name])
      setFieldErrors((previous) => ({
        ...previous,
        [name]: event.target.validity.valid
          ? ""
          : validationError(event.target),
      }));
  };

  const reportSubmissionError = (message) => {
    const text =
      message ||
      "Order submission could not be confirmed. Check My Orders before trying again.";
    setSubmissionError(text);
    toast.error(text);
  };

  const onInvalidHandler = (event) => {
    event.preventDefault();
    setFieldErrors((previous) => ({
      ...previous,
      [event.target.name]: validationError(event.target),
    }));
    event.target.form.querySelector("input[required]:invalid")?.focus();
  };

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    if (method !== "cod") {
      reportSubmissionError(
        "Online payments are temporarily unavailable. Please use Pay as you claim.",
      );
      return;
    }
    setSubmissionError("");
    let cartCheckout;
    try {
      cartCheckout = beginCartCheckout?.();
    } catch (error) {
      reportSubmissionError(error.message);
      return;
    }
    pending.current = true;
    setSubmitting(true);
    try {
      let orderItems = [];
      const checkoutItems = cartCheckout?.snapshot?.cartData || cartItems;

      for (const items in checkoutItems) {
        for (const item in checkoutItems[items]) {
          if (checkoutItems[items][item] > 0) {
            const itemInfo = structuredClone(
              findProduct(items),
            );
            if (!itemInfo)
              throw new Error(
                "A product is no longer available. Review your cart.",
              );
            if (itemInfo) {
              itemInfo.size = item;
              itemInfo.quantity = checkoutItems[items][item];
              orderItems.push(itemInfo);
            }
          }
        }
      }

      if (!orderItems.length) throw new Error("Your cart is empty.");
      const signature = JSON.stringify({
        items: orderItems.map((item) => [item._id, item.size, item.quantity]),
        method,
        address: formData,
        checkoutCart: cartCheckout?.snapshot,
      });
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(signature),
      );
      if (cartCheckout && !cartCheckout.isCurrent()) return;
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
      if (checkoutRequest.current?.fingerprint !== fingerprint)
        checkoutRequest.current = {
          fingerprint,
          requestId: crypto.randomUUID(),
        };
      try {
        sessionStorage.setItem(
          "pamo-checkout-request",
          JSON.stringify(checkoutRequest.current),
        );
      } catch {
        /* Keep the current request in memory. */
      }

      let orderData = {
        address: formData,
        items: orderItems,
        amount: sumPhp(phpItemsTotal(orderItems), delivery_fee),
        requestId: checkoutRequest.current.requestId,
        checkoutCart: cartCheckout?.snapshot,
      };

      const response = await axios.post(
        backendUrl + "/api/order/place",
        orderData,
        { headers: { token } },
      );
      if (cartCheckout && !cartCheckout.isCurrent()) return;
      if (response.data.success) {
        await cartCheckout?.complete(response.data.cartCleanupPending);
        if (cartCheckout && !cartCheckout.isCurrent()) return;
        checkoutRequest.current = null;
        try {
          sessionStorage.removeItem("pamo-checkout-request");
        } catch {
          /* Optional persistence. */
        }
        navigate("/orders");
      } else {
        reportSubmissionError(response.data.message);
      }
    } catch (error) {
      if (cartCheckout && !cartCheckout.isCurrent()) return;
      reportSubmissionError(
        error.response?.data?.message ||
          "Order submission could not be confirmed. Check My Orders before trying again.",
      );
    } finally {
      cartCheckout?.finish();
      try {
        await getProductsData();
      } finally {
        pending.current = false;
        setSubmitting(false);
      }
    }
  };

  // Presentation reads the same full cart used by the existing submission handler.
  const reviewItems = Object.entries(cartItems).flatMap(([id, sizes]) =>
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
    submitting || loading || !reviewItems.length || Boolean(productError);
  const field = ([name, label, type, autoComplete]) => (
    <div
      key={name}
      className={
        "checkout-field" + (name === "street" ? " checkout-field-wide" : "")
      }
    >
      <label htmlFor={"checkout-" + name}>
        {label} <span aria-hidden="true">*</span>
      </label>
      <input
        id={"checkout-" + name}
        required
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={formData[name]}
        onChange={onChangeHandler}
        disabled={submitting}
        placeholder={label}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={
          fieldErrors[name] ? "checkout-" + name + "-error" : undefined
        }
      />
      {fieldErrors[name] && (
        <span
          className="checkout-field-error"
          id={"checkout-" + name + "-error"}
        >
          {fieldErrors[name]}
        </span>
      )}
    </div>
  );

  return (
    <section className="checkout-page">
      <div className="checkout-container">
        <header className="checkout-header">
          <p className="checkout-eyebrow">Complete your order</p>
          <h1>Checkout</h1>
          <p>
            Enter your contact details, review the items, and choose how to pay.
          </p>
          <div className="checkout-progress">
            <nav aria-label="Checkout progress">
              <ol>
                <li>
                  <Link to="/cart">
                    <span className="checkout-step-number" aria-hidden="true">
                      01
                    </span>
                    Cart
                  </Link>
                  <ChevronRight size={16} aria-hidden="true" />
                </li>
                <li aria-current="step">
                  <span>
                    <span className="checkout-step-number" aria-hidden="true">
                      02
                    </span>
                    Checkout
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </li>
                <li>
                  <span>
                    <span className="checkout-step-number" aria-hidden="true">
                      03
                    </span>
                    Confirmation
                  </span>
                </li>
              </ol>
            </nav>
            <p>Confirmation and order updates appear in My Orders.</p>
          </div>
        </header>
        {productError && (
          <div className="checkout-request-error" role="alert">
            <p>
              Product availability could not be refreshed. Please try again
              before placing your order.
            </p>
            <button
              type="button"
              className="btn-secondary checkout-action"
              disabled={submitting}
              onClick={getProductsData}
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !reviewItems.length ? (
          <div className="checkout-empty">
            <ShoppingBag size={36} strokeWidth={1.75} aria-hidden="true" />
            <h2>Your cart is empty</h2>
            <p>Choose your school essentials and a size before checkout.</p>
            <Link
              to="/collection"
              className="btn-primary checkout-action checkout-brand-action"
            >
              Browse collection <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <form
            className="checkout-form"
            onSubmit={onSubmitHandler}
            onInvalid={onInvalidHandler}
            aria-busy={submitting}
          >
            <div className="checkout-form-main">
              <div className="checkout-details-card">
                <section
                  className="checkout-contact"
                  aria-labelledby="checkout-contact-heading"
                >
                  <h2
                    id="checkout-contact-heading"
                    className="checkout-marked-heading"
                  >
                    Your contact details
                  </h2>
                  <p className="checkout-section-intro">
                    For order updates and school coordination. All fields are
                    required.
                  </p>
                  {Object.values(fieldErrors).some(Boolean) && (
                    <p className="checkout-validation-summary" role="alert">
                      Check the highlighted fields before continuing.
                    </p>
                  )}
                  <div className="checkout-fields">
                    {contactFields.map(field)}
                  </div>
                  <fieldset className="checkout-address">
                    <legend>Required address details</legend>
                    <p>Complete your address to place the order.</p>
                    <div className="checkout-fields">
                      {addressFields.map(field)}
                    </div>
                  </fieldset>
                </section>
                <section
                  className="checkout-fulfillment"
                  aria-labelledby="checkout-fulfillment-heading"
                >
                  <h2
                    id="checkout-fulfillment-heading"
                    className="checkout-eyebrow"
                  >
                    Order fulfillment
                  </h2>
                  <div className="checkout-pickup">
                    <CheckCircle2 size={20} aria-hidden="true" />
                    <div>
                      <h3>Campus collection</h3>
                      <p>
                        Follow the school approval and claiming process. Check
                        My Orders for payment and release updates.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
              <section
                className="checkout-payment"
                aria-labelledby="checkout-payment-heading"
              >
                <h2 id="checkout-payment-heading">Payment method</h2>
                <p className="checkout-section-intro">
                  Select one method to continue.
                </p>
                <fieldset>
                  <legend className="sr-only">Choose a payment method</legend>
                  {paymentMethods.map(([value, label, copy]) => (
                    <label
                      key={value}
                      className={
                        "checkout-payment-option" +
                        (method === value ? " is-selected" : "")
                      }
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        value={value}
                        checked={method === value}
                        disabled={submitting || value !== "cod"}
                        onChange={() => {
                          if (value === "cod") setMethod(value);
                        }}
                      />
                      <span>
                        <strong>{label}</strong>
                        <span>{copy}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <p className="checkout-provider-note">
                  Online payments are temporarily unavailable. If you already
                  paid online, contact PAMO before retrying.
                </p>
              </section>
            </div>
            <aside
              className="checkout-review-column"
              aria-label="Final order review"
            >
              <section
                className="checkout-review"
                aria-labelledby="checkout-review-heading"
              >
                <h2
                  id="checkout-review-heading"
                  className="checkout-marked-heading"
                >
                  Order review
                </h2>
                <div className="checkout-review-heading">
                  <p>
                    {reviewItems.length}{" "}
                    {reviewItems.length === 1
                      ? "product variant"
                      : "product variants"}{" "}
                    · {unitCount} total {unitCount === 1 ? "unit" : "units"}
                  </p>
                  <Link
                    to="/cart"
                    className="btn-secondary checkout-action"
                    aria-disabled={submitting}
                    onClick={(event) => {
                      if (submitting) event.preventDefault();
                    }}
                  >
                    Edit cart <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                {loading ? (
                  <p className="checkout-loading" role="status">
                    Loading your order items…
                  </p>
                ) : (
                  <ul className="checkout-review-items">
                    {reviewItems.map((item) => (
                      <li key={JSON.stringify([item.id, item.size])}>
                        <div className="checkout-product-image">
                          <CheckoutImage
                            key={item.product?.image?.[0] || "missing"}
                            src={item.product?.image?.[0]}
                            name={item.product?.name || "Product unavailable"}
                          />
                        </div>
                        <div className="checkout-product-copy">
                          <h3>
                            {item.product ? (
                              <Link to={"/product/" + item.id}>
                                {item.product.name}
                              </Link>
                            ) : (
                              "Product unavailable"
                            )}
                          </h3>
                          <p>
                            Size {item.size} · Qty {item.quantity}
                          </p>
                          <p>
                            Unit price ·{" "}
                            {item.product
                              ? formatMoney(item.product.price, currency)
                              : "Unavailable"}
                          </p>
                          <strong>
                            Line total ·{" "}
                            {item.product
                              ? formatMoney(
                                  tryPhpLineTotal(item.product.price, item.quantity),
                                  currency,
                                )
                              : "Unavailable"}
                          </strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <CartTotal checkoutView />
                <div className="checkout-order-check">
                  <p className="checkout-eyebrow">Order check</p>
                  <p>
                    Sizes and quantities are checked again when the order is
                    submitted.
                  </p>
                </div>
                {unavailable && (
                  <p className="checkout-stock-error">
                    Review product availability, sizes and quantities in your
                    cart. If you recently submitted an order, check My Orders
                    before trying again.{" "}
                    <Link to="/orders">Check My Orders.</Link>
                  </p>
                )}
              </section>
              <div className="checkout-submit-panel">
                <button
                  type="submit"
                  className="btn-primary checkout-action checkout-brand-action checkout-submit"
                  disabled={cannotSubmit}
                  aria-busy={submitting}
                >
                  {submitting ? "Placing your order…" : "Place order"}{" "}
                  {!submitting && <ArrowRight size={18} aria-hidden="true" />}
                </button>
                {submitting && (
                  <p role="status" className="checkout-submission-status">
                    Please wait. Your order request is being processed.
                  </p>
                )}
                {submissionError && (
                  <div className="checkout-submission-error" role="alert">
                    <p>{submissionError}</p>
                    <Link to="/orders">
                      Check My Orders before retrying{" "}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                )}
                <p className="checkout-submit-note">
                  Review your contact and payment details before confirming.
                </p>
                <p className="checkout-submit-note">
                  Pay as you claim continues to My Orders after submission.
                  Online payments are temporarily unavailable.
                </p>
              </div>
            </aside>
          </form>
        )}
        <section
          className="checkout-support"
          aria-labelledby="checkout-support-heading"
        >
          <div>
            <h2 id="checkout-support-heading">
              Need assistance with your order?
            </h2>
            <p>
              Review your cart or contact STI College Carmona before confirming.
            </p>
          </div>
          <Link to="/contact" className="btn-secondary checkout-action">
            Contact support <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </section>
  );
};

export default PlaceOrder;
