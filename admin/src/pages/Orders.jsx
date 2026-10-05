import axios from 'axios'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { backendUrl, currency } from '../App'
import { toast } from 'react-toastify'
import { assets } from '../assets/assets'
import OrderDetails, { OrderStatusBadge } from '../components/OrderDetails'
import { money, orderDate, orderFilters, orderName } from '../utils/orderPresentation'

const Orders = ({ token }) => {
  const [orders, setOrders] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All Orders')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const mutationPending = useRef(false)
  const requestId = useRef(0)

  const fetchAllOrders = useCallback(async () => {
    if (!token) return
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const response = await axios.post(backendUrl + '/api/order/list', {}, { headers: { token } })
      if (currentRequest !== requestId.current) return
      if (!response.data.success) throw new Error(response.data.message || 'Unable to load orders.')
      const loadedOrders = [...response.data.orders].sort((a,b)=>Number(b.date)-Number(a.date))
      setOrders(loadedOrders)
      setSelectedId(current => loadedOrders.some(order => order._id === current) ? current : loadedOrders[0]?._id || null)
    } catch (error) {
      if (currentRequest !== requestId.current) return
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
    if (mutationPending.current || !order.allowedStatuses?.includes(status)) return
    if (status === 'Cancelled' && !window.confirm('Reject this order?' + (order.payment ? ' This does not issue a payment refund.' : ''))) return
    mutationPending.current = true
    setPending(true)
    try {
      const response = await axios.post(backendUrl + '/api/order/status', { orderId: order._id, status }, { headers: { token } })
      if (!response.data.success) throw new Error(response.data.message || 'Unable to update order.')
      if (response.data.order) {
        setOrders(current => current.map(item => item._id === response.data.order._id ? response.data.order : item))
      } else {
        await fetchAllOrders()
      }
      toast.success(response.data.message || 'Order updated.')
    } catch (error) {
      toast.error(error.response?.data?.message || error.message)
    } finally {
      mutationPending.current = false
      setPending(false)
    }
  }

  const matchesStatus = orderFilters.find(([label])=>label === filter)[1]
  const search = query.trim().toLowerCase()
  const visibleOrders = orders.filter(order => matchesStatus(order) && (order._id + ' ' + orderName(order)).toLowerCase().includes(search))
  const selectedOrder = orders.find(order => order._id === selectedId)

  const viewOrder = (order) => {
    setSelectedId(order._id)
    if (window.innerWidth < 1280) window.setTimeout(()=>{
      document.getElementById('order-details')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      document.getElementById('order-details')?.focus({ preventScroll: true })
    }, 0)
  }

  return (
    <section className='min-w-0 text-slate-600 dark:text-slate-400'>
      <div className='mb-5 flex flex-wrap items-start justify-between gap-4'>
        <div><h1 className='border-l-4 border-amber-400 pl-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-100'>Orders</h1><p className='mt-2 pl-4 text-sm'>Manage and track all student orders.</p></div>
        <div className='flex w-full items-center gap-2 sm:w-auto'>
          <label className='relative min-w-0 flex-1 sm:w-64'><span className='sr-only'>Search order ID or student name</span><svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' className='pointer-events-none absolute left-3 top-3 h-4 w-4'><circle cx='10' cy='10' r='6'/><path d='m15 15 5 5'/></svg><input type='search' value={query} onChange={event=>{setQuery(event.target.value);setSelectedId(null)}} placeholder='Search order ID, student name…' className='h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-500 focus:outline focus:outline-2 focus:outline-amber-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'/></label>
          <button type='button' onClick={fetchAllOrders} disabled={loading || pending} className='min-h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-100 focus-visible:outline-amber-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'>Refresh</button>
        </div>
      </div>
      <div role='group' aria-label='Filter orders' className='mb-5 flex gap-2 overflow-x-auto pb-2'>
        {orderFilters.map(([label,predicate])=><button key={label} type='button' aria-pressed={filter === label} onClick={()=>{setFilter(label);setSelectedId(null)}} className={'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs focus-visible:outline-amber-500 ' + (filter === label ? 'border-amber-400 bg-amber-400 font-semibold text-slate-950' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800')}><span>{label}</span><span className={'rounded px-1.5 py-0.5 text-[10px] ' + (filter === label ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}>{orders.filter(predicate).length}</span></button>)}
      </div>
      {error && <p role='alert' className='mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'>{error}</p>}
      <div className='grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]'>
        <div className='min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/60'>
          {loading ? <p role='status' className='p-8 text-center text-sm'>Loading orders…</p> : visibleOrders.length === 0 ? <div className='p-8 text-center'><h2 className='font-semibold text-slate-900 dark:text-slate-100'>{orders.length ? 'No matching orders' : 'No orders yet'}</h2><p className='mt-2 text-sm'>{orders.length ? 'Try a different search or status filter.' : 'Student orders will appear here when placed.'}</p></div> : <div className='overflow-x-auto' tabIndex={0} role='region' aria-label='Orders table' aria-busy={pending}>
            <table className='w-full min-w-[780px] border-separate border-spacing-y-1 text-left text-xs'>
              <thead><tr>{['Order','Student','Total','Payment','Order Status','Date','Action'].map(heading=><th key={heading} scope='col' className='px-3 py-2 text-[11px] font-medium text-slate-500 dark:text-slate-400'>{heading}</th>)}</tr></thead>
              <tbody>{visibleOrders.map(order=>{
                const date = orderDate(order.date)
                const selected = order._id === selectedId
                const cell = 'border-y px-3 py-3 ' + (selected ? 'border-amber-400 bg-amber-50/70 dark:bg-amber-400/10' : 'border-slate-100 dark:border-slate-800')
                return <tr key={order._id}>
                  <td className={cell + ' rounded-l-lg border-l'}><div className='flex items-center gap-2'><img src={order.items?.[0]?.image?.[0] || assets.parcel_icon} alt='' className='h-10 w-9 shrink-0 rounded bg-slate-100 object-contain dark:bg-slate-800'/><div><p className='max-w-40 break-all font-semibold text-slate-900 dark:text-slate-100'>#{order._id}</p><p className='mt-1 text-[11px]'>{order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'item' : 'items'}</p></div></div></td>
                  <td className={cell}><p className='min-w-20 max-w-36 break-words font-medium text-slate-900 dark:text-slate-100'>{orderName(order)}</p></td>
                  <td className={cell + ' whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100'}>{money(order.amount,currency)}</td>
                  <td className={cell}><OrderStatusBadge status={order.payment ? 'Paid' : 'Pending'}/></td>
                  <td className={cell}><OrderStatusBadge status={order.status}/></td>
                  <td className={cell + ' whitespace-nowrap'}><p>{date.date}</p><p className='mt-1 text-[11px] text-slate-500 dark:text-slate-400'>{date.time}</p></td>
                  <td className={cell + ' rounded-r-lg border-r'}><button type='button' aria-label={'View order ' + order._id} aria-controls='order-details' aria-pressed={selected} onClick={()=>viewOrder(order)} className='min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'>View</button></td>
                </tr>
              })}</tbody>
            </table>
          </div>}
        </div>
        <OrderDetails order={selectedOrder} currency={currency} pending={pending || loading} onAction={statusHandler} onClose={()=>setSelectedId(null)}/>
      </div>
    </section>
  )
}

export default Orders
