import axios from 'axios'
import { useContext, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShopContext } from '../context/shopContext.js'
import { formatOrderMoney } from '../../../shared/money.js'
import { isDemoOrder } from '../../../shared/demoPayment.js'

const clearDemoRequest = order => {
  if (order.demoPayment.status === 'pending') return
  try {
    const request = JSON.parse(sessionStorage.getItem('pamo-checkout-request'))
    if (request?.requestId === order.requestId) sessionStorage.removeItem('pamo-checkout-request')
  } catch { /* Optional browser retry storage. */ }
}

const DemoPayment = () => {
  const { orderId } = useParams()
  const { backendUrl, token, reloadCart, getProductsData } = useContext(ShopContext)
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const currentScope = useRef(null)

  useEffect(() => {
    const scope = { active: true }
    currentScope.current = scope
    pending.current = null
    setBusy(false)
    setLoading(true)
    setOrder(null)
    setError('')
    axios.get(`${backendUrl}/api/order/demo/${orderId}`, { headers: { token } })
      .then(async ({ data }) => {
        if (!scope.active) return
        if (!data.success || !isDemoOrder(data.order)) throw new Error('Demo order unavailable.')
        setOrder(data.order)
        clearDemoRequest(data.order)
        if (data.order.demoPayment.status !== 'pending') {
          await Promise.all([reloadCart?.(), getProductsData?.()])
          if (scope.active && data.cartCleanupPending) {
            setError('Demo result saved. Cart synchronization is pending; check My Orders before purchasing again.')
          }
        }
      })
      .catch(error => {
        if (scope.active) setError(error.response?.data?.message || 'Unable to load this demo payment.')
      })
      .finally(() => { if (scope.active) setLoading(false) })
    return () => { scope.active = false }
  }, [backendUrl, token, orderId, reloadCart, getProductsData])

  const simulate = async outcome => {
    const scope = currentScope.current
    if (!scope?.active || pending.current === scope) return
    pending.current = scope
    setBusy(true)
    setError('')
    try {
      const { data } = await axios.post(`${backendUrl}/api/order/demo/${orderId}/result`,
        { outcome }, { headers: { token } })
      if (!scope.active) return
      if (!data.success || !isDemoOrder(data.order)) throw new Error('Demo result could not be saved.')
      setOrder(data.order)
      clearDemoRequest(data.order)
      await Promise.all([reloadCart?.(), getProductsData?.()])
      if (scope.active && data.cartCleanupPending) {
        setError('Demo payment saved. Cart synchronization is pending; check My Orders before purchasing again.')
      }
    } catch (error) {
      if (scope.active) setError(error.response?.data?.message || 'Demo result could not be confirmed. Refresh before retrying.')
    } finally {
      if (pending.current === scope) pending.current = null
      if (scope.active) setBusy(false)
    }
  }

  let result = 'Choose a simulated result below.'
  if (order?.demoPayment.status === 'succeeded') result = 'Demo payment succeeded. Your demo order was automatically accepted.'
  if (order?.demoPayment.status === 'failed') result = 'Demo payment failed. Reserved stock was released and your cart was preserved.'
  if (order?.demoPayment.status === 'cancelled') result = 'Demo payment cancelled. Reserved stock was released and your cart was preserved.'

  return (
    <section className='mx-auto w-full max-w-xl py-8 sm:py-12' aria-labelledby='demo-payment-heading'>
      <div className='rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-5 sm:p-8'>
        <p className='text-xs font-semibold uppercase text-[color:var(--pamo-color-accent-text)]'>Thesis demonstration only</p>
        <h1 id='demo-payment-heading' className='mt-3 text-2xl font-bold'>{order?.paymentMethod || 'Demo payment'}</h1>
        <p className='mt-3 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>No real money is charged. Stripe and PayPal are not contacted. No provider verification or official receipt is generated.</p>
        {loading && <p className='mt-5' role='status'>Loading demo order…</p>}
        {error && <p role='alert' className='mt-5 text-sm text-[color:var(--pamo-color-error-text)]'>{error}</p>}
        {order && (
          <>
            <p className='mt-5 break-all font-mono text-xs'>Order {order._id}</p>
            <p className='mt-2 text-xl font-semibold'>{formatOrderMoney(order.amount, order)}</p>
            <p className='mt-4 text-sm leading-6' role='status'>{result}</p>
            {order.demoPayment.transactionId && <p className='mt-3 break-all font-mono text-xs'>Demo transaction: {order.demoPayment.transactionId}</p>}
            {order.demoPayment.status === 'pending' && order.status === 'Order Placed' && (
              <div className='mt-6 grid gap-3 sm:grid-cols-2' aria-busy={busy}>
                <button type='button' className='btn-primary min-h-11' disabled={busy} onClick={() => simulate('succeeded')}>Simulate success</button>
                <button type='button' className='btn-secondary min-h-11' disabled={busy} onClick={() => simulate('failed')}>Simulate failure</button>
                <button type='button' className='btn-secondary min-h-11 sm:col-span-2' disabled={busy} onClick={() => simulate('cancelled')}>Cancel demo payment</button>
              </div>
            )}
          </>
        )}
        <div className='mt-6 flex flex-wrap gap-3'>
          <Link to='/orders' className='btn-secondary min-h-11'>Return to My Orders</Link>
          <Link to='/cart' className='btn-secondary min-h-11'>Return to Cart</Link>
        </div>
      </div>
    </section>
  )
}

export default DemoPayment
