import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search, ShoppingBag } from "lucide-react";
import "../components/StorefrontFoundation.css";
import "./Orders.css";
import axios from "axios";
import { toast } from "react-toastify";
import { ShopContext } from "../context/shopContext";
import CustomerOrderCard from "../components/CustomerOrderCard";
import { getOrderPresentation, orderFilters } from "../utils/orderPresentation";
import { getCancellationMode } from "../../../shared/orderCancellation.js";
import { isDemoOrder } from '../../../shared/demoPayment.js';

const ordersContainerClassName = [
  "mx-auto w-[calc(100%-32px)] max-w-[var(--pamo-layout-max)] pb-14 pt-[30px]",
  "md:w-[calc(100%-48px)] md:pb-[72px] md:pt-[38px]",
  "min-[1180px]:w-[calc(100%-var(--pamo-home-gutter))] min-[1180px]:pt-8",
].join(" ");
const actionClassName = [
  "inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-[7px] border px-4 py-2.5",
  "text-[13px] font-semibold leading-5 disabled:cursor-not-allowed disabled:opacity-[0.55]",
].join(" ");
const secondaryActionClassName = [
  "btn-secondary",
  actionClassName,
  "border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)]",
  "text-[color:var(--pamo-color-text-primary)] hover:bg-[var(--pamo-color-surface-subtle)]",
  "dark:border-[color:var(--pamo-color-border-input)] dark:bg-[var(--pamo-color-surface-default)]",
  "dark:text-[color:var(--pamo-color-text-primary)] dark:hover:bg-[var(--pamo-color-surface-subtle)]",
].join(" ");
const brandActionClassName = [
  "btn-primary",
  actionClassName,
  "border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-brand-yellow)] text-slate-950",
  "hover:bg-[var(--pamo-color-brand-hover)]",
].join(" ");
const dangerActionClassName = [
  secondaryActionClassName,
  "border-[color:var(--pamo-color-error-text)] text-[color:var(--pamo-color-error-text)]",
  "hover:bg-[var(--pamo-color-error-surface)] dark:border-[color:var(--pamo-color-error-text)]",
  "dark:text-[color:var(--pamo-color-error-text)] dark:hover:bg-[var(--pamo-color-error-surface)]",
].join(" ");
const emptyStateClassName = [
  "flex flex-col items-center gap-4 rounded-[10px] border px-5 py-14 text-center",
  "border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)]",
].join(" ");

