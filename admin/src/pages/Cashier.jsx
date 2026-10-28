import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import axios from 'axios'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import CashierPaymentInspector from '../components/CashierPaymentInspector'
import CashierTable from '../components/CashierTable'
import PaymentDetails from '../components/PaymentDetails'
import { backendUrl, currency } from '../utils/config'
import { orderName } from '../utils/orderPresentation'
import './CashierPayments.css'

const filters = [
  ['Awaiting Payment', order => order.status === 'Sent to Cashier' && order.payment === false],
  ['Paid', order => order.payment === true],
  ['Transactions', order => order.payment === true],
  ['Receipt Records', order => order.payment === true && Boolean(order.receiptNumber)]
]

const pageClass = 'mx-auto grid max-w-[2240px] min-w-0 gap-[22px] break-words px-[clamp(16px,2.4vw,40px)] py-8 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] max-xl:gap-5 max-xl:px-[clamp(12px,2.2vw,44px)] max-xl:py-[clamp(18px,2.4vw,40px)]'
const headingClass = 'flex flex-wrap items-center justify-between gap-6'
const eyebrowClass = 'mb-2 text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'
const titleClass = 'border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4 [&_h1]:text-[length:var(--pamo-staff-heading)] [&_h1]:font-bold [&_h1]:leading-[var(--pamo-staff-heading-leading)] [&_h1]:tracking-[-.03em] [&_p]:mt-2.5 [&_p]:text-[color:var(--pamo-color-text-secondary)]'
const searchClass = 'flex w-full min-w-0 gap-2.5 max-md:flex-col xl:w-[min(43%,480px)]'
const searchLabelClass = 'relative min-w-0 flex-1'
const searchIconClass = 'pointer-events-none absolute left-3.5 top-[15px] text-[color:var(--pamo-color-text-secondary)]'
const searchInputClass = 'min-h-12 w-full rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] py-2.5 pl-[42px] pr-3 text-base leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-50 md:text-[length:var(--pamo-staff-small)]'
const controlClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-semibold leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-50'
const sectionLabelClass = 'mb-2 text-[length:var(--pamo-staff-small)] font-semibold uppercase text-[color:var(--pamo-color-text-secondary)]'
const errorClass = 'my-3 rounded-[7px] border border-[color:var(--pamo-color-error-text)] bg-[var(--pamo-color-surface-subtle)] p-3 text-[13px] text-[color:var(--pamo-color-error-text)]'
const masterDetailClass = 'grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'

const publicProgramCategories = response => {
  if (!response?.data?.success) return []
  const active = Array.isArray(response.data.categories) ? response.data.categories : []
  const archived = Array.isArray(response.data.archivedCategories)
    ? response.data.archivedCategories
    : []
  return [...active, ...archived]
}

const getInitialSelectedId = locationState => {
  if (typeof locationState?.paymentOrderId !== 'string') return null
  return locationState.paymentOrderId
}

const getOrderSortTime = order => order.paidAt || order.sentToCashierAt || order.date

const getRecordCountText = ({ loading, error, count, loadingText, suffix }) => {
  if (loading) return loadingText
  if (error) return 'Records unavailable'
  return `${count} ${suffix}`
}

const getFilterButtonClassName = selected => {
  const baseClass = 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs focus-visible:outline-amber-500 disabled:opacity-50 '
  if (selected) return baseClass + 'border-amber-400 bg-amber-400 font-semibold text-slate-950'
  return baseClass + 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800'
}

const getFilterCountClassName = selected => {
  const baseClass = 'rounded px-1.5 py-0.5 text-[10px] '
  if (selected) return baseClass + 'bg-slate-900 text-white'
  return baseClass + 'bg-slate-100 dark:bg-slate-800'
}

