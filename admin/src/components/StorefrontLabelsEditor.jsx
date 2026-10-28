import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { getNewArrivalStatus } from '../../../shared/productLabels.js'

const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'
const controlClass = `min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila'
})

const StorefrontLabelsEditor = ({ product, token, disabled, onUpdated, onDirtyChange, onBusyChange }) => {
  const [bestSeller, setBestSeller] = useState(product.BestSeller === true)
  const [newArrival, setNewArrival] = useState(product.NewArrival === true)
  const [renew, setRenew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const pending = useRef(false)
  const active = useRef(false)
  const status = getNewArrivalStatus(product)
  const changed = renew || bestSeller !== (product.BestSeller === true) || newArrival !== (product.NewArrival === true)
  const blocked = disabled || saving

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => { onDirtyChange?.(changed) }, [changed, onDirtyChange])
  useEffect(() => { onBusyChange?.(saving) }, [saving, onBusyChange])

  const cancel = () => {
    if (pending.current) return
    setBestSeller(product.BestSeller === true)
    setNewArrival(product.NewArrival === true)
    setRenew(false)
    setFeedback(null)
  }

  const save = async event => {
    event.preventDefault()
    if (pending.current || blocked || !changed) return
    const flags = { id: product._id }
    if (bestSeller !== (product.BestSeller === true)) flags.BestSeller = bestSeller
    if (renew || newArrival !== (product.NewArrival === true)) flags.NewArrival = newArrival
    pending.current = true
    setSaving(true)
    setFeedback(null)
    try {
      const { data } = await axios.post(backendUrl + '/api/product/flags', flags, { headers: { token } })
      if (!active.current) return
      if (!data.success || data.product?._id !== product._id) {
        throw new Error(data.message || 'Unable to confirm saved Storefront Labels. Refresh and retry.')
      }
      onUpdated?.(data.product)
      setBestSeller(data.product.BestSeller === true)
      setNewArrival(data.product.NewArrival === true)
      setRenew(false)
      setFeedback({ ok: true, message: 'Storefront Labels saved.' })
    } catch (error) {
      if (active.current) setFeedback({ ok: false, message: error.response?.data?.message || error.message || 'Unable to save Storefront Labels.' })
    } finally {
      pending.current = false
      if (active.current) setSaving(false)
    }
  }

  let statusText = 'New Arrival: Off'
  if (status.enabled) statusText = status.active ? 'New Arrival: Active' : 'New Arrival: Expired'

  return (
    <form onSubmit={save} aria-labelledby='storefront-labels-heading' aria-busy={saving} className='mt-6 border-t border-[color:var(--pamo-color-border-default)] pt-6'>
      <h3 id='storefront-labels-heading' className='text-lg font-semibold'>Storefront Labels</h3>
      <fieldset disabled={blocked} className='mt-3 grid gap-2 disabled:opacity-60'>
        <legend className='sr-only'>Labels for {product.name}</legend>
        <label className='flex min-h-11 cursor-pointer items-center gap-3 text-sm'>
          <input type='checkbox' checked={bestSeller} onChange={event => setBestSeller(event.target.checked)} className={`h-5 w-5 shrink-0 accent-[var(--pamo-color-brand-yellow)] ${focusClass}`} />
          Feature Product
        </label>
        <label className='flex min-h-11 cursor-pointer items-center gap-3 text-sm'>
          <input type='checkbox' checked={newArrival} onChange={event => { setNewArrival(event.target.checked); setRenew(false) }} className={`h-5 w-5 shrink-0 accent-[var(--pamo-color-brand-yellow)] ${focusClass}`} />
          Mark as New Arrival
        </label>
      </fieldset>
      <div className='mt-2 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>
        <p>{statusText}</p>
        {status.enabled && status.expiresAt !== null && <p>Expires: {dateFormatter.format(status.expiresAt)} (Asia/Manila)</p>}
        {status.expired && status.expiresAt === null && <p>No valid marking or creation date. Renew to activate.</p>}
        {newArrival && (!status.enabled || renew) && <p>Saving starts a new 30-day period.</p>}
      </div>
      <div className='mt-4 flex flex-wrap gap-3'>
        {status.expired && newArrival && <button type='button' disabled={blocked || renew} onClick={() => setRenew(true)} className={controlClass}>{renew ? 'Renewal selected' : 'Renew for 30 days'}</button>}
        <button type='button' disabled={blocked || !changed} onClick={cancel} className={controlClass}>Cancel Label Changes</button>
        <button type='submit' disabled={blocked || !changed} className={`${controlClass} border-transparent bg-[var(--pamo-color-brand-yellow)] text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)]`}>{saving ? 'Saving...' : 'Save Labels'}</button>
      </div>
      {feedback && <p role={feedback.ok ? 'status' : 'alert'} className={`mt-3 break-words text-sm ${feedback.ok ? 'text-[color:var(--pamo-color-success-text)]' : 'text-[color:var(--pamo-color-error-text)]'}`}>{feedback.message}</p>}
    </form>
  )
}

export default StorefrontLabelsEditor