const Orders = () => {
  const { backendUrl, token, getProductsData } =
    useContext(ShopContext);
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All Orders");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshFeedback, setRefreshFeedback] = useState("");
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const cancellationDialog = useRef(null);
  const keepOrderButton = useRef(null);
  const headingRef = useRef(null);
  const mutationPending = useRef(false);
  const requestId = useRef(0);
  const needsReview = cancelOrder && getCancellationMode(cancelOrder) === 'request';
  let cancellationSubmitLabel = needsReview ? 'Submit Request' : 'Cancel Order';
  if (cancelling) cancellationSubmitLabel = 'Submitting…';

  const loadOrders = useCallback(async () => {
    if (!token) {
      return;
    }
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    setRefreshFeedback("");
    try {
      const { data } = await axios.post(
        backendUrl + "/api/order/userorders",
        {},
        { headers: { token } },
      );
      if (request !== requestId.current) {
        return;
      }
      if (!data.success || !Array.isArray(data.orders)) {
        throw new Error(data.message || "Unable to load your orders.");
      }
      setOrders(data.orders);
      setRefreshFeedback("Orders updated.");
    } catch (error) {
      if (request !== requestId.current) {
        return;
      }
      const message = error.response?.data?.message || error.message;
      setError(message);
      toast.error(message);
    } finally {
      if (request === requestId.current) {
        setLoading(false);
      }
    }
  }, [backendUrl, token]);

  useEffect(() => {
    loadOrders();
    return () => {
      requestId.current += 1;
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!cancelOrder) {
      return;
    }
    const dialog = cancellationDialog.current;
    const previousFocus = document.activeElement;
    const fallbackFocus = headingRef.current;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) {
      dialog.showModal();
    }
    document.body.style.overflow = "hidden";
    keepOrderButton.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      document.body.style.overflow = previousOverflow;
      if (
        previousFocus?.isConnected &&
        !previousFocus.disabled &&
        previousFocus.getClientRects().length
      ) {
        previousFocus.focus();
      } else {
        fallbackFocus?.focus();
      }
    };
  }, [cancelOrder]);

  const cancelHandler = async () => {
    if (!cancelOrder || mutationPending.current) {
      return;
    }
    if (needsReview && !cancellationReason.trim()) return;
    mutationPending.current = true;
    setCancelling(true);
    requestId.current += 1;
    try {
      const { data } = await axios.post(
        backendUrl + (needsReview ? "/api/order/cancellation/request" : "/api/order/cancel"),
        { orderId: cancelOrder._id, ...(needsReview ? { reason: cancellationReason.trim() } : {}) },
        { headers: { token } },
      );
      if (!data.success) {
        throw new Error(data.message || "Unable to cancel this order.");
      }
      setOrders((current) =>
        current.map((order) => {
          if (order._id === data.order._id) {
            return { ...order, ...data.order };
          }
          return order;
        }),
      );
      setCancelOrder(null);
      toast.success(data.message || "Order cancelled.");
      if (!needsReview) await getProductsData();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
      await loadOrders();
    } finally {
      mutationPending.current = false;
      setCancelling(false);
      setLoading(false);
    }
  };

  const search = query.trim().toLowerCase();
  const matchesSearch = (order) => {
    const itemNames = (order.items || []).map((item) => item.name || "").join(" ");
    const searchableText = `${order._id} ${itemNames} ${order.receiptNumber || ""}`;
    return searchableText.toLowerCase().includes(search);
  };
  const visibleOrders = orders
    .filter((order) => {
      const matchesFilter = filter === "All Orders" || getOrderPresentation(order).group === filter;
      return matchesFilter && matchesSearch(order);
    })
    .sort(
      (a, b) =>
        (Number(a.date || 0) - Number(b.date || 0)) *
        (sort === "oldest" ? 1 : -1),
    );
  const isInitialLoad = loading && !orders.length;
  const hasVisibleOrders = visibleOrders.length > 0;
  const showEmptyState = !isInitialLoad && !hasVisibleOrders && !error;
  const refreshStatus = loading && orders.length ? "Refreshing your orders..." : refreshFeedback;
  const previousOrdersMessage = orders.length
    ? "Your previously loaded orders remain available."
    : "Please try again.";
  const emptyHeading = orders.length ? "No matching orders" : "No orders yet";
  const emptyMessage = orders.length
    ? "Try a different search or status filter."
    : "Your school essentials will appear here after you place an order.";

  const clearFilters = () => {
    setQuery("");
    setFilter("All Orders");
  };
  const closeCancellationDialog = () => {
    if (!mutationPending.current) {
      setCancelOrder(null);
    }
  };

  return (
    <section className="orders-page min-w-0 text-[color:var(--pamo-color-text-primary)]">
      <div className={ordersContainerClassName}>
        <header className="mb-6 min-[1180px]:mb-7">
          <p className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.09em] text-[color:var(--pamo-color-accent-text)]">Your school essentials</p>
          <h1 className="my-3 border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-3 text-[30px] font-semibold uppercase leading-[1.2] tracking-[-0.025em] md:text-4xl" ref={headingRef} tabIndex={-1}>
            My orders
          </h1>
          <p className="text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">
            Review your orders, check their progress, and find payment details
            when you need them.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_150px_140px] min-[1180px]:grid-cols-[minmax(0,522px)_1fr_160px_144px]">
          <label className="col-span-full flex min-w-0 items-center gap-2.5 rounded-lg border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3.5 text-[color:var(--pamo-color-text-secondary)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-[color:var(--pamo-color-accent-text)] md:col-auto">
            <span className="sr-only">
              Search your orders by order ID, product or receipt
            </span>
            <Search size={18} aria-hidden="true" />
            <input
              className="h-12 w-full min-w-0 bg-transparent text-base text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] focus-visible:!outline-none md:text-sm"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders, products or receipts..."
            />
          </label>
          <label className="min-w-0 min-[1180px]:col-start-3">
            <span className="sr-only">Sort orders</span>
            <select
              className="h-[50px] w-full rounded-lg border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-2.5 text-[13px] text-[color:var(--pamo-color-text-primary)]"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button
            type="button"
            className={`${secondaryActionClassName} min-h-[50px]`}
            onClick={loadOrders}
            disabled={loading || cancelling}
            aria-label="Refresh your orders"
          >
            Refresh <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
        <div
          className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-2.5 pt-1"
          role="group"
          aria-label="Filter your orders"
        >
          {orderFilters.map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-[9px] rounded-[7px] border px-3.5 py-2.5 text-[13px] ${filter === label ? "border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-brand-yellow)] font-semibold text-slate-950" : "border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-secondary)] hover:border-[color:var(--pamo-color-border-input)]"}`}
            >
              <span>{label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${filter === label ? "bg-slate-900 text-white" : "bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)]"}`}>
                {label === "All Orders" ? orders.length : orders.filter(
                  (order) => getOrderPresentation(order).group === label,
                ).length}
              </span>
            </button>
          ))}
        </div>
        <div className="mb-[18px] mt-2 flex min-h-[26px] flex-wrap justify-between gap-x-5 gap-y-1.5 text-xs text-[color:var(--pamo-color-text-secondary)]">
          <p>
            {visibleOrders.length}{" "}
            {visibleOrders.length === 1 ? "order" : "orders"} · Showing{" "}
            {sort === "oldest" ? "oldest" : "newest"} first
          </p>
          <p role="status">
            {refreshStatus}
          </p>
        </div>
        {error && (
          <div role="alert" className="mb-5 rounded-lg border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] p-4 text-sm leading-[1.6]">
            <p>
              We could not load your orders.{" "}
              {previousOrdersMessage}
            </p>
            <button
              type="button"
              className={`${secondaryActionClassName} mt-3`}
              onClick={loadOrders}
              disabled={loading || cancelling}
            >
              Try again
            </button>
          </div>
        )}
        {isInitialLoad && (
          <div className={emptyStateClassName} role="status">
            Loading your orders...
          </div>
        )}
        {hasVisibleOrders && (
          <div className="grid min-w-0 gap-5">
            {visibleOrders.map((order) => (
              <CustomerOrderCard
                key={order._id}
                order={order}
                onCancel={order => { setCancellationReason(''); setCancelOrder(order); }}
                cancellationPending={cancelling}
              />
            ))}
          </div>
        )}
        {showEmptyState && (
          <div className={emptyStateClassName}>
            <ShoppingBag size={36} strokeWidth={1.75} aria-hidden="true" />
            <h2 className="text-[22px] font-semibold">{emptyHeading}</h2>
            <p className="max-w-[42ch] text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">{emptyMessage}</p>
            {orders.length > 0 && (
              <button type="button" className={secondaryActionClassName} onClick={clearFilters}>
                Clear filters
              </button>
            )}
            {!orders.length && (
              <Link to="/collection" className={brandActionClassName}>
                Browse Collection
              </Link>
            )}
          </div>
        )}
        <dialog
          ref={cancellationDialog}
          className="orders-cancel-dialog max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[520px] overflow-y-auto rounded-[10px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] p-6 text-[color:var(--pamo-color-text-primary)]"
          aria-labelledby="cancel-order-heading"
          aria-describedby="cancel-order-description"
          aria-busy={cancelling}
          onCancel={(event) => {
            event.preventDefault();
            closeCancellationDialog();
          }}
        >
          <h2 className="text-[22px] font-semibold" id="cancel-order-heading">{needsReview ? 'Request cancellation?' : 'Cancel order?'}</h2>
          <p className="mt-4 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]" id="cancel-order-description">
            {needsReview ? 'Review target: 24 hours. Fulfillment will be on hold until PAMO makes a decision.' : 'Are you sure you want to cancel this order? This action cannot be undone.'}
          </p>
          {needsReview && (
            <label className='mt-4 block text-sm font-semibold'>Cancellation reason
              <textarea value={cancellationReason} onChange={event => setCancellationReason(event.target.value)} maxLength={1000} required disabled={cancelling} rows={3} className='mt-2 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] p-3 text-base font-normal text-[color:var(--pamo-color-text-primary)]' />
            </label>
          )}
          {cancelOrder?.payment === true && !isDemoOrder(cancelOrder) && (
            <p className="mt-4 text-sm leading-[1.6] text-[color:var(--pamo-color-text-secondary)]">Cancelling this paid order records a refund obligation. It does not issue a refund. Contact PAMO to arrange the refund.</p>
          )}
          {isDemoOrder(cancelOrder) && <p className='mt-4 text-sm'>Demo payment only. No real money was charged and no refund is due.</p>}
          <div className="mt-6 flex flex-wrap gap-3 [&>button]:flex-[1_1_170px]">
            <button
              ref={keepOrderButton}
              type="button"
              className={secondaryActionClassName}
              disabled={cancelling}
              onClick={() => setCancelOrder(null)}
            >
              Keep Order
            </button>
            <button
              type="button"
              className={dangerActionClassName}
              disabled={cancelling || (needsReview && !cancellationReason.trim())}
              onClick={cancelHandler}
            >
              {cancellationSubmitLabel}
            </button>
          </div>
        </dialog>
      </div>
    </section>
  );
};

export default Orders;