const Cashier = ({ token, title, filter, onFilterChange }) => {
  const { state, key: viewKey } = useLocation()
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => getInitialSelectedId(state))
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [programCategories, setProgramCategories] = useState([])
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
      const [orderResponse, categoryResponse] = await Promise.all([
        axios.post(backendUrl + '/api/order/cashier/list', {}, { headers: { token } }),
        axios.get(backendUrl + '/api/category/public').catch(() => null)
      ])
      const { data } = orderResponse
      if (request !== requestId.current) return
      if (!data.success) throw new Error(data.message || 'Unable to load cashier orders.')
      const categories = publicProgramCategories(categoryResponse)
      if (categories.length > 0) setProgramCategories(categories)
      setOrders([...data.orders].sort((firstOrder, secondOrder) => getOrderSortTime(secondOrder) - getOrderSortTime(firstOrder)))
      setSelectedId(current => {
        const selectionStillExists = data.orders.some(order => order._id === current)
        return selectionStillExists ? current : null
      })
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
      const endpoint = fields.receiptOnly ? '/api/order/cashier/receipt' : '/api/order/cashier/confirm'
      const { data } = await axios.post(backendUrl + endpoint, { orderId, ...fields }, { headers: { token } })
      if (!scope.active) return
      if (!data.success || !data.order) throw new Error(data.message || 'Unable to confirm payment.')
      setOrders(current => current.map(order => {
        if (order._id === data.order._id) return data.order
        return order
      }))
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
  const activeFilter = filters.find(([label]) => label === filter)
  const predicate = activeFilter?.[1] || (() => false)
  const visibleOrders = orders.filter(order => predicate(order) && `${order._id} ${orderName(order)} ${order.receiptNumber || ''}`.toLowerCase().includes(search))
  const selected = orders.find(order => order._id === selectedId)
  const filteredOrderCount = orders.filter(predicate).length
  const detailsPending = pending || loading

  const closeDetails = () => setSelectedId(null)
  const changeSearch = event => {
    setQuery(event.target.value)
    setSelectedId(null)
  }
  const changeFilter = label => {
    onFilterChange(label)
    setSelectedId(null)
  }

  const view = id => {
    cancelPendingFocus()
    setSelectedId(id)
    if (window.innerWidth >= 1280) return
    const request = { orderId: id, timer: null }
    request.timer = window.setTimeout(() => {
      if (pendingFocus.current !== request) return
      pendingFocus.current = null
      const panel = document.getElementById('payment-details')
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const behavior = reducedMotion ? 'auto' : 'smooth'
      panel?.scrollIntoView({ behavior, block: 'start' })
      panel?.focus({ preventScroll: true })
    }, 0)
    pendingFocus.current = request
  }

  const renderDetails = ({ label, transaction = false, receiptRecord = false } = {}) => {
    const details = (
      <PaymentDetails
        key={selectedId}
        order={selected}
        pending={detailsPending}
        currency={currency}
        onConfirm={confirmPayment}
        onClose={closeDetails}
        error={selected ? error : undefined}
        v2
        transaction={transaction}
        receiptRecord={receiptRecord}
        programCategories={programCategories}
      />
    )

    if (!selected) return details

    return (
      <CashierPaymentInspector key={selectedId} pending={detailsPending} onClose={closeDetails} label={label}>
        {details}
      </CashierPaymentInspector>
    )
  }

  if (filter === 'Transactions') return (
    <section className={'cashier-transactions-v2 ' + pageClass} aria-labelledby='cashier-transactions-heading'>
      <header className={headingClass}>
        <div className='min-w-0 flex-1'>
          <p className={eyebrowClass}>Cashier / Financial records</p>
          <div className={titleClass}>
            <h1 id='cashier-transactions-heading'>Transactions</h1>
            <p>Review and track recorded payment transactions.</p>
          </div>
        </div>
        <div className={searchClass}>
          <label className={searchLabelClass}>
            <span className='sr-only'>Search order ID, student name or receipt number</span>
            <Search size={18} aria-hidden='true' className={searchIconClass} />
            <input type='search' value={query} disabled={pending} onChange={changeSearch} placeholder='Search order, student, receipt…' className={searchInputClass} />
          </label>
          <button type='button' onClick={refresh} disabled={loading || pending} className={controlClass}>
            <RefreshCw size={16} aria-hidden='true' />
            Refresh
          </button>
        </div>
      </header>
      <aside className='flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[color:var(--pamo-color-border-default)] border-l-[3px] border-l-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-default)] p-[18px]'>
        <div>
          <h2 className='text-[11px] font-semibold uppercase text-[color:var(--pamo-color-accent-text)]'>Confirmed transaction ledger</h2>
          <p className='mt-2.5 text-xs text-[color:var(--pamo-color-text-secondary)]'>Review-only history of recorded payments. To process payments, use the Payments workspace.</p>
        </div>
        <span className='rounded-md bg-[var(--pamo-color-surface-subtle)] px-[18px] py-2.5 text-xs font-semibold'>{getRecordCountText({ loading, error, count: filteredOrderCount, loadingText: 'Loading…', suffix: 'recorded' })}</span>
      </aside>
      {error && !selected && <p role='alert' className={errorClass}>{error}</p>}
      <div className={masterDetailClass}>
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} v2 query={query} error={error} />
        {renderDetails({ label: 'Transaction Details', transaction: true })}
      </div>
      <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Ledger review is read-only. Payment confirmation belongs to Payments; receipts remain accessible through Receipt Records.</p>
    </section>
  )

  if (filter === 'Receipt Records') return (
    <section className={'cashier-receipts-v2 ' + pageClass} aria-labelledby='cashier-receipts-heading'>
      <header className={headingClass}>
        <div className='min-w-0 flex-1'>
          <p className={eyebrowClass}>Cashier / Payment documentation</p>
          <div className={titleClass}>
            <h1 id='cashier-receipts-heading'>Receipt Records</h1>
            <p>Find and review recorded official receipt information.</p>
          </div>
        </div>
        <div className={searchClass}>
          <label className={searchLabelClass}>
            <span className='sr-only'>Search receipt number, student name or order ID</span>
            <Search size={18} aria-hidden='true' className={searchIconClass} />
            <input type='search' value={query} disabled={pending} onChange={changeSearch} placeholder='Search receipt, student, order…' className={searchInputClass} />
          </label>
          <button id='cashier-payments-refresh' type='button' onClick={refresh} disabled={loading || pending} className={controlClass}>
            <RefreshCw size={16} aria-hidden='true' />
            Refresh
          </button>
        </div>
      </header>
      <section className='flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[color:var(--pamo-color-border-default)] border-l-[3px] border-l-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-default)] p-[18px]' aria-label='Official receipt directory'>
        <div>
          <h2 className='text-[11px] font-semibold uppercase text-[color:var(--pamo-color-accent-text)]'>Official receipt directory</h2>
          <p className='mt-2.5 text-xs text-[color:var(--pamo-color-text-secondary)]'>Review receipt numbers and the original confirmed payments. No new receipt is generated from this screen.</p>
        </div>
        <span className='rounded-md bg-[var(--pamo-color-surface-subtle)] px-[18px] py-2.5 text-xs font-semibold'>{getRecordCountText({ loading, error, count: filteredOrderCount, loadingText: 'Loading records…', suffix: 'records' })}</span>
      </section>
      {error && !selected && <p role='alert' className={errorClass}>{error}</p>}
      <div className={masterDetailClass}>
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} currency={currency} v2 query={query} error={error} />
        {renderDetails({ label: 'Receipt Details', receiptRecord: true })}
      </div>
      <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Receipt record review only. Payment confirmation remains in Payments.</p>
    </section>
  )

  const paymentsV2 = filter === 'Awaiting Payment' || filter === 'Paid'
  if (paymentsV2) return (
    <section className={pageClass} aria-labelledby='cashier-payments-heading'>
      <header className={headingClass}>
        <div className='min-w-0 flex-1'>
          <p className={eyebrowClass}>Cashier / Payment processing</p>
          <div className={titleClass}>
            <h1 id='cashier-payments-heading'>Payments</h1>
            <p>Review orders awaiting confirmation and confirmed student payments.</p>
          </div>
        </div>
        <div className={searchClass}>
          <label className={searchLabelClass}>
            <span className='sr-only'>Search order ID, student name or receipt number</span>
            <Search size={18} aria-hidden='true' className={searchIconClass} />
            <input type='search' value={query} disabled={pending} onChange={changeSearch} placeholder='Search order, student, receipt…' className={searchInputClass} />
          </label>
          <button id='cashier-payments-refresh' type='button' onClick={refresh} disabled={loading || pending} className={controlClass}>
            <RefreshCw size={16} aria-hidden='true' />
            Refresh
          </button>
        </div>
      </header>
      <div className='grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <div className='min-w-0 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-3.5 max-[339px]:p-2.5'>
          <h2 className={sectionLabelClass}>Payment workflow</h2>
          <div role='group' aria-label='Filter payments' className='flex flex-wrap gap-2 max-md:flex-nowrap'>
            {filters.slice(0, 2).map(([label, matches]) => (
              <button key={label} type='button' aria-pressed={filter === label} disabled={pending} onClick={() => changeFilter(label)} className='inline-flex min-h-11 items-center justify-between gap-4 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2 text-[length:var(--pamo-staff-small)] font-semibold leading-[var(--pamo-staff-compact-leading)] aria-pressed:border-[color:var(--pamo-color-brand-yellow)] aria-pressed:bg-[var(--pamo-color-brand-yellow)] aria-pressed:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 max-md:min-w-0 max-md:flex-1 max-md:gap-2 max-md:px-2 max-[339px]:gap-1'>
                {label}<span className='rounded-[3px] bg-slate-950 px-[7px] py-0.5 text-[11px] text-white'>{loading ? '—' : orders.filter(matches).length}</span>
              </button>
            ))}
          </div>
        </div>
        <nav aria-label='Other Cashier workspaces' className='min-w-0 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-3.5 max-md:border-0 max-md:bg-transparent max-md:p-0'>
          <h2 className={sectionLabelClass}>Record workspaces</h2>
          <div className='flex flex-wrap gap-2 max-md:grid max-md:grid-cols-2'>
            <Link to='/cashier/transactions' className={controlClass + ' border-transparent bg-transparent py-1.5 max-md:border-[color:var(--pamo-color-border-input)] max-md:bg-[var(--pamo-color-surface-subtle)] max-md:px-2'}>Transactions<ArrowRight size={14} aria-hidden='true' /></Link>
            <Link to='/cashier/receipts' className={controlClass + ' border-transparent bg-transparent py-1.5 max-md:border-[color:var(--pamo-color-border-input)] max-md:bg-[var(--pamo-color-surface-subtle)] max-md:px-2'}>Receipt Records<ArrowRight size={14} aria-hidden='true' /></Link>
          </div>
        </nav>
      </div>
      {error && !selected && <p role='alert' className={errorClass}>{error}</p>}
      <div className={masterDetailClass}>
        <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} currency={currency} v2 query={query} error={error} />
        {renderDetails()}
      </div>
      <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Confirmed payments are read-only in this view. Payment status and fulfillment status are separate backend-authoritative facts.</p>
    </section>
  )

  return (
    <section className='min-w-0 text-slate-600 dark:text-slate-400'>
      <div className='grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]'>
        <div className='min-w-0'>
          <div className='mb-5 flex flex-wrap items-start justify-between gap-4'>
            <div>
              <h1 className='text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100'>{title}</h1>
              <p className='mt-1 text-sm'>Process and confirm student payments.</p>
            </div>
            <div className='flex w-full items-center gap-2 sm:w-auto'>
              <label className='relative min-w-0 flex-1 sm:w-72'>
                <span className='sr-only'>Search order ID, student name or receipt number</span>
                <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='pointer-events-none absolute left-3 top-3 h-4 w-4'>
                  <circle cx='10' cy='10' r='6' />
                  <path d='m15 15 5 5' />
                </svg>
                <input type='search' value={query} disabled={pending} onChange={changeSearch} placeholder='Search order, student, receipt…' className='h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline focus:outline-2 focus:outline-amber-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:text-xs' />
              </label>
              <button type='button' onClick={refresh} disabled={loading || pending} className='inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'>
                <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-4 w-4'>
                  <path d='M20 11a8 8 0 1 0-2 6M20 4v7h-7' />
                </svg>
                Refresh
              </button>
            </div>
          </div>
          <div role='group' aria-label='Filter payments' className='mb-4 flex gap-2 overflow-x-auto pb-2'>
            {filters.map(([label, matches]) => {
              const selectedFilter = filter === label
              return (
                <button key={label} type='button' aria-pressed={selectedFilter} disabled={pending} onClick={() => changeFilter(label)} className={getFilterButtonClassName(selectedFilter)}>
                  <span>{label}</span>
                  <span className={getFilterCountClassName(selectedFilter)}>{orders.filter(matches).length}</span>
                </button>
              )
            })}
          </div>
          {error && <p role='alert' className='mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'>{error}</p>}
          <CashierTable orders={visibleOrders} filter={filter} selectedId={selectedId} loading={loading} pending={pending} onView={view} currency={currency} />
        </div>
        <PaymentDetails key={selectedId} order={selected} pending={detailsPending} currency={currency} onConfirm={confirmPayment} onClose={closeDetails} programCategories={programCategories} />
      </div>
    </section>
  )
}

export default Cashier
