import axios from 'axios'
import {
  CalendarClock,
  Edit3,
  Megaphone,
  Package,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPhp } from '../../../shared/money.js'
import BulkPriceScheduleDialog from '../components/BulkPriceScheduleDialog'
import PriceManagementDrawer from '../components/PriceManagementDrawer'
import ProductSelector from '../components/ProductSelector'
import { containDialogFocus } from '../utils/dialogFocus'
import { backendUrl } from '../utils/config'

const MANILA_TIME_ZONE = 'Asia/Manila'
const MANILA_UTC_OFFSET_HOURS = 8
const emptyForm = {
  type: 'general',
  message: '',
  link: '',
  linkedProductIds: [],
  publishAt: '',
  expiresAt: '',
  enabled: false,
}

const focusClass =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'
const controlClass = `min-h-12 w-full min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2.5 text-base text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-60 md:text-sm ${focusClass}`
const secondaryButtonClass = `inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-4 py-2.5 text-sm font-semibold text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`
const primaryButtonClass = `inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--pamo-color-brand-yellow)] px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60 ${focusClass}`
const cardClass =
  'grid min-w-0 gap-5 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 sm:p-5'

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

const formatManilaDateTime = value => {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unavailable'
  return `${manilaFormatter.format(date)} (Asia/Manila)`
}

const toManilaInputValue = value => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = Object.fromEntries(
    manilaInputFormatter
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const manilaInputToIso = value => {
  if (!value) return null
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  )
  if (!match) return undefined

  const [, year, month, day, hour, minute] = match.map(Number)
  const utcTime = Date.UTC(
    year,
    month - 1,
    day,
    hour - MANILA_UTC_OFFSET_HOURS,
    minute,
  )
  const date = new Date(utcTime)
  if (toManilaInputValue(date) !== value) return undefined
  return date.toISOString()
}

const announcementForm = announcement => {
  if (!announcement) return { ...emptyForm }
  return {
    type: announcement.type,
    message: announcement.message,
    link: announcement.link || '',
    linkedProductIds: announcement.linkedProductIds || [],
    publishAt: toManilaInputValue(announcement.publishAt),
    expiresAt: toManilaInputValue(announcement.expiresAt),
    enabled: announcement.enabled,
  }
}

const announcementStatus = announcement => {
  if (!announcement.enabled) return 'Disabled'
  const now = Date.now()
  if (announcement.publishAt && new Date(announcement.publishAt).getTime() > now) {
    return 'Scheduled'
  }
  if (announcement.expiresAt && new Date(announcement.expiresAt).getTime() <= now) {
    return 'Expired'
  }
  return 'Active'
}

const statusClassName = announcement => {
  const status = announcementStatus(announcement)
  const base =
    'inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold'
  if (status === 'Active') {
    return `${base} border-[color:var(--pamo-color-success-text)] text-[color:var(--pamo-color-success-text)]`
  }
  if (status === 'Scheduled') {
    return `${base} border-[color:var(--pamo-color-accent-text)] text-[color:var(--pamo-color-accent-text)]`
  }
  if (status === 'Expired') {
    return `${base} border-[color:var(--pamo-color-error-text)] text-[color:var(--pamo-color-error-text)]`
  }
  return `${base} border-[color:var(--pamo-color-border-input)] text-[color:var(--pamo-color-text-secondary)]`
}

const typeLabel = type => {
  if (type === 'price-change') return 'Price-change notice'
  return 'General announcement'
}

const responseMessage = (error, fallback) => {
  return error.response?.data?.message || error.message || fallback
}

