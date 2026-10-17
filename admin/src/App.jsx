import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import { Routes, Route, Link, Navigate, matchPath, useLocation, useNavigate } from 'react-router-dom'
import Add from './pages/Add'
import List from './pages/List'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import HeroImages from './pages/HeroImages'
import CashierLayout from './components/CashierLayout'
import Login from './components/Login'
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useTheme } from './hooks/useTheme'
import { adminPanelFromSearch } from '../../shared/loginNavigation'
import { backendUrl } from './utils/config'
import { useAuthSession } from '../../shared/authSession'

const readStoredPanel = () => {
  try { return sessionStorage.getItem('pamo-admin-panel') === 'cashier' ? 'cashier' : 'pamo' }
  catch { return 'pamo' }
}

const persistPanel = panel => {
  try {
    if (panel) sessionStorage.setItem('pamo-admin-panel', panel)
    else sessionStorage.removeItem('pamo-admin-panel')
  } catch { /* Panel preference storage must not interrupt session cleanup or navigation. */ }
}

const App = () => {
  const { theme } = useTheme()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const requestedPanel = pathname === '/login' ? adminPanelFromSearch(search) : null
  const useAdminV2Layout = pathname === '/dashboard' || pathname === '/list' || pathname === '/orders' || pathname === '/hero-images' || Boolean(matchPath('/add', pathname))

  const { token, setToken, sessionMessage, invalidateSession, isCurrentSession } = useAuthSession(axios, backendUrl, 'staff')
  const [access, setAccess] = useState(null)
  const [panel, setPanel] = useState(() => requestedPanel || readStoredPanel())
  const role = access?.token === token ? access.role : null
  const loginPanel = access?.role === 'cashier' ? 'cashier' : panel
  const sessionNotice = useRef('')
  const updateSession = (nextToken, selectedPanel = panel) => {
    setAccess(null)
    setToken(nextToken)
    if (nextToken) {
      setPanel(selectedPanel)
      persistPanel(selectedPanel)
      navigate(selectedPanel === 'cashier' ? '/cashier' : '/dashboard', { replace: true })
    } else {
      persistPanel(null)
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
        if (active && isCurrentSession(token)) setAccess({ token, role: data.role })
      })
      .catch(error => {
        if (active && [401, 403].includes(error.response?.status)) {
          invalidateSession(token)
          return
        }
        if (active && isCurrentSession(token)) setAccess({ token, error: error.response?.data?.message || error.message })
      })
    return () => { active = false }
  }, [token, invalidateSession, isCurrentSession])

  useEffect(() => {
    if (!sessionMessage) { sessionNotice.current = ''; return }
    if (sessionNotice.current === sessionMessage) return
    sessionNotice.current = sessionMessage
    persistPanel(null)
    toast.error(sessionMessage)
    navigate('/login?panel=' + loginPanel, { replace: true })
  }, [sessionMessage, loginPanel, navigate])

  useEffect(() => {
    if (!token || !requestedPanel) return
    persistPanel(requestedPanel)
    navigate(requestedPanel === 'cashier' ? '/cashier' : '/dashboard', { replace: true })
  }, [token, requestedPanel, navigate])

  return (
    <div className='bg-gray-50 min-h-screen dark:bg-slate-950 dark:text-slate-100'>
      <ToastContainer theme={theme} />
      {token === ""
        ? sessionMessage && !requestedPanel
          ? <Navigate to={'/login?panel=' + loginPanel} replace />
          : <Login setToken={updateSession} />
        : !role ? <><Navbar setToken={updateSession} /><p role='status' className='p-5 text-sm'>{access?.token === token && access.error ? access.error + ' Sign in again or refresh to retry.' : 'Checking access…'}</p></>
        : panel === 'cashier' || role === 'cashier' ? <CashierLayout token={token} setToken={updateSession} />
        : <div className={'min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]' + (useAdminV2Layout ? ' pamo-dashboard-layout' : '')}>
          <Sidebar onLogout={() => updateSession('')} dashboard={useAdminV2Layout} />
          <div className='min-w-0'>
            <Navbar setToken={updateSession} sidebarControls dashboard={useAdminV2Layout} />
            <hr className='dark:border-slate-800' />
            <div className={pathname === '/orders' || useAdminV2Layout ? 'min-w-0 flex-1 p-4 text-slate-600 md:p-6 xl:p-8 dark:text-slate-400' + (useAdminV2Layout ? ' pamo-dashboard-body' : '') : 'mx-4 my-8 min-w-0 overflow-x-auto text-gray-600 text-base sm:mx-6 lg:mx-8 dark:text-slate-400'}>
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
