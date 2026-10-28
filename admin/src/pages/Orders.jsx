import axios from 'axios'
import { formatOrderMoney } from '../../../shared/money.js'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { backendUrl, currency } from '../utils/config'
import { toast } from 'react-toastify'
import { assets } from '../assets/assets'
import OrderDetails, { OrderStatusBadge } from '../components/OrderDetails'
import { getOrderStatusLabel, orderDate, orderFilters, orderName } from '../utils/orderPresentation'
import { ArrowRight, CircleCheck, RefreshCw, Search } from 'lucide-react'
import { canAdminCancelPaidOnline, getCancellationRequestLabel } from '../../../shared/orderCancellation.js'
import { isDemoOrder } from '../../../shared/demoPayment.js'
import './Orders.css'

const progressFilters = orderFilters.filter(([label]) => label !== 'Paid')
const paidFilter = orderFilters.find(([label]) => label === 'Paid')[1]
const controlClass = 'orders-control inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-medium leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)]'
const filterButtonClass = 'inline-flex min-h-11 max-w-full items-center justify-between gap-4 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-2.5 text-xs aria-pressed:border-transparent aria-pressed:bg-[var(--pamo-color-brand-yellow)] aria-pressed:font-semibold aria-pressed:text-slate-900'
const primaryActionClass = 'orders-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--pamo-color-brand-yellow)] p-3 text-xs font-semibold text-slate-900 [&:not(:disabled):hover]:bg-[var(--pamo-color-brand-hover)]'
const emptyClass = 'px-5 py-10 text-center [&_h2]:font-semibold [&_p]:my-3'
const supportingTextClass = 'text-xs text-[color:var(--pamo-color-text-secondary)]'
const publicProgramCategories = response => {
  if (!response?.data?.success) return []
  const active = Array.isArray(response.data.categories) ? response.data.categories : []
  const archived = Array.isArray(response.data.archivedCategories)
    ? response.data.archivedCategories
    : []
  return [...active, ...archived]
}
const claimedToastOptions = {
  ariaLabel: 'Order successfully claimed. The order has been marked as claimed.',
  autoClose: 4000,
  className: 'pamo-order-claimed-toast',
  hideProgressBar: true,
  icon: false,
}

const OrderClaimedToast = () => (
  <div className='flex min-w-0 items-start gap-3 pr-2'>
    <span className='pamo-order-claimed-toast__icon grid h-9 w-9 shrink-0 place-items-center rounded-full' aria-hidden='true'>
      <CircleCheck size={19} strokeWidth={2.25} />
    </span>
    <div className='min-w-0 py-0.5'>
      <p className='text-sm font-semibold leading-5 text-[color:var(--pamo-color-text-primary)]'>Order successfully claimed</p>
      <p className='mt-1 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>The order has been marked as claimed.</p>
    </div>
  </div>
)

const showStatusSuccess = (status, message) => {
  if (status === 'Claimed') {
    toast.success(<OrderClaimedToast />, claimedToastOptions)
    return
  }
  toast.success(message || 'Order updated.')
}

