import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Check, Clock3, Settings2, X } from 'lucide-react'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { getInventorySizes, getSizeStock, getTotalStock, sizeOptions, sortSizes } from '../../../shared/inventory'
import CustomSizeInput from './CustomSizeInput'
import SizeMeasurementsEditor from './SizeMeasurementsEditor'
import {
  editableSizeGuide,
  normalizeSizeGuide,
  restrictSizeGuideToSizes
} from '../../../shared/productMeasurements.js'
import './StockManagementDrawer.css'

const getNewStockClassName = (valid, adjustment) => {
  const baseClass = 'rounded-[5px] px-1 py-3 text-center font-semibold [overflow-wrap:anywhere]'
  if (!valid) return baseClass + ' text-[color:var(--pamo-color-error-text)]'
  if (adjustment > 0) return baseClass + ' bg-green-500/10 text-[color:var(--pamo-color-success-text)]'
  return baseClass
}

const getResultingTotalClassName = (validTotal, netChange) => {
  const baseClass = 'text-[34px] font-bold leading-[1.2] [overflow-wrap:anywhere]'
  if (!validTotal) return baseClass + ' text-[color:var(--pamo-color-error-text)]'
  if (netChange > 0) return baseClass + ' text-[color:var(--pamo-color-success-text)]'
  return baseClass
}

const formatNetChange = (validTotal, netChange) => {
  if (!validTotal) return '—'
  if (netChange > 0) return '+' + netChange
  return String(netChange)
}

const validRestockDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const MANILA_OFFSET_HOURS = 8

const manilaScheduleIso = (dateValue, timeValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = timeValue.split(':').map(Number)
  const utcTime = Date.UTC(year, month - 1, day, hour - MANILA_OFFSET_HOURS, minute)
  const manilaValue = new Date(utcTime + MANILA_OFFSET_HOURS * 60 * 60 * 1000)
    .toISOString().slice(0, 16)
  if (manilaValue !== `${dateValue}T${timeValue}`) return null
  return new Date(utcTime).toISOString()
}

const formatManilaSchedule = value => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return `${new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila'
  }).format(date)} (Asia/Manila)`
}

const restockFormValues = product => {
  const status = product.restockPlan?.status
  const savedDate = product.restockPlan?.estimatedDate
  let estimatedDate = ''
  if (savedDate) {
    const parsedDate = new Date(savedDate)
    if (!Number.isNaN(parsedDate.getTime())) estimatedDate = parsedDate.toISOString().slice(0, 10)
  }
  return {
    status: status === 'soon' || status === 'scheduled' ? status : 'none',
    estimatedDate,
    announce: product.restockPlan?.announce === true,
    publicationTiming: product.restockPlan?.publicationTiming === 'arrival' ? 'arrival' : 'immediate'
  }
}

