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
import { formatPhp, phpItemsTotal, tryPhpLineTotal } from '../../../shared/money.js';
import { createProductLookup } from '../../../shared/productLookup.js';
import {
  cartSelectionKey,
  persistCartSelection,
  readCartSelection,
  reconcileCartSelection,
} from '../utils/cartSelection.js';

const itemKey = item => cartSelectionKey(item._id, item.size);

const cartContainerClassName = [
  "mx-auto w-[calc(100%-38px)] max-w-[var(--pamo-layout-max)]",
  "md:w-[calc(100%-60px)] min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))]",
].join(" ");
const surfaceClassName =
  "border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]";
const eyebrowClassName =
  "text-xs font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-accent-text)]";
const actionClassName = [
  "inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-2",
  "rounded-[7px] px-4 py-2.5 text-[13px] font-medium leading-[1.5]",
  "disabled:cursor-not-allowed disabled:opacity-[0.65]",
].join(" ");
const secondaryActionClassName = [
  "btn-secondary",
  actionClassName,
  "border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]",
  "text-[color:var(--pamo-color-text-primary)] dark:border-[color:var(--pamo-color-border-input)]",
  "dark:bg-[var(--pamo-color-surface-default)] dark:text-[color:var(--pamo-color-text-primary)]",
  "[&:not(:disabled):hover]:border-[color:var(--pamo-color-accent-text)]",
].join(" ");
const brandActionClassName = [
  "btn-primary",
  actionClassName,
  "bg-[var(--pamo-color-brand-yellow)] font-semibold text-slate-950",
  "hover:bg-[var(--pamo-color-brand-hover)] active:bg-[var(--pamo-color-brand-pressed)]",
].join(" ");
const dangerActionClassName = [
  secondaryActionClassName,
  "border-[color:var(--pamo-color-error-text)] text-[color:var(--pamo-color-error-text)]",
  "dark:border-[color:var(--pamo-color-error-text)] dark:text-[color:var(--pamo-color-error-text)]",
].join(" ");
const cartItemClassName = [
  "grid min-w-0 items-start gap-x-3.5 gap-y-[18px] rounded-lg border p-3.5",
  "grid-cols-[104px_minmax(0,1fr)] [grid-template-areas:'photo_copy'_'purchase_purchase'_'remove_remove']",
  "border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)]",
  "max-[359px]:grid-cols-[72px_minmax(0,1fr)] max-[359px]:gap-x-2.5 max-[359px]:gap-y-4 max-[359px]:px-2.5 max-[359px]:py-3",
  "md:grid-cols-[124px_minmax(0,1fr)_minmax(120px,160px)] md:gap-x-5 md:gap-y-4 md:p-[18px]",
  "md:[grid-template-areas:'photo_copy_remove'_'photo_purchase_purchase']",
  "min-[1180px]:grid-cols-[136px_minmax(0,1fr)_minmax(116px,180px)]",
].join(" ");
const managingCartItemClassName = [
  "[grid-template-areas:'selection_selection'_'photo_copy'_'purchase_purchase'_'remove_remove']",
  "md:grid-cols-[44px_104px_minmax(0,1fr)_minmax(120px,140px)]",
  "md:[grid-template-areas:'selection_photo_copy_remove'_'selection_photo_purchase_purchase']",
  "min-[1180px]:grid-cols-[44px_112px_minmax(0,1fr)_116px]",
].join(" ");
const checkboxClassName =
  "h-[18px] w-[18px] shrink-0 accent-[var(--pamo-color-brand-yellow)]";
const itemPhotoClassName = [
  "flex aspect-[110/148] w-full items-center justify-center overflow-hidden rounded-md",
  "bg-[var(--pamo-color-surface-default)] p-2 [grid-area:photo] md:max-h-[180px]",
].join(" ");
const stockPanelClassName =
  "mt-3.5 rounded-md bg-[var(--pamo-color-surface-default)] px-3 py-2.5 max-[359px]:p-2";
