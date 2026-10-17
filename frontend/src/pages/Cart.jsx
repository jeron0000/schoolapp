import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { ShopContext } from "../context/shopContext";
import CartTotal from "../components/CartTotal";
import CartImage from "../components/ImageWithFallback";
import { getSizeStock } from "../../../shared/inventory";
import "../components/StorefrontFoundation.css";
import "./Cart.css";
import { formatPhp, tryPhpLineTotal } from '../../../shared/money.js';
import { createProductLookup } from '../../../shared/productLookup.js';

const itemKey = (item) => JSON.stringify([item._id, item.size]);
const money = (currency, amount) =>
  formatPhp(amount);

const CartItem = ({
  item,
  currency,
  managing,
  selected,
  onSelection,
  onQuantity,
  onRemove,
  disabled,
}) => {
  const product = item.product;
  const stock = getSizeStock(product, item.size);
  const validQuantity =
    Number.isSafeInteger(item.quantity) && item.quantity >= 1;
  const unavailable = !product || !validQuantity || item.quantity > stock;
  const name = product?.name || "Product unavailable";
  return (
    <article className={"cart-item" + (managing ? " is-managing" : "")}>
      {managing && (
        <label className="cart-item-selection">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelection}
            disabled={disabled}
            aria-label={`Select ${name}, size ${item.size}, for removal`}
          />
        </label>
      )}
      <div className="cart-item-photo">
        <CartImage
          key={product?.image?.[0] || "missing"}
          src={product?.image?.[0]}
          name={name}
        />
      </div>
      <div className="cart-item-copy">
        <h3>
          {product ? <Link to={`/product/${item._id}`}>{name}</Link> : name}
        </h3>
        <p className="cart-unit-price">
          Unit price ·{" "}
          {product ? money(currency, Number(product.price)) : "Unavailable"}
        </p>
        <div
          className={"cart-item-stock" + (unavailable ? " is-unavailable" : "")}
        >
          <p>Size {item.size}</p>
          <strong>
            {product
              ? `${stock} available in this size`
              : "This product is no longer available."}
          </strong>
          {unavailable && product && (
            <span>
              {!validQuantity
                ? "Enter a valid quantity."
                : "Reduce the quantity or remove this item before checkout."}
            </span>
          )}
        </div>
      </div>
      <div className="cart-item-purchase">
        <div className="cart-item-quantity">
          <p className="cart-label">Quantity</p>
          <div className="cart-quantity-stepper">
            <button
              type="button"
              disabled={disabled || !validQuantity || item.quantity <= 1}
              onClick={() => onQuantity(item.quantity - 1)}
              aria-label={`Decrease quantity for ${name}, size ${item.size}`}
            >
              <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <input
              type="number"
              min={1}
              max={stock}
              step={1}
              value={validQuantity ? item.quantity : ""}
              disabled={disabled || stock === 0}
              onChange={(event) => onQuantity(Number(event.target.value))}
              aria-label={`Quantity for ${name}, size ${item.size}`}
            />
            <button
              type="button"
              disabled={disabled || !validQuantity || item.quantity >= stock}
              onClick={() => onQuantity(item.quantity + 1)}
              aria-label={`Increase quantity for ${name}, size ${item.size}`}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="cart-item-total">
          <p className="cart-label">Line total</p>
          <strong>
            {product
              ? money(currency, tryPhpLineTotal(product.price, item.quantity))
              : "Unavailable"}
          </strong>
        </div>
      </div>
      <button
        type="button"
        className="btn-secondary cart-action cart-item-remove"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${name}, size ${item.size}`}
      >
        Remove<span className="cart-remove-mobile"> item</span>
      </button>
    </article>
  );
};

const ClearCartDialog = ({
  count,
  busy,
  feedback,
  onClose,
  onConfirm,
  fallbackFocusRef,
}) => {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const fallbackFocus = fallbackFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    cancelRef.current.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length)
        previousFocus.focus();
      else fallbackFocus?.focus();
    };
  }, [fallbackFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className="cart-clear-dialog"
      aria-labelledby="cart-clear-title"
      aria-describedby="cart-clear-description"
      aria-modal="true"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <p className="cart-eyebrow">Clear cart</p>
      <h2 id="cart-clear-title">Remove everything from your cart?</h2>
      <p id="cart-clear-description">
        This removes all {count}{" "}
        {count === 1 ? "product variant" : "product variants"} from your cart.
        You can add items again from the collection.
      </p>
      {feedback && (
        <p className="cart-feedback" role="alert">
          {feedback}
        </p>
      )}
      <div className="cart-dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn-secondary cart-action"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-secondary cart-action cart-danger"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Clearing…" : "Clear all items"}
        </button>
      </div>
    </dialog>
  );
};

const Cart = () => {
  const {
    products,
    currency,
    cartItems,
    updateQuantity,
    getProductsData,
    productsLoading,
    productError,
    cartReady = true,
    cartError,
    reloadCart,
  } = useContext(ShopContext);
  const findProduct = useMemo(() => createProductLookup(products), [products]);
  useEffect(() => {
    getProductsData();
  }, [getProductsData]);
  const [managing, setManaging] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [operation, setOperation] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const pending = useRef(false);
  const latestUpdateQuantity = useRef(updateQuantity);
  const headingRef = useRef(null);
  useEffect(() => {
    latestUpdateQuantity.current = updateQuantity;
  }, [updateQuantity]);

  // Cart quantities remain owned solely by ShopContext; selection is removal-only.
  const cartData = Object.entries(cartItems).flatMap(([id, sizes]) =>
    Object.entries(sizes || {})
      .filter(([, quantity]) => quantity > 0)
      .map(([size, quantity]) => ({
        _id: id,
        size,
        quantity,
        product: findProduct(id),
      })),
  );
  const selectedItems = cartData.filter((item) =>
    selectedKeys.has(itemKey(item)),
  );
  const allSelected =
    cartData.length > 0 && selectedItems.length === cartData.length;
  const unitCount = cartData.reduce((total, item) => total + item.quantity, 0);
  const busy = Boolean(operation);
  const invalidItems = cartData.some(
    (item) =>
      !item.product ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > getSizeStock(item.product, item.size),
  );
  const loading = productsLoading && products.length === 0;
  const closeClear = useCallback(() => setClearOpen(false), []);

  const toggleSelection = (item) =>
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      const key = itemKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const changeQuantity = async (item, quantity) => {
    if (pending.current) return;
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > getSizeStock(item.product, item.size)
    ) {
      setFeedback(
        "Enter a whole quantity of at least 1, within the available stock for this size.",
      );
      return;
    }
    pending.current = true;
    setOperation("quantity");
    setFeedback("");
    try {
      await latestUpdateQuantity.current(item._id, item.size, quantity);
    } catch {
      setFeedback("Could not update your cart. Please try again.");
    } finally {
      pending.current = false;
      setOperation(null);
    }
  };

  const removeItems = async (items) => {
    if (pending.current || !items.length) return false;
    pending.current = true;
    setOperation("removal");
    setFeedback("");
    try {
      for (const item of items) {
        await latestUpdateQuantity.current(item._id, item.size, 0);
        // Preserve the existing sequential removal pattern: let optimistic state commit.
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      setSelectedKeys(new Set());
      return true;
    } catch {
      setFeedback("Could not finish removing these items. Please try again.");
      return false;
    } finally {
      pending.current = false;
      setOperation(null);
    }
  };

  return (
    <section className="cart-page">
      <div className="cart-container">
        <header className="cart-header">
          <p className="cart-eyebrow">Check your essentials</p>
          <div className="cart-heading-row">
            <h1 ref={headingRef} tabIndex={-1}>
              Your <span>cart</span>
            </h1>
            <nav aria-label="Breadcrumb">
              <ol>
                <li>
                  <Link to="/">Home</Link>
                </li>
                <li>
                  <ChevronRight size={14} aria-hidden="true" />
                  <span aria-current="page">Cart</span>
                </li>
              </ol>
            </nav>
          </div>
          <p className="cart-introduction">
            Review your sizes, quantities and order total before checkout.
          </p>
        </header>
        {productError && (
          <div className="cart-request-error" role="alert">
            <p>
              Product availability could not be refreshed. Please try again
              before checkout.
            </p>
            <button
              type="button"
              className="btn-secondary cart-action"
              onClick={getProductsData}
              disabled={busy}
            >
              Try again
            </button>
          </div>
        )}
        {cartError && (
          <div className="cart-request-error" role="alert">
            <p>{cartError}</p>
            <button type="button" className="btn-secondary cart-action" onClick={reloadCart} disabled={busy}>
              Reload cart
            </button>
          </div>
        )}
        {!clearOpen && feedback && (
          <p className="cart-feedback" role="alert">
            {feedback}
          </p>
        )}
        {loading ? (
          <div className="cart-empty" role="status">
            Loading your cart products…
          </div>
        ) : !cartData.length ? (
          <div className="cart-empty">
            <span className="cart-empty-icon" aria-hidden="true">
              <ShoppingBag size={32} strokeWidth={1.75} />
            </span>
            <h2>{cartError ? "Your cart needs attention" : !cartReady ? "Loading your saved cart" : "Your cart is empty"}</h2>
            <p>Browse the collection and choose a size to get started.</p>
            <Link
              to="/collection"
              className="btn-primary cart-action cart-brand-action"
            >
              Browse collection{" "}
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items-column">
              <section
                className="cart-items-panel"
                aria-labelledby="cart-items-heading"
              >
                <div className="cart-items-heading">
                  <div>
                    <h2 id="cart-items-heading">In your cart</h2>
                    <p>
                      {cartData.length}{" "}
                      {cartData.length === 1
                        ? "product variant"
                        : "product variants"}{" "}
                      · {unitCount} total {unitCount === 1 ? "unit" : "units"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary cart-action"
                    aria-pressed={managing}
                    disabled={busy}
                    onClick={() => {
                      setManaging((value) => !value);
                      setSelectedKeys(new Set());
                    }}
                  >
                    {managing ? "Done" : "Manage items"}
                  </button>
                </div>
                {managing && (
                  <div
                    className="cart-management"
                    aria-label="Select items for removal"
                  >
                    <p>
                      Selection is for removal only. Checkout includes every
                      remaining cart item.
                    </p>
                    <div>
                      <label className="cart-select-all">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(element) => {
                            if (element)
                              element.indeterminate =
                                selectedItems.length > 0 && !allSelected;
                          }}
                          disabled={busy}
                          onChange={() =>
                            setSelectedKeys(
                              allSelected
                                ? new Set()
                                : new Set(cartData.map(itemKey)),
                            )
                          }
                        />
                        Select all ({cartData.length})
                      </label>
                      <button
                        type="button"
                        className="btn-secondary cart-action cart-danger"
                        disabled={busy || !selectedItems.length}
                        onClick={() => removeItems(selectedItems)}
                      >
                        Remove selected ({selectedItems.length})
                      </button>
                    </div>
                  </div>
                )}
                <div className="cart-item-list" aria-busy={busy}>
                  {cartData.map((item) => (
                    <CartItem
                      key={itemKey(item)}
                      item={item}
                      currency={currency}
                      managing={managing}
                      selected={selectedKeys.has(itemKey(item))}
                      onSelection={() => toggleSelection(item)}
                      onQuantity={(quantity) => changeQuantity(item, quantity)}
                      onRemove={() => removeItems([item])}
                      disabled={busy}
                    />
                  ))}
                </div>
                {busy && (
                  <p className="cart-progress" role="status">
                    {operation === "quantity"
                      ? "Updating quantity…"
                      : "Removing items…"}
                  </p>
                )}
                <div className="cart-items-actions">
                  <button
                    type="button"
                    className="btn-secondary cart-action"
                    disabled={busy}
                    onClick={() => {
                      setFeedback("");
                      setClearOpen(true);
                    }}
                  >
                    Clear cart
                  </button>
                  <Link to="/collection" className="btn-secondary cart-action">
                    <ArrowLeft
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Continue shopping
                  </Link>
                </div>
              </section>
              <p className="cart-order-note">
                Cart changes do not reserve stock. Availability is confirmed
                when your order is created.
              </p>
            </div>
            <aside className="cart-sidebar" aria-label="Order review">
              <CartTotal
                cartView
                itemCount={cartData.length}
                unitCount={unitCount}
              >
                <Link
                  to="/place-order"
                  className={
                    "btn-primary cart-action cart-brand-action cart-checkout" +
                    (busy || !cartReady || invalidItems || productError ? " is-disabled" : "")
                  }
                  aria-disabled={busy || !cartReady || invalidItems || Boolean(productError)}
                  onClick={(event) => {
                    if (busy || !cartReady || invalidItems || productError)
                      event.preventDefault();
                  }}
                >
                  Proceed to checkout{" "}
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </Link>
                {invalidItems ? (
                  <p className="cart-checkout-note">
                    Review unavailable items or quantities before checkout.
                    Every remaining cart item must be available.
                  </p>
                ) : (
                  <p className="cart-checkout-note">
                    Checkout includes every item currently in your cart.
                  </p>
                )}
              </CartTotal>
              <section
                className="cart-support"
                aria-labelledby="cart-support-heading"
              >
                <p className="cart-eyebrow">Before you check out</p>
                <h2 id="cart-support-heading">Need to double-check a size?</h2>
                <p>
                  Review product details and size availability in the
                  collection.
                </p>
                <Link to="/collection">
                  Browse collection <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link to="/contact">
                  Contact support <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </section>
            </aside>
          </div>
        )}
        {clearOpen && (
          <ClearCartDialog
            count={cartData.length}
            busy={busy}
            feedback={feedback}
            onClose={closeClear}
            onConfirm={async () => {
              if (await removeItems(cartData)) closeClear();
            }}
            fallbackFocusRef={headingRef}
          />
        )}
      </div>
    </section>
  );
};

export default Cart;
