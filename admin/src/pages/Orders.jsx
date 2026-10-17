import axios from 'axios'
import { formatOrderMoney } from '../../../shared/money.js'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { backendUrl, currency } from '../utils/config'
import { toast } from 'react-toastify'
import { assets } from '../assets/assets'
import OrderDetails, { OrderStatusBadge } from '../components/OrderDetails'
import { getOrderStatusLabel, orderDate, orderFilters, orderName } from '../utils/orderPresentation'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import './Orders.css'

const progressFilters = orderFilters.filter(([label]) => label !== 'Paid')
const paidFilter = orderFilters.find(([label]) => label === 'Paid')[1]

const containModalFocus = event => {
  if (event.key !== 'Tab' || !event.currentTarget.matches(':modal')) return
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
    .filter(control => control.getClientRects().length > 0)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first) { event.preventDefault(); return }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

const Orders = ({ token }) => {
  const { key: viewKey } = useLocation()
  const [orders, setOrders] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All Orders')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [paymentFilter, setPaymentFilter] = useState('All Payments')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [claimId, setClaimId] = useState(null)
  const [actionError, setActionError] = useState('')
  const detailsDialog = useRef(null)
  const claimDialog = useRef(null)
  const mutationPending = useRef(false)
  const requestId = useRef(0)
  const mutationScope = useRef(null)
  const pendingFocus = useRef(null)

  const cancelPendingFocus = useCallback(() => {
    if (!pendingFocus.current) return
    window.clearTimeout(pendingFocus.current.timer)
    pendingFocus.current = null
  }, [])

  useLayoutEffect(() => {
    if (pendingFocus.current && pendingFocus.current.orderId !== selectedId) cancelPendingFocus()
  }, [selectedId, cancelPendingFocus])

  useLayoutEffect(() => () => cancelPendingFocus(), [token, viewKey, cancelPendingFocus])

  useLayoutEffect(() => {
    const scope = { token, viewKey, active: true }
    mutationScope.current = scope
    return () => { scope.active = false }
  }, [token, viewKey])

  const fetchAllOrders = useCallback(async (scope) => {
    if (!token || (scope && !scope.active)) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const response = await axios.post(backendUrl + '/api/order/list', {}, { headers: { token } })
      if (currentRequest !== requestId.current || (scope && !scope.active)) return
      if (!response.data.success) throw new Error(response.data.message || 'Unable to load orders.')
      const loadedOrders = [...response.data.orders].sort((a,b)=>Number(b.date)-Number(a.date))
      setOrders(loadedOrders)
      setSelectedId(current => loadedOrders.some(order => order._id === current) ? current : loadedOrders[0]?._id || null)
    } catch (error) {
      if (currentRequest !== requestId.current || (scope && !scope.active)) return
      const message = error.response?.data?.message || error.message
      setError(message)
      toast.error(message)
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchAllOrders()
    return () => { requestId.current += 1 }
  }, [fetchAllOrders])

  const statusHandler = async (order, status) => {
    const scope = mutationScope.current
    if (!scope?.active || scope.token !== token || scope.viewKey !== viewKey) return
    if (mutationPending.current || !order.allowedStatuses?.includes(status)) return
    if (status === 'Cancelled' && !window.confirm('Reject this order?' + (order.payment ? ' This does not issue a payment refund.' : ''))) return
    mutationPending.current = true
    setPending(true)
    setActionError('')
    try {
      const response = await axios.post(backendUrl + '/api/order/status', { orderId: order._id, status }, { headers: { token } })
      if (!scope.active) return
      if (!response.data.success) throw new Error(response.data.message || 'Unable to update order.')
      if (response.data.order) {
        setOrders(current => current.map(item => item._id === response.data.order._id ? response.data.order : item))
      } else {
        await fetchAllOrders(scope)
      }
      if (!scope.active) return
      setClaimId(null)
      toast.success(response.data.message || 'Order updated.')
    } catch (error) {
      if (!scope.active) return
      const message = error.response?.data?.message || error.message
      setActionError(message)
      setClaimId(null)
      toast.error(message)
      if (status === 'Claimed') await fetchAllOrders(scope)
    } finally {
      mutationPending.current = false
      // Release this request's busy state only while this instance is mounted.
      if (mutationScope.current?.active) setPending(false)
    }
  }

  const matchesStatus = orderFilters.find(([label])=>label === filter)[1]
  const search = query.trim().toLowerCase()
  const visibleOrders = orders.filter(order => matchesStatus(order)
    && (paymentFilter === 'All Payments' || (paymentFilter === 'Paid' ? paidFilter(order) : !order.payment))
    && (order._id + ' ' + orderName(order)).toLowerCase().includes(search))
  const selectedOrder = orders.find(order => order._id === selectedId)
  const showDetails = detailsOpen && Boolean(selectedOrder)
  const claimOrder = orders.find(order => order._id === claimId)

  useEffect(() => {
    if (!showDetails) return
    const dialog = detailsDialog.current
    const opener = document.activeElement
    const media = window.matchMedia('(min-width: 1280px)')
    const previousOverflow = document.body.style.overflow
    const syncDialog = () => {
      if (dialog.open) dialog.close()
      if (media.matches) {
        // Inline inspection must not move focus or scroll away from the selected row.
        dialog.open = true
        document.body.style.overflow = previousOverflow
      } else {
        dialog.showModal()
        document.body.style.overflow = 'hidden'
      }
    }
    syncDialog()
    media.addEventListener('change', syncDialog)
    return () => {
      media.removeEventListener('change', syncDialog)
      dialog.close()
      document.body.style.overflow = previousOverflow
      opener?.focus({ preventScroll: true })
    }
  }, [showDetails, token, viewKey])

  useEffect(() => {
    if (!claimId) return
    const dialog = claimDialog.current
    const opener = document.activeElement
    dialog.showModal()
    return () => { dialog.close(); opener?.focus({ preventScroll: true }) }
  }, [claimId])

  const closeDetails = () => {
    cancelPendingFocus()
    setDetailsOpen(false)
    setSelectedId(null)
  }

  const requestAction = (order, status) => {
    const scope = mutationScope.current
    if (!scope?.active || scope.token !== token || scope.viewKey !== viewKey) return
    if (status !== 'Claimed') return statusHandler(order, status)
    if (!mutationPending.current && order.allowedStatuses?.includes(status)) setClaimId(order._id)
  }

  const viewOrder = (order) => {
    cancelPendingFocus()
    setSelectedId(order._id)
    setDetailsOpen(true)
    setActionError('')
    if (window.innerWidth >= 1280) return
    const request = { orderId: order._id, timer: null }
    request.timer = window.setTimeout(() => {
      if (pendingFocus.current !== request) return
      pendingFocus.current = null
      const panel = document.getElementById('order-details')
      panel?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      panel?.focus({ preventScroll: true })
    }, 0)
    pendingFocus.current = request
  }

  return (
    <section className='pamo-orders-page' aria-labelledby='orders-heading'>
      <nav className='orders-breadcrumb' aria-label='Breadcrumb'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Orders</span><span aria-hidden='true'>/</span><span aria-current='page'>All Orders</span>
      </nav>
      <header className='orders-heading'>
        <div>
          <h1 id='orders-heading'>Orders</h1>
          <p>Review student requests, payments and claiming progress.</p>
        </div>
        <div className='orders-search-tools'>
          <label className='orders-search'>
            <span className='sr-only'>Search order ID or student name</span>
            <Search size={18} aria-hidden='true' />
            <input type='search' value={query} onChange={event => { setQuery(event.target.value); setSelectedId(null); setDetailsOpen(false) }} placeholder='Search order ID or student…' />
          </label>
          <button type='button' onClick={() => fetchAllOrders()} disabled={loading || pending} className='orders-control'>
            Refresh <RefreshCw size={15} aria-hidden='true' />
          </button>
        </div>
      </header>

      <div role='group' aria-label='Filter orders' className='orders-progress'>
        <h2>Order progress</h2>
        <div>
          {progressFilters.map(([label, predicate]) => (
            <button key={label} type='button' aria-pressed={filter === label} onClick={() => { setFilter(label); setSelectedId(null); setDetailsOpen(false) }}>
              <span>{label}</span><span>{orders.filter(predicate).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className='orders-payment-filter'>
        <label htmlFor='orders-payment-filter'>Payment status</label>
        <select id='orders-payment-filter' value={paymentFilter} onChange={event => { setPaymentFilter(event.target.value); setSelectedId(null); setDetailsOpen(false) }}>
          <option>All Payments</option><option>Paid</option><option>Pending</option>
        </select>
        <p>Paid: {orders.filter(paidFilter).length} · Pending: {orders.filter(order => !order.payment).length}</p>
        <span>Payment and order stages may overlap.</span>
      </div>
      {error && <div role='alert' className='orders-error'>{error}</div>}
      <div className={'orders-workspace' + (showDetails ? ' has-details' : '')}>
        <div className='orders-list-panel'>
          {loading ? <p role='status' className='orders-empty'>Loading orders…</p>
            : visibleOrders.length === 0 ? <div className='orders-empty'>
              <h2>{orders.length ? 'No matching orders' : 'No orders yet'}</h2>
              <p>{orders.length ? 'Try a different search or status filter.' : 'Student orders will appear here when placed.'}</p>
              {orders.length > 0 && <button type='button' className='orders-control' onClick={() => { setQuery(''); setFilter('All Orders'); setPaymentFilter('All Payments') }}>Clear filters</button>}
            </div>
            : <table className='orders-table' aria-label='Orders table' aria-busy={pending}>
              <thead>
                <tr>{['Order', 'Student', 'Total', 'Payment', 'Order Status', 'Date', 'Action'].map(heading => <th key={heading} scope='col'>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {visibleOrders.map(order => {
                  const date = orderDate(order.date)
                  const selected = showDetails && order._id === selectedId
                  return (
                    <tr key={order._id} className={selected ? 'is-selected' : ''}>
                      <td className='orders-identity'>
                        <img className='orders-thumbnail' src={order.items?.[0]?.image?.[0] || assets.parcel_icon} alt='' />
                        <div>
                          <p title={order._id}>#{order._id.length > 12 ? order._id.slice(0, 9) + '…' : order._id}</p>
                          <span>{order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'}<span className='orders-inline-total'> · {formatOrderMoney(order.amount, order)}</span></span>
                        </div>
                      </td>
                      <td className='orders-student'>{orderName(order)}</td>
                      <td className='orders-amount'>{formatOrderMoney(order.amount, order)}</td>
                      <td className='orders-payment'><span className='orders-card-label'>Payment</span><span className='orders-badge'><OrderStatusBadge status={order.payment ? 'Paid' : 'Pending'} /></span></td>
                      <td className='orders-status'><span className='orders-card-label'>Order status</span><span className='orders-badge'><OrderStatusBadge status={order.status} label={getOrderStatusLabel(order)} /></span></td>
                      <td className='orders-date'><span>{date.date}</span><span>{date.time}</span></td>
                      <td className='orders-view'>
                        <button type='button' aria-label={'View order ' + order._id} aria-controls='order-details' aria-pressed={selected} onClick={() => viewOrder(order)} className='orders-control'>
                          <span className='orders-view-desktop'>View</span><span className='orders-view-compact'>View Details</span><ArrowRight size={14} aria-hidden='true' />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>}
          <p className='orders-list-note'>Select View for full order information and available actions.</p>
        </div>
        <dialog
          ref={detailsDialog}
          aria-label='Order Details'
          className='orders-inspector'
          onCancel={event => { event.preventDefault(); closeDetails() }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); closeDetails(); return }
            containModalFocus(event)
          }}
        >
          <OrderDetails order={showDetails ? selectedOrder : undefined} currency={currency} pending={pending || loading} error={actionError} onAction={requestAction} onClose={closeDetails} />
        </dialog>
      </div>
      <p className='orders-summary' role='status'>{visibleOrders.length} orders currently visible · Refresh to check for updates</p>
      <p className='orders-footnote'>Payment status and order progress are distinct. A Paid order may also be Ready to Claim.</p>
      <dialog ref={claimDialog} aria-labelledby='claim-heading' aria-describedby='claim-description' className='orders-claim-dialog' onKeyDown={containModalFocus} onCancel={event => { event.preventDefault(); if (!mutationPending.current) setClaimId(null) }}>
        <h2 id='claim-heading'>Confirm order claim?</h2>
        <p id='claim-description'>You are about to mark this order as claimed:</p>
        <strong>#{claimOrder?._id}</strong>
        {claimOrder && <p>{orderName(claimOrder)} · {formatOrderMoney(claimOrder.amount, claimOrder)}</p>}
        <p className='orders-claim-warning'>This confirms that the order was released to the student.</p>
        <div>
          <button type='button' className='orders-control' autoFocus disabled={pending} onClick={() => setClaimId(null)}>Keep reviewing</button>
          <button type='button' className='orders-primary' disabled={pending || loading || !claimOrder?.allowedStatuses?.includes('Claimed')} onClick={() => statusHandler(claimOrder, 'Claimed')}>{pending ? 'Updating…' : 'Confirm Claim'}</button>
        </div>
      </dialog>
    </section>
  )
}

export default Orders
