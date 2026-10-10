import axios from 'axios'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import { backendUrl, currency } from '../utils/config'
import CashierTable from '../components/CashierTable'
import PaymentDetails from '../components/PaymentDetails'
import { orderName } from '../utils/orderPresentation'

const filters = [
  ['Awaiting Payment', order => order.status === 'Sent to Cashier' && order.payment === false],
  ['Paid', order => order.payment === true],
  ['Transactions', order => order.payment === true],
  ['Receipt Records', order => order.payment === true && Boolean(order.receiptNumber)]
]

const Cashier = ({ token, title, filter, onFilterChange }) => {
  const { state } = useLocation()
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => typeof state?.paymentOrderId === 'string' ? state.paymentOrderId : null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const paying = useRef(false)

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
    if (paying.current) return
    paying.current = true
    setPending(true)
    setError('')
    try {
      const { data } = await axios.post(backendUrl + '/api/order/cashier/confirm', { orderId, ...fields }, { headers: { token } })
      if (!data.success || !data.order) throw new Error(data.message || 'Unable to confirm payment.')
      setOrders(current => current.map(order => order._id === data.order._id ? data.order : order))
      onFilterChange('Paid')
      setQuery('')
      toast.success(data.message)
    } catch (error) {
      const message = error.response?.data?.message || error.message
      setError(message)
      toast.error(message)
    } finally {
      paying.current = false
      setPending(false)
    }
  }

  const search = query.trim().toLowerCase()
  const predicate = filters.find(([label]) => label === filter)[1]
  const visibleOrders = orders.filter(order => predicate(order) && `${order._id} ${orderName(order)} ${order.receiptNumber || ''}`.toLowerCase().includes(search))
  const selected = orders.find(order => order._id === selectedId)
  const view = id => {
    setSelectedId(id)
    if (window.innerWidth < 1280) window.setTimeout(() => {
      const panel = document.getElementById('payment-details')
      panel?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      panel?.focus({ preventScroll: true })
    }, 0)
  }

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
