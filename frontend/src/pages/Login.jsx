import React, { useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'react-toastify'
import { ShopContext } from '../context/ShopContext'
import { assets } from '../assets/assets'
import ThemeToggle from '../components/ThemeToggle'
import LoginFlow from '../../../shared/LoginFlow'
import { loginDestination } from '../../../shared/loginNavigation'

const Login = () => {
  const { token, setToken, navigate, backendUrl } = useContext(ShopContext)
  const { search } = useLocation()
  const studentStep = new URLSearchParams(search).get('step') === 'student'
  const authenticate = async (credentials, { register }) => {
    const { data } = await axios.post(backendUrl + (register ? '/api/user/register' : '/api/user/login'), credentials)
    if (!data.success) throw new Error(data.message)
    setToken(data.token)
    localStorage.setItem('token', data.token)
    navigate('/')
  }

  if (studentStep && token) return <Navigate to='/' replace/>
  return <LoginFlow host='student' logo={assets.logo} themeToggle={<ThemeToggle/>}
    initialStep={studentStep ? 'studentLogin' : 'account'} studentAuthenticated={Boolean(token)}
    onStudent={() => navigate('/')} onAdmin={panel => window.location.assign(loginDestination('admin', { panel }))}
    onAuthenticate={authenticate} onError={message => toast.error(message)}/>
}

export default Login