const validateForm = form => {
  if (!form.message.trim() || form.message.length > 500) {
    return { error: 'Enter an announcement message of 500 characters or fewer.' }
  }
  if (
    form.link &&
    (!form.link.startsWith('/') ||
      form.link.startsWith('//') ||
      form.link.includes('\\'))
  ) {
    return { error: 'Use a valid internal Storefront link beginning with /.' }
  }

  const publishAt = manilaInputToIso(form.publishAt)
  const expiresAt = manilaInputToIso(form.expiresAt)
  if (publishAt === undefined || expiresAt === undefined) {
    return { error: 'Enter valid Asia/Manila publication and expiration times.' }
  }
  if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
    return { error: 'Expiration must be after publication.' }
  }
  return {
    type: form.type,
    message: form.message.trim(),
    link: form.link.trim() || null,
    linkedProductIds: form.linkedProductIds,
    publishAt,
    expiresAt,
    enabled: form.enabled,
  }
}

export const AnnouncementForm = ({
  announcement,
  products,
  busy,
  onClose,
  onSave,
  onStartPriceSchedule,
}) => {
  const [form, setForm] = useState(() => announcementForm(announcement))
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const firstField = useRef(null)

  useEffect(() => {
    const modal = dialog.current
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    firstField.current?.focus()
    return () => {
      modal.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const updateField = event => {
    const { checked, name, type, value } = event.target
    if (name === 'type' && value === 'price-change' && !announcement) {
      onStartPriceSchedule()
      return
    }
    setForm(current => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setError('')
  }

  const submit = async event => {
    event.preventDefault()
    if (busy) return
    const values = validateForm(form)
    if (values.error) {
      setError(values.error)
      return
    }
    const result = await onSave(values)
    if (!result.ok) setError(result.message)
  }

  let submitLabel = announcement ? 'Save changes' : 'Create announcement'
  if (busy) submitLabel = 'Saving…'

  return (
    <dialog ref={dialog} tabIndex={-1} aria-labelledby='announcement-form-heading' aria-busy={busy} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='fixed inset-0 m-auto max-h-[calc(100dvh-24px)] w-[min(760px,calc(100%-24px))] max-w-none overflow-hidden rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[color:var(--pamo-color-text-primary)] shadow-xl backdrop:bg-slate-950/60'>
      <form onSubmit={submit} className='grid max-h-[calc(100dvh-24px)] grid-rows-[auto_minmax(0,1fr)_auto]'>
        <header className='grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[color:var(--pamo-color-border-default)] p-4 sm:p-6'>
          <div className='min-w-0'>
            <h2 id='announcement-form-heading' className='text-xl font-semibold leading-tight tracking-[-.02em] sm:text-2xl'>{announcement ? 'Edit Announcement' : 'Create Announcement'}</h2>
            <p className='mt-2 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Manage content, product links, visibility, and optional scheduling.</p>
          </div>
          <button type='button' disabled={busy} onClick={onClose} className={`grid h-11 w-11 place-items-center rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] ${focusClass}`} aria-label='Close announcement form'><X size={18} aria-hidden='true' /></button>
        </header>

        <div className='min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6'>
          <div className='grid min-w-0 gap-5 sm:grid-cols-2'>
            <label className='grid min-w-0 gap-2 text-sm font-semibold' htmlFor='announcement-type'>
              Announcement type
              <select ref={firstField} id='announcement-type' name='type' value={form.type} onChange={updateField} disabled={busy} className={controlClass}>
                <option value='general'>General announcement</option>
                <option value='price-change'>Price-change notice</option>
              </select>
              {!announcement && <span className='text-xs font-normal leading-5 text-[color:var(--pamo-color-text-secondary)]'>Price-change notices continue into the atomic price scheduling workflow.</span>}
            </label>
            <label className='flex min-h-12 items-center gap-3 self-end rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-4 py-3 text-sm font-semibold'>
              <input name='enabled' type='checkbox' checked={form.enabled} onChange={updateField} disabled={busy} className='h-5 w-5 accent-[var(--pamo-color-brand-yellow)]' />
              Enabled on the Storefront
            </label>
          </div>

          <label className='mt-5 grid min-w-0 gap-2 text-sm font-semibold' htmlFor='announcement-message'>
            Message
            <textarea id='announcement-message' name='message' required maxLength='500' rows='5' value={form.message} onChange={updateField} disabled={busy} className={`${controlClass} min-h-32 resize-y`} />
            <span className='text-xs font-normal text-[color:var(--pamo-color-text-secondary)]'>{form.message.length}/500 characters · displayed as plain text</span>
          </label>

          <ProductSelector products={products} selectedIds={form.linkedProductIds} disabled={busy} onChange={linkedProductIds => setForm(current => ({ ...current, linkedProductIds }))} />

          <label className='mt-6 grid min-w-0 gap-2 text-sm font-semibold' htmlFor='announcement-link'>
            General internal link <span className='font-normal text-[color:var(--pamo-color-text-secondary)]'>(optional)</span>
            <input id='announcement-link' name='link' type='text' maxLength='500' placeholder='/collection' value={form.link} onChange={updateField} disabled={busy} className={controlClass} />
            <span className='text-xs font-normal text-[color:var(--pamo-color-text-secondary)]'>Use for a general Storefront destination. Product associations are managed above.</span>
          </label>

          <fieldset className='mt-6 grid min-w-0 gap-5 border-t border-[color:var(--pamo-color-border-default)] pt-6 sm:grid-cols-2'>
            <legend className='mb-4 flex items-center gap-2 text-sm font-semibold'><CalendarClock size={18} aria-hidden='true' />Optional schedule</legend>
            <label className='grid min-w-0 gap-2 text-sm font-semibold' htmlFor='announcement-publish-at'>
              Publish date and time
              <input id='announcement-publish-at' name='publishAt' type='datetime-local' value={form.publishAt} onChange={updateField} disabled={busy} className={controlClass} />
            </label>
            <label className='grid min-w-0 gap-2 text-sm font-semibold' htmlFor='announcement-expires-at'>
              Expiration date and time
              <input id='announcement-expires-at' name='expiresAt' type='datetime-local' value={form.expiresAt} onChange={updateField} disabled={busy} className={controlClass} />
            </label>
            <p className='text-xs text-[color:var(--pamo-color-text-secondary)] sm:col-span-2'>Times are entered and displayed in Asia/Manila, then stored in UTC.</p>
          </fieldset>

          {error && <p role='alert' className='mt-5 rounded-md border border-[color:var(--pamo-color-error-text)] px-4 py-3 text-sm text-[color:var(--pamo-color-error-text)]'>{error}</p>}
        </div>

        <footer className='flex flex-wrap justify-end gap-3 border-t border-[color:var(--pamo-color-border-default)] px-4 py-4 sm:px-6'>
          <button type='button' disabled={busy} onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type='submit' disabled={busy} className={primaryButtonClass}><Save size={17} aria-hidden='true' />{submitLabel}</button>
        </footer>
      </form>
    </dialog>
  )
}

const DeleteConfirmation = ({ announcement, busy, onClose, onConfirm }) => {
  const dialog = useRef(null)
  const cancelButton = useRef(null)

  useEffect(() => {
    const modal = dialog.current
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    cancelButton.current?.focus()
    return () => {
      modal.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <dialog ref={dialog} tabIndex={-1} aria-labelledby='announcement-delete-heading' aria-busy={busy} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='fixed inset-0 m-auto w-[min(480px,calc(100%-24px))] max-w-none rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[color:var(--pamo-color-text-primary)] shadow-xl backdrop:bg-slate-950/60'>
      <div className='p-5 sm:p-6'>
        <h2 id='announcement-delete-heading' className='text-xl font-semibold'>Delete announcement?</h2>
        <p className='mt-3 break-words text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>This permanently removes “{announcement.message}”. Existing Storefront data outside this announcement is unchanged.</p>
        <div className='mt-6 flex flex-wrap justify-end gap-3'>
          <button ref={cancelButton} type='button' disabled={busy} onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type='button' disabled={busy} onClick={onConfirm} className={`${secondaryButtonClass} border-[color:var(--pamo-color-error-text)] text-[color:var(--pamo-color-error-text)]`}><Trash2 size={17} aria-hidden='true' />{busy ? 'Deleting…' : 'Confirm delete'}</button>
        </div>
      </div>
    </dialog>
  )
}

const AnnouncementCard = ({ announcement, products, busy, onEdit, onToggle, onDelete }) => {
  const linkedProducts = (announcement.linkedProductIds || []).map(productId => {
    return products.find(product => product._id === productId) || {
      _id: productId,
      name: 'Unavailable product',
    }
  })

  return (
    <li className={cardClass}>
      <div className='flex min-w-0 flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-accent-text)]'>{typeLabel(announcement.type)}</p>
          <h2 className='mt-2 line-clamp-2 break-words text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)]'>{announcement.message}</h2>
        </div>
        <span className={statusClassName(announcement)}>{announcementStatus(announcement)}</span>
      </div>

      <dl className='grid min-w-0 gap-3 rounded-md bg-[var(--pamo-color-surface-subtle)] p-4 text-xs text-[color:var(--pamo-color-text-secondary)] sm:grid-cols-2'>
        <div><dt className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Publishes</dt><dd className='mt-1 break-words'>{formatManilaDateTime(announcement.publishAt)}</dd></div>
        <div><dt className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Expires</dt><dd className='mt-1 break-words'>{formatManilaDateTime(announcement.expiresAt)}</dd></div>
      </dl>

      {linkedProducts.length > 0 && (
        <div>
          <p className='text-xs font-semibold'>Linked products</p>
          <ul className='mt-2 flex min-w-0 flex-wrap gap-2'>
            {linkedProducts.map(product => <li key={product._id} className='max-w-full truncate rounded-full border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] px-3 py-1 text-xs'>{product.name}</li>)}
          </ul>
        </div>
      )}

      <div className='grid min-w-0 gap-3 border-t border-[color:var(--pamo-color-border-default)] pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
        <label className='flex min-h-11 min-w-0 items-center gap-3 text-sm font-semibold'>
          <input type='checkbox' role='switch' checked={announcement.enabled} disabled={busy} onChange={event => onToggle(announcement, event.target.checked)} className='h-5 w-5 shrink-0 accent-[var(--pamo-color-brand-yellow)]' />
          {announcement.enabled ? 'Enabled' : 'Disabled'}
        </label>
        <div className='grid min-w-0 grid-cols-2 gap-2 max-[319px]:grid-cols-1'>
          <button type='button' disabled={busy} onClick={() => onEdit(announcement)} className={secondaryButtonClass}><Edit3 size={16} aria-hidden='true' />Edit</button>
          <button type='button' disabled={busy} onClick={() => onDelete(announcement)} className={`${secondaryButtonClass} text-[color:var(--pamo-color-error-text)]`}><Trash2 size={16} aria-hidden='true' />Delete</button>
        </div>
      </div>
    </li>
  )
}

const scheduledAnnouncementLabel = status => {
  if (status === 'not-announced') return 'Not announced'
  if (status === 'scheduled') return 'Announcement scheduled'
  if (status === 'active') return 'Announcement active'
  if (status === 'expired') return 'Announcement expired'
  return 'Announcement disabled'
}

const ScheduledPriceCard = ({ change, busy, onEdit, onCancel }) => {
  const image = Array.isArray(change.image) ? change.image[0] : null

  return (
    <li className={cardClass}>
      <div className='flex min-w-0 items-start gap-4'>
        {image ? (
          <img src={image} alt='' className='h-16 w-16 shrink-0 rounded-lg object-cover' />
        ) : (
          <span className='grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)]'>
            <Package size={22} aria-hidden='true' />
          </span>
        )}
        <div className='min-w-0 flex-1'>
          <p className='text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-accent-text)]'>Scheduled price change</p>
          <h2 className='mt-2 break-words text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)]'>{change.name}</h2>
          <p className='mt-2 text-sm tabular-nums text-[color:var(--pamo-color-text-secondary)] [overflow-wrap:anywhere]'>{formatPhp(change.currentPrice)} <span aria-hidden='true'>→</span> <strong className='text-[color:var(--pamo-color-text-primary)]'>{formatPhp(change.scheduledPrice)}</strong></p>
        </div>
      </div>

      <dl className='grid min-w-0 gap-3 rounded-md bg-[var(--pamo-color-surface-subtle)] p-4 text-xs text-[color:var(--pamo-color-text-secondary)] sm:grid-cols-2'>
        <div><dt className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Effective</dt><dd className='mt-1 break-words'>{formatManilaDateTime(change.effectiveAt)}</dd></div>
        <div><dt className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Student notice</dt><dd className='mt-1 break-words'>{scheduledAnnouncementLabel(change.announcementStatus)}</dd></div>
      </dl>

      <div className='grid min-w-0 grid-cols-2 gap-2 border-t border-[color:var(--pamo-color-border-default)] pt-4 max-[319px]:grid-cols-1'>
        <button type='button' disabled={busy} onClick={() => onEdit(change)} className={secondaryButtonClass}><Edit3 size={16} aria-hidden='true' />Edit</button>
        <button type='button' disabled={busy} onClick={() => onCancel(change)} className={`${secondaryButtonClass} text-[color:var(--pamo-color-error-text)]`}><Trash2 size={16} aria-hidden='true' />Cancel</button>
      </div>
    </li>
  )
}

const Announcements = ({ token }) => {
  const [announcements, setAnnouncements] = useState([])
  const [products, setProducts] = useState([])
  const [scheduledChanges, setScheduledChanges] = useState([])
  const [activeTab, setActiveTab] = useState('announcements')
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState(null)
  const [formAnnouncement, setFormAnnouncement] = useState(undefined)
  const [deleting, setDeleting] = useState(null)
  const [bulkSchedulerOpen, setBulkSchedulerOpen] = useState(false)
  const [priceAction, setPriceAction] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const active = useRef(false)
  const requestId = useRef(0)

  const loadData = useCallback(async () => {
    const currentRequest = ++requestId.current
    setStatus('loading')
    setNotice(null)
    try {
      const [announcementResponse, productResponse, scheduledResponse] = await Promise.all([
        axios.get(backendUrl + '/api/announcement/admin/list', { headers: { token } }),
        axios.get(backendUrl + '/api/product/list'),
        axios.get(backendUrl + '/api/product/pricing/scheduled', { headers: { token } }),
      ])
      if (!active.current || currentRequest !== requestId.current) return
      if (!announcementResponse.data.success) {
        throw new Error(announcementResponse.data.message || 'Unable to load announcements.')
      }
      if (!productResponse.data.success) {
        throw new Error(productResponse.data.message || 'Unable to load products.')
      }
      if (!scheduledResponse.data.success) {
        throw new Error(scheduledResponse.data.message || 'Unable to load scheduled price changes.')
      }
      setAnnouncements(announcementResponse.data.announcements || [])
      setProducts(productResponse.data.products || [])
      setScheduledChanges(scheduledResponse.data.scheduledChanges || [])
      setStatus('ready')
    } catch (error) {
      if (!active.current || currentRequest !== requestId.current) return
      setNotice({ type: 'error', message: responseMessage(error, 'Unable to load announcements.') })
      setStatus('error')
    }
  }, [token])

  useEffect(() => {
    active.current = true
    loadData()
    return () => {
      active.current = false
      requestId.current += 1
    }
  }, [loadData])

  const saveAnnouncement = async values => {
    const current = formAnnouncement || null
    const action = current ? `save:${current._id}` : 'create'
    if (busyAction) return { ok: false, message: 'Another announcement change is still in progress.' }
    setBusyAction(action)
    setNotice(null)
    try {
      let response
      if (current) {
        response = await axios.patch(
          backendUrl + `/api/announcement/admin/${current._id}`,
          values,
          { headers: { token } },
        )
      } else {
        response = await axios.post(
          backendUrl + '/api/announcement/admin',
          values,
          { headers: { token } },
        )
      }
      if (!response.data.success) {
        throw new Error(response.data.message || 'Unable to save the announcement.')
      }
      if (!active.current) return { ok: false, message: 'The page is no longer active.' }
      setAnnouncements(previous => {
        if (!current) return [response.data.announcement, ...previous]
        return previous.map(item => {
          if (item._id === current._id) return response.data.announcement
          return item
        })
      })
      setFormAnnouncement(undefined)
      setNotice({ type: 'success', message: response.data.message })
      return { ok: true }
    } catch (error) {
      const message = responseMessage(error, 'Unable to save the announcement.')
      if (active.current) setNotice({ type: 'error', message })
      return { ok: false, message }
    } finally {
      if (active.current) setBusyAction('')
    }
  }

  const toggleAnnouncement = async (announcement, enabled) => {
    if (busyAction) return
    setBusyAction(`toggle:${announcement._id}`)
    setNotice(null)
    try {
      const { data } = await axios.patch(
        backendUrl + `/api/announcement/admin/${announcement._id}`,
        { enabled },
        { headers: { token } },
      )
      if (!data.success) throw new Error(data.message || 'Unable to update visibility.')
      if (!active.current) return
      setAnnouncements(previous => previous.map(item => {
        if (item._id === announcement._id) return data.announcement
        return item
      }))
      setNotice({ type: 'success', message: enabled ? 'Announcement activated.' : 'Announcement deactivated.' })
    } catch (error) {
      if (active.current) setNotice({ type: 'error', message: responseMessage(error, 'Unable to update visibility.') })
    } finally {
      if (active.current) setBusyAction('')
    }
  }

  const deleteAnnouncement = async () => {
    if (!deleting || busyAction) return
    setBusyAction(`delete:${deleting._id}`)
    setNotice(null)
    try {
      const { data } = await axios.delete(
        backendUrl + `/api/announcement/admin/${deleting._id}`,
        { headers: { token } },
      )
      if (!data.success) throw new Error(data.message || 'Unable to delete the announcement.')
      if (!active.current) return
      setAnnouncements(previous => previous.filter(item => item._id !== deleting._id))
      setDeleting(null)
      setNotice({ type: 'success', message: data.message })
    } catch (error) {
      if (active.current) setNotice({ type: 'error', message: responseMessage(error, 'Unable to delete the announcement.') })
    } finally {
      if (active.current) setBusyAction('')
    }
  }

  const scheduleBulkPrices = async values => {
    if (busyAction) {
      return { ok: false, message: 'Another management change is still in progress.' }
    }
    setBusyAction('bulk-pricing')
    setNotice(null)
    try {
      const { data } = await axios.post(
        backendUrl + '/api/product/pricing/bulk',
        values,
        { headers: { token } },
      )
      if (!data.success) throw new Error(data.message || 'Unable to schedule price changes.')
      if (!active.current) return { ok: false, message: 'The page is no longer active.' }
      setBulkSchedulerOpen(false)
      setActiveTab('pricing')
      await loadData()
      if (active.current) {
        setNotice({
          type: 'success',
          message: `${data.schedule.changes.length} price changes scheduled${data.schedule.announcementId ? ' with one student announcement' : ''}.`,
        })
      }
      return { ok: true }
    } catch (error) {
      const message = responseMessage(error, 'Unable to schedule price changes.')
      if (active.current) setNotice({ type: 'error', message })
      return { ok: false, message }
    } finally {
      if (active.current) setBusyAction('')
    }
  }

  const openPriceAction = (change, action) => {
    setPriceAction({ productId: change.productId, initialAction: action })
  }

  const startPriceSchedule = () => {
    setFormAnnouncement(undefined)
    setBulkSchedulerOpen(true)
  }

  const refreshScheduledPricing = () => {
    loadData()
  }

  const busy = Boolean(busyAction)
  const noticeRole = notice?.type === 'error' ? 'alert' : 'status'
  const noticeClass = notice?.type === 'error'
    ? 'border-[color:var(--pamo-color-error-text)] text-[color:var(--pamo-color-error-text)]'
    : 'border-[color:var(--pamo-color-success-text)] text-[color:var(--pamo-color-success-text)]'
  const announcementLabel = announcements.length === 1 ? 'announcement' : 'announcements'
  const scheduledLabel = scheduledChanges.length === 1 ? 'change' : 'changes'
  const selectedPriceProduct = priceAction
    ? products.find(product => product._id === priceAction.productId)
    : null

  return (
    <section aria-labelledby='announcements-heading' className='mx-auto grid max-w-[2160px] min-w-0 grid-cols-[minmax(0,1fr)] gap-6 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] max-sm:gap-[18px]'>
      <nav className='flex flex-wrap items-center gap-2 text-[length:var(--pamo-staff-small)] uppercase text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center' aria-label='Breadcrumb'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Storefront content</span><span aria-hidden='true'>/</span><span aria-current='page'>Announcements</span>
      </nav>

      <header className='flex items-center justify-between gap-6 max-sm:flex-col max-sm:items-stretch'>
        <div className='min-w-0 border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4'>
          <h1 id='announcements-heading' className='break-words text-[length:var(--pamo-staff-heading)] font-bold leading-[var(--pamo-staff-heading-leading)] tracking-[-.025em]'>Announcements</h1>
          <p className='mt-2.5 text-[color:var(--pamo-color-text-secondary)]'>Manage Storefront notices and coordinated product pricing.</p>
        </div>
        {activeTab === 'announcements' ? (
          <button type='button' disabled={status !== 'ready' || busy} onClick={() => setFormAnnouncement(null)} className={primaryButtonClass}><Plus size={18} aria-hidden='true' />Create Announcement</button>
        ) : (
          <button type='button' disabled={status !== 'ready' || busy} onClick={() => setBulkSchedulerOpen(true)} className={primaryButtonClass}><CalendarClock size={18} aria-hidden='true' />Schedule Price Changes</button>
        )}
      </header>

      <div role='group' aria-label='Announcements management view' className='grid min-w-0 grid-cols-2 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-1 max-[359px]:grid-cols-1'>
        <button type='button' aria-pressed={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')} className={`min-h-11 rounded-md px-3 py-2 text-sm font-semibold ${focusClass} ${activeTab === 'announcements' ? 'bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-accent-text)] shadow-sm' : 'text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-text-primary)]'}`}>Announcements</button>
        <button type='button' aria-pressed={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} className={`min-h-11 rounded-md px-3 py-2 text-sm font-semibold ${focusClass} ${activeTab === 'pricing' ? 'bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-accent-text)] shadow-sm' : 'text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-text-primary)]'}`}>Scheduled Price Changes</button>
      </div>

      {notice && <p role={noticeRole} className={`rounded-md border bg-[var(--pamo-color-surface-default)] px-4 py-3 text-sm ${noticeClass}`}>{notice.message}</p>}

      {status === 'loading' && <p role='status' className={`${cardClass} text-center text-[color:var(--pamo-color-text-secondary)]`}>Loading management data…</p>}
      {status === 'error' && <div role='alert' className={`${cardClass} text-center`}><p>Announcement and pricing management could not be loaded.</p><button type='button' onClick={() => loadData()} className={`${primaryButtonClass} mx-auto`}>Try again</button></div>}

      {status === 'ready' && activeTab === 'announcements' && (
        <>
          <div className='flex items-start gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 text-sm text-[color:var(--pamo-color-text-secondary)]'>
            <Megaphone className='mt-0.5 shrink-0 text-[color:var(--pamo-color-accent-text)]' size={19} aria-hidden='true' />
            <p>Enabled announcements appear only during their publication window. Inactive and expired records remain manageable here.</p>
          </div>
          <div className='flex flex-wrap justify-between gap-2 text-xs text-[color:var(--pamo-color-text-secondary)]'>
            <p>{announcements.length} managed {announcementLabel}</p>
            <span>Newest records first</span>
          </div>
          {announcements.length > 0 && (
            <ul aria-label='Managed announcements' aria-busy={busy} className='grid min-w-0 gap-5 xl:grid-cols-2'>
              {announcements.map(announcement => (
                <AnnouncementCard key={announcement._id} announcement={announcement} products={products} busy={busy} onEdit={setFormAnnouncement} onToggle={toggleAnnouncement} onDelete={setDeleting} />
              ))}
            </ul>
          )}
          {announcements.length === 0 && (
            <div className={`${cardClass} place-items-center px-5 py-10 text-center`}>
              <Megaphone size={30} className='text-[color:var(--pamo-color-accent-text)]' aria-hidden='true' />
              <div><h2 className='font-semibold'>No announcements yet</h2><p className='mt-2 text-sm text-[color:var(--pamo-color-text-secondary)]'>Create the first Storefront notice when an update is ready.</p></div>
              <button type='button' disabled={busy} onClick={() => setFormAnnouncement(null)} className={primaryButtonClass}><Plus size={18} aria-hidden='true' />Create Announcement</button>
            </div>
          )}
        </>
      )}

      {status === 'ready' && activeTab === 'pricing' && (
        <>
          <div className='flex items-start gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 text-sm text-[color:var(--pamo-color-text-secondary)]'>
            <CalendarClock className='mt-0.5 shrink-0 text-[color:var(--pamo-color-accent-text)]' size={19} aria-hidden='true' />
            <p>Bulk schedules commit atomically. A product with an existing pending price must be edited or cancelled before joining another schedule.</p>
          </div>
          <div className='flex flex-wrap justify-between gap-2 text-xs text-[color:var(--pamo-color-text-secondary)]'>
            <p>{scheduledChanges.length} scheduled {scheduledLabel}</p>
            <span>Earliest effective time first</span>
          </div>
          {scheduledChanges.length > 0 && (
            <ul aria-label='Scheduled price changes' aria-busy={busy} className='grid min-w-0 gap-5 xl:grid-cols-2'>
              {scheduledChanges.map(change => (
                <ScheduledPriceCard key={change.pendingChangeId} change={change} busy={busy} onEdit={item => openPriceAction(item, 'edit')} onCancel={item => openPriceAction(item, 'cancel')} />
              ))}
            </ul>
          )}
          {scheduledChanges.length === 0 && (
            <div className={`${cardClass} place-items-center px-5 py-10 text-center`}>
              <CalendarClock size={30} className='text-[color:var(--pamo-color-accent-text)]' aria-hidden='true' />
              <div><h2 className='font-semibold'>No scheduled price changes</h2><p className='mt-2 text-sm text-[color:var(--pamo-color-text-secondary)]'>Schedule coordinated future prices when the catalog is ready.</p></div>
              <button type='button' disabled={busy} onClick={() => setBulkSchedulerOpen(true)} className={primaryButtonClass}><CalendarClock size={18} aria-hidden='true' />Schedule Price Changes</button>
            </div>
          )}
        </>
      )}

      {formAnnouncement !== undefined && <AnnouncementForm announcement={formAnnouncement} products={products} busy={busyAction === 'create' || busyAction.startsWith('save:')} onClose={() => setFormAnnouncement(undefined)} onSave={saveAnnouncement} onStartPriceSchedule={startPriceSchedule} />}
      {deleting && <DeleteConfirmation announcement={deleting} busy={busyAction === `delete:${deleting._id}`} onClose={() => setDeleting(null)} onConfirm={deleteAnnouncement} />}
      {bulkSchedulerOpen && <BulkPriceScheduleDialog products={products} busy={busyAction === 'bulk-pricing'} onClose={() => setBulkSchedulerOpen(false)} onSchedule={scheduleBulkPrices} />}
      {priceAction && selectedPriceProduct && <PriceManagementDrawer product={selectedPriceProduct} token={token} initialAction={priceAction.initialAction} onClose={() => setPriceAction(null)} onUpdated={refreshScheduledPricing} />}
      {priceAction && !selectedPriceProduct && <div role='alert' className={`${cardClass} text-[color:var(--pamo-color-error-text)]`}><p>This product is no longer available in the catalog.</p><button type='button' onClick={() => setPriceAction(null)} className={secondaryButtonClass}>Dismiss</button></div>}
    </section>
  )
}

export default Announcements
