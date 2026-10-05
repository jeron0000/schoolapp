import React, { useContext } from 'react'
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
import SearchBar from './components/SearchBar'
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Verify from './pages/Verify'
import { useTheme } from './hooks/useTheme'
import { ShopContext } from './context/ShopContext'
import ProtectedRoute from './components/ProtectedRoute'

const App = () => {
  const { theme } = useTheme()
  const { token } = useContext(ShopContext)
  const { pathname } = useLocation()
  return (
    
    <div className='flex min-h-screen flex-col'>
    <ToastContainer theme={theme}/>
    {pathname !== '/login' && <NavBar />}
    <main id='main-content' className={(pathname === '/' || pathname === '/login' ? '' : 'content-container ') + 'flex-1'}>
    {token && pathname !== '/login' && <SearchBar />}
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
      <Route path='/verify' element={<Verify/>} />
      </Route>
    </Routes>
    </main>

    {pathname !== '/login' && <Footer />}

    </div>
    

  )
}

export default App
