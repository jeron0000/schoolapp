import { useContext, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { ShopContext } from '../context/shopContext'

const ProtectedRoute = () => {
  const { token, sessionMessage } = useContext(ShopContext)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Allow ShopContext's existing mount effect to restore a saved token first.
    const timer = window.setTimeout(() => setReady(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  if (!ready) return null
  return token ? <Outlet /> : <Navigate to={sessionMessage ? '/login?step=student' : '/login'} replace />
}

export default ProtectedRoute
