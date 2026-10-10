import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Add from './pages/Add'
import List from './pages/List'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import HeroImages from './pages/HeroImages'
import CashierLayout from './components/CashierLayout'
import Login from './components/Login'
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTheme } from './hooks/useTheme'
import { adminPanelFromSearch } from '../../shared/loginNavigation'
import { backendUrl } from './utils/config'

const App = () => {
  const { theme } = useTheme()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const requestedPanel = pathname === '/login' ? adminPanelFromSearch(search) : null

  const [token, setToken] = useState(localStorage.getItem('token') ? localStorage.getItem('token') : '');
  const [access, setAccess] = useState(null)
  const [panel, setPanel] = useState(() => requestedPanel || (sessionStorage.getItem('pamo-admin-panel') === 'cashier' ? 'cashier' : 'pamo'))
  const role = access?.token === token ? access.role : null
  const updateSession = (nextToken, selectedPanel = panel) => {
    setAccess(null)
    setToken(nextToken)
    if (nextToken) {
      setPanel(selectedPanel)
      sessionStorage.setItem('pamo-admin-panel', selectedPanel)
      navigate(selectedPanel === 'cashier' ? '/cashier' : '/dashboard', { replace: true })
    } else {
      sessionStorage.removeItem('pamo-admin-panel')
      setPanel('pamo')
      navigate('/', { replace: true })
    }
  }

  useEffect(() => {
    if (!token) return
    let active = true
    axios.post(backendUrl + '/api/order/cashier/access', {}, { headers: { token } })
      .then(({ data }) => {
        if (!data.success || !['admin', 'cashier'].includes(data.role)) throw new Error(data.message || 'Access denied.')
        if (active) setAccess({ token, role: data.role })
      })
      .catch(error => {
        if (active) setAccess({ token, error: error.response?.data?.message || error.message })
      })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    localStorage.setItem('token', token)
  }, [token])

  useEffect(() => {
    if (!token || !requestedPanel) return
    sessionStorage.setItem('pamo-admin-panel', requestedPanel)
    navigate(requestedPanel === 'cashier' ? '/cashier' : '/dashboard', { replace: true })
  }, [token, requestedPanel, navigate])

  return (
    <div className='bg-gray-50 min-h-screen dark:bg-slate-950 dark:text-slate-100'>
      <ToastContainer theme={theme} />
      {token === ""
        ? <Login setToken={updateSession} />
        : !role ? <><Navbar setToken={updateSession} /><p role='status' className='p-5 text-sm'>{access?.token === token && access.error ? access.error + ' Sign in again or refresh to retry.' : 'Checking access…'}</p></>
        : panel === 'cashier' || role === 'cashier' ? <CashierLayout token={token} setToken={updateSession} />
        : <div className='min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]'>
          <Sidebar onLogout={() => updateSession('')} />
          <div className='min-w-0'>
            <Navbar setToken={updateSession} sidebarControls />
            <hr className='dark:border-slate-800' />
            <div className={pathname === '/orders' || pathname === '/dashboard' ? 'min-w-0 flex-1 p-4 text-slate-600 md:p-6 xl:p-8 dark:text-slate-400' : 'mx-4 my-8 min-w-0 overflow-x-auto text-gray-600 text-base sm:mx-6 lg:mx-8 dark:text-slate-400'}>
              <Routes>
                <Route path='/' element={<Navigate to='/dashboard' replace />} />
                <Route path='/dashboard' element={<Dashboard key={token} token={token} />} />
                <Route path='/add' element={<Add token={token} />} />
                <Route path='/list' element={<List token={token} />} />
                <Route path='/orders' element={<Orders token={token} />} />
                <Route path='/hero-images' element={<HeroImages key={token} token={token} />} />
                <Route path='/cashier/*' element={<Navigate to='/orders' replace />} />
              </Routes>

            </div>
          </div>
        </div>
      }



    </div>
  )
}

export default App
