import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { backendUrl } from '../App'
import { assets } from '../assets/assets'
import ThemeToggle from './ThemeToggle'
import LoginFlow from '../../../shared/LoginFlow'
import { adminPanelFromSearch, loginDestination } from '../../../shared/loginNavigation'

const Login = ({ setToken }) => {
  const { pathname, search } = useLocation()
  const panel = pathname === '/login' ? adminPanelFromSearch(search) : null
  let destination = ''
  let error = ''
  if (!panel) {
    try { destination = loginDestination('customer') }
    catch (cause) { error = cause.message }
  }

  useEffect(() => {
    if (destination) window.location.replace(destination)
  }, [destination])

  const authenticate = async ({ email, password }, { panel }) => {
    const { data } = await axios.post(backendUrl + '/api/user/admin', { email, password })
    if (!data.success) throw new Error(data.message)
    setToken(data.token, panel)
  }

  if (!panel) return <p role='status' className='p-6 text-sm text-slate-600 dark:text-slate-400'>{error || 'Opening PAMO login…'}</p>
  return <LoginFlow host='admin' logo={assets.logo} themeToggle={<ThemeToggle/>}
    initialStep='adminLogin' initialPanel={panel} onStudent={() => window.location.assign(loginDestination('customer', { student: true }))}
    onAuthenticate={authenticate} onError={message => toast.error(message)}/>
}

export default Login