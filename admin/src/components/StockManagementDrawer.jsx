import { useEffect, useRef, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { getInventorySizes, getSizeStock, getTotalStock } from '../../../shared/inventory'
import './StockManagementDrawer.css'

const StockManagementDrawer = ({ product, token, onClose, onUpdated, onRefresh, refreshing = false }) => {
  const [adjustments, setAdjustments] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const panel = useRef(null)
  const inputs = useRef({})
  const pending = useRef(false)

  const rows = getInventorySizes(product).map(size => {
    const current = getSizeStock(product, size)
    const adjustment = Number(adjustments[size] || 0)
    const next = current + adjustment
    const valid = Number.isSafeInteger(adjustment) && Number.isSafeInteger(next) && next >= 0
    return { size, current, adjustment, next, valid }
  })
  const valid = rows.every(row => row.valid)
  const changed = rows.some(row => row.adjustment !== 0)
  const total = getTotalStock(product)
  const nextTotal = rows.reduce((sum, row) => sum + row.next, 0)
  const validTotal = valid && Number.isSafeInteger(nextTotal)
  const netChange = nextTotal - total

  useEffect(() => {
    const dialog = panel.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  const submit = async event => {
    event.preventDefault()
    if (pending.current || refreshing) return
    const invalid = rows.find(row => !row.valid)
    if (invalid || !validTotal) {
      setFailed(true)
      setMessage('Enter whole-number adjustments that keep resulting stock between 0 and the supported maximum.')
      if (invalid) inputs.current[invalid.size]?.focus()
      return
    }
    if (!changed) return
    const values = Object.fromEntries(rows.map(({ size, adjustment }) => [size, adjustment]))
    pending.current = true
    setSubmitting(true)
    setMessage('')
    setFailed(false)
    try {
      const { data } = await axios.post(backendUrl + '/api/product/stock', { id: product._id, adjustments: values }, { headers: { token } })
      if (!data.success) throw new Error(data.message)
      onUpdated(data.product)
      setAdjustments({})
      setMessage('Stock updated.')
    } catch (error) {
      setFailed(true)
      setMessage(error.response?.data?.message || error.message)
    } finally {
      pending.current = false
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={panel}
      aria-labelledby='stock-heading'
      aria-describedby='stock-instructions'
      aria-busy={submitting}
      tabIndex={-1}
      onCancel={event => { event.preventDefault(); if (!pending.current) onClose() }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)')
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first) {
          event.preventDefault()
          event.currentTarget.focus()
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
          event.preventDefault()
          first.focus()
        }
      }}
      className='pamo-stock-drawer'
    >
      <header className='stock-drawer-heading'>
        <div>
          <p>Manage inventory</p>
          <h2 id='stock-heading'>Manage Stock</h2>
          <span>{product.name}</span>
        </div>
        <button type='button' onClick={onClose} disabled={submitting} aria-label='Close stock drawer' className='stock-drawer-close' autoFocus>
          <X size={20} aria-hidden='true' />
        </button>
      </header>
      <form onSubmit={submit} noValidate>
        <div className='stock-drawer-content'>
          <div id='stock-instructions' className='stock-drawer-instructions'>
            <h3>How adjustments work</h3>
            <p>Positive adds stock · Negative removes stock</p>
            <span>Review the resulting quantities before updating.</span>
          </div>
          <div className='stock-drawer-columns' aria-hidden='true'>
            <span>Size</span><span>Current</span><span>Change</span><span>New stock</span>
          </div>
          <div className='stock-drawer-rows'>
            {rows.map(({ size, current, adjustment, next, valid }, index) => (
              <div key={size} className='stock-drawer-row'>
                <label htmlFor={`stock-adjustment-${index}`}>{size}</label>
                <span aria-label={`Current stock for ${size}: ${current}`}>{current}</span>
                <div>
                  <input
                    ref={element => { inputs.current[size] = element }}
                    id={`stock-adjustment-${index}`}
                    aria-label={`Adjustment for ${size}`}
                    aria-invalid={!valid}
                    aria-describedby={!valid ? 'stock-invalid-help' : undefined}
                    type='number'
                    step='1'
                    disabled={submitting}
                    value={adjustments[size] ?? 0}
                    onChange={event => {
                      setAdjustments(previous => ({ ...previous, [size]: event.target.value }))
                      setMessage('')
                    }}
                  />
                </div>
                <output aria-label={`New stock for ${size}`} className={!valid ? 'is-invalid' : adjustment > 0 ? 'is-increase' : ''}>
                  {Number.isSafeInteger(next) ? next : '—'}
                </output>
              </div>
            ))}
          </div>
          {!validTotal && <p id='stock-invalid-help' className='stock-drawer-error' role='alert'>Use whole numbers. Resulting quantities must be non-negative and within the supported range.</p>}
          <div className='stock-drawer-total'>
            <h3>Total stock</h3>
            <div>
              <span>{total}</span>
              <span className={'stock-drawer-net' + (netChange > 0 && validTotal ? ' is-increase' : '')}>
                {validTotal ? (netChange > 0 ? '+' : '') + netChange : '—'}
              </span>
              <ArrowRight size={22} aria-hidden='true' />
              <output aria-label='Resulting total stock' className={validTotal && netChange > 0 ? 'is-increase' : !validTotal ? 'is-invalid' : ''}>{validTotal ? nextTotal : '—'}</output>
            </div>
          </div>
          <p className='stock-drawer-note'>Preview based on the stock shown here. The server validates each adjustment against the latest inventory.</p>
          {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'stock-drawer-error' : 'stock-drawer-success'}>{message}</p>}
          {failed && onRefresh && <div className='stock-drawer-refresh'>
            <p>Refresh the quantities and review your adjustments before trying again. Your edits will be kept.</p>
            <button type='button' onClick={onRefresh} disabled={submitting || refreshing}>{refreshing ? 'Refreshing…' : 'Refresh quantities'}</button>
          </div>}
        </div>
        <footer className='stock-drawer-footer'>
          <button type='button' onClick={onClose} disabled={submitting}>Cancel</button>
          <button type='submit' disabled={submitting || refreshing || !changed || !validTotal}>
            {submitting ? 'Updating…' : 'Update Stock'}<ArrowRight size={18} aria-hidden='true' />
          </button>
        </footer>
      </form>
    </dialog>
  )
}

export default StockManagementDrawer
