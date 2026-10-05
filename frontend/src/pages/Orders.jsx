import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { ShopContext } from '../context/ShopContext'
import CustomerOrderCard from '../components/CustomerOrderCard'
import { getOrderPresentation, orderFilters } from '../utils/orderPresentation'

const Orders = () => {
  const { backendUrl, token, currency } = useContext(ShopContext)
  const [orders, setOrders] = useState([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All Orders')
  const [sort, setSort] = useState('newest')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const loadOrders = useCallback(async () => {
    if (!token) return
    const request = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post(backendUrl + '/api/order/userorders', {}, { headers: { token } })
      if (request !== requestId.current) return
      if (!data.success) throw new Error(data.message || 'Unable to load your orders.')
      setOrders(data.orders)
    } catch (error) {
      if (request !== requestId.current) return
      const message = error.response?.data?.message || error.message
      setError(message)
      toast.error(message)
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [backendUrl, token])

  useEffect(() => {
    loadOrders()
    return () => { requestId.current += 1 }
  }, [loadOrders])

  const search = query.trim().toLowerCase()
  const visibleOrders = orders.filter(order => (filter === 'All Orders' || getOrderPresentation(order).group === filter)
    && `${order._id} ${(order.items || []).map(item => item.name || '').join(' ')} ${order.receiptNumber || ''}`.toLowerCase().includes(search))
    .sort((a, b) => (Number(a.date || 0) - Number(b.date || 0)) * (sort === 'oldest' ? 1 : -1))

  return (
    <section className='page-section min-w-0'>
      <div className='mb-5 flex flex-wrap items-end justify-between gap-5'>
        <div><p className='eyebrow mb-3'>YOUR SCHOOL ESSENTIALS</p><h1 className='border-l-4 border-amber-400 pl-3 text-2xl font-semibold tracking-tight sm:text-3xl'>MY ORDERS</h1><p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>Review your orders and refresh to see their latest status.</p></div>
        <div className='flex w-full flex-wrap items-center gap-2 md:w-auto'>
          <label className='relative min-w-0 flex-1 basis-full md:w-56 md:basis-auto'><span className='sr-only'>Search your orders by order ID, product or receipt</span><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500 dark:text-slate-400'><circle cx='10' cy='10' r='6'/><path d='m15 15 5 5'/></svg><input type='search' value={query} onChange={event => setQuery(event.target.value)} placeholder='Search your orders…' className='h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100'/></label>
          <label><span className='sr-only'>Sort orders</span><select value={sort} onChange={event => setSort(event.target.value)} className='h-11 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200'><option value='newest'>Newest first</option><option value='oldest'>Oldest first</option></select></label>
          <button type='button' onClick={loadOrders} disabled={loading} aria-label='Refresh your orders' title='Refresh your orders' className='flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800'><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='h-4 w-4'><path d='M20 11a8 8 0 1 0-2 6M20 4v7h-7'/></svg></button>
        </div>
      </div>
      <div role='group' aria-label='Filter your orders' className='mb-4 flex gap-2 overflow-x-auto pb-2'>
        {orderFilters.map(label => <button key={label} type='button' aria-pressed={filter === label} onClick={() => setFilter(label)} className={'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs ' + (filter === label ? 'border-amber-400 bg-amber-400 font-semibold text-slate-950' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:bg-slate-800')}><span>{label}</span><span className={'rounded px-1.5 py-0.5 text-[10px] ' + (filter === label ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>{label === 'All Orders' ? orders.length : orders.filter(order => getOrderPresentation(order).group === label).length}</span></button>)}
      </div>
      {error && <div role='alert' className='mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300'><p>We could not refresh your orders. Please try again.</p><button type='button' onClick={loadOrders} disabled={loading} className='mt-2 min-h-11 font-semibold underline underline-offset-4'>Try again</button></div>}
      {loading ? <p role='status' className='rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400'>Loading your orders…</p> : visibleOrders.length ? <div className='space-y-4'>{visibleOrders.map(order => <CustomerOrderCard key={order._id} order={order} currency={currency}/>)}</div> : !error && <div className='rounded-xl border border-slate-200 bg-white px-5 py-12 text-center dark:border-slate-800 dark:bg-slate-900/60'><h2 className='text-lg font-semibold'>{orders.length ? 'No matching orders' : 'No orders yet'}</h2><p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>{orders.length ? 'Try a different search or status filter.' : 'Your school essentials will appear here after you place an order.'}</p>{orders.length ? <button type='button' onClick={() => { setQuery(''); setFilter('All Orders') }} className='btn-secondary mt-5'>Clear filters</button> : <Link to='/collection' className='btn-secondary mt-5'>Browse Collection</Link>}</div>}
    </section>
  )
}

export default Orders