const StockManagementDrawer = ({
  product,
  token,
  onClose,
  onUpdated,
  onRefresh,
  refreshing = false,
  embedded = false,
  onDirtyChange,
  onBusyChange
}) => {
  const [adjustments, setAdjustments] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [sizeEditorOpen, setSizeEditorOpen] = useState(false)
  const [selectedSizes, setSelectedSizes] = useState(() => getInventorySizes(product))
  const [sizeMessage, setSizeMessage] = useState('')
  const [sizeFailed, setSizeFailed] = useState(false)
  const [sizeSaving, setSizeSaving] = useState(false)
  const [sizeGuide, setSizeGuide] = useState(() => editableSizeGuide(product.sizeGuide))
  const [measurementMessage, setMeasurementMessage] = useState('')
  const [measurementFailed, setMeasurementFailed] = useState(false)
  const [measurementSaving, setMeasurementSaving] = useState(false)
  const initialRestock = restockFormValues(product)
  const [restockStatus, setRestockStatus] = useState(initialRestock.status)
  const [restockDate, setRestockDate] = useState(initialRestock.estimatedDate)
  const [announceRestock, setAnnounceRestock] = useState(initialRestock.announce)
  const [restockPublicationTiming, setRestockPublicationTiming] = useState(initialRestock.publicationTiming)
  const [restockMessage, setRestockMessage] = useState('')
  const [restockFailed, setRestockFailed] = useState(false)
  const [restockSaving, setRestockSaving] = useState(false)
  const [stockUpdateMode, setStockUpdateMode] = useState('immediate')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduledStockUpdate, setScheduledStockUpdate] = useState(null)
  const [scheduleLoaded, setScheduleLoaded] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [scheduleFailed, setScheduleFailed] = useState(false)
  const panel = useRef(null)
  const inputs = useRef({})
  const pending = useRef(false)
  const sizePending = useRef(false)
  const measurementPending = useRef(false)
  const restockPending = useRef(false)
  const schedulePending = useRef(false)

  const currentSizes = getInventorySizes(product)
  const rows = currentSizes.map(size => {
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
  const sizeChanged = selectedSizes.length !== currentSizes.length
    || selectedSizes.some(size => !currentSizes.includes(size))
  const savedSizeGuide = editableSizeGuide(product.sizeGuide)
  const measurementChanged = JSON.stringify(sizeGuide) !== JSON.stringify(savedSizeGuide)
  const savedRestock = restockFormValues(product)
  const restockDateValid = restockStatus === 'scheduled' && validRestockDate(restockDate)
  const restockChanged = restockStatus !== savedRestock.status
    || (restockStatus === 'scheduled' && restockDate !== savedRestock.estimatedDate)
    || announceRestock !== savedRestock.announce
    || (announceRestock && restockPublicationTiming !== savedRestock.publicationTiming)
  const scheduleFormChanged = stockUpdateMode === 'scheduled'
    && Boolean(changed || scheduleDate || scheduleTime)
  const busy = submitting || sizeSaving || measurementSaving || restockSaving || scheduleLoading

  useEffect(() => {
    const dialog = panel.current
    let previousFocus
    let previousOverflow
    if (!embedded) {
      previousFocus = document.activeElement
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      dialog.showModal()
    }
    return () => {
      if (!embedded) {
        dialog.close()
        document.body.style.overflow = previousOverflow
        previousFocus?.focus()
      }
    }
  }, [embedded])

  useEffect(() => {
    onDirtyChange?.(changed || sizeChanged || measurementChanged || restockChanged || scheduleFormChanged)
  }, [changed, measurementChanged, onDirtyChange, restockChanged, scheduleFormChanged, sizeChanged])

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  const submit = async event => {
    event.preventDefault()
    if (pending.current || sizePending.current || measurementPending.current || restockPending.current || schedulePending.current || refreshing) return
    const invalid = rows.find(row => !row.valid)
    const scheduledInvalid = stockUpdateMode === 'scheduled'
      && rows.find(row => !row.valid || row.adjustment < 0)
    if (invalid || !validTotal || scheduledInvalid) {
      setFailed(true)
      const errorRow = scheduledInvalid || invalid
      const errorMessage = stockUpdateMode === 'scheduled'
        ? 'Scheduled stock updates can only contain positive whole-number additions.'
        : 'Enter whole-number adjustments that keep resulting stock between 0 and the supported maximum.'
      setMessage(errorMessage)
      if (errorRow) inputs.current[errorRow.size]?.focus()
      return
    }
    if (!changed) return
    const values = Object.fromEntries(rows.map(({ size, adjustment }) => [size, adjustment]))
    if (stockUpdateMode === 'scheduled') {
      const executeAt = manilaScheduleIso(scheduleDate, scheduleTime)
      if (!executeAt || new Date(executeAt).getTime() <= Date.now()) {
        setFailed(true)
        setMessage('Choose a valid future Asia/Manila date and time.')
        return
      }
      if (['pending', 'failed'].includes(scheduledStockUpdate?.status)) {
        setFailed(true)
        setMessage('Cancel the existing scheduled stock update before creating another.')
        return
      }
      schedulePending.current = true
      setSubmitting(true)
      setMessage('')
      setFailed(false)
      try {
        const { data } = await axios.post(
          backendUrl + '/api/product/stock/scheduled',
          { id: product._id, adjustments: values, executeAt },
          { headers: { token } }
        )
        if (!data.success) throw new Error(data.message)
        setScheduledStockUpdate(data.scheduledStockUpdate)
        setScheduleLoaded(true)
        setAdjustments({})
        setScheduleDate('')
        setScheduleTime('')
        setMessage(data.message || 'Stock update scheduled.')
        onUpdated(data.product)
      } catch (error) {
        setFailed(true)
        setMessage(error.response?.data?.message || error.message)
      } finally {
        schedulePending.current = false
        setSubmitting(false)
      }
      return
    }
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

  const closeUnlessPending = event => {
    event.preventDefault()
    if (!pending.current && !sizePending.current && !measurementPending.current && !restockPending.current && !schedulePending.current) onClose()
  }

  const openScheduledMode = async () => {
    setStockUpdateMode('scheduled')
    setMessage('')
    setFailed(false)
    if (scheduleLoaded || schedulePending.current) return
    schedulePending.current = true
    setScheduleLoading(true)
    setScheduleMessage('')
    setScheduleFailed(false)
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/product/stock/scheduled/${product._id}`,
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message)
      setScheduledStockUpdate(data.scheduledStockUpdate)
      setScheduleLoaded(true)
    } catch (error) {
      setScheduleFailed(true)
      setScheduleMessage(error.response?.data?.message || error.message)
    } finally {
      schedulePending.current = false
      setScheduleLoading(false)
    }
  }

  const cancelPendingStockUpdate = async () => {
    if (schedulePending.current || !['pending', 'failed'].includes(scheduledStockUpdate?.status)) return
    schedulePending.current = true
    setScheduleLoading(true)
    setScheduleMessage('')
    setScheduleFailed(false)
    try {
      const { data } = await axios.delete(
        `${backendUrl}/api/product/stock/scheduled/${product._id}`,
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message)
      setScheduledStockUpdate(data.scheduledStockUpdate)
      setScheduleMessage(data.message || 'Scheduled stock update cancelled.')
      onUpdated(data.product)
    } catch (error) {
      setScheduleFailed(true)
      setScheduleMessage(error.response?.data?.message || error.message)
    } finally {
      schedulePending.current = false
      setScheduleLoading(false)
    }
  }

  const toggleSize = size => {
    setSizeMessage('')
    setSizeFailed(false)
    setSelectedSizes(previous => {
      if (previous.includes(size)) return previous.filter(item => item !== size)
      return sortSizes([...previous, size])
    })
  }

  const addCustomSize = size => {
    setSelectedSizes(previous => sortSizes([...previous, size]))
    setSizeMessage(`${size} added with initial stock 0. Save size changes to apply it.`)
    setSizeFailed(false)
  }

  const cancelSizeChanges = () => {
    setSelectedSizes(currentSizes)
    setSizeMessage('')
    setSizeFailed(false)
    setSizeEditorOpen(false)
  }

  const saveSizes = async () => {
    if (sizePending.current || pending.current || measurementPending.current || restockPending.current || schedulePending.current || !sizeChanged) return
    sizePending.current = true
    setSizeSaving(true)
    setSizeMessage('')
    setSizeFailed(false)
    try {
      const { data } = await axios.patch(
        `${backendUrl}/api/product/sizes/${product._id}`,
        { sizes: sortSizes(selectedSizes) },
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message)
      const nextSizes = getInventorySizes(data.product)
      setSelectedSizes(nextSizes)
      setAdjustments(previous => Object.fromEntries(
        Object.entries(previous).filter(([size]) => nextSizes.includes(size))
      ))
      setSizeGuide(previous => restrictSizeGuideToSizes(previous, nextSizes))
      setSizeMessage(data.message || 'Available sizes updated.')
      setSizeEditorOpen(false)
      onUpdated(data.product)
    } catch (error) {
      setSizeFailed(true)
      setSizeMessage(error.response?.data?.message || error.message)
    } finally {
      sizePending.current = false
      setSizeSaving(false)
    }
  }

  const cancelMeasurementChanges = () => {
    setSizeGuide(editableSizeGuide(product.sizeGuide))
    setMeasurementMessage('')
    setMeasurementFailed(false)
  }

  const saveMeasurements = async () => {
    if (measurementPending.current || pending.current || sizePending.current || restockPending.current || schedulePending.current || !measurementChanged) return
    let normalizedSizeGuide
    try {
      normalizedSizeGuide = normalizeSizeGuide(
        restrictSizeGuideToSizes(sizeGuide, currentSizes),
        currentSizes
      )
    } catch (error) {
      setMeasurementFailed(true)
      setMeasurementMessage(error.message)
      return
    }

    measurementPending.current = true
    setMeasurementSaving(true)
    setMeasurementMessage('')
    setMeasurementFailed(false)
    try {
      const { data } = await axios.patch(
        `${backendUrl}/api/product/measurements/${product._id}`,
        { sizeGuide: normalizedSizeGuide },
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message)
      setSizeGuide(editableSizeGuide(data.product.sizeGuide))
      setMeasurementMessage(data.message || 'Measurements updated.')
      onUpdated(data.product)
    } catch (error) {
      setMeasurementFailed(true)
      setMeasurementMessage(error.response?.data?.message || error.message)
    } finally {
      measurementPending.current = false
      setMeasurementSaving(false)
    }
  }

  const resetRestockChanges = () => {
    const saved = restockFormValues(product)
    setRestockStatus(saved.status)
    setRestockDate(saved.estimatedDate)
    setAnnounceRestock(saved.announce)
    setRestockPublicationTiming(saved.publicationTiming)
    setRestockMessage('')
    setRestockFailed(false)
  }

  const saveRestockPlan = async () => {
    if (restockPending.current || pending.current || sizePending.current || measurementPending.current || schedulePending.current || !restockChanged) return
    if (restockStatus === 'scheduled' && !restockDateValid) {
      setRestockFailed(true)
      setRestockMessage('Choose a valid estimated arrival date.')
      return
    }
    if (announceRestock && restockPublicationTiming === 'arrival' && !restockDateValid) {
      setRestockFailed(true)
      setRestockMessage('Choose a valid estimated arrival date before scheduling publication.')
      return
    }

    const payload = {
      status: restockStatus,
      announceRestock: restockStatus === 'none' ? false : announceRestock
    }
    if (restockStatus === 'scheduled') payload.estimatedDate = restockDate
    if (payload.announceRestock) payload.publicationTiming = restockPublicationTiming
    restockPending.current = true
    setRestockSaving(true)
    setRestockMessage('')
    setRestockFailed(false)
    try {
      const { data } = await axios.patch(
        `${backendUrl}/api/product/restock/${product._id}`,
        payload,
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message)
      const saved = restockFormValues(data.product)
      setRestockStatus(saved.status)
      setRestockDate(saved.estimatedDate)
      setAnnounceRestock(saved.announce)
      setRestockPublicationTiming(saved.publicationTiming)
      setRestockMessage(data.message || 'Restock plan updated.')
      onUpdated(data.product)
    } catch (error) {
      setRestockFailed(true)
      setRestockMessage(error.response?.data?.message || error.message)
    } finally {
      restockPending.current = false
      setRestockSaving(false)
    }
  }

  const containFocus = event => {
    if (event.key !== 'Tab') return

    const controls = event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary')
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first) {
      event.preventDefault()
      event.currentTarget.focus()
      return
    }

    const focusIsAtStart = document.activeElement === first || document.activeElement === event.currentTarget
    if (event.shiftKey && focusIsAtStart) {
      event.preventDefault()
      last.focus()
      return
    }

    const focusIsAtEnd = document.activeElement === last || document.activeElement === event.currentTarget
    if (!event.shiftKey && focusIsAtEnd) {
      event.preventDefault()
      first.focus()
    }
  }

  let netChangeClassName = 'text-sm text-[color:var(--pamo-color-text-secondary)]'
  if (netChange > 0 && validTotal) {
    netChangeClassName = 'text-sm text-[color:var(--pamo-color-success-text)]'
  }
  const netChangeLabel = formatNetChange(validTotal, netChange)
  const resultingTotal = validTotal ? nextTotal : '—'
  const resultingTotalClassName = getResultingTotalClassName(validTotal, netChange)
  const messageRole = failed ? 'alert' : 'status'
  const messageClassName = failed
    ? 'mt-4 text-[color:var(--pamo-color-error-text)] [overflow-wrap:anywhere]'
    : 'mt-4 text-[color:var(--pamo-color-success-text)] [overflow-wrap:anywhere]'
  const refreshLabel = refreshing ? 'Refreshing…' : 'Refresh quantities'
  let submitLabel = submitting ? 'Updating…' : 'Update Stock'
  if (stockUpdateMode === 'scheduled') {
    submitLabel = submitting ? 'Scheduling…' : 'Schedule Stock Update'
  }
  let restockSubmitLabel = 'Save Restock Plan'
  if (restockSaving) restockSubmitLabel = 'Saving…'
  else if (restockStatus === 'none' && savedRestock.status !== 'none') restockSubmitLabel = 'Clear Restock Plan'
  const customSizes = selectedSizes.filter(size => !sizeOptions.includes(size))
  const scheduledStockBlocked = stockUpdateMode === 'scheduled'
    && ['pending', 'failed'].includes(scheduledStockUpdate?.status)
  const Container = embedded ? 'section' : 'dialog'
  const containerProps = embedded
    ? {
        'aria-label': 'Stock management',
        className: 'pamo-stock-drawer text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)]'
      }
    : {
        ref: panel,
        'aria-labelledby': 'stock-heading',
        'aria-describedby': 'stock-instructions',
        'aria-busy': busy,
        tabIndex: -1,
        onCancel: closeUnlessPending,
        onKeyDown: containFocus,
        className: 'pamo-stock-drawer fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-[min(100%,528px)] max-w-full border-0 border-l border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 open:flex open:flex-col'
      }

  return (
    <Container {...containerProps}>
      {!embedded && <header className='stock-drawer-heading flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--pamo-color-border-default)] px-6 pb-6 pt-7 max-[539px]:px-[18px] max-[539px]:pb-5 max-[539px]:pt-6'>
        <div className='min-w-0'>
          <p className='text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--pamo-color-accent-text)]'>Manage inventory</p>
          <h2 id='stock-heading' className='mt-2 text-[28px] font-bold leading-[1.2] tracking-[-.02em] max-[539px]:text-[26px]'>Manage Stock</h2>
          <span className='mt-2.5 block text-[color:var(--pamo-color-text-secondary)] [overflow-wrap:anywhere]'>{product.name}</span>
        </div>
        <button type='button' onClick={onClose} disabled={busy} aria-label='Close stock drawer' className='flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-[.45]' autoFocus>
          <X size={20} aria-hidden='true' />
        </button>
      </header>}
      <form onSubmit={submit} noValidate className={embedded ? 'block' : 'flex min-h-0 flex-1 flex-col'}>
        <div className={embedded ? 'p-6 max-[539px]:px-[18px] max-[539px]:py-5' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 max-[539px]:px-[18px] max-[539px]:py-5'}>
          <div id='stock-instructions' className='rounded-lg bg-[var(--pamo-color-surface-subtle)] p-4'>
            <h3 className='mb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[color:var(--pamo-color-accent-text)]'>How adjustments work</h3>
            <p className='text-[13px] font-medium'>Positive adds stock · Negative removes stock</p>
            <span className='mt-1 block text-xs text-[color:var(--pamo-color-text-secondary)]'>Review the resulting quantities before updating.</span>
          </div>
          <section aria-labelledby='restock-management-heading' className='mt-5 rounded-lg border border-[color:var(--pamo-color-border-default)] p-4'>
            <div>
              <h3 id='restock-management-heading' className='font-semibold'>Restock Management</h3>
              <p className='mt-1 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Share a product-level estimate without changing inventory.</p>
            </div>
            <div className='mt-4 grid gap-3 sm:grid-cols-2'>
              <label htmlFor='restock-status' className='grid gap-1.5 text-sm font-semibold'>Restock status
                <select
                  id='restock-status'
                  aria-label='Restock status'
                  value={restockStatus}
                  disabled={busy}
                  onChange={event => {
                    const nextStatus = event.target.value
                    setRestockStatus(nextStatus)
                    if (nextStatus === 'none') setAnnounceRestock(false)
                    if (nextStatus !== 'scheduled') setRestockPublicationTiming('immediate')
                    setRestockMessage('')
                    setRestockFailed(false)
                  }}
                  className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 text-base text-[color:var(--pamo-color-text-primary)] disabled:opacity-50'
                >
                  <option value='none'>None</option>
                  <option value='soon'>Restocking Soon</option>
                  <option value='scheduled'>Scheduled Restock</option>
                </select>
              </label>
              {restockStatus === 'scheduled' && (
                <label htmlFor='restock-date' className='grid gap-1.5 text-sm font-semibold'>Estimated Arrival Date
                  <span className='relative block'>
                    <CalendarDays data-testid='restock-calendar-icon' aria-hidden='true' className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
                    <input
                      id='restock-date'
                      aria-label='Estimated Arrival Date'
                      type='date'
                      value={restockDate}
                      disabled={busy}
                      onChange={event => {
                        const nextDate = event.target.value
                        setRestockDate(nextDate)
                        if (!validRestockDate(nextDate) && restockPublicationTiming === 'arrival') {
                          setRestockPublicationTiming('immediate')
                        }
                        setRestockMessage('')
                        setRestockFailed(false)
                      }}
                      className='min-h-11 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] py-2 pl-10 pr-3 text-base text-[color:var(--pamo-color-text-primary)] disabled:opacity-50'
                    />
                  </span>
                </label>
              )}
            </div>
            {restockStatus !== 'none' && (
              <div className='mt-4 grid gap-3 rounded-md bg-[var(--pamo-color-surface-subtle)] p-3'>
                <label className='flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold'>
                  <input
                    type='checkbox'
                    aria-label='Announce this restock'
                    checked={announceRestock}
                    disabled={busy}
                    onChange={event => {
                      setAnnounceRestock(event.target.checked)
                      setRestockMessage('')
                      setRestockFailed(false)
                    }}
                    className='h-5 w-5 accent-[var(--pamo-color-brand-yellow)]'
                  />
                  Announce this restock
                </label>
                {announceRestock && (
                  <label htmlFor='restock-publication' className='grid gap-1.5 text-sm font-semibold'>Publication
                    <select
                      id='restock-publication'
                      aria-label='Restock announcement publication'
                      value={restockPublicationTiming}
                      disabled={busy}
                      onChange={event => setRestockPublicationTiming(event.target.value)}
                      className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 text-base text-[color:var(--pamo-color-text-primary)] disabled:opacity-50'
                    >
                      <option value='immediate'>Publish immediately</option>
                      {restockDateValid && <option value='arrival'>Publish on expected arrival date</option>}
                    </select>
                  </label>
                )}
              </div>
            )}
            <div className='mt-4 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1'>
              <button type='button' onClick={resetRestockChanges} disabled={busy || !restockChanged} className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold disabled:opacity-50'>Reset</button>
              <button type='button' onClick={saveRestockPlan} disabled={busy || !restockChanged} className='min-h-11 rounded-md bg-[var(--pamo-color-brand-yellow)] px-3 py-2 text-sm font-semibold text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50'>{restockSubmitLabel}</button>
            </div>
            {restockMessage && <p role={restockFailed ? 'alert' : 'status'} className={`mt-3 text-sm [overflow-wrap:anywhere] ${restockFailed ? 'text-[color:var(--pamo-color-error-text)]' : 'text-[color:var(--pamo-color-success-text)]'}`}>{restockMessage}</p>}
          </section>
          <div className='mt-5 rounded-lg border border-[color:var(--pamo-color-border-default)] p-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h3 className='font-semibold'>Available sizes</h3>
                <p className='mt-1 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>{currentSizes.join(', ')}</p>
              </div>
              <button type='button' onClick={() => { setSizeEditorOpen(true); setSizeMessage(''); setSizeFailed(false) }} disabled={busy} className='inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'>
                <Settings2 aria-hidden='true' className='h-4 w-4' />Manage Sizes
              </button>
            </div>

            {sizeEditorOpen && (
              <div className='mt-4 border-t border-[color:var(--pamo-color-border-default)] pt-4'>
                <fieldset disabled={busy} className='border-0 p-0'>
                  <legend className='text-xs font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>Select available sizes</legend>
                  <div className='mt-3 grid grid-cols-3 gap-2 max-[359px]:grid-cols-2'>
                    {sizeOptions.map(size => {
                      const selected = selectedSizes.includes(size)
                      const quantity = getSizeStock(product, size)
                      const lastSelected = selected && selectedSizes.length === 1
                      const removalBlocked = selected && (quantity > 0 || lastSelected)
                      let explanation = ''
                      if (quantity > 0) explanation = `${quantity} in stock; set stock to 0 before removing.`
                      else if (lastSelected) explanation = 'A product must keep at least one size.'
                      return (
                        <label key={size} title={explanation} className='relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-2 py-2 text-center text-sm font-semibold has-[:checked]:border-[color:var(--pamo-color-brand-yellow)] has-[:checked]:bg-[var(--pamo-color-brand-yellow)]/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--pamo-color-focus)]'>
                          <input type='checkbox' aria-label={`Available size ${size}`} checked={selected} disabled={removalBlocked || busy} onChange={() => toggleSize(size)} className='sr-only' />
                          {selected && <Check aria-hidden='true' className='h-4 w-4 shrink-0' />}
                          <span>{size}</span>
                        </label>
                      )
                    })}
                  </div>
                  {customSizes.length > 0 && (
                    <div className='mt-3 flex flex-wrap gap-2' aria-label='Selected custom sizes'>
                      {customSizes.map(size => {
                        const quantity = getSizeStock(product, size)
                        const lastSelected = selectedSizes.length === 1
                        const removalBlocked = quantity > 0 || lastSelected
                        let explanation = `Remove ${size}`
                        if (quantity > 0) explanation = `${quantity} in stock; set stock to 0 before removing.`
                        else if (lastSelected) explanation = 'A product must keep at least one size.'
                        return (
                          <span key={size} className='inline-flex min-h-11 items-center gap-2 rounded-md border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-brand-yellow)]/10 pl-3 pr-1 text-sm font-semibold'>
                            {size}
                            <button type='button' onClick={() => toggleSize(size)} disabled={removalBlocked || busy} aria-label={`Remove custom size ${size}`} title={explanation} className='flex h-9 w-9 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-40'>
                              <X aria-hidden='true' className='h-4 w-4' />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <div className='mt-3'>
                    <CustomSizeInput selectedSizes={selectedSizes} onAdd={addCustomSize} disabled={busy} />
                  </div>
                  <p className='mt-3 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>New sizes start at 0. Sizes with stock cannot be removed. Active order reservations are verified by the server when saving.</p>
                  <div className='mt-4 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1'>
                    <button type='button' onClick={cancelSizeChanges} disabled={busy} className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold disabled:opacity-50'>Cancel</button>
                    <button type='button' onClick={saveSizes} disabled={busy || !sizeChanged} className='min-h-11 rounded-md bg-[var(--pamo-color-brand-yellow)] px-3 py-2 text-sm font-semibold text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50'>{sizeSaving ? 'Saving…' : 'Save Size Changes'}</button>
                  </div>
                </fieldset>
                <SizeMeasurementsEditor
                  idPrefix='managed-product-measurements'
                  sizes={currentSizes}
                  value={sizeGuide}
                  onChange={nextGuide => { setSizeGuide(nextGuide); setMeasurementMessage(''); setMeasurementFailed(false) }}
                  disabled={busy}
                />
                <div className='mt-4 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1'>
                  <button type='button' onClick={cancelMeasurementChanges} disabled={busy || !measurementChanged} className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold disabled:opacity-50'>Cancel Measurement Changes</button>
                  <button type='button' onClick={saveMeasurements} disabled={busy || !measurementChanged} className='min-h-11 rounded-md bg-[var(--pamo-color-brand-yellow)] px-3 py-2 text-sm font-semibold text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50'>{measurementSaving ? 'Saving…' : 'Save Measurements'}</button>
                </div>
                {measurementMessage && <p role={measurementFailed ? 'alert' : 'status'} className={`mt-3 text-sm [overflow-wrap:anywhere] ${measurementFailed ? 'text-[color:var(--pamo-color-error-text)]' : 'text-[color:var(--pamo-color-success-text)]'}`}>{measurementMessage}</p>}
              </div>
            )}
            {sizeMessage && <p role={sizeFailed ? 'alert' : 'status'} className={`mt-3 text-sm [overflow-wrap:anywhere] ${sizeFailed ? 'text-[color:var(--pamo-color-error-text)]' : 'text-[color:var(--pamo-color-success-text)]'}`}>{sizeMessage}</p>}
          </div>
          <section aria-labelledby='stock-update-method-heading' className='mt-5 rounded-lg border border-[color:var(--pamo-color-border-default)] p-4'>
            <h3 id='stock-update-method-heading' className='font-semibold'>Stock Update Method</h3>
            <div className='mt-3 grid grid-cols-2 gap-2 max-[359px]:grid-cols-1'>
              <button type='button' aria-pressed={stockUpdateMode === 'immediate'} onClick={() => { setStockUpdateMode('immediate'); setMessage(''); setFailed(false) }} disabled={busy} className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold aria-pressed:border-[color:var(--pamo-color-brand-yellow)] aria-pressed:bg-[var(--pamo-color-brand-yellow)]/10 disabled:opacity-50'>Update Immediately</button>
              <button type='button' aria-pressed={stockUpdateMode === 'scheduled'} onClick={openScheduledMode} disabled={busy} className='min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold aria-pressed:border-[color:var(--pamo-color-brand-yellow)] aria-pressed:bg-[var(--pamo-color-brand-yellow)]/10 disabled:opacity-50'>Schedule Stock Update</button>
            </div>
            {stockUpdateMode === 'scheduled' && (
              <div className='mt-4 grid gap-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label htmlFor='scheduled-stock-date' className='grid gap-1.5 text-sm font-semibold'>Execution Date
                    <span className='relative block'>
                      <CalendarDays aria-hidden='true' className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
                      <input id='scheduled-stock-date' aria-label='Scheduled stock execution date' type='date' value={scheduleDate} disabled={busy || scheduledStockBlocked} onChange={event => { setScheduleDate(event.target.value); setMessage(''); setFailed(false) }} className='min-h-11 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] py-2 pl-10 pr-3 text-base text-[color:var(--pamo-color-text-primary)] disabled:opacity-50' />
                    </span>
                  </label>
                  <label htmlFor='scheduled-stock-time' className='grid gap-1.5 text-sm font-semibold'>Execution Time
                    <span className='relative block'>
                      <Clock3 aria-hidden='true' className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
                      <input id='scheduled-stock-time' aria-label='Scheduled stock execution time' type='time' value={scheduleTime} disabled={busy || scheduledStockBlocked} onChange={event => { setScheduleTime(event.target.value); setMessage(''); setFailed(false) }} className='min-h-11 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] py-2 pl-10 pr-3 text-base text-[color:var(--pamo-color-text-primary)] disabled:opacity-50' />
                    </span>
                  </label>
                </div>
                <p className='text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Entered in Asia/Manila. Planned additions use the latest inventory when they execute; current stock remains unchanged until then.</p>
                {scheduleLoading && <p role='status' className='text-sm text-[color:var(--pamo-color-text-secondary)]'>Loading scheduled update…</p>}
                {scheduledStockUpdate && (
                  <div className='rounded-md bg-[var(--pamo-color-surface-subtle)] p-3 text-sm'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <p className='font-semibold'>Latest scheduled update</p>
                      <span className='rounded-full border border-[color:var(--pamo-color-border-default)] px-2.5 py-1 text-xs font-semibold capitalize'>{scheduledStockUpdate.status}</span>
                    </div>
                    <p className='mt-2 text-[color:var(--pamo-color-text-secondary)]'>{formatManilaSchedule(scheduledStockUpdate.executeAt)}</p>
                    <ul className='mt-2 flex flex-wrap gap-2' aria-label='Scheduled stock additions'>
                      {Object.entries(scheduledStockUpdate.adjustments || {}).map(([size, quantity]) => <li key={size} className='rounded border border-[color:var(--pamo-color-border-default)] px-2 py-1 font-medium'>{size}: +{quantity}</li>)}
                    </ul>
                    {scheduledStockUpdate.lastError && <p className='mt-2 text-[color:var(--pamo-color-error-text)]'>{scheduledStockUpdate.lastError} Automatic execution will retry.</p>}
                    {['pending', 'failed'].includes(scheduledStockUpdate.status) && <button type='button' onClick={cancelPendingStockUpdate} disabled={busy} className='mt-3 min-h-11 rounded-md border border-[color:var(--pamo-color-error-text)] px-3 py-2 text-sm font-semibold text-[color:var(--pamo-color-error-text)] disabled:opacity-50'>Cancel Scheduled Update</button>}
                  </div>
                )}
                {scheduleMessage && <p role={scheduleFailed ? 'alert' : 'status'} className={`text-sm [overflow-wrap:anywhere] ${scheduleFailed ? 'text-[color:var(--pamo-color-error-text)]' : 'text-[color:var(--pamo-color-success-text)]'}`}>{scheduleMessage}</p>}
              </div>
            )}
          </section>
          <div className='stock-drawer-columns mt-[26px] grid grid-cols-[minmax(0,.65fr)_minmax(0,.7fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 pb-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)] [&>:not(:first-child)]:text-center max-[539px]:grid-cols-[minmax(0,.65fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,.85fr)] max-[539px]:gap-2 max-[539px]:px-1.5 max-[539px]:text-[9px] max-[539px]:tracking-normal' aria-hidden='true'>
            <span>Size</span><span>Current</span><span>{stockUpdateMode === 'scheduled' ? 'Future +' : 'Change'}</span><span><span className='max-[539px]:hidden'>{stockUpdateMode === 'scheduled' ? 'Future stock' : 'New stock'}</span><span className='hidden max-[539px]:inline'>{stockUpdateMode === 'scheduled' ? 'Future' : 'New'}</span></span>
          </div>
          <div className='border-t border-[color:var(--pamo-color-border-default)]'>
            {rows.map(({ size, current, adjustment, next, valid }, index) => (
              <div key={size} className='stock-drawer-row grid min-h-20 grid-cols-[minmax(0,.65fr)_minmax(0,.7fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-[color:var(--pamo-color-border-default)] px-3 odd:bg-[var(--pamo-color-surface-subtle)] max-[539px]:grid-cols-[minmax(0,.65fr)_minmax(0,.8fr)_minmax(0,1fr)_minmax(0,.85fr)] max-[539px]:gap-2 max-[539px]:px-1.5'>
                <label htmlFor={`stock-adjustment-${index}`} className='font-semibold [overflow-wrap:anywhere]'>{size}</label>
                <span aria-label={`Current stock for ${size}: ${current}`} className='text-center tabular-nums'>{current}</span>
                <div>
                  <input
                    ref={element => { inputs.current[size] = element }}
                    id={`stock-adjustment-${index}`}
                    aria-label={`Adjustment for ${size}`}
                    aria-invalid={!valid}
                    aria-describedby={!valid ? 'stock-invalid-help' : undefined}
                    type='number'
                    step='1'
                    disabled={busy}
                    value={adjustments[size] ?? 0}
                    className='min-h-12 w-full min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-1 py-2.5 text-center text-base text-[color:var(--pamo-color-text-primary)] [&[aria-invalid=true]]:border-[color:var(--pamo-color-error-text)]'
                    onChange={event => {
                      setAdjustments(previous => ({ ...previous, [size]: event.target.value }))
                      setMessage('')
                    }}
                  />
                </div>
                <output aria-label={`New stock for ${size}`} className={getNewStockClassName(valid, adjustment)}>
                  {Number.isSafeInteger(next) ? next : '—'}
                </output>
              </div>
            ))}
          </div>
          {!validTotal && <p id='stock-invalid-help' className='mt-4 text-[color:var(--pamo-color-error-text)] [overflow-wrap:anywhere]' role='alert'>Use whole numbers. Resulting quantities must be non-negative and within the supported range.</p>}
          <div className='mt-6 rounded-lg bg-[var(--pamo-color-surface-subtle)] p-[18px]'>
            <h3 className='text-[10px] font-semibold uppercase tracking-[.1em] text-[color:var(--pamo-color-text-secondary)]'>{stockUpdateMode === 'scheduled' ? 'Planned total stock' : 'Total stock'}</h3>
            <div className='mt-2.5 flex flex-wrap items-center gap-4'>
              <span className='text-[clamp(24px,2vw,28px)] font-bold leading-[1.2] tabular-nums [overflow-wrap:anywhere]'>{total}</span>
              <span className={netChangeClassName}>{netChangeLabel}</span>
              <ArrowRight size={22} aria-hidden='true' className='shrink-0 text-[color:var(--pamo-color-text-secondary)]' />
              <output aria-label='Resulting total stock' className={`${resultingTotalClassName} tabular-nums`}>{resultingTotal}</output>
            </div>
          </div>
          <p className='mt-4 text-xs leading-[1.7] text-[color:var(--pamo-color-text-secondary)]'>{stockUpdateMode === 'scheduled' ? 'Future preview only. Inventory changes after the secured server job successfully executes the schedule.' : 'Preview based on the stock shown here. The server validates each adjustment against the latest inventory.'}</p>
          {message && <p role={messageRole} className={messageClassName}>{message}</p>}
          {failed && onRefresh && <div className='mt-3 text-xs text-[color:var(--pamo-color-text-secondary)]'>
            <p>Refresh the quantities and review your adjustments before trying again. Your edits will be kept.</p>
            <button type='button' onClick={onRefresh} disabled={busy || refreshing} className='mt-2 min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2.5 text-[color:var(--pamo-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-[.45]'>{refreshLabel}</button>
          </div>}
        </div>
        <footer className='stock-drawer-footer flex shrink-0 gap-3 border-t border-[color:var(--pamo-color-border-default)] px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 max-[539px]:gap-2.5 max-[539px]:px-[18px] max-[359px]:flex-col'>
          {!embedded && <button type='button' onClick={onClose} disabled={busy} className='flex min-h-[54px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[7px] border border-[color:var(--pamo-color-border-input)] p-3 font-semibold disabled:cursor-not-allowed disabled:opacity-[.45] max-[539px]:gap-1.5 max-[539px]:px-2 max-[539px]:text-[13px] max-[359px]:w-full'>Cancel</button>}
          <button type='submit' disabled={busy || refreshing || !changed || !validTotal || scheduledStockBlocked || (stockUpdateMode === 'scheduled' && (!manilaScheduleIso(scheduleDate, scheduleTime) || rows.some(row => row.adjustment < 0)))} className={`flex min-h-[54px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[7px] border border-transparent bg-[var(--pamo-color-brand-yellow)] p-3 font-semibold text-slate-900 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-[.45] max-[539px]:gap-1.5 max-[539px]:px-2 max-[539px]:text-[13px] max-[539px]:[&_svg]:w-4 max-[359px]:w-full ${embedded ? 'w-full' : ''}`}>
            {submitLabel}<ArrowRight size={18} aria-hidden='true' />
          </button>
        </footer>
      </form>
    </Container>
  )
}

export default StockManagementDrawer
