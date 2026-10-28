import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
  MAX_MEASUREMENT_FIELDS,
  measurementFieldKey,
  measurementPresets,
  measurementValueError
} from '../../../shared/productMeasurements.js'
import { containDialogFocus } from '../utils/dialogFocus.js'

const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'

const valuesForSize = (guide, size) => {
  return guide.measurements.find(entry => entry.size === size)?.values || {}
}

const setMeasurementValue = (guide, size, key, value) => {
  const values = { ...valuesForSize(guide, size) }
  if (value === '') delete values[key]
  else values[key] = value
  const existingIndex = guide.measurements.findIndex(entry => entry.size === size)
  const measurements = [...guide.measurements]
  if (Object.keys(values).length === 0) {
    if (existingIndex >= 0) measurements.splice(existingIndex, 1)
  } else if (existingIndex >= 0) {
    measurements[existingIndex] = { size, values }
  } else {
    measurements.push({ size, values })
  }
  return { ...guide, measurements }
}

const removeFields = (guide, keys) => ({
  fields: guide.fields.filter(field => !keys.has(field.key)),
  measurements: guide.measurements
    .map(entry => {
      const values = { ...entry.values }
      keys.forEach(key => delete values[key])
      return { ...entry, values }
    })
    .filter(entry => Object.keys(entry.values).length > 0)
})

