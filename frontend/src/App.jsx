import React from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Collection from './pages/Collection'
import About from './pages/About'
import Contact from './pages/Contact'
import Product from './pages/Product'
import Cart from './pages/Cart'
import Login from './pages/Login'
import PlaceOrder from './pages/PlaceOrder'
import Orders from './pages/Orders'
import NavBar from './components/NavBar'
import Footer from './components/Footer'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Verify from './pages/Verify'
import { useTheme } from './hooks/useTheme'
import ProtectedRoute from './components/ProtectedRoute'
import Announcements from './pages/Announcements'
import Account from './pages/Account'
import DemoPayment from './pages/DemoPayment'

const App = () => {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  return (
    
    <div className={'flex min-h-screen flex-col' + (pathname === '/verify' ? ' storefront-verify' : '')}>
    <ToastContainer theme={theme}/>
    {pathname !== '/login' && <NavBar />}
    <main id='main-content' className={(pathname === '/' || pathname === '/login' || pathname === '/collection' || pathname === '/about' ? '' : 'content-container ') + 'flex-1'}>
    <Routes>
      <Route path='/login' element={<Login/>} />
      <Route element={<ProtectedRoute/>}>
      <Route path='/' element={<Home/>} />
      <Route path='/collection' element={<Collection/>} />
      <Route path='/about' element={<About/>} />
      <Route path='/contact' element={<Contact/>} />
      <Route path='/product/:productId' element={<Product/>} />
      <Route path='/cart' element={<Cart/>} />
      <Route path='/place-order' element={<PlaceOrder/>} />
      <Route path='/orders' element={<Orders/>} />
      <Route path='/announcements' element={<Announcements/>} />
      <Route path='/account' element={<Account/>} />
      <Route path='/verify' element={<Verify/>} />
      <Route path='/demo-payment/:orderId' element={<DemoPayment/>} />
      </Route>
    </Routes>
    </main>

    {pathname !== '/login' && <Footer />}

    </div>
    

  )
}

export default App
