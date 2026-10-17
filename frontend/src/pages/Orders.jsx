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

const Orders = () => {
  const { backendUrl, token, currency, getProductsData } =
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
  const cancellationDialog = useRef(null);
  const keepOrderButton = useRef(null);
  const headingRef = useRef(null);
  const mutationPending = useRef(false);
  const requestId = useRef(0);

  const loadOrders = useCallback(async () => {
    if (!token) return;
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
      if (request !== requestId.current) return;
      if (!data.success || !Array.isArray(data.orders))
        throw new Error(data.message || "Unable to load your orders.");
      setOrders(data.orders);
      setRefreshFeedback("Orders updated.");
    } catch (error) {
      if (request !== requestId.current) return;
      const message = error.response?.data?.message || error.message;
      setError(message);
      toast.error(message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [backendUrl, token]);

  useEffect(() => {
    loadOrders();
    return () => {
      requestId.current += 1;
    };
  }, [loadOrders]);

  useEffect(() => {
    if (!cancelOrder) return;
    const dialog = cancellationDialog.current;
    const previousFocus = document.activeElement;
    const fallbackFocus = headingRef.current;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    keepOrderButton.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (
        previousFocus?.isConnected &&
        !previousFocus.disabled &&
        previousFocus.getClientRects().length
      )
        previousFocus.focus();
      else fallbackFocus?.focus();
    };
  }, [cancelOrder]);

  const cancelHandler = async () => {
    if (!cancelOrder || mutationPending.current) return;
    mutationPending.current = true;
    setCancelling(true);
    requestId.current += 1;
    try {
      const { data } = await axios.post(
        backendUrl + "/api/order/cancel",
        { orderId: cancelOrder._id },
        { headers: { token } },
      );
      if (!data.success)
        throw new Error(data.message || "Unable to cancel this order.");
      setOrders((current) =>
        current.map((order) =>
          order._id === data.order._id ? { ...order, ...data.order } : order,
        ),
      );
      setCancelOrder(null);
      toast.success(data.message || "Order cancelled.");
      await getProductsData();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message);
      setCancelOrder(null);
      await loadOrders();
    } finally {
      mutationPending.current = false;
      setCancelling(false);
      setLoading(false);
    }
  };

  const search = query.trim().toLowerCase();
  const visibleOrders = orders
    .filter(
      (order) =>
        (filter === "All Orders" ||
          getOrderPresentation(order).group === filter) &&
        `${order._id} ${(order.items || []).map((item) => item.name || "").join(" ")} ${order.receiptNumber || ""}`
          .toLowerCase()
          .includes(search),
    )
    .sort(
      (a, b) =>
        (Number(a.date || 0) - Number(b.date || 0)) *
        (sort === "oldest" ? 1 : -1),
    );

  return (
    <section className="orders-page">
      <div className="orders-container">
        <header className="orders-header">
          <p className="orders-eyebrow">Your school essentials</p>
          <h1 ref={headingRef} tabIndex={-1}>
            My orders
          </h1>
          <p>
            Review your orders, check their progress, and find payment details
            when you need them.
          </p>
        </header>
        <div className="orders-toolbar">
          <label className="orders-search">
            <span className="sr-only">
              Search your orders by order ID, product or receipt
            </span>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders, products or receipts..."
            />
          </label>
          <label className="orders-sort">
            <span className="sr-only">Sort orders</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary orders-action orders-refresh"
            onClick={loadOrders}
            disabled={loading || cancelling}
            aria-label="Refresh your orders"
          >
            Refresh <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
        <div
          className="orders-filters"
          role="group"
          aria-label="Filter your orders"
        >
          {orderFilters.map((label) => (
            <button
              key={label}
              type="button"
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
            >
              <span>{label}</span>
              <span className="orders-filter-count">
                {label === "All Orders"
                  ? orders.length
                  : orders.filter(
                      (order) => getOrderPresentation(order).group === label,
                    ).length}
              </span>
            </button>
          ))}
        </div>
        <div className="orders-results">
          <p>
            {visibleOrders.length}{" "}
            {visibleOrders.length === 1 ? "order" : "orders"} · Showing{" "}
            {sort === "oldest" ? "oldest" : "newest"} first
          </p>
          <p role="status">
            {loading && orders.length
              ? "Refreshing your orders..."
              : !loading
                ? refreshFeedback
                : ""}
          </p>
        </div>
        {error && (
          <div role="alert" className="orders-request-error">
            <p>
              We could not load your orders.{" "}
              {orders.length
                ? "Your previously loaded orders remain available."
                : "Please try again."}
            </p>
            <button
              type="button"
              className="btn-secondary orders-action"
              onClick={loadOrders}
              disabled={loading || cancelling}
            >
              Try again
            </button>
          </div>
        )}
        {loading && !orders.length ? (
          <div className="orders-empty" role="status">
            Loading your orders...
          </div>
        ) : visibleOrders.length ? (
          <div className="orders-list">
            {visibleOrders.map((order) => (
              <CustomerOrderCard
                key={order._id}
                order={order}
                currency={currency}
                onCancel={setCancelOrder}
                cancellationPending={cancelling}
              />
            ))}
          </div>
        ) : (
          !error && (
            <div className="orders-empty">
              <ShoppingBag size={36} strokeWidth={1.75} aria-hidden="true" />
              <h2>{orders.length ? "No matching orders" : "No orders yet"}</h2>
              <p>
                {orders.length
                  ? "Try a different search or status filter."
                  : "Your school essentials will appear here after you place an order."}
              </p>
              {orders.length ? (
                <button
                  type="button"
                  className="btn-secondary orders-action"
                  onClick={() => {
                    setQuery("");
                    setFilter("All Orders");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  to="/collection"
                  className="btn-primary orders-action orders-brand-action"
                >
                  Browse Collection
                </Link>
              )}
            </div>
          )
        )}
        <dialog
          ref={cancellationDialog}
          className="orders-cancel-dialog"
          aria-labelledby="cancel-order-heading"
          aria-describedby="cancel-order-description"
          aria-busy={cancelling}
          onCancel={(event) => {
            event.preventDefault();
            if (!mutationPending.current) setCancelOrder(null);
          }}
        >
          <h2 id="cancel-order-heading">Cancel order?</h2>
          <p id="cancel-order-description">
            Are you sure you want to cancel this order? This action cannot be
            undone.
          </p>
          {cancelOrder?.payment === true && (
            <p>Cancelling this paid order records a refund obligation. It does not issue a refund. Contact PAMO to arrange the refund.</p>
          )}
          <div>
            <button
              ref={keepOrderButton}
              type="button"
              className="btn-secondary orders-action"
              disabled={cancelling}
              onClick={() => setCancelOrder(null)}
            >
              Keep Order
            </button>
            <button
              type="button"
              className="btn-secondary orders-action orders-danger"
              disabled={cancelling}
              onClick={cancelHandler}
            >
              {cancelling ? "Cancelling..." : "Cancel Order"}
            </button>
          </div>
        </dialog>
      </div>
    </section>
  );
};

export default Orders;
