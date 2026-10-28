import axios from 'axios'
import { useContext, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShopContext } from '../context/shopContext.js'

const Verify = () => {
  const [params] = useSearchParams()
  const { backendUrl, token, reloadCart, getProductsData } = useContext(ShopContext)
  const [message, setMessage] = useState('Checking the saved payment with the provider. Do not start another checkout.')
  const [busy, setBusy] = useState(true)
  const orderId = params.get('orderId')
  const method = params.get('method')
  const cancelled = params.get('cancelled') === 'true'
  const validReturn = Boolean(token && /^[a-f\d]{24}$/i.test(orderId || '') && ['stripe', 'paypal'].includes(method))

  useEffect(() => {
    let active = true
    if (!validReturn) {
      return () => { active = false }
    }
    const endpoint = method === 'stripe' ? 'verifyStripe' : 'verifyPaypal'
    axios.post(`${backendUrl}/api/order/${endpoint}`, { orderId, cancelled }, { headers: { token } })
      .then(async ({ data }) => {
        if (!data.success) throw new Error('Payment could not be confirmed.')
        if (!active) return
        try {
          const saved = JSON.parse(sessionStorage.getItem('pamo-checkout-request'))
          if (saved?.requestId === data.requestId && !data.cartCleanupPending) {
            sessionStorage.removeItem('pamo-checkout-request')
          }
        } catch { /* Optional retry persistence. */ }
        setMessage(data.cartCleanupPending
          ? 'Test payment verified. Cart synchronization is pending; check My Orders before purchasing again.'
          : 'Test payment verified by the provider. Your order is saved in My Orders.')
        await Promise.allSettled([reloadCart?.(), getProductsData?.()])
      })
      .catch(() => {
        if (active) setMessage('Payment is not confirmed. No cancellation or stock restoration was performed from this return link. Check My Orders or contact PAMO before retrying.')
      })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [backendUrl, token, orderId, method, cancelled, validReturn, reloadCart, getProductsData])

  return (
  <section className='page-section flex min-h-[50vh] items-center justify-center'>
    <div className='panel w-full max-w-md px-6 py-12 text-center' aria-busy={validReturn && busy}>
      <h1 className='text-xl font-semibold'>Test payment verification</h1>
      <p role='status' className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>
        {validReturn ? message : 'Open a valid payment return link after signing in, or check My Orders for the saved payment status.'}
      </p>
      <p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>
        Check My Orders before retrying. If you already paid online, contact PAMO for review.
      </p>
      <div className='mt-6 flex flex-wrap justify-center gap-3'>
        <Link to='/orders' className='btn-primary'>My Orders</Link>
        <Link to='/contact' className='btn-secondary'>Contact PAMO</Link>
      </div>
    </div>
  </section>
  )
}

export default Verify
