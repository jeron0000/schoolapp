import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock, Check, Pencil, Trash2, X } from 'lucide-react'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { formatPhp, phpFromMinorUnits, phpMinorUnits } from '../../../shared/money'

const MANILA_TIME_ZONE = 'Asia/Manila'
const MANILA_UTC_OFFSET_HOURS = 8
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'
const controlClass = `min-h-12 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 py-2.5 text-base text-[color:var(--pamo-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const secondaryButtonClass = `inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-center font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const primaryButtonClass = `inline-flex min-h-[52px] min-w-0 items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--pamo-color-brand-yellow)] px-4 py-3 text-center font-semibold text-slate-900 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`

const manilaFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: MANILA_TIME_ZONE
})

const manilaInputFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: MANILA_TIME_ZONE
})

const formatManilaDateTime = value => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unavailable'
  return `${manilaFormatter.format(date)} (Asia/Manila)`
}

const toManilaInputValue = value => {
  const parts = Object.fromEntries(
    manilaInputFormatter.formatToParts(new Date(value))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const manilaInputToIso = value => {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, year, month, day, hour, minute] = match.map(Number)
  const utcTime = Date.UTC(year, month - 1, day, hour - MANILA_UTC_OFFSET_HOURS, minute)
  const date = new Date(utcTime)
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

const apiMessage = (error, fallback) => {
  return error.response?.data?.message || error.message || fallback
}

const statusClassName = status => {
  const base = 'rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.06em]'
  if (status === 'pending') return base + ' border-amber-500/50 text-[color:var(--pamo-color-accent-text)]'
  if (status === 'cancelled') return base + ' border-[color:var(--pamo-color-border-default)] text-[color:var(--pamo-color-text-secondary)]'
  return base + ' border-green-600/40 text-[color:var(--pamo-color-success-text)]'
}

const PriceManagementDrawer = ({
  product,
  token,
  onClose,
  onUpdated,
  initialAction = 'view',
  embedded = false,
  onDirtyChange,
  onBusyChange
}) => {
  const [pricing, setPricing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState('immediate')
  const [price, setPrice] = useState('')
  const [effectiveAt, setEffectiveAt] = useState('')
  const [editingPending, setEditingPending] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [action, setAction] = useState('')
  const panel = useRef(null)
  const priceInput = useRef(null)
  const active = useRef(false)
  const pending = useRef(false)
  const pricingRequestId = useRef(0)
  const initialActionApplied = useRef(false)

  const loadPricing = useCallback(async (clearFeedback = true) => {
    const requestId = ++pricingRequestId.current
    setLoading(true)
    setLoadError('')
    if (clearFeedback) setFeedback(null)
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/product/pricing/${product._id}`,
        { headers: { token } }
      )
      if (!active.current || requestId !== pricingRequestId.current) return
      if (!data.success) throw new Error(data.message || 'Unable to load product pricing.')
      setPricing(data.pricing)
      if (!initialActionApplied.current && data.pricing.pendingChange) {
        initialActionApplied.current = true
        if (initialAction === 'edit') {
          setMode('scheduled')
          setPrice(String(data.pricing.pendingChange.amount))
          setEffectiveAt(toManilaInputValue(data.pricing.pendingChange.effectiveAt))
          setEditingPending(true)
          requestAnimationFrame(() => priceInput.current?.focus())
        }
        if (initialAction === 'cancel') setConfirmingCancel(true)
      }
    } catch (error) {
      if (!active.current || requestId !== pricingRequestId.current) return
      setLoadError(apiMessage(error, 'Unable to load product pricing.'))
    } finally {
      if (active.current && requestId === pricingRequestId.current) setLoading(false)
    }
  }, [initialAction, product._id, token])

  useEffect(() => {
    const dialog = panel.current
    active.current = true
    let previousFocus
    let previousOverflow
    if (!embedded) {
      previousFocus = document.activeElement
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      dialog.showModal()
    }
    loadPricing()

    return () => {
      active.current = false
      pricingRequestId.current += 1
      if (!embedded) {
        dialog.close()
        document.body.style.overflow = previousOverflow
        previousFocus?.focus()
      }
    }
  }, [embedded, loadPricing])

  const updatePricing = nextPricing => {
    setPricing(nextPricing)
    onUpdated?.(product._id, nextPricing.currentPrice)
  }

  const clearForm = () => {
    setPrice('')
    setEffectiveAt('')
    setEditingPending(false)
    setConfirmingCancel(false)
  }

  const selectMode = nextMode => {
    setMode(nextMode)
    setFeedback(null)
    if (nextMode === 'immediate') {
      setEditingPending(false)
      setEffectiveAt('')
    }
  }

  const editPendingChange = () => {
    const pendingChange = pricing?.pendingChange
    if (!pendingChange) return
    setMode('scheduled')
    setPrice(String(pendingChange.amount))
    setEffectiveAt(toManilaInputValue(pendingChange.effectiveAt))
    setEditingPending(true)
    setConfirmingCancel(false)
    setFeedback(null)
    requestAnimationFrame(() => priceInput.current?.focus())
  }

  const cancelPendingChange = async () => {
    if (pending.current) return
    pending.current = true
    setAction('cancel')
    setFeedback(null)
    try {
      const { data } = await axios.delete(
        `${backendUrl}/api/product/pricing/${product._id}/pending`,
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message || 'Unable to cancel the pending price change.')
      updatePricing(data.pricing)
      clearForm()
      setFeedback({ type: 'success', message: 'Pending price change cancelled. Its history was retained.' })
    } catch (error) {
      setFeedback({ type: 'error', message: apiMessage(error, 'Unable to cancel the pending price change.') })
    } finally {
      pending.current = false
      setAction('')
      setConfirmingCancel(false)
    }
  }

  const validateForm = () => {
    const amount = canonicalPrice(price)
    if (amount === null) {
      return { error: 'Enter a non-negative PHP price with at most two decimal places.' }
    }
    if (mode === 'immediate') return { amount }

    const effectiveDate = manilaInputToIso(effectiveAt)
    if (!effectiveDate) {
      return { error: 'Choose a valid Asia/Manila date and time.' }
    }
    if (new Date(effectiveDate).getTime() <= Date.now()) {
      return { error: 'Scheduled price changes must use a future Asia/Manila date and time.' }
    }
    return { amount, effectiveAt: effectiveDate }
  }

  const submit = async event => {
    event.preventDefault()
    if (pending.current) return

    const values = validateForm()
    if (values.error) {
      setFeedback({ type: 'error', message: values.error })
      priceInput.current?.focus()
      return
    }
    if (mode === 'scheduled' && pricing?.pendingChange && !editingPending) {
      setFeedback({ type: 'error', message: 'Edit or cancel the existing pending change before scheduling another.' })
      return
    }

    pending.current = true
    setAction('save')
    setFeedback(null)
    try {
      const body = { price: values.amount }
      if (values.effectiveAt) body.effectiveAt = values.effectiveAt
      let endpoint = `${backendUrl}/api/product/pricing/${product._id}`
      if (editingPending) {
        body.pendingChangeId = pricing.pendingChange._id
        endpoint += '/pending'
      }
      const { data } = await axios.patch(
        endpoint,
        body,
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message || 'Unable to update product pricing.')

      updatePricing(data.pricing)
      clearForm()
      setFeedback({ type: 'success', message: values.effectiveAt ? 'Price change scheduled.' : 'Price updated immediately.' })
    } catch (error) {
      let message = apiMessage(error, 'Unable to update product pricing.')
      if (error.response?.status === 409) {
        clearForm()
        await loadPricing(false)
        message += ' Pricing was refreshed.'
      }
      setFeedback({ type: 'error', message })
    } finally {
      pending.current = false
      setAction('')
    }
  }

  const closeUnlessPending = event => {
    event.preventDefault()
    if (!pending.current) onClose()
  }

  const containFocus = event => {
    if (event.key !== 'Tab') return
    const controls = event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first) {
      event.preventDefault()
      event.currentTarget.focus()
      return
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
      event.preventDefault()
      first.focus()
    }
  }

  const busy = Boolean(action)
  const dirty = Boolean(price || effectiveAt || editingPending || confirmingCancel)
  const scheduledBlocked = mode === 'scheduled' && pricing?.pendingChange && !editingPending
  const history = pricing?.history ? [...pricing.history].reverse() : []
  let submitLabel = 'Update Price'
  if (mode === 'scheduled') submitLabel = editingPending ? 'Save Replacement' : 'Schedule Price'
  if (action === 'save') submitLabel = 'Saving…'

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  const Container = embedded ? 'section' : 'dialog'
  const containerProps = embedded
    ? {
        'aria-label': 'Price management',
        className: 'text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)]'
      }
    : {
        ref: panel,
        'aria-labelledby': 'price-management-heading',
        'aria-describedby': 'price-management-description',
        'aria-busy': loading || busy,
        tabIndex: -1,
        onCancel: closeUnlessPending,
        onKeyDown: containFocus,
        className: 'fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-[min(100%,560px)] max-w-full border-0 border-l border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 open:flex open:flex-col'
      }

  return (
    <Container {...containerProps}>
      {!embedded && <header className='flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--pamo-color-border-default)] px-6 pb-6 pt-7 max-[539px]:px-4 max-[539px]:pb-5 max-[539px]:pt-5'>
        <div className='min-w-0'>
          <p className='text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--pamo-color-accent-text)]'>Product pricing</p>
          <h2 id='price-management-heading' className='mt-2 text-[28px] font-bold leading-[1.2] tracking-[-.02em] max-[539px]:text-[25px]'>Manage Price</h2>
          <p id='price-management-description' className='mt-2.5 [overflow-wrap:anywhere] text-[color:var(--pamo-color-text-secondary)]'>{product.name}</p>
        </div>
        <button type='button' onClick={onClose} disabled={busy} aria-label='Close price drawer' className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`} autoFocus>
          <X size={20} aria-hidden='true' />
        </button>
      </header>}

      <div className={embedded ? 'p-6 max-[539px]:p-4' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 max-[539px]:p-4'}>
        {loading && <p role='status' className='py-12 text-center'>Loading pricing…</p>}
        {!loading && loadError && (
          <div role='alert' className='rounded-lg border border-[color:var(--pamo-color-error-text)]/40 p-4 text-[color:var(--pamo-color-error-text)]'>
            <p>{loadError}</p>
            <button type='button' onClick={() => loadPricing()} className={secondaryButtonClass + ' mt-4'}>Try again</button>
          </div>
        )}

        {!loading && !loadError && pricing && (
          <>
            <section aria-labelledby='current-price-heading' className='rounded-lg bg-[var(--pamo-color-surface-subtle)] p-5 max-[359px]:p-4'>
              <p id='current-price-heading' className='text-[10px] font-semibold uppercase tracking-[.1em] text-[color:var(--pamo-color-text-secondary)]'>Current effective price</p>
              <strong className='mt-2 block text-[clamp(1.5rem,5vw,1.75rem)] leading-tight tabular-nums text-[color:var(--pamo-color-text-primary)] [overflow-wrap:anywhere]'>{formatPhp(pricing.currentPrice)}</strong>
              <p className='mt-2 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Server-authoritative PHP price used for new orders.</p>
            </section>

            {pricing.pendingChange && (
              <section aria-labelledby='pending-price-heading' className='mt-5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p id='pending-price-heading' className='text-[10px] font-semibold uppercase tracking-[.09em] text-[color:var(--pamo-color-accent-text)]'>Pending change</p>
                    <strong className='mt-1.5 block text-xl tabular-nums [overflow-wrap:anywhere]'>{formatPhp(pricing.pendingChange.amount)}</strong>
                    <time className='mt-1 block text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]' dateTime={pricing.pendingChange.effectiveAt}>{formatManilaDateTime(pricing.pendingChange.effectiveAt)}</time>
                  </div>
                  {!confirmingCancel && (
                    <div className='flex flex-wrap gap-2 max-[279px]:w-full max-[279px]:[&>button]:w-full'>
                      <button type='button' onClick={editPendingChange} disabled={busy} className={secondaryButtonClass}><Pencil size={15} aria-hidden='true' />Edit</button>
                      <button type='button' onClick={() => setConfirmingCancel(true)} disabled={busy} className={secondaryButtonClass + ' text-[color:var(--pamo-color-error-text)]'}><Trash2 size={15} aria-hidden='true' />Cancel</button>
                    </div>
                  )}
                </div>
                {confirmingCancel && (
                  <div className='mt-4 border-t border-amber-500/30 pt-4'>
                    <p className='text-xs leading-5'>Cancel this pending change? Its record will remain in price history.</p>
                    <div className='mt-3 flex flex-wrap gap-2 max-[279px]:[&>button]:w-full'>
                      <button type='button' onClick={() => setConfirmingCancel(false)} disabled={busy} className={secondaryButtonClass}>Keep change</button>
                      <button type='button' onClick={cancelPendingChange} disabled={busy} className={secondaryButtonClass + ' text-[color:var(--pamo-color-error-text)]'}>{action === 'cancel' ? 'Cancelling…' : 'Confirm cancel'}</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <form onSubmit={submit} noValidate className='mt-6'>
              <fieldset disabled={busy} className='m-0 border-0 p-0'>
                <legend className='font-semibold'>Create a price change</legend>
                <div className='mt-3 grid grid-cols-2 gap-2 max-[319px]:grid-cols-1'>
                  <label className='flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2 has-[:checked]:border-[color:var(--pamo-color-accent-text)]'>
                    <input type='radio' name='price-mode' value='immediate' checked={mode === 'immediate'} onChange={() => selectMode('immediate')} className='h-4 w-4 accent-[var(--pamo-color-brand-yellow)]' />
                    <span>Immediate</span>
                  </label>
                  <label className='flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2 has-[:checked]:border-[color:var(--pamo-color-accent-text)]'>
                    <input type='radio' name='price-mode' value='scheduled' checked={mode === 'scheduled'} onChange={() => selectMode('scheduled')} className='h-4 w-4 accent-[var(--pamo-color-brand-yellow)]' />
                    <span>Scheduled</span>
                  </label>
                </div>

                <label htmlFor='managed-product-price' className='mt-5 block text-xs font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>New price (PHP)</label>
                <div className='relative mt-2'>
                  <span aria-hidden='true' className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]'>₱</span>
                  <input ref={priceInput} id='managed-product-price' type='number' min='0' step='0.01' inputMode='decimal' required value={price} onChange={event => { setPrice(event.target.value); setFeedback(null) }} className={controlClass + ' pl-9'} />
                </div>

                {mode === 'scheduled' && (
                  <div className='mt-5'>
                    <label htmlFor='managed-price-effective-at' className='block text-xs font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>Effective date and time</label>
                    <div className='relative mt-2'>
                      <CalendarClock size={17} aria-hidden='true' className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
                      <input id='managed-price-effective-at' type='datetime-local' required min={toManilaInputValue(Date.now() + 60_000)} value={effectiveAt} onChange={event => { setEffectiveAt(event.target.value); setFeedback(null) }} className={controlClass + ' pl-10'} />
                    </div>
                    <p className='mt-2 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Times are entered and displayed in Asia/Manila.</p>
                  </div>
                )}

                {editingPending && <p className='mt-4 rounded-md bg-[var(--pamo-color-surface-subtle)] p-3 text-xs leading-5'>Saving will retain the original change as cancelled history, then create its replacement.</p>}
                {scheduledBlocked && <p role='alert' className='mt-4 text-xs leading-5 text-[color:var(--pamo-color-error-text)]'>Only one future change is allowed. Edit or cancel the pending change above.</p>}
                {feedback && <p role={feedback.type === 'error' ? 'alert' : 'status'} className={`mt-4 text-sm [overflow-wrap:anywhere] ${feedback.type === 'error' ? 'text-[color:var(--pamo-color-error-text)]' : 'text-[color:var(--pamo-color-success-text)]'}`}>{feedback.message}</p>}

                <div className='mt-5 grid grid-cols-2 gap-3 max-[319px]:grid-cols-1'>
                  <button type='button' onClick={clearForm} disabled={busy} className={secondaryButtonClass}>Clear</button>
                  <button type='submit' disabled={busy || scheduledBlocked} className={primaryButtonClass}>{submitLabel}<Check size={17} aria-hidden='true' /></button>
                </div>
              </fieldset>
            </form>

            <section aria-labelledby='price-history-heading' className='mt-8 border-t border-[color:var(--pamo-color-border-default)] pt-6'>
              <div className='flex flex-wrap items-end justify-between gap-2'>
                <h3 id='price-history-heading' className='font-semibold'>Price history</h3>
                <span className='text-xs text-[color:var(--pamo-color-text-secondary)]'>{history.length} {history.length === 1 ? 'change' : 'changes'}</span>
              </div>
              {history.length === 0 && <p className='mt-3 rounded-lg bg-[var(--pamo-color-surface-subtle)] p-4 text-sm text-[color:var(--pamo-color-text-secondary)]'>No price changes recorded yet. The product’s original price remains the baseline.</p>}
              {history.length > 0 && (
                <ol className='mt-3 grid gap-3'>
                  {history.map(change => (
                    <li key={String(change._id)} className='rounded-lg border border-[color:var(--pamo-color-border-default)] p-4'>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <strong className='tabular-nums [overflow-wrap:anywhere]'>{formatPhp(change.amount)}</strong>
                        <span className={statusClassName(change.status)}>{change.status}</span>
                      </div>
                      <time className='mt-2 block text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]' dateTime={change.effectiveAt}>Effective {formatManilaDateTime(change.effectiveAt)}</time>
                      {change.cancelledAt && <time className='mt-1 block text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]' dateTime={change.cancelledAt}>Cancelled {formatManilaDateTime(change.cancelledAt)}</time>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>

      {!embedded && <footer className='flex shrink-0 border-t border-[color:var(--pamo-color-border-default)] px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 max-[539px]:px-4'>
        <button type='button' onClick={onClose} disabled={busy} className={secondaryButtonClass + ' w-full'}>Close</button>
      </footer>}
    </Container>
  )
}

export default PriceManagementDrawer
