// Only public destinations and panel names cross app boundaries, never credentials.
export const adminPanelFromSearch = search => {
  const panel = new URLSearchParams(search).get('panel')
  return panel === 'pamo' || panel === 'cashier' ? panel : null
}

export const loginDestination = (app, { panel, student = false } = {}) => {
  const configured = app === 'admin' ? import.meta.env.VITE_ADMIN_URL : import.meta.env.VITE_CUSTOMER_URL
  const base = configured || (app === 'admin' ? 'http://localhost:5174' : 'http://localhost:5173')
  const destination = new URL('login', base.replace(/\/$/, '') + '/')
  if (!['http:', 'https:'].includes(destination.protocol) || destination.origin === window.location.origin) {
    throw new Error('The login destination is not configured correctly. Please contact PAMO support.')
  }
  if (app === 'admin' && ['pamo', 'cashier'].includes(panel)) destination.searchParams.set('panel', panel)
  if (app === 'customer' && student) destination.searchParams.set('step', 'student')
  return destination.href
}
