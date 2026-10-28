import { CalendarClock, Check, Megaphone, Package, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  formatPhp,
  phpFromMinorUnits,
  phpMinorUnits,
} from '../../../shared/money.js'
import { containDialogFocus } from '../utils/dialogFocus'
import ProductSelector from './ProductSelector'

const MANILA_TIME_ZONE = 'Asia/Manila'
const MANILA_UTC_OFFSET_HOURS = 8
const focusClass =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'
const controlClass = `min-h-12 w-full min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2.5 text-base text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-60 md:text-sm ${focusClass}`
const secondaryButtonClass = `inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-4 py-2.5 text-sm font-semibold text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`
const primaryButtonClass = `inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--pamo-color-brand-yellow)] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`

const manilaFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: MANILA_TIME_ZONE,
})

const manilaInputFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: MANILA_TIME_ZONE,
})

const toManilaInputValue = value => {
  const parts = Object.fromEntries(
    manilaInputFormatter
      .formatToParts(new Date(value))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const manilaInputToIso = value => {
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  )
  if (!match) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const date = new Date(Date.UTC(
    year,
    month - 1,
    day,
    hour - MANILA_UTC_OFFSET_HOURS,
    minute,
  ))
  if (toManilaInputValue(date) !== value) return null
  return date.toISOString()
}

const canonicalPrice = value => {
  try {
    return phpFromMinorUnits(phpMinorUnits(value))
  } catch {
    return null
  }
}

const currentTimestamp = () => Date.now()

const ProductImage = ({ product }) => {
  const source = Array.isArray(product.image) ? product.image[0] : null
  if (source) {
    return <img src={source} alt='' className='h-12 w-12 shrink-0 rounded-md object-cover' />
  }
  return (
    <span className='grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)]'>
      <Package size={18} aria-hidden='true' />
    </span>
  )
}

const BulkPriceScheduleDialog = ({ products, busy, onClose, onSchedule }) => {
  const [selectedIds, setSelectedIds] = useState([])
  const [prices, setPrices] = useState({})
  const [effectiveAt, setEffectiveAt] = useState('')
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const closeButton = useRef(null)

  useEffect(() => {
    const modal = dialog.current
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    closeButton.current?.focus()
    return () => {
      modal.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const selectedProducts = selectedIds
    .map(productId => products.find(product => product._id === productId))
    .filter(Boolean)

  const changeSelection = productIds => {
    setSelectedIds(productIds)
    setReview(null)
    setError('')
  }

  const updatePrice = (productId, value) => {
    setPrices(current => ({ ...current, [productId]: value }))
    setReview(null)
    setError('')
  }

  const validate = (currentTime, announceToStudents) => {
    if (selectedProducts.length === 0) {
      return { error: 'Choose at least one product.' }
    }
    const effectiveDate = manilaInputToIso(effectiveAt)
    if (!effectiveDate || Date.parse(effectiveDate) <= currentTime) {
      return { error: 'Choose a future Asia/Manila effective date and time.' }
    }
    const changes = []
    for (const product of selectedProducts) {
      const price = canonicalPrice(prices[product._id])
      if (price === null) {
        return { error: `Enter a valid PHP price for ${product.name}.` }
      }
      changes.push({ productId: product._id, price })
    }
    return {
      changes,
      effectiveAt: effectiveDate,
      announceToStudents,
    }
  }

  const reviewSchedule = announceToStudents => {
    if (busy) return
    const values = validate(currentTimestamp(), announceToStudents)
    if (values.error) {
      setError(values.error)
      return
    }
    setReview(values)
    setError('')
  }

  const confirmSchedule = async event => {
    event.preventDefault()
    if (busy || !review) return
    const result = await onSchedule(review)
    if (!result.ok) setError(result.message)
  }

  let submitLabel = review?.announceToStudents
    ? 'Confirm Schedule & Announce'
    : 'Confirm Schedule Only'
  if (busy) submitLabel = 'Scheduling…'

  return (
    <dialog ref={dialog} tabIndex={-1} aria-labelledby='bulk-price-heading' aria-busy={busy} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='fixed inset-0 m-auto max-h-[calc(100dvh-24px)] w-[min(860px,calc(100%-24px))] max-w-none overflow-hidden rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[color:var(--pamo-color-text-primary)] shadow-xl backdrop:bg-slate-950/60'>
      <form onSubmit={confirmSchedule} className='grid max-h-[calc(100dvh-24px)] grid-rows-[auto_minmax(0,1fr)_auto]'>
        <header className='grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[color:var(--pamo-color-border-default)] p-4 sm:p-6'>
          <div className='min-w-0'>
            <p className='text-[10px] font-semibold uppercase tracking-[.08em] text-[color:var(--pamo-color-accent-text)]'>Bulk pricing</p>
            <h2 id='bulk-price-heading' className='mt-2 break-words text-xl font-semibold leading-tight tracking-[-.02em] sm:text-2xl'>{review ? 'Review Scheduled Changes' : 'Schedule Price Changes'}</h2>
            <p className='mt-2 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>All selected prices use one Asia/Manila effective time and commit together.</p>
          </div>
          <button ref={closeButton} type='button' disabled={busy} onClick={onClose} className={`grid h-11 w-11 place-items-center rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] ${focusClass}`} aria-label='Close bulk price scheduling'><X size={18} aria-hidden='true' /></button>
        </header>

        <div className='min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6'>
          {!review && (
            <>
              <ProductSelector
                products={products}
                selectedIds={selectedIds}
                disabled={busy}
                onChange={changeSelection}
                legend='Products to update'
                description='Select every product that should change at the shared effective time.'
              />

              {selectedProducts.length > 0 && (
                <section className='mt-6' aria-labelledby='selected-price-heading'>
                  <h3 id='selected-price-heading' className='text-sm font-semibold'>New PHP prices</h3>
                  <ul className='mt-3 grid min-w-0 gap-3'>
                    {selectedProducts.map(product => (
                      <li key={product._id} className='grid min-w-0 gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,220px)] sm:items-center'>
                        <div className='flex min-w-0 items-center gap-3'>
                          <ProductImage product={product} />
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-semibold'>{product.name}</p>
                            <p className='mt-1 text-xs text-[color:var(--pamo-color-text-secondary)]'>Current: {formatPhp(product.price)}</p>
                          </div>
                        </div>
                        <label className='grid min-w-0 gap-1.5 text-xs font-semibold' htmlFor={`bulk-price-${product._id}`}>
                          New PHP price
                          <input id={`bulk-price-${product._id}`} type='text' inputMode='decimal' value={prices[product._id] || ''} onChange={event => updatePrice(product._id, event.target.value)} disabled={busy} placeholder='0.00' className={controlClass} />
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <label className='mt-6 grid min-w-0 gap-2 text-sm font-semibold' htmlFor='bulk-effective-at'>
                Shared effective date and time
                <input id='bulk-effective-at' type='datetime-local' value={effectiveAt} onChange={event => { setEffectiveAt(event.target.value); setReview(null); setError('') }} disabled={busy} className={controlClass} />
                <span className='text-xs font-normal text-[color:var(--pamo-color-text-secondary)]'>Entered in Asia/Manila and stored in UTC.</span>
              </label>

              <p className='mt-5 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Choose whether to schedule prices only or create one grouped Storefront announcement. Either action opens a review before anything is submitted.</p>
            </>
          )}

          {review && (
            <section aria-label='Price schedule review' className='grid min-w-0 gap-5'>
              <div className='rounded-lg border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] p-4'>
                <p className='flex items-center gap-2 text-sm font-semibold'><CalendarClock size={18} aria-hidden='true' />{manilaFormatter.format(new Date(review.effectiveAt))} (Asia/Manila)</p>
                <p className='mt-2 text-xs text-[color:var(--pamo-color-text-secondary)]'>{review.announceToStudents ? 'One grouped Storefront announcement will be created.' : 'No Storefront announcement will be created.'}</p>
              </div>
              <ul className='grid min-w-0 gap-3'>
                {selectedProducts.map(product => (
                  <li key={product._id} className='flex min-w-0 items-center gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] p-3'>
                    <ProductImage product={product} />
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm font-semibold'>{product.name}</p>
                      <p className='mt-1 text-xs text-[color:var(--pamo-color-text-secondary)]'>{formatPhp(product.price)} → {formatPhp(review.changes.find(change => change.productId === product._id)?.price)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className='text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Confirmation schedules every listed product atomically. If any product conflicts, none are changed.</p>
            </section>
          )}

          {error && <p role='alert' className='mt-5 rounded-md border border-[color:var(--pamo-color-error-text)] px-4 py-3 text-sm text-[color:var(--pamo-color-error-text)]'>{error}</p>}
        </div>

        <footer className='flex flex-wrap justify-end gap-3 border-t border-[color:var(--pamo-color-border-default)] px-4 py-4 sm:px-6'>
          {review && <button type='button' disabled={busy} onClick={() => { setReview(null); setError('') }} className={secondaryButtonClass}>Edit selections</button>}
          <button type='button' disabled={busy} onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          {!review && <button type='button' disabled={busy} onClick={() => reviewSchedule(false)} className={secondaryButtonClass}><CalendarClock size={17} aria-hidden='true' />Schedule Only</button>}
          {!review && <button type='button' disabled={busy} onClick={() => reviewSchedule(true)} className={primaryButtonClass}><Megaphone size={17} aria-hidden='true' />Schedule &amp; Announce</button>}
          {review && <button type='submit' disabled={busy} className={primaryButtonClass}><Check size={17} aria-hidden='true' />{submitLabel}</button>}
        </footer>
      </form>
    </dialog>
  )
}

export default BulkPriceScheduleDialog
