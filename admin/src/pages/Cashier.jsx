import axios from 'axios'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import { backendUrl, currency } from '../utils/config'
import CashierTable from '../components/CashierTable'
import PaymentDetails from '../components/PaymentDetails'
import { orderName } from '../utils/orderPresentation'
import CashierPaymentInspector from '../components/CashierPaymentInspector'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import './CashierPayments.css'
import './CashierTransactions.css'
import './CashierReceipts.css'

const filters = [
  ['Awaiting Payment', order => order.status === 'Sent to Cashier' && order.payment === false],
  ['Paid', order => order.payment === true],
  ['Transactions', order => order.payment === true],
  ['Receipt Records', order => order.payment === true && Boolean(order.receiptNumber)]
]

const Cashier = ({ token, title, filter, onFilterChange }) => {
  const { state, key: viewKey } = useLocation()
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => typeof state?.paymentOrderId === 'string' ? state.paymentOrderId : null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const paying = useRef(false)
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

  useLayoutEffect(() => () => cancelPendingFocus(), [token, viewKey, filter, cancelPendingFocus])

  useLayoutEffect(() => {
    const scope = { token, viewKey, filter, active: true }
    mutationScope.current = scope
    return () => { scope.active = false }
  }, [token, viewKey, filter])

  const refresh = useCallback(async () => {
    const request = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post(backendUrl + '/api/order/cashier/list', {}, { headers: { token } })
      if (request !== requestId.current) return
      if (!data.success) throw new Error(data.message || 'Unable to load cashier orders.')
      setOrders([...data.orders].sort((a, b) => (b.paidAt || b.sentToCashierAt || b.date) - (a.paidAt || a.sentToCashierAt || a.date)))
      setSelectedId(current => data.orders.some(order => order._id === current) ? current : null)
    } catch (error) {
      if (request !== requestId.current) return
      setError(error.response?.data?.message || error.message)
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    refresh()
    return () => { requestId.current += 1 }
  }, [refresh])

  const confirmPayment = async (orderId, fields) => {
    const scope = mutationScope.current
    if (!scope?.active || scope.token !== token || scope.viewKey !== viewKey || scope.filter !== filter) return
    if (paying.current) return
    paying.current = true
    setPending(true)
    setError('')
    try {
      const { data } = await axios.post(backendUrl + '/api/order/cashier/confirm', { orderId, ...fields }, { headers: { token } })
      if (!scope.active) return
      if (!data.success || !data.order) throw new Error(data.message || 'Unable to confirm payment.')
      setOrders(current => current.map(order => order._id === data.order._id ? data.order : order))
      onFilterChange('Paid')
      setQuery('')
      toast.success(data.message)
    } catch (error) {
      if (!scope.active) return
      const message = error.response?.data?.message || error.message
      setError(message)
      toast.error(message)
    } finally {
      paying.current = false
      // Release this request's busy state only while this instance is mounted.
      if (mutationScope.current?.active) setPending(false)
    }
  }

  const search = query.trim().toLowerCase()
  const predicate = filters.find(([label]) => label === filter)[1]
  const visibleOrders = orders.filter(order => predicate(order) && `${order._id} ${orderName(order)} ${order.receiptNumber || ''}`.toLowerCase().includes(search))
  const selected = orders.find(order => order._id === selectedId)
  const view = id => {
    cancelPendingFocus()
    setSelectedId(id)
    if (window.innerWidth >= 1280) return
    const request = { orderId: id, timer: null }
    request.timer = window.setTimeout(() => {
      if (pendingFocus.current !== request) return
      pendingFocus.current = null
      const panel = document.getElementById('payment-details')
      panel?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      panel?.focus({ preventScroll: true })
    }, 0)
    pendingFocus.current = request
  }

  if (filter === 'Transactions') return (
    <section className='cashier-payments-v2 cashier-transactions-v2' aria-labelledby='cashier-transactions-heading'>
      <header className='cashier-payments-heading'>
        <div>
          <p className='cashier-payments-eyebrow'>Cashier / Financial records</p>
          <div className='cashier-payments-title'><h1 id='cashier-transactions-heading'>Transactions</h1><p>Review and track recorded payment transactions.</p></div>
        </div>
        <div className='cashier-payments-search'>
          <label><span className='sr-only'>Search order ID, student name or receipt number</span><Search size={18} aria-hidden='true' /><input type='search' value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setSelectedId(null) }} placeholder='Search order, student, receipt…' /></label>
          <button type='button' onClick={refresh} disabled={loading || pending}><RefreshCw size={16} aria-hidden='true' />Refresh</button>
        </div>
      </header>
      <aside className='cashier-transactions-notice'>
        <div><h2>Confirmed transaction ledger</h2><p>Review-only history of recorded payments. To process payments, use the Payments workspace.</p></div>
        <span>{loading ? 'Loading…' : error ? 'Records unavailable' : `${orders.filter(predicate).length} recorded`}</span>
      </aside>
      {error && !selected && <p role='alert' className='cashier-payments-error'>{error}</p>}
      <div className='cashier-payments-master-detail'>
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} v2 query={query} error={error} />
        {selected
          ? <CashierPaymentInspector key={selectedId} pending={pending || loading} onClose={() => setSelectedId(null)} label='Transaction Details'>
              <PaymentDetails key={selectedId} order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)} error={error} v2 transaction />
            </CashierPaymentInspector>
          : <PaymentDetails order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)} v2 transaction />}
      </div>
      <p className='cashier-payments-footnote'>Ledger review is read-only. Payment confirmation belongs to Payments; receipts remain accessible through Receipt Records.</p>
    </section>
  )

  if (filter === 'Receipt Records') return (
    <section className='cashier-payments-v2 cashier-receipts-v2' aria-labelledby='cashier-receipts-heading'>
      <header className='cashier-payments-heading'>
        <div>
          <p className='cashier-payments-eyebrow'>Cashier / Payment documentation</p>
          <div className='cashier-payments-title'>
            <h1 id='cashier-receipts-heading'>Receipt Records</h1>
            <p>Find and review recorded official receipt information.</p>
          </div>
        </div>
        <div className='cashier-payments-search'>
          <label>
            <span className='sr-only'>Search receipt number, student name or order ID</span>
            <Search size={18} aria-hidden='true' />
            <input type='search' value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setSelectedId(null) }} placeholder='Search receipt, student, order…' />
          </label>
          <button id='cashier-payments-refresh' type='button' onClick={refresh} disabled={loading || pending}><RefreshCw size={16} aria-hidden='true' />Refresh</button>
        </div>
      </header>
      <section className='cashier-receipts-notice' aria-label='Official receipt directory'>
        <div><h2>Official receipt directory</h2><p>Review receipt numbers and the original confirmed payments. No new receipt is generated from this screen.</p></div>
        <span>{loading ? 'Loading records…' : error ? 'Records unavailable' : `${orders.filter(predicate).length} records`}</span>
      </section>
      {error && !selected && <p role='alert' className='cashier-payments-error'>{error}</p>}
      <div className='cashier-payments-master-detail'>
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} currency={currency} v2 query={query} error={error} />
        {selected
          ? <CashierPaymentInspector key={selectedId} pending={pending || loading} onClose={() => setSelectedId(null)} label='Receipt Details'>
              <PaymentDetails key={selectedId} order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)} error={error} v2 receiptRecord />
            </CashierPaymentInspector>
          : <PaymentDetails order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)} v2 receiptRecord />}
      </div>
      <p className='cashier-payments-footnote'>Receipt record review only. Payment confirmation remains in Payments.</p>
    </section>
  )

  const paymentsV2 = filter === 'Awaiting Payment' || filter === 'Paid'
  if (paymentsV2) return (
    <section className='cashier-payments-v2' aria-labelledby='cashier-payments-heading'>
      <header className='cashier-payments-heading'>
        <div>
          <p className='cashier-payments-eyebrow'>Cashier / Payment processing</p>
          <div className='cashier-payments-title'>
            <h1 id='cashier-payments-heading'>Payments</h1>
            <p>Review orders awaiting confirmation and confirmed student payments.</p>
          </div>
        </div>
        <div className='cashier-payments-search'>
          <label>
            <span className='sr-only'>Search order ID, student name or receipt number</span>
            <Search size={18} aria-hidden='true' />
            <input type='search' value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setSelectedId(null) }} placeholder='Search order, student, receipt…' />
          </label>
          <button id='cashier-payments-refresh' type='button' onClick={refresh} disabled={loading || pending}><RefreshCw size={16} aria-hidden='true' />Refresh</button>
        </div>
      </header>
      <div className='cashier-payments-navigation'>
        <div className='cashier-payments-workflow'>
          <h2>Payment workflow</h2>
          <div role='group' aria-label='Filter payments'>
            {filters.slice(0, 2).map(([label, matches]) => (
              <button key={label} type='button' aria-pressed={filter === label} disabled={pending} onClick={() => { onFilterChange(label); setSelectedId(null) }}>
                {label}<span>{loading ? '—' : orders.filter(matches).length}</span>
              </button>
            ))}
          </div>
        </div>
        <nav aria-label='Other Cashier workspaces' className='cashier-payments-workspaces'>
          <h2>Record workspaces</h2>
          <div><Link to='/cashier/transactions'>Transactions<ArrowRight size={14} aria-hidden='true' /></Link><Link to='/cashier/receipts'>Receipt Records<ArrowRight size={14} aria-hidden='true' /></Link></div>
        </nav>
      </div>
      {error && !selected && <p role='alert' className='cashier-payments-error'>{error}</p>}
      <div className='cashier-payments-master-detail'>
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} currency={currency} v2 query={query} error={error} />
        {selected
          ? <CashierPaymentInspector key={selectedId} pending={pending || loading} onClose={() => setSelectedId(null)}>
              <PaymentDetails key={selectedId} order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)} error={error} v2 />
            </CashierPaymentInspector>
          : <PaymentDetails order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)} v2 />}
      </div>
      <p className='cashier-payments-footnote'>Confirmed payments are read-only in this view. Payment status and fulfillment status are separate backend-authoritative facts.</p>
    </section>
  )

  return (
    <section className='min-w-0 text-slate-600 dark:text-slate-400'>
      <div className='grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]'>
      <div className='min-w-0'>
      <div className='mb-5 flex flex-wrap items-start justify-between gap-4'>
        <div><h1 className='text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100'>{title}</h1><p className='mt-1 text-sm'>Process and confirm student payments.</p></div>
        <div className='flex w-full items-center gap-2 sm:w-auto'>
          <label className='relative min-w-0 flex-1 sm:w-72'><span className='sr-only'>Search order ID, student name or receipt number</span><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='pointer-events-none absolute left-3 top-3 h-4 w-4'><circle cx='10' cy='10' r='6'/><path d='m15 15 5 5'/></svg><input type='search' value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setSelectedId(null) }} placeholder='Search order, student, receipt…' className='h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-500 focus:outline focus:outline-2 focus:outline-amber-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'/></label>
          <button type='button' onClick={refresh} disabled={loading || pending} className='inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-4 w-4'><path d='M20 11a8 8 0 1 0-2 6M20 4v7h-7'/></svg>Refresh</button>
        </div>
      </div>
      <div role='group' aria-label='Filter payments' className='mb-4 flex gap-2 overflow-x-auto pb-2'>
        {filters.map(([label, matches]) => <button key={label} type='button' aria-pressed={filter === label} disabled={pending} onClick={() => { onFilterChange(label); setSelectedId(null) }} className={'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs focus-visible:outline-amber-500 disabled:opacity-50 ' + (filter === label ? 'border-amber-400 bg-amber-400 font-semibold text-slate-950' : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800')}><span>{label}</span><span className={'rounded px-1.5 py-0.5 text-[10px] ' + (filter === label ? 'bg-slate-900 text-white' : 'bg-slate-100 dark:bg-slate-800')}>{orders.filter(matches).length}</span></button>)}
      </div>
      {error && <p role='alert' className='mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'>{error}</p>}
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} currency={currency}/>
      </div>
        <PaymentDetails key={selectedId} order={selected} pending={pending || loading} currency={currency} onConfirm={confirmPayment} onClose={() => setSelectedId(null)}/>
      </div>
    </section>
  )
}

export default Cashier
