import React, { useContext, useState } from 'react'
import Title from '../components/Title'
import CartTotal from '../components/CartTotal'
import { assets } from '../assets/assets'
import { ShopContext } from '../context/ShopContext'
import axios from 'axios'
import { toast } from 'react-toastify'

const PlaceOrder = () => {

  const [method, setMethod] = useState('cod');
  const { navigate, backendUrl, token, cartItems, setCartItems, getCartAmount, delivery_fee, products } = useContext(ShopContext);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zipcode: '',
    country: '',
    phone: ''
  })

  const onChangeHandler = (event) => {
    const name = event.target.name
    const value = event.target.value

    setFormData(data => ({ ...data, [name]: value }))

  }

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    try {

      console.log(" Submitting Order"); //  DEBUG

      let orderItems = []

      for (const items in cartItems) {
        for (const item in cartItems[items]) {
          if (cartItems[items][item] > 0) {
            const itemInfo = structuredClone(products.find(product => product._id === items))
            if (itemInfo) {
              itemInfo.size = item
              itemInfo.quantity = cartItems[items][item]
              orderItems.push(itemInfo)
            }
          }
        }
      }

      let orderData = {
        address: formData,
        items: orderItems,
        amount: getCartAmount() + delivery_fee
      }

      console.log("📦 Order Data:", orderData);

      switch (method) {

        //API Calls for COD
        case 'cod':
          const response = await axios.post(backendUrl + '/api/order/place', orderData, { headers: { token } })
          if (response.data.success) {
            setCartItems({})
            navigate('/orders')
          } else {
            toast.error(response.data.message)
          }
          break;

          // stripe
        case 'stripe':
          const responseStripe = await axios.post(backendUrl + '/api/order/stripe', orderData, { headers: { token } })
          if (responseStripe.data.success) {
            const {session_url} = responseStripe.data
            window.location.replace(session_url)
          } else {
            toast.error(responseStripe.data.message)
          }
          break;

          // paypal
          case 'paypal':

          console.log("PayPal selected");

          const responsePaypal = await axios.post(
            backendUrl + '/api/order/paypal',
            orderData,
            { headers: { token } }
          )

          console.log("📨 PayPal Response:", responsePaypal.data);

          if (responsePaypal.data.success) {

            const { url } = responsePaypal.data; 

            console.log("Redirecting to:", url); 

            window.location.replace(url);

          } else {
            toast.error(responsePaypal.data.message)
          }

          break; 



      }
    } catch (error) {
      console.log(error);
      toast.error(error.message)

    }
  }

  return (

    <section className='page-section'>
      <div className='mb-8'><p className='eyebrow mb-3'>Complete your order</p><h1 className='text-3xl font-semibold tracking-tight'>Checkout</h1><p className='mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400'>Enter your information and choose how you would like to pay.</p></div>
      <form onSubmit={onSubmitHandler} className='grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10'>
        <div className='panel min-w-0 p-5 sm:p-8'>
          <Title text1={'ORDER'} text2={'INFORMATION'}/>
          <p className='mb-7 text-sm text-slate-500 dark:text-slate-400'>All fields are required.</p>
          <div className='grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2'>
            {[
              ['firstName', 'First name', 'text', 'given-name', false],
              ['lastName', 'Last name', 'text', 'family-name', false],
              ['email', 'Email address', 'email', 'email', true],
              ['street', 'Street address', 'text', 'street-address', true],
              ['city', 'City', 'text', 'address-level2', false],
              ['state', 'State / Province', 'text', 'address-level1', false],
              ['zipcode', 'Zipcode', 'number', 'postal-code', false],
              ['country', 'Country', 'text', 'country-name', false],
              ['phone', 'Phone number', 'number', 'tel', true]
            ].map(([name,label,type,autoComplete,wide]) => (
              <label key={name} className={wide ? 'sm:col-span-2' : ''}><span className='field-label'>{label}</span><input required onChange={onChangeHandler} name={name} value={formData[name]} className='field' type={type} autoComplete={autoComplete} placeholder={label}/></label>
            ))}
          </div>
        </div>
        <aside className='min-w-0 space-y-5'>
          <CartTotal/>
          <div className='panel p-5 sm:p-6'>
            <Title text1={'PAYMENT'} text2={'METHOD'}/>
            <fieldset className='mt-5 space-y-3'>
              <legend className='sr-only'>Choose a payment method</legend>
              {[
                ['stripe', 'Stripe', 'Pay online with your card'],
                ['paypal', 'PayPal', 'Pay using your PayPal account'],
                ['cod', 'PAY AS YOU CLAIM', 'Pay when you claim your order']
              ].map(([value,label,copy]) => (
                <label key={value} className={'flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors duration-[250ms] ' + (method === value ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900 dark:border-slate-400 dark:bg-slate-800/50 dark:ring-amber-400' : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600')}>
                  <input type='radio' name='payment-method' value={value} checked={method === value} onChange={()=>setMethod(value)} className='h-4 w-4 shrink-0'/>
                  <span className='min-w-0 flex-1'><span className='block text-sm font-semibold text-slate-900 dark:text-slate-100'>{label}</span><span className='mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400'>{copy}</span></span>
                  {value === 'stripe' && <img className='h-5 w-auto max-w-16' src={assets.stripe_logo} alt=''/>}
                </label>
              ))}
            </fieldset>
            <button type='submit' className='btn-primary mt-6 w-full'>Place order <span aria-hidden='true'>→</span></button>
          </div>
        </aside>
      </form>
    </section>
  )
}

export default PlaceOrder
