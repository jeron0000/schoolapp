import React, { useContext, useEffect } from 'react'
import { ShopContext } from '../context/ShopContext'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import axios from 'axios'

const Verify = () => {

    const { navigate, token, setCartItems, backendUrl } = useContext(ShopContext)
    const [searchParams] = useSearchParams()

    const success = searchParams.get('success')
    const orderId = searchParams.get('orderId')

    // detect payment method (stripe / paypal)
    const method = searchParams.get('method')

    const verifyPayment = async () => {
        try {

            if (!token) {
                return null
            }

            // dynamic endpoint based on method
            let endpoint = ''

            if (method === 'paypal') {
                endpoint = '/api/order/verifyPaypal'
            } else {
                endpoint = '/api/order/verifyStripe'
            }

            const response = await axios.post(
                backendUrl + endpoint,
                { success, orderId, userId: token },
                { headers: { token } }
            )

            if (response.data.success) {
                setCartItems({})
                navigate('/orders')
            } else {
                navigate('/cart')
            }

        } catch (error) {
            console.log(error);
            toast.error(error.message)
        }
    }

    useEffect(() => {
        verifyPayment()
    }, [token])

    return (

    <section className='page-section flex min-h-[50vh] items-center justify-center'>
      <div className='panel w-full max-w-md px-6 py-12 text-center' role='status' aria-live='polite'>
        <div className='mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-900 dark:border-slate-800 dark:border-t-amber-400' aria-hidden='true'/>
        <h1 className='text-xl font-semibold'>Verifying your payment…</h1><p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>Please don't close this page while we check your payment.</p>
      </div>
    </section>
  )
}

export default Verify
