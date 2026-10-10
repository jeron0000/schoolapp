import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { getInventorySizes, getSizeStock, getTotalStock } from '../../../shared/inventory'

const StockManagementDrawer = ({ product, token, onClose, onUpdated }) => {
  const [adjustments, setAdjustments] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const panel = useRef(null)
  const pending = useRef(false)

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current.querySelector('button').focus()
    const onKeyDown = event => {
      if (event.key === 'Escape' && !pending.current) onClose()
      if (event.key !== 'Tab') return
      const controls = panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  const submit = async event => {
    event.preventDefault()
    if (pending.current) return
    const values = Object.fromEntries(getInventorySizes(product).map(size => [size, Number(adjustments[size] || 0)]))
    if (Object.values(values).some(value => !Number.isSafeInteger(value))) { setMessage('Enter whole-number adjustments.'); return }
    if (Object.entries(values).some(([size, value]) => getSizeStock(product, size) + value < 0)) { setMessage('An adjustment cannot make stock negative.'); return }
    pending.current = true
    setSubmitting(true)
    setMessage('')
    try {
      const { data } = await axios.post(backendUrl + '/api/product/stock', { id: product._id, adjustments: values }, { headers: { token } })
      if (!data.success) throw new Error(data.message)
      onUpdated(data.product)
      setAdjustments({})
      setMessage('Stock updated.')
    } catch (error) {
      setMessage(error.response?.data?.message || error.message)
    } finally {
      pending.current = false
      setSubmitting(false)
    }
  }

  return <div className='fixed inset-0 z-50 bg-slate-950/30'>
    <aside ref={panel} role='dialog' aria-modal='true' aria-labelledby='stock-heading' className='absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-slate-200 bg-white text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
      <header className='flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700'>
        <div className='min-w-0'><h2 id='stock-heading' className='text-xl font-semibold'>Manage Stock</h2><p className='mt-2 break-words text-sm text-slate-500 dark:text-slate-400'>{product.name}</p></div>
        <button type='button' onClick={onClose} disabled={submitting} aria-label='Close stock drawer' className='h-11 w-11 shrink-0 rounded-lg border border-slate-300 text-xl dark:border-slate-600'>×</button>
      </header>
      <form onSubmit={submit} className='flex min-h-0 flex-1 flex-col'>
        <div className='flex-1 overflow-y-auto p-5'>
          <h3 className='font-medium'>Current Inventory</h3>
          <p className='mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400'>Use positive numbers to restock and negative numbers to correct stock.</p>
          <div className='mt-5 grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] gap-3 text-xs text-slate-500 dark:text-slate-400'><span>Size</span><span>Current</span><span>Adjustment</span></div>
          {getInventorySizes(product).map(size => <div key={size} className='grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 py-3 text-sm dark:border-slate-800'>
            <span className='break-words'>{size}</span><span>{getSizeStock(product, size)}</span>
            <input aria-label={`Adjustment for ${size}`} type='number' step='1' disabled={submitting} value={adjustments[size] ?? 0} onChange={event => setAdjustments(previous => ({ ...previous, [size]: event.target.value }))} className='min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-slate-50 px-3 dark:border-slate-600 dark:bg-slate-800'/>
          </div>)}
          <p className='mt-5 text-sm font-semibold'>Total Stock: {getTotalStock(product)}</p>
          {message && <p role='status' className='mt-4 text-sm'>{message}</p>}
        </div>
        <div className='flex gap-3 border-t border-slate-200 p-5 dark:border-slate-700'>
          <button type='button' onClick={onClose} disabled={submitting} className='min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600'>Cancel</button>
          <button type='submit' disabled={submitting} className='min-h-11 flex-1 rounded-lg bg-amber-400 px-3 text-sm font-semibold text-slate-950 disabled:opacity-50'>{submitting ? 'Updating…' : 'Update Stock'}</button>
        </div>
      </form>
    </aside>
  </div>
}

export default StockManagementDrawer