const SizeMeasurementsEditor = ({ idPrefix, sizes, value, onChange, disabled = false }) => {
  const [customLabel, setCustomLabel] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [openPreset, setOpenPreset] = useState('')
  const [removalTarget, setRemovalTarget] = useState(null)
  const presetControlsRef = useRef(null)
  const topsTriggerRef = useRef(null)
  const bottomsTriggerRef = useRef(null)
  const removalDialogRef = useRef(null)
  const removalCancelRef = useRef(null)

  const presetControls = [
    { key: 'tops', label: 'Tops fields', fields: measurementPresets.tops, triggerRef: topsTriggerRef },
    { key: 'bottoms', label: 'Bottoms fields', fields: measurementPresets.bottoms, triggerRef: bottomsTriggerRef }
  ]

  useEffect(() => {
    if (!openPreset || typeof document === 'undefined') return undefined

    const closeOnOutsideClick = event => {
      if (!presetControlsRef.current?.contains?.(event.target)) setOpenPreset('')
    }
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpenPreset('')
      const activeTriggerRef = openPreset === 'tops' ? topsTriggerRef : bottomsTriggerRef
      activeTriggerRef.current?.focus?.()
    }

    document.addEventListener?.('pointerdown', closeOnOutsideClick)
    document.addEventListener?.('keydown', closeOnEscape)
    return () => {
      document.removeEventListener?.('pointerdown', closeOnOutsideClick)
      document.removeEventListener?.('keydown', closeOnEscape)
    }
  }, [openPreset])

  useEffect(() => {
    if (!removalTarget || typeof document === 'undefined') return undefined

    const dialog = removalDialogRef.current
    const previousOverflow = document.body?.style?.overflow
    if (document.body?.style) document.body.style.overflow = 'hidden'
    dialog?.showModal?.()
    removalCancelRef.current?.focus?.()

    return () => {
      if (dialog?.open) dialog.close()
      if (document.body?.style) document.body.style.overflow = previousOverflow || ''
      removalTarget.triggerRef.current?.focus?.()
    }
  }, [removalTarget])

  const addFields = fields => {
    const existingKeys = new Set(value.fields.map(field => field.key))
    const additions = fields.filter(field => !existingKeys.has(field.key))
    if (value.fields.length + additions.length > MAX_MEASUREMENT_FIELDS) {
      setFieldError(`Use no more than ${MAX_MEASUREMENT_FIELDS} measurement fields.`)
      return
    }
    onChange({ ...value, fields: [...value.fields, ...additions] })
    setFieldError('')
    setOpenPreset('')
  }

  const removePresetFields = presetKey => {
    const preset = measurementPresets[presetKey]
    const currentKeys = new Set(value.fields.map(field => field.key))
    const preservedSharedKeys = new Set()

    for (const [otherKey, otherPreset] of Object.entries(measurementPresets)) {
      if (otherKey === presetKey) continue
      const otherPresetIsActive = otherPreset.every(field => currentKeys.has(field.key))
      if (!otherPresetIsActive) continue
      otherPreset.forEach(field => preservedSharedKeys.add(field.key))
    }

    const removableKeys = new Set(preset
      .map(field => field.key)
      .filter(key => currentKeys.has(key) && !preservedSharedKeys.has(key)))
    if (removableKeys.size === 0) {
      setOpenPreset('')
      return
    }

    const removesEnteredValues = value.measurements.some(entry => {
      return [...removableKeys].some(key => String(entry.values?.[key] ?? '').trim())
    })
    if (removesEnteredValues) {
      const label = presetKey === 'tops' ? 'Tops' : 'Bottoms'
      const triggerRef = presetKey === 'tops' ? topsTriggerRef : bottomsTriggerRef
      setRemovalTarget({
        label,
        fieldKeys: [...removableKeys],
        fields: value.fields.filter(field => removableKeys.has(field.key)),
        sizes: [...sizes],
        triggerRef
      })
      setOpenPreset('')
      return
    }

    onChange(removeFields(value, removableKeys))
    setFieldError('')
    setOpenPreset('')
  }

  const confirmPresetRemoval = () => {
    if (!removalTarget) return
    onChange(removeFields(value, new Set(removalTarget.fieldKeys)))
    setFieldError('')
    setRemovalTarget(null)
  }

  const addCustomField = () => {
    const label = customLabel.trim().replace(/\s+/g, ' ')
    if (!/^[A-Za-z0-9][A-Za-z0-9 /&()'.,+-]{1,39}$/.test(label)) {
      setFieldError('Use a unique field name with 2 to 40 supported characters.')
      return
    }
    if (value.fields.some(field => field.label.toLowerCase() === label.toLowerCase())) {
      setFieldError('That measurement field already exists.')
      return
    }
    if (value.fields.length >= MAX_MEASUREMENT_FIELDS) {
      setFieldError(`Use no more than ${MAX_MEASUREMENT_FIELDS} measurement fields.`)
      return
    }
    const field = { key: measurementFieldKey(label, value.fields), label }
    onChange({ ...value, fields: [...value.fields, field] })
    setCustomLabel('')
    setFieldError('')
  }

  return (
    <section aria-labelledby={`${idPrefix}-heading`} className='mt-5 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4'>
      <div>
        <h3 id={`${idPrefix}-heading`} tabIndex={-1} className='font-semibold'>Measurements (cm)</h3>
        <p className='mt-1 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Optional finished-garment measurements. Enter measured values only; blank values stay unavailable.</p>
      </div>

      <div ref={presetControlsRef} className='mt-4 flex flex-wrap gap-2'>
        {presetControls.map(control => {
          const menuId = `${idPrefix}-${control.key}-preset-menu`
          const isOpen = openPreset === control.key
          const currentKeys = new Set(value.fields.map(field => field.key))
          const hasMissingFields = control.fields.some(field => !currentKeys.has(field.key))
          const hasPresetFields = control.fields.some(field => currentKeys.has(field.key))
          return (
            <div key={control.key} className='relative'>
              <button
                ref={control.triggerRef}
                type='button'
                aria-expanded={isOpen}
                aria-controls={menuId}
                aria-haspopup='menu'
                onClick={() => setOpenPreset(current => current === control.key ? '' : control.key)}
                disabled={disabled}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}
              >
                {control.label}
                <ChevronDown aria-hidden='true' className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div id={menuId} role='menu' aria-label={`${control.label} actions`} className='absolute left-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-1 shadow-lg'>
                  <button type='button' role='menuitem' onClick={() => addFields(control.fields)} disabled={!hasMissingFields} className={`flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-sm font-medium hover:bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>Add all fields</button>
                  <button type='button' role='menuitem' onClick={() => removePresetFields(control.key)} disabled={!hasPresetFields} className={`flex min-h-11 w-full items-center rounded px-3 py-2 text-left text-sm font-medium text-[color:var(--pamo-color-error-text)] hover:bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>Remove all fields</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className='mt-3 flex min-w-0 gap-2 max-[399px]:flex-col'>
        <label htmlFor={`${idPrefix}-custom-field`} className='sr-only'>Custom measurement field</label>
        <input
          id={`${idPrefix}-custom-field`}
          value={customLabel}
          onChange={event => { setCustomLabel(event.target.value); setFieldError('') }}
          disabled={disabled}
          maxLength={40}
          placeholder='Custom field, e.g. Rise'
          className={`min-h-11 min-w-0 flex-1 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 text-base text-[color:var(--pamo-color-text-primary)] disabled:opacity-50 ${focusClass}`}
        />
        <button type='button' onClick={addCustomField} disabled={disabled || !customLabel.trim()} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--pamo-color-brand-yellow)] px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>
          <Plus aria-hidden='true' className='h-4 w-4' />Add field
        </button>
      </div>
      {fieldError && <p role='alert' className='mt-2 text-xs text-[color:var(--pamo-color-error-text)]'>{fieldError}</p>}

      {value.fields.length > 0 && (
        <div className='mt-4 flex flex-wrap gap-2' aria-label='Measurement fields'>
          {value.fields.map(field => (
            <span key={field.key} className='inline-flex min-h-10 items-center gap-1 rounded-md bg-[var(--pamo-color-surface-subtle)] pl-3 pr-1 text-xs font-semibold'>
              {field.label}
              <button type='button' onClick={() => onChange(removeFields(value, new Set([field.key])))} disabled={disabled} aria-label={`Remove ${field.label} measurement field`} className={`flex h-9 w-9 items-center justify-center rounded disabled:opacity-50 ${focusClass}`}>
                <Trash2 aria-hidden='true' className='h-4 w-4' />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className='mt-4 grid gap-2'>
        {sizes.map(size => {
          const values = valuesForSize(value, size)
          const completed = value.fields.filter(field => !measurementValueError(values[field.key]) && String(values[field.key] ?? '').trim()).length
          return (
            <details key={size} className='rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)]'>
              <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-semibold marker:hidden ${focusClass}`}>
                <span>Size {size}</span>
                <span className='flex items-center gap-2 text-xs font-medium text-[color:var(--pamo-color-text-secondary)]'>
                  {completed}/{value.fields.length} completed
                  <ChevronDown aria-hidden='true' className='h-4 w-4 shrink-0' />
                </span>
              </summary>
              <div className='grid gap-3 border-t border-[color:var(--pamo-color-border-default)] p-3 min-[480px]:grid-cols-2'>
                {value.fields.map(field => {
                  const inputId = `${idPrefix}-${size}-${field.key}`.replaceAll(' ', '-')
                  const inputValue = values[field.key] ?? ''
                  const error = measurementValueError(inputValue)
                  return (
                    <div key={field.key} className='min-w-0'>
                      <label htmlFor={inputId} className='mb-1.5 block text-xs font-semibold'>{field.label}</label>
                      <div className='flex items-center gap-2'>
                        <input
                          id={inputId}
                          aria-label={`${field.label} for size ${size} in centimeters`}
                          aria-invalid={Boolean(error)}
                          value={inputValue}
                          onChange={event => onChange(setMeasurementValue(value, size, field.key, event.target.value))}
                          disabled={disabled}
                          type='number'
                          inputMode='decimal'
                          min='0.01'
                          max='500'
                          step='any'
                          placeholder='Optional'
                          className={`min-h-11 min-w-0 flex-1 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 text-base tabular-nums text-[color:var(--pamo-color-text-primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-50 ${focusClass}`}
                        />
                        <span className='text-xs text-[color:var(--pamo-color-text-secondary)]'>cm</span>
                      </div>
                      {error && <p className='mt-1 text-xs text-[color:var(--pamo-color-error-text)]'>{error}</p>}
                    </div>
                  )
                })}
                {value.fields.length === 0 && <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Add a preset or custom field to enter measurements.</p>}
              </div>
            </details>
          )
        })}
        {sizes.length === 0 && <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Select an available size before adding measurements.</p>}
      </div>

      {removalTarget && (
        <dialog
          ref={removalDialogRef}
          aria-modal='true'
          aria-labelledby={`${idPrefix}-preset-removal-heading`}
          aria-describedby={`${idPrefix}-preset-removal-description ${idPrefix}-preset-removal-warning`}
          onKeyDown={event => { event.stopPropagation(); containDialogFocus(event) }}
          onCancel={event => { event.preventDefault(); setRemovalTarget(null) }}
          className='fixed inset-0 m-auto max-h-[calc(100dvh-24px)] w-[min(520px,calc(100%-24px))] max-w-none overflow-y-auto rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-5 text-[color:var(--pamo-color-text-primary)] shadow-xl backdrop:bg-slate-950/60 sm:p-6'
        >
          <h3 id={`${idPrefix}-preset-removal-heading`} className='text-xl font-semibold'>Remove {removalTarget.label} Measurements?</h3>
          <p id={`${idPrefix}-preset-removal-description`} className='mt-3 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>The following measurement fields will be removed across all product sizes:</p>
          <ul aria-label='Measurement fields being removed' className='mt-3 flex flex-wrap gap-2'>
            {removalTarget.fields.map(field => (
              <li key={field.key} className='rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] px-2.5 py-1.5 text-xs font-semibold'>{field.label}</li>
            ))}
          </ul>
          <div className='mt-4'>
            <p className='text-xs font-semibold uppercase tracking-[.08em] text-[color:var(--pamo-color-text-secondary)]'>Affected product sizes</p>
            <ul aria-label='Affected product sizes' className='mt-2 flex flex-wrap gap-2'>
              {removalTarget.sizes.map(size => (
                <li key={size} className='rounded-md bg-[var(--pamo-color-surface-subtle)] px-2.5 py-1.5 text-xs font-semibold'>Size {size}</li>
              ))}
            </ul>
          </div>
          <p id={`${idPrefix}-preset-removal-warning`} className='mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm leading-6 text-[color:var(--pamo-color-error-text)]'>Entered values for these fields will be removed. Product sizes and stock quantities are not affected.</p>
          <div className='mt-6 flex flex-col-reverse gap-3 min-[400px]:flex-row min-[400px]:justify-end'>
            <button ref={removalCancelRef} type='button' onClick={() => setRemovalTarget(null)} className={`min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-4 py-2 text-sm font-semibold hover:bg-[var(--pamo-color-surface-subtle)] ${focusClass}`}>Cancel</button>
            <button type='button' onClick={confirmPresetRemoval} className={`min-h-11 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-[color:var(--pamo-color-error-text)] hover:bg-red-500/15 ${focusClass}`}>Remove {removalTarget.label} Fields</button>
          </div>
        </dialog>
      )}
    </section>
  )
}

export default SizeMeasurementsEditor