const quantityStepperClassName = [
  "inline-flex max-w-full rounded-[7px] border",
  "border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]",
].join(" ");
const stepperButtonClassName =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md enabled:hover:bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50";
const emptyStateClassName = [
  surfaceClassName,
  "my-7 mb-16 flex flex-col items-center gap-5 rounded-[10px] px-5 py-12 text-center",
  "md:mb-20",
].join(" ");

const CartItem = ({
  item,
  managing,
  selected,
  checkoutSelected,
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
  const unitPrice = product ? formatPhp(Number(product.price)) : "Unavailable";
  const stockMessage = product
    ? `${stock} available in this size`
    : "This product is no longer available.";
  const quantityFeedback = validQuantity
    ? "Reduce the quantity or remove this item before checkout."
    : "Enter a valid quantity.";
  const lineTotal = product
    ? formatPhp(tryPhpLineTotal(product.price, item.quantity))
    : "Unavailable";
  return (
    <article className={`${cartItemClassName} ${managingCartItemClassName} ${checkoutSelected && !managing ? "border-[color:var(--pamo-color-brand-yellow)]" : ""}`}>
      <label className="flex min-h-11 w-11 cursor-pointer items-center justify-center [grid-area:selection] md:self-center">
        <input
          className={checkboxClassName}
          type="checkbox"
          checked={selected}
          onChange={onSelection}
          disabled={disabled}
          aria-label={managing
            ? `Select ${name}, size ${item.size}, for removal`
            : `Select ${name}, size ${item.size}, for checkout`}
        />
      </label>
      <div className={itemPhotoClassName}>
        <CartImage
          key={product?.image?.[0] || "missing"}
          src={product?.image?.[0]}
          name={name}
        />
      </div>
      <div className="min-w-0 [grid-area:copy]">
        <h3 className="text-[15px] font-semibold leading-[1.4] md:text-[17px] min-[1180px]:text-lg">
          {product ? <Link className="inline-flex min-h-11 items-center" to={`/product/${item._id}`}>{name}</Link> : name}
        </h3>
        <p className="mt-2 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
          Unit price · {unitPrice}
        </p>
        <div
          className={stockPanelClassName}
        >
          <p className="text-xs font-semibold uppercase leading-[1.5]">Size {item.size}</p>
          {product?.optionLabel && <p className='mt-1 text-xs'>Item · {product.optionLabel}</p>}
          {!product?.optionLabel && product?.colorLabel && <p className='mt-1 text-xs'>Color · {product.colorLabel}</p>}
          <strong className={`mt-1 block text-xs font-medium leading-[1.5] ${unavailable ? "text-[color:var(--pamo-color-error-text)]" : "text-[color:var(--pamo-color-success-text)]"}`}>
            {stockMessage}
          </strong>
          {unavailable && product && (
            <span className="mt-1.5 block text-xs leading-[1.6] text-[color:var(--pamo-color-error-text)]">
              {quantityFeedback}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4 [grid-area:purchase]">
        <div className="min-w-0 shrink-0 md:flex md:flex-wrap md:items-center md:gap-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-text-secondary)] md:mb-0">Quantity</p>
          <div className={quantityStepperClassName}>
            <button
              className={stepperButtonClassName}
              type="button"
              disabled={disabled || !validQuantity || item.quantity <= 1}
              onClick={() => onQuantity(item.quantity - 1)}
              aria-label={`Decrease quantity for ${name}, size ${item.size}`}
            >
              <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <input
              className="cart-quantity-input min-h-11 w-[46px] min-w-0 flex-[0_0_46px] appearance-none border-x border-[color:var(--pamo-color-border-default)] bg-transparent text-center text-sm"
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
              className={stepperButtonClassName}
              type="button"
              disabled={disabled || !validQuantity || item.quantity >= stock}
              onClick={() => onQuantity(item.quantity + 1)}
              aria-label={`Increase quantity for ${name}, size ${item.size}`}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-[1_1_84px] text-right max-[359px]:text-left">
          <p className="mb-2 text-[11px] font-semibold uppercase leading-[1.5] text-[color:var(--pamo-color-text-secondary)]">Line total</p>
          <strong className="text-[19px] font-semibold leading-[1.4] md:text-[23px]">{lineTotal}</strong>
        </div>
      </div>
      <button
        type="button"
        className={`${secondaryActionClassName} w-full [grid-area:remove] md:w-auto md:min-w-[100px] md:justify-self-end`}
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${name}, size ${item.size}`}
      >
        Remove<span className="md:hidden"> item</span>
      </button>
    </article>
  );
};

const getEmptyCartHeading = (cartError, cartReady) => {
  if (cartError) {
    return "Your cart needs attention";
  }
  if (!cartReady) {
    return "Loading your saved cart";
  }
  return "Your cart is empty";
};

const CartEmptyState = ({ cartError, cartReady }) => (
  <div className={emptyStateClassName}>
    <span className="flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-accent-text)]" aria-hidden="true">
      <ShoppingBag size={32} strokeWidth={1.75} />
    </span>
    <h2 className="text-2xl font-semibold leading-[1.3]">{getEmptyCartHeading(cartError, cartReady)}</h2>
    <p className="max-w-[40ch] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">Browse the collection and choose a size to get started.</p>
    <Link to="/collection" className={brandActionClassName}>
      Browse collection <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  </div>
);

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
      className="cart-clear-dialog m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[560px] overflow-y-auto rounded-[10px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] p-6 text-[color:var(--pamo-color-text-primary)]"
      aria-labelledby="cart-clear-title"
      aria-describedby="cart-clear-description"
      aria-modal="true"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <p className={eyebrowClassName}>Clear cart</p>
      <h2 id="cart-clear-title" className="mt-5 text-2xl font-semibold leading-[1.35]">Remove everything from your cart?</h2>
      <p id="cart-clear-description" className="mt-[22px] text-sm leading-[1.7]">
        This removes all {count}{" "}
        {count === 1 ? "product variant" : "product variants"} from your cart.
        You can add items again from the collection.
      </p>
      {feedback && (
        <p className="mt-[18px] text-sm leading-[1.6] text-[color:var(--pamo-color-error-text)]" role="alert">
          {feedback}
        </p>
      )}
      <div className="mt-7 flex flex-wrap gap-3.5 border-t border-[color:var(--pamo-color-border-default)] pt-6 [&>button]:flex-[1_1_160px]">
        <button
          ref={cancelRef}
          type="button"
          className={secondaryActionClassName}
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className={dangerActionClassName}
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
    cartItems,
    updateQuantity,
    getProductsData,
    productsLoading,
    productError,
    cartReady = true,
    cartError,
    reloadCart,
    userId,
  } = useContext(ShopContext);
  const findProduct = useMemo(() => createProductLookup(products), [products]);
  useEffect(() => {
    getProductsData();
  }, [getProductsData]);
  const [managing, setManaging] = useState(false);
  const [removalKeys, setRemovalKeys] = useState(new Set());
  const [selectionState, setSelectionState] = useState(null);
  const [operation, setOperation] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const pending = useRef(false);
  const latestUpdateQuantity = useRef(updateQuantity);
  const headingRef = useRef(null);
  useEffect(() => {
    latestUpdateQuantity.current = updateQuantity;
  }, [updateQuantity]);

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
  const checkoutSelection = reconcileCartSelection(
    cartItems,
    selectionState?.userId === userId ? selectionState : readCartSelection(userId),
  );
  const checkoutKeys = new Set(checkoutSelection.selected);
  const checkoutItems = cartData.filter(item => checkoutKeys.has(itemKey(item)));
  const removalItems = cartData.filter((item) =>
    removalKeys.has(itemKey(item)),
  );
  const allCheckoutSelected = cartData.length > 0 && checkoutItems.length === cartData.length;
  const allRemovalSelected = cartData.length > 0 && removalItems.length === cartData.length;
  const unitCount = cartData.reduce((total, item) => total + item.quantity, 0);
  const selectedUnitCount = checkoutItems.reduce((total, item) => total + item.quantity, 0);
  const selectedSubtotal = phpItemsTotal(checkoutItems
    .filter(item => item.product)
    .map(item => ({ price: item.product.price, quantity: item.quantity })));
  const busy = Boolean(operation);
  const invalidItems = checkoutItems.some(
    (item) =>
      !item.product ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > getSizeStock(item.product, item.size),
  );
  const loading = productsLoading && products.length === 0;
  const hasItems = cartData.length > 0;
  const checkoutBlocked = busy || !cartReady || !checkoutItems.length || invalidItems || Boolean(productError);
  const checkoutNote = invalidItems
    ? "Review unavailable selected items or quantities before checkout."
    : "Only selected items will be included in checkout.";
  const closeClear = useCallback(() => setClearOpen(false), []);

  useEffect(() => {
    const stored = selectionState?.userId === userId
      ? selectionState
      : readCartSelection(userId);
    persistCartSelection(userId, reconcileCartSelection(cartItems, stored));
  }, [cartItems, selectionState, userId]);

  const toggleManaging = () => {
    setManaging((value) => !value);
    setRemovalKeys(new Set());
  };

  const updateCheckoutSelection = selected => {
    setSelectionState({
      userId,
      known: cartData.map(itemKey),
      selected: [...selected],
    });
  };

  const toggleCheckoutSelectAll = () => {
    updateCheckoutSelection(allCheckoutSelected ? new Set() : new Set(cartData.map(itemKey)));
  };

  const toggleRemovalSelectAll = () => {
    const nextSelection = allRemovalSelected ? new Set() : new Set(cartData.map(itemKey));
    setRemovalKeys(nextSelection);
  };

  const toggleCheckoutSelection = item => {
    const next = new Set(checkoutKeys);
    const key = itemKey(item);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    updateCheckoutSelection(next);
  };

  const toggleRemovalSelection = (item) =>
    setRemovalKeys((previous) => {
      const next = new Set(previous);
      const key = itemKey(item);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
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
      setRemovalKeys(new Set());
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
    <section className="cart-page text-[color:var(--pamo-color-text-primary)]">
      <div className={cartContainerClassName}>
        <header className="border-b border-[color:var(--pamo-color-border-default)] py-7 md:py-9">
          <p className={eyebrowClassName}>Check your essentials</p>
          <div className="mt-[18px] flex flex-wrap items-center justify-between gap-4">
            <h1 className="border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4 text-[30px] font-medium uppercase leading-[1.3] md:text-[34px] min-[1180px]:text-[38px]" ref={headingRef} tabIndex={-1}>
              Your <span className="ml-1.5 font-semibold text-[color:var(--pamo-color-accent-text)]">cart</span>
            </h1>
            <nav className="hidden text-xs text-[color:var(--pamo-color-text-secondary)] min-[1180px]:block" aria-label="Breadcrumb">
              <ol className="flex items-center gap-2.5">
                <li className="flex items-center gap-2.5">
                  <Link className="inline-flex min-h-11 min-w-11 items-center justify-center" to="/">Home</Link>
                </li>
                <li className="flex items-center gap-2.5">
                  <ChevronRight size={14} aria-hidden="true" />
                  <span aria-current="page">Cart</span>
                </li>
              </ol>
            </nav>
          </div>
          <p className="mt-4 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
            Review your sizes, quantities and order total before checkout.
          </p>
        </header>
        {productError && (
          <div className={`${surfaceClassName} mt-6 flex flex-wrap items-center justify-between gap-3.5 rounded-lg p-[18px] text-sm leading-[1.6]`} role="alert">
            <p>
              Product availability could not be refreshed. Please try again
              before checkout.
            </p>
            <button
              type="button"
              className={secondaryActionClassName}
              onClick={getProductsData}
              disabled={busy}
            >
              Try again
            </button>
          </div>
        )}
        {cartError && (
          <div className={`${surfaceClassName} mt-6 flex flex-wrap items-center justify-between gap-3.5 rounded-lg p-[18px] text-sm leading-[1.6]`} role="alert">
            <p>{cartError}</p>
            <button type="button" className={secondaryActionClassName} onClick={reloadCart} disabled={busy}>
              Reload cart
            </button>
          </div>
        )}
        {!clearOpen && feedback && (
          <p className="mt-[18px] text-sm leading-[1.6] text-[color:var(--pamo-color-error-text)]" role="alert">
            {feedback}
          </p>
        )}
        {loading && (
          <div className={emptyStateClassName} role="status">
            Loading your cart products…
          </div>
        )}
        {!loading && !hasItems && <CartEmptyState cartError={cartError} cartReady={cartReady} />}
        {!loading && hasItems && (
          <div className="mb-16 mt-7 grid grid-cols-[minmax(0,1fr)] items-start gap-8 md:mb-20 md:mt-10 md:gap-10 min-[1180px]:mb-24 min-[1180px]:grid-cols-[minmax(0,1.96fr)_minmax(0,1fr)] min-[1180px]:gap-6">
            <div className="min-w-0">
              <section
                className={`${surfaceClassName} rounded-[10px] px-3 py-[18px] md:p-6 min-[1180px]:px-5`}
                aria-labelledby="cart-items-heading"
              >
                <div className="flex flex-wrap items-start justify-between gap-3.5 border-b border-[color:var(--pamo-color-border-default)] pb-5">
                  <div>
                    <h2 id="cart-items-heading" className="text-[15px] font-semibold uppercase leading-[1.5]">In your cart</h2>
                    <p className="mt-2 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]">
                      {cartData.length}{" "}
                      {cartData.length === 1
                        ? "product variant"
                        : "product variants"}{" "}
                      · {unitCount} total {unitCount === 1 ? "unit" : "units"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={secondaryActionClassName}
                    aria-pressed={managing}
                    disabled={busy}
                    onClick={toggleManaging}
                  >
                    {managing ? "Done" : "Manage items"}
                  </button>
                </div>
                {managing && (
                  <div
                    className="border-b border-[color:var(--pamo-color-border-default)] py-[18px]"
                    aria-label="Select items for removal"
                  >
                    <p className="text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                      Removal selection is separate. Your checkout selection
                      is preserved when you finish managing items.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px]">
                        <input
                          className={checkboxClassName}
                          type="checkbox"
                          checked={allRemovalSelected}
                          ref={(element) => {
                            if (element)
                              element.indeterminate =
                                removalItems.length > 0 && !allRemovalSelected;
                          }}
                          disabled={busy}
                          onChange={toggleRemovalSelectAll}
                        />
                        Select all ({cartData.length})
                      </label>
                      <button
                        type="button"
                        className={dangerActionClassName}
                        disabled={busy || !removalItems.length}
                        onClick={() => removeItems(removalItems)}
                      >
                        Remove selected ({removalItems.length})
                      </button>
                    </div>
                  </div>
                )}
                {!managing && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--pamo-color-border-default)] py-[18px]">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] font-medium">
                      <input
                        className={checkboxClassName}
                        type="checkbox"
                        checked={allCheckoutSelected}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = checkoutItems.length > 0 && !allCheckoutSelected;
                          }
                        }}
                        disabled={busy}
                        onChange={toggleCheckoutSelectAll}
                        aria-label={allCheckoutSelected ? "Deselect all checkout items" : "Select all checkout items"}
                      />
                      {allCheckoutSelected ? "Deselect all" : "Select all"}
                    </label>
                    <strong className="text-[13px] font-semibold leading-[1.5]">
                      Selected: {selectedUnitCount} {selectedUnitCount === 1 ? "item" : "items"}
                    </strong>
                  </div>
                )}
                <div className="mt-5 grid gap-[18px]" aria-busy={busy}>
                  {cartData.map((item) => (
                    <CartItem
                      key={itemKey(item)}
                      item={item}
                      managing={managing}
                      selected={managing
                        ? removalKeys.has(itemKey(item))
                        : checkoutKeys.has(itemKey(item))}
                      checkoutSelected={checkoutKeys.has(itemKey(item))}
                      onSelection={() => managing
                        ? toggleRemovalSelection(item)
                        : toggleCheckoutSelection(item)}
                      onQuantity={(quantity) => changeQuantity(item, quantity)}
                      onRemove={() => removeItems([item])}
                      disabled={busy}
                    />
                  ))}
                </div>
                {busy && (
                  <p className="mt-[18px] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]" role="status">
                    {operation === "quantity"
                      ? "Updating quantity…"
                      : "Removing items…"}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--pamo-color-border-default)] pt-5">
                  <button
                    type="button"
                    className={secondaryActionClassName}
                    disabled={busy}
                    onClick={() => {
                      setFeedback("");
                      setClearOpen(true);
                    }}
                  >
                    Clear cart
                  </button>
                  <Link to="/collection" className={secondaryActionClassName}>
                    <ArrowLeft
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    Continue shopping
                  </Link>
                </div>
              </section>
              <p className="mt-5 text-xs leading-[1.7] text-[color:var(--pamo-color-text-secondary)]">
                Cart changes do not reserve stock. Availability is confirmed
                when your order is created.
              </p>
            </div>
            <aside className="min-w-0" aria-label="Order review">
              <CartTotal
                cartView
                itemCount={checkoutItems.length}
                unitCount={selectedUnitCount}
                subtotal={selectedSubtotal}
              >
                <Link
                  to="/place-order"
                  className={`${brandActionClassName} mt-[26px] min-h-12 w-full text-center ${checkoutBlocked ? "cursor-not-allowed opacity-[0.65]" : ""}`}
                  aria-disabled={checkoutBlocked}
                  onClick={(event) => {
                    if (checkoutBlocked) {
                      event.preventDefault();
                    }
                  }}
                >
                  Checkout ({selectedUnitCount} {selectedUnitCount === 1 ? "item" : "items"}){" "}
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </Link>
                <p className="mt-3.5 text-xs leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">{checkoutNote}</p>
              </CartTotal>
              <section
                className={`${surfaceClassName} mt-[26px] rounded-[10px] px-4 py-[22px] md:p-6`}
                aria-labelledby="cart-support-heading"
              >
                <p className={eyebrowClassName}>Before you check out</p>
                <h2 id="cart-support-heading" className="mt-3.5 text-base font-semibold leading-[1.5]">Need to double-check a size?</h2>
                <p className="mt-2.5 text-[13px] leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
                  Review product details and size availability in the
                  collection.
                </p>
                <Link className="mt-3.5 flex min-h-11 flex-wrap items-center justify-between gap-2.5 border-t border-[color:var(--pamo-color-border-default)] py-2.5 text-[13px] font-medium text-[color:var(--pamo-color-text-primary)]" to="/collection">
                  Browse collection <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link className="flex min-h-11 flex-wrap items-center justify-between gap-2.5 py-2.5 text-[13px] font-medium text-[color:var(--pamo-color-text-primary)]" to="/contact">
                  Contact support <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </section>
            </aside>
          </div>
        )}
        {!loading && hasItems && !managing && !clearOpen && (
          <aside
            className="cart-mobile-checkout fixed inset-x-0 bottom-0 z-20 border-t border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-[19px] pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(2,6,23,0.12)] min-[960px]:hidden"
            aria-label="Mobile checkout action"
          >
            <div className="mx-auto flex w-full max-w-[var(--pamo-layout-max)] items-center gap-3">
              <p className="min-w-0 flex-1 text-xs leading-[1.5] text-[color:var(--pamo-color-text-secondary)]">
                Selected: {selectedUnitCount} {selectedUnitCount === 1 ? "item" : "items"}
              </p>
              <Link
                to="/place-order"
                className={`${brandActionClassName} min-h-12 shrink-0 px-5 ${checkoutBlocked ? "cursor-not-allowed opacity-[0.65]" : ""}`}
                aria-disabled={checkoutBlocked}
                onClick={(event) => {
                  if (checkoutBlocked) {
                    event.preventDefault();
                  }
                }}
              >
                Checkout ({selectedUnitCount})
                <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>
          </aside>
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
