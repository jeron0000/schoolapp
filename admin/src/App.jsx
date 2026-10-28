import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { adminPanelFromSearch } from '../../shared/loginNavigation'
import { useAuthSession } from '../../shared/authSession'
import CashierLayout from './components/CashierLayout'
import Login from './components/Login'
import Navbar from './components/Navbar'
import Sidebar from './components/Sidebar'
import { useTheme } from './hooks/useTheme'
import Add from './pages/Add'
import Announcements from './pages/Announcements'
import Dashboard from './pages/Dashboard'
import HeroImages from './pages/HeroImages'
import List from './pages/List'
import Orders from './pages/Orders'
import { backendUrl } from './utils/config'

const adminV2Paths = ['/dashboard', '/list', '/orders', '/hero-images', '/announcements']

const readStoredPanel = () => {
  try {
    if (sessionStorage.getItem('pamo-admin-panel') === 'cashier') return 'cashier'
    return 'pamo'
  } catch {
    return 'pamo'
  }
}

const persistPanel = panel => {
  try {
    if (panel) {
      sessionStorage.setItem('pamo-admin-panel', panel)
      return
    }
    sessionStorage.removeItem('pamo-admin-panel')
  } catch {
    // Panel preference storage must not interrupt session cleanup or navigation.
  }
}

const getPanelPath = panel => {
  if (panel === 'cashier') return '/cashier'
  return '/dashboard'
}

const App = () => {
  const { theme } = useTheme()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  let requestedPanel = null
  if (pathname === '/login') requestedPanel = adminPanelFromSearch(search)
  const useAdminV2Layout = adminV2Paths.includes(pathname) || Boolean(matchPath('/add', pathname))

  const { token, setToken, sessionMessage, invalidateSession, isCurrentSession } = useAuthSession(axios, backendUrl, 'staff')
  const [access, setAccess] = useState(null)
  const [panel, setPanel] = useState(() => requestedPanel || readStoredPanel())
  let role = null
  if (access?.token === token) role = access.role
  let loginPanel = panel
  if (access?.role === 'cashier') loginPanel = 'cashier'
  const sessionNotice = useRef('')

  const updateSession = (nextToken, selectedPanel = panel) => {
    setAccess(null)
    setToken(nextToken)

    if (!nextToken) {
      persistPanel(null)
      setPanel('pamo')
      navigate('/', { replace: true })
      return
    }

    setPanel(selectedPanel)
    persistPanel(selectedPanel)
    navigate(getPanelPath(selectedPanel), { replace: true })
  }

  useEffect(() => {
    if (!token) return
    let active = true
    axios.post(backendUrl + '/api/order/cashier/access', {}, { headers: { token } })
      .then(({ data }) => {
        if (!data.success || !['admin', 'cashier'].includes(data.role)) {
          throw new Error(data.message || 'Access denied.')
        }
        if (active && isCurrentSession(token)) setAccess({ token, role: data.role })
      })
      .catch(error => {
        if (active && [401, 403].includes(error.response?.status)) {
          invalidateSession(token)
          return
        }
        if (active && isCurrentSession(token)) {
          setAccess({ token, error: error.response?.data?.message || error.message })
        }
      })
    return () => {
      active = false
    }
  }, [token, invalidateSession, isCurrentSession])

  useEffect(() => {
    if (!sessionMessage) {
      sessionNotice.current = ''
      return
    }
    if (sessionNotice.current === sessionMessage) return
    sessionNotice.current = sessionMessage
    persistPanel(null)
    toast.error(sessionMessage)
    navigate('/login?panel=' + loginPanel, { replace: true })
  }, [sessionMessage, loginPanel, navigate])

  useEffect(() => {
    if (!token || !requestedPanel) return
    persistPanel(requestedPanel)
    navigate(getPanelPath(requestedPanel), { replace: true })
  }, [token, requestedPanel, navigate])

  let accessMessage = 'Checking access…'
  if (access?.token === token && access.error) {
    accessMessage = access.error + ' Sign in again or refresh to retry.'
  }

  return (
    <div className='bg-gray-50 min-h-screen dark:bg-slate-950 dark:text-slate-100'>
      <ToastContainer theme={theme} />
      <AppContent
        accessMessage={accessMessage}
        loginPanel={loginPanel}
        panel={panel}
        pathname={pathname}
        requestedPanel={requestedPanel}
        role={role}
        sessionMessage={sessionMessage}
        token={token}
        updateSession={updateSession}
        useAdminV2Layout={useAdminV2Layout}
      />
    </div>
  )
}

const AppContent = ({ accessMessage, loginPanel, panel, pathname, requestedPanel, role, sessionMessage, token, updateSession, useAdminV2Layout }) => {
  if (token === '') {
    if (sessionMessage && !requestedPanel) {
      return <Navigate to={'/login?panel=' + loginPanel} replace />
    }
    return <Login setToken={updateSession} />
  }

  if (!role) {
    return (
      <>
        <Navbar setToken={updateSession} />
        <p role='status' className='p-5 text-sm'>{accessMessage}</p>
      </>
    )
  }

  if (panel === 'cashier' || role === 'cashier') {
    return <CashierLayout token={token} setToken={updateSession} />
  }

  return (
    <AdminWorkspace
      pathname={pathname}
      token={token}
      updateSession={updateSession}
      useAdminV2Layout={useAdminV2Layout}
    />
  )
}

const AdminWorkspace = ({ pathname, token, updateSession, useAdminV2Layout }) => {
  let layoutClass = 'min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]'
  if (useAdminV2Layout) {
    layoutClass = [
      'pamo-dashboard-layout min-h-screen min-w-0 bg-[var(--pamo-color-surface-subtle)]',
      'text-[color:var(--pamo-color-text-primary)] dark:bg-[var(--pamo-color-surface-navy)]',
      'md:grid md:grid-cols-[220px_minmax(0,1fr)] min-[1180px]:grid-cols-[clamp(228px,6.5vw,280px)_minmax(0,1fr)]',
    ].join(' ')
  }

  let contentClass = 'mx-4 my-8 min-w-0 overflow-x-auto text-gray-600 text-base sm:mx-6 lg:mx-8 dark:text-slate-400'
  if (pathname === '/orders' || useAdminV2Layout) {
    contentClass = 'min-w-0 flex-1 p-4 text-slate-600 md:p-6 xl:p-8 dark:text-slate-400'
    if (useAdminV2Layout) contentClass = 'min-w-0 flex-1 px-[clamp(12px,2.2vw,44px)] py-[clamp(18px,2.4vw,40px)] text-slate-600 dark:text-slate-400'
  }

  return (
    <div className={layoutClass}>
      <Sidebar onLogout={() => updateSession('')} dashboard={useAdminV2Layout} />
      <div className='min-w-0'>
        <Navbar setToken={updateSession} sidebarControls dashboard={useAdminV2Layout} />
        <hr className={useAdminV2Layout ? 'hidden' : 'dark:border-slate-800'} />
        <div className={contentClass}>
          <Routes>
            <Route path='/' element={<Navigate to='/dashboard' replace />} />
            <Route path='/dashboard' element={<Dashboard key={token} token={token} />} />
            <Route path='/add' element={<Add token={token} />} />
            <Route path='/list' element={<List token={token} />} />
            <Route path='/orders' element={<Orders token={token} />} />
            <Route path='/hero-images' element={<HeroImages key={token} token={token} />} />
            <Route path='/announcements' element={<Announcements key={token} token={token} />} />
            <Route path='/cashier/*' element={<Navigate to='/orders' replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

export default App