const containModalFocus = event => {
  if (event.key !== 'Tab' || !event.currentTarget.matches(':modal')) {
    return
  }
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), textarea:not(:disabled)')]
    .filter(control => control.getClientRects().length > 0)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first) {
    event.preventDefault()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
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
  const [reviewSelection, setReviewSelection] = useState(null)
  const [programCategories, setProgramCategories] = useState([])
  const [rejectionReason, setRejectionReason] = useState('')
  const reviewRequiresReason = ['reject', 'exception'].includes(reviewSelection?.decision)
  let reviewTitle = 'Approve cancellation?'
  if (reviewSelection?.decision === 'reject') reviewTitle = 'Reject cancellation?'
  if (reviewSelection?.decision === 'exception') reviewTitle = 'Exceptional cancellation?'
  const detailsDialog = useRef(null)
  const claimDialog = useRef(null)
  const reviewDialog = useRef(null)
  const mutationPending = useRef(false)
  const requestId = useRef(0)
  const mutationScope = useRef(null)
  const pendingFocus = useRef(null)

  const cancelPendingFocus = useCallback(() => {
    if (!pendingFocus.current) {
      return
    }
    window.clearTimeout(pendingFocus.current.timer)
    pendingFocus.current = null
  }, [])

  useLayoutEffect(() => {
    if (pendingFocus.current && pendingFocus.current.orderId !== selectedId) {
      cancelPendingFocus()
    }
  }, [selectedId, cancelPendingFocus])

  useLayoutEffect(() => () => cancelPendingFocus(), [token, viewKey, cancelPendingFocus])

  useLayoutEffect(() => {
    const scope = { token, viewKey, active: true }
    mutationScope.current = scope
    return () => {
      scope.active = false
    }
  }, [token, viewKey])

  const fetchAllOrders = useCallback(async (scope) => {
    if (!token || (scope && !scope.active)) {
      return
    }
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const [response, categoryResponse] = await Promise.all([
        axios.post(backendUrl + '/api/order/list', {}, { headers: { token } }),
        axios.get(backendUrl + '/api/category/public').catch(() => null)
      ])
      if (currentRequest !== requestId.current || (scope && !scope.active)) {
        return
      }
      if (!response.data.success) {
        throw new Error(response.data.message || 'Unable to load orders.')
      }
      const loadedOrders = [...response.data.orders].sort((a, b) => Number(b.date) - Number(a.date))
      setOrders(loadedOrders)
      const categories = publicProgramCategories(categoryResponse)
      if (categories.length > 0) setProgramCategories(categories)
      setSelectedId(current => {
        if (loadedOrders.some(order => order._id === current)) {
          return current
        }
        return loadedOrders[0]?._id || null
      })
    } catch (error) {
      if (currentRequest !== requestId.current || (scope && !scope.active)) {
        return
      }
      const message = error.response?.data?.message || error.message
      setError(message)
      toast.error(message)
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [token])

  useEffect(() => {
    fetchAllOrders()
    return () => {
      requestId.current += 1
    }
  }, [fetchAllOrders])

  const statusHandler = async (order, status) => {
    const scope = mutationScope.current
    if (!scope?.active || scope.token !== token || scope.viewKey !== viewKey) {
      return
    }
    if (mutationPending.current || !order.allowedStatuses?.includes(status)) {
      return
    }
    if (status === 'Cancelled') {
      const refundWarning = order.payment ? ' This does not issue a payment refund.' : ''
      if (!window.confirm('Reject this order?' + refundWarning)) {
        return
      }
    }
    mutationPending.current = true
    setPending(true)
    setActionError('')
    try {
      const response = await axios.post(backendUrl + '/api/order/status', { orderId: order._id, status }, { headers: { token } })
      if (!scope.active) {
        return
      }
      if (!response.data.success) {
        throw new Error(response.data.message || 'Unable to update order.')
      }
      if (response.data.order) {
        setOrders(current => current.map(item => {
          if (item._id === response.data.order._id) {
            return response.data.order
          }
          return item
        }))
      } else {
        await fetchAllOrders(scope)
      }
      if (!scope.active) {
        return
      }
      setClaimId(null)
      showStatusSuccess(status, response.data.message)
    } catch (error) {
      if (!scope.active) {
        return
      }
      const message = error.response?.data?.message || error.message
      setActionError(message)
      setClaimId(null)
      toast.error(message)
      if (status === 'Claimed') {
        await fetchAllOrders(scope)
      }
    } finally {
      mutationPending.current = false
      // Release this request's busy state only while this instance is mounted.
      if (mutationScope.current?.active) {
        setPending(false)
      }
    }
  }

  const openCancellationReview = (order, decision) => {
    if (mutationPending.current) return
    if (decision === 'exception') {
      if (!canAdminCancelPaidOnline(order)) return
    } else if (order.cancellationRequest?.status !== 'pending') return
    setRejectionReason('')
    setReviewSelection({ order, decision, token, viewKey })
  }

  const submitCancellationReview = async () => {
    const scope = mutationScope.current
    if (!scope?.active || scope.token !== token || scope.viewKey !== viewKey
        || !reviewSelection || mutationPending.current) return
    if (reviewSelection.token !== token || reviewSelection.viewKey !== viewKey) return
    if (reviewRequiresReason && !rejectionReason.trim()) return
    mutationPending.current = true
    setPending(true)
    setActionError('')
    requestId.current += 1
    try {
      const { order, decision } = reviewSelection
      const body = { orderId: order._id, decision }
      if (decision === 'exception') body.expectedStatus = order.status
      else body.requestId = order.cancellationRequest._id
      if (reviewRequiresReason) body.reason = rejectionReason.trim()
      const { data } = await axios.post(backendUrl + '/api/order/cancellation/review', body, { headers: { token } })
      if (!scope.active) return
      if (!data.success || !data.order) throw new Error(data.message || 'Unable to review cancellation.')
      setOrders(current => current.map(item => item._id === data.order._id ? data.order : item))
      setReviewSelection(null)
      toast.success(data.message)
    } catch (error) {
      if (!scope.active) return
      const message = error.response?.data?.message || error.message
      setActionError(message)
      toast.error(message)
      await fetchAllOrders(scope)
    } finally {
      mutationPending.current = false
      if (mutationScope.current?.active) setPending(false)
    }
  }

  const matchesStatus = orderFilters.find(([label]) => label === filter)[1]
  const matchesPayment = order => {
    if (paymentFilter === 'All Payments') {
      return true
    }
    if (paymentFilter === 'Paid') {
      return paidFilter(order)
    }
    return !order.payment
  }
  const search = query.trim().toLowerCase()
  const visibleOrders = orders.filter(order => matchesStatus(order)
    && matchesPayment(order)
    && (order._id + ' ' + orderName(order)).toLowerCase().includes(search))
  const selectedOrder = orders.find(order => order._id === selectedId)
  const showDetails = detailsOpen && Boolean(selectedOrder)
  const claimOrder = orders.find(order => order._id === claimId)
  const showEmptyState = !loading && visibleOrders.length === 0
  const showOrderTable = !loading && visibleOrders.length > 0
  const emptyHeading = orders.length ? 'No matching orders' : 'No orders yet'
  const emptyMessage = orders.length
    ? 'Try a different search or status filter.'
    : 'Student orders will appear here when placed.'

  useEffect(() => {
    if (!showDetails) {
      return
    }
    const dialog = detailsDialog.current
    const opener = document.activeElement
    const media = window.matchMedia('(min-width: 1280px)')
    const previousOverflow = document.body.style.overflow
    const syncDialog = () => {
      if (dialog.open) {
        dialog.close()
      }
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
    if (!claimId) {
      return
    }
    const dialog = claimDialog.current
    const opener = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      opener?.focus({ preventScroll: true })
    }
  }, [claimId])

  useEffect(() => {
    if (!reviewSelection || reviewSelection.token !== token || reviewSelection.viewKey !== viewKey) return
    const dialog = reviewDialog.current
    const opener = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (opener?.isConnected && !opener.disabled && opener.getClientRects().length) opener.focus({ preventScroll: true })
    }
  }, [reviewSelection, token, viewKey])

  const closeDetails = () => {
    cancelPendingFocus()
    setDetailsOpen(false)
    setSelectedId(null)
  }

  const requestAction = (order, status) => {
    const scope = mutationScope.current
    if (!scope?.active || scope.token !== token || scope.viewKey !== viewKey) {
      return
    }
    if (status !== 'Claimed') {
      return statusHandler(order, status)
    }
    if (!mutationPending.current && order.allowedStatuses?.includes(status)) {
      setClaimId(order._id)
    }
  }

  const viewOrder = (order) => {
    cancelPendingFocus()
    setSelectedId(order._id)
    setDetailsOpen(true)
    setActionError('')
    if (window.innerWidth >= 1280) {
      return
    }
    const request = { orderId: order._id, timer: null }
    request.timer = window.setTimeout(() => {
      if (pendingFocus.current !== request) {
        return
      }
      pendingFocus.current = null
      const panel = document.getElementById('order-details')
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panel?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
      panel?.focus({ preventScroll: true })
    }, 0)
    pendingFocus.current = request
  }

  const resetSelection = () => {
    setSelectedId(null)
    setDetailsOpen(false)
  }
  const changeSearch = event => {
    setQuery(event.target.value)
    resetSelection()
  }
  const changeProgressFilter = label => {
    setFilter(label)
    resetSelection()
  }
  const changePaymentFilter = event => {
    setPaymentFilter(event.target.value)
    resetSelection()
  }
  const clearFilters = () => {
    setQuery('')
    setFilter('All Orders')
    setPaymentFilter('All Payments')
  }
  const cancelClaimDialog = event => {
    event.preventDefault()
    if (!mutationPending.current) {
      setClaimId(null)
    }
  }

  return (
    <section className='pamo-orders-page mx-auto grid max-w-[2160px] min-w-0 gap-[22px] text-[length:var(--dashboard-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] max-sm:gap-[18px]' aria-labelledby='orders-heading'>
      <nav className='orders-breadcrumb flex flex-wrap items-center gap-2 text-[length:var(--pamo-staff-small)] font-medium uppercase text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center' aria-label='Breadcrumb'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Orders</span><span aria-hidden='true'>/</span><span aria-current='page'>All Orders</span>
      </nav>
      <header className='mb-3 flex items-center justify-between gap-6 max-xl:flex-wrap max-sm:mb-0'>
        <div className='min-w-0 border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4'>
          <h1 id='orders-heading' className='text-[length:var(--pamo-staff-heading)] font-bold leading-[var(--pamo-staff-heading-leading)] tracking-[-.025em]'>Orders</h1>
          <p className='mt-2.5 text-[length:var(--pamo-staff-body)] text-[color:var(--pamo-color-text-secondary)] max-sm:leading-relaxed'>Review student requests, payments and claiming progress.</p>
        </div>
        <div className='flex min-w-0 items-stretch gap-2.5 max-xl:w-full max-xl:rounded-lg max-xl:border max-xl:border-[color:var(--pamo-color-border-default)] max-xl:bg-[var(--pamo-color-surface-default)] max-xl:p-3 max-sm:flex-col max-sm:gap-3 max-sm:border-0 max-sm:bg-transparent max-sm:p-0'>
          <label className='relative block min-w-0 w-[clamp(230px,20vw,340px)] max-xl:flex-1 max-xl:w-auto'>
            <span className='sr-only'>Search order ID or student name</span>
            <Search size={18} aria-hidden='true' className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
            <input type='search' value={query} onChange={changeSearch} placeholder='Search order ID or student…' className='min-h-12 w-full min-w-0 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] py-3 pl-[42px] pr-3 text-base leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] sm:text-[length:var(--pamo-staff-small)]' />
          </label>
          <button type='button' onClick={() => fetchAllOrders()} disabled={loading || pending} className={controlClass}>
            Refresh <RefreshCw size={15} aria-hidden='true' />
          </button>
        </div>
      </header>

      <div role='group' aria-label='Filter orders' className='rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-3.5 max-sm:p-3'>
        <h2 className='mb-3 text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>Order progress</h2>
        <div className='flex flex-wrap gap-2.5 max-sm:gap-2'>
          {progressFilters.map(([label, predicate]) => (
            <button key={label} type='button' aria-pressed={filter === label} onClick={() => changeProgressFilter(label)} className={filterButtonClass + ' max-sm:flex-grow max-sm:gap-2.5 max-sm:text-[11px]'}>
              <span>{label}</span><span className='rounded bg-[var(--pamo-color-surface-navy)] px-1.5 py-0.5 text-[10px] text-white'>{orders.filter(predicate).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className='-mt-2 flex flex-wrap items-center gap-[18px] rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-3.5 py-3 max-sm:grid max-sm:grid-cols-1 max-sm:gap-2 max-sm:p-3'>
        <label htmlFor='orders-payment-filter' className='text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'>Payment status</label>
        <select id='orders-payment-filter' value={paymentFilter} onChange={changePaymentFilter} className='min-h-11 w-[190px] max-w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-xs text-[color:var(--pamo-color-text-primary)] max-sm:w-full'>
          <option>All Payments</option><option>Paid</option><option>Pending</option>
        </select>
        <p className='text-xs text-[color:var(--pamo-color-text-secondary)] max-sm:hidden'>Paid: {orders.filter(paidFilter).length} · Pending: {orders.filter(order => !order.payment).length}</p>
        <span className='ml-auto text-xs text-[color:var(--pamo-color-text-secondary)] max-xl:hidden'>Payment and order stages may overlap.</span>
      </div>
      {error && <div role='alert' className='mt-3 rounded-md border border-[color:var(--pamo-color-error-text)] p-3 text-[13px] text-[color:var(--pamo-color-error-text)] [overflow-wrap:anywhere]'>{error}</div>}
      <div className={'orders-workspace grid min-w-0 items-start gap-5' + (showDetails ? ' has-details' : '')}>
        <div className='min-w-0 overflow-hidden rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] max-xl:overflow-visible max-xl:border-0 max-xl:bg-transparent'>
          {loading && <p role='status' className={emptyClass}>Loading orders…</p>}
          {showEmptyState && (
            <div className={emptyClass}>
              <h2>{emptyHeading}</h2>
              <p>{emptyMessage}</p>
              {orders.length > 0 && <button type='button' className={controlClass} onClick={clearFilters}>Clear filters</button>}
            </div>
          )}
          {showOrderTable && (
            <table className='orders-table' aria-label='Orders table' aria-busy={pending}>
              <thead>
                <tr>{['Order', 'Student', 'Total', 'Payment', 'Order Status', 'Date', 'Action'].map(heading => <th key={heading} scope='col'>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {visibleOrders.map(order => {
                  const date = orderDate(order.date)
                  const selected = showDetails && order._id === selectedId
                  const orderIdLabel = order._id.length > 12
                    ? order._id.slice(0, 9) + '…'
                    : order._id
                  const itemCount = order.items?.length || 0
                  const itemLabel = itemCount === 1 ? 'item' : 'items'
                  const paymentStatus = order.payment ? 'Paid' : 'Pending'
                  const paymentLabel = isDemoOrder(order) ? `${paymentStatus} (DEMO)` : paymentStatus
                  return (
                    <tr key={order._id} className={selected ? 'is-selected' : ''}>
                      <td className='orders-identity'>
                        <img className='orders-thumbnail' src={order.items?.[0]?.image?.[0] || assets.parcel_icon} alt='' />
                        <div>
                          <p title={order._id}>#{orderIdLabel}</p>
                          <span>{itemCount} {itemLabel}<span className='orders-inline-total'> · {formatOrderMoney(order.amount, order)}</span></span>
                        </div>
                      </td>
                      <td className='orders-student'>{orderName(order)}</td>
                      <td className='orders-amount'>{formatOrderMoney(order.amount, order)}</td>
                      <td className='orders-payment'><span className='orders-card-label'>Payment</span><span className='orders-badge'><OrderStatusBadge status={paymentStatus} label={paymentLabel} /></span></td>
                      <td className='orders-status'><span className='orders-card-label'>Order status</span><span className='orders-badge'><OrderStatusBadge status={order.status} label={getOrderStatusLabel(order)} /></span>{order.cancellationRequest?.status === 'pending' && <span className='mt-2 block text-xs font-semibold text-[color:var(--pamo-color-accent-text)]'>Cancellation · {getCancellationRequestLabel(order.cancellationRequest)}</span>}</td>
                      <td className='orders-date'><span>{date.date}</span><span>{date.time}</span></td>
                      <td className='orders-view'>
                        <button type='button' aria-label={'View order ' + order._id} aria-controls='order-details' aria-pressed={selected} onClick={() => viewOrder(order)} className={controlClass}>
                          <span className='orders-view-desktop'>View</span><span className='orders-view-compact'>View Details</span><ArrowRight size={14} aria-hidden='true' />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <p className='px-3.5 py-4 text-xs text-[color:var(--pamo-color-text-secondary)] max-xl:hidden'>Select View for full order information and available actions.</p>
        </div>
        <dialog
          ref={detailsDialog}
          aria-label='Order Details'
          className='orders-inspector m-0 min-w-0 max-w-full overflow-hidden rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 open:block max-xl:fixed max-xl:inset-y-0 max-xl:left-auto max-xl:right-0 max-xl:h-dvh max-xl:max-h-dvh max-xl:w-[min(520px,100%)] max-xl:rounded-l-lg max-xl:rounded-r-none max-sm:w-full max-sm:rounded-none xl:sticky xl:top-4 xl:h-[clamp(420px,calc(100dvh-440px),820px)] xl:max-h-none'
          onCancel={event => { event.preventDefault(); closeDetails() }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); closeDetails(); return }
            containModalFocus(event)
          }}
        >
          <OrderDetails order={showDetails ? selectedOrder : undefined} currency={currency} pending={pending || loading} error={actionError} onAction={requestAction} onReview={openCancellationReview} onClose={closeDetails} programCategories={programCategories} />
        </dialog>
      </div>
      <p className={supportingTextClass + ' max-sm:text-[11px]'} role='status'>{visibleOrders.length} orders currently visible · Refresh to check for updates</p>
      <p className={supportingTextClass + ' max-sm:text-[11px]'}>Payment status and order progress are distinct. A Paid order may also be Ready to Claim.</p>
      <dialog ref={reviewDialog} aria-labelledby='cancellation-review-heading' aria-describedby='cancellation-review-description' className='fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(480px,calc(100%-32px))] overflow-y-auto rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-6 text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60' onKeyDown={containModalFocus} onCancel={event => { event.preventDefault(); if (!mutationPending.current) setReviewSelection(null) }}>
        <h2 id='cancellation-review-heading' className='text-[22px] font-semibold'>{reviewTitle}</h2>
        <p className='mt-3 break-words font-mono text-sm'>#{reviewSelection?.order._id}</p>
        <p id='cancellation-review-description' className='mt-3 text-sm leading-relaxed'>
          {isDemoOrder(reviewSelection?.order)
            ? 'Approval cancels the demo order and releases reserved stock. No real payment or refund obligation exists.'
            : 'Approval cancels the order and releases reserved stock. Paid orders retain a refund obligation; no refund is issued here.'}
        </p>
        {reviewSelection?.decision === 'exception' && <p className='mt-3 text-sm leading-relaxed'>Use only for merchant errors, unavailable products, or legitimate refund concerns. Payment and receipt evidence will be preserved.</p>}
        {reviewSelection?.order.cancellationRequest && <p className='mt-3 whitespace-pre-wrap break-words text-sm'>Student reason: {reviewSelection.order.cancellationRequest.reason}</p>}
        {reviewRequiresReason && <label className='mt-4 block text-sm font-semibold'>{reviewSelection?.decision === 'exception' ? 'Reason for exceptional cancellation' : 'Rejection reason'}<textarea required maxLength={1000} rows={3} value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} disabled={pending} className='mt-2 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] p-3 text-base font-normal' /></label>}
        <div className='mt-5 flex flex-wrap gap-2.5 [&>button]:flex-[1_1_140px]'>
          <button type='button' className={controlClass} autoFocus disabled={pending} onClick={() => setReviewSelection(null)}>Cancel Review</button>
          <button type='button' className={primaryActionClass} disabled={pending || (reviewRequiresReason && !rejectionReason.trim())} onClick={submitCancellationReview}>{pending ? 'Saving…' : 'Confirm Decision'}</button>
        </div>
      </dialog>
      <dialog ref={claimDialog} aria-labelledby='claim-heading' aria-describedby='claim-description' className='fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100%-32px))] overflow-y-auto rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-6 text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60' onKeyDown={containModalFocus} onCancel={cancelClaimDialog}>
        <h2 id='claim-heading' className='text-[22px] font-semibold'>Confirm order claim?</h2>
        <p id='claim-description' className='mt-3.5 text-[13px] text-[color:var(--pamo-color-text-secondary)]'>You are about to mark this order as claimed:</p>
        <strong className='mt-3.5 block text-[13px] [overflow-wrap:anywhere]'>#{claimOrder?._id}</strong>
        {claimOrder && <p className='mt-3.5 text-[13px] text-[color:var(--pamo-color-text-secondary)]'>{orderName(claimOrder)} · {formatOrderMoney(claimOrder.amount, claimOrder)}</p>}
        <p className='mt-3.5 rounded-[5px] bg-[var(--pamo-color-surface-subtle)] p-3 text-[13px] text-[color:var(--pamo-color-accent-text)]'>This confirms that the order was released to the student.</p>
        <div className='mt-5 flex flex-wrap gap-2.5 [&>button]:flex-[1_1_120px]'>
          <button type='button' className={controlClass} autoFocus disabled={pending} onClick={() => setClaimId(null)}>Keep reviewing</button>
          <button type='button' className={primaryActionClass} disabled={pending || loading || !claimOrder?.allowedStatuses?.includes('Claimed')} onClick={() => statusHandler(claimOrder, 'Claimed')}>{pending ? 'Updating…' : 'Confirm Claim'}</button>
        </div>
      </dialog>
    </section>
  )
}

export default Orders
