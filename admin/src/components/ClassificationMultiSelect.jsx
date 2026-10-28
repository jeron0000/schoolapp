import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

const triggerClass = 'flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2.5 text-left text-sm text-[color:var(--pamo-color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)] disabled:cursor-not-allowed disabled:opacity-50'
const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-md px-3 text-xs font-semibold text-[color:var(--pamo-color-accent-text)] hover:bg-[var(--pamo-color-surface-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)] disabled:cursor-not-allowed disabled:opacity-50'

const uniqueValues = values => [...new Set(values.filter(Boolean))]

const orderValues = (values, options) => {
  const order = new Map(options.map((option, index) => [option.value, index]))
  return uniqueValues(values).sort((left, right) => {
    return (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
  })
}

const ClassificationMultiSelect = ({
  id,
  label,
  options,
  selectedValues,
  onChange,
  disabled = false,
  exclusiveValues = [],
  loading = false
}) => {
  const generatedId = useId()
  const controlId = id || `classification-${generatedId}`
  const labelId = `${controlId}-label`
  const panelId = `${controlId}-options`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = uniqueValues(selectedValues)
  const exclusive = new Set(exclusiveValues)
  const availableOptions = options.filter(option => option.active !== false && option.selectable !== false)
  const selectAllValues = availableOptions
    .map(option => option.value)
    .filter(value => !exclusive.has(value))
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US')
  const visibleOptions = options.filter(option => {
    if (!normalizedQuery) return true
    return `${option.label} ${option.value}`.toLocaleLowerCase('en-US').includes(normalizedQuery)
  })

  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined

    const dismissOutside = event => {
      if (rootRef.current?.contains(event.target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [open])

  const handleKeyDown = event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
      triggerRef.current?.focus()
    }
  }

  const toggleOpen = () => {
    if (open) {
      close()
      return
    }
    setOpen(true)
  }

  const handleSearchKeyDown = event => {
    if (event.key === 'Enter') event.preventDefault()
  }

  const toggleOption = value => {
    if (selected.includes(value)) {
      onChange(selected.filter(item => item !== value))
      return
    }

    if (exclusive.has(value)) {
      onChange([value])
      return
    }

    const withoutExclusiveValues = selected.filter(item => !exclusive.has(item))
    onChange(orderValues([...withoutExclusiveValues, value], options))
  }

  const selectAll = () => onChange(orderValues(selectAllValues, options))
  const clearAll = () => onChange([])
  const summary = selected.length === 0 ? 'Unassigned' : `${selected.length} selected`

  return (
    <div ref={rootRef} className='relative min-w-0' onKeyDown={handleKeyDown}>
      <span id={labelId} className='mb-2 block text-sm font-semibold'>{label}</span>
      <button
        id={controlId}
        ref={triggerRef}
        data-classification-trigger
        type='button'
        aria-labelledby={`${labelId} ${controlId}-summary`}
        aria-haspopup='dialog'
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={toggleOpen}
        className={triggerClass}
      >
        <span id={`${controlId}-summary`} className={selected.length ? 'font-semibold' : 'text-[color:var(--pamo-color-text-secondary)]'}>{loading ? 'Loading options...' : summary}</span>
        <ChevronDown aria-hidden='true' className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {selected.length > 0 && (
        <div className='mt-2 flex min-w-0 flex-wrap gap-2' aria-label={`${label} selections`}>
          {selected.map(value => {
            const option = options.find(item => item.value === value)
            const chipLabel = option?.label || value
            return (
              <span key={value} className='inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] pl-3 text-xs font-semibold text-[color:var(--pamo-color-text-primary)]'>
                <span className='truncate'>{chipLabel}</span>
                <button type='button' aria-label={`Remove ${chipLabel}`} disabled={disabled} onClick={() => toggleOption(value)} className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--pamo-color-text-secondary)] hover:bg-[var(--pamo-color-surface-default)] hover:text-[color:var(--pamo-color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pamo-color-focus)]'>
                  <X aria-hidden='true' className='h-3.5 w-3.5' />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {open && !disabled && (
        <div id={panelId} role='dialog' aria-labelledby={labelId} className='absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] shadow-lg'>
          <label className='relative block border-b border-[color:var(--pamo-color-border-default)] p-3'>
            <span className='sr-only'>Search {label}</span>
            <Search aria-hidden='true' className='pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
            <input ref={searchRef} type='search' value={query} onChange={event => setQuery(event.target.value)} onKeyDown={handleSearchKeyDown} placeholder={`Search ${label.toLocaleLowerCase('en-US')}`} className='min-h-11 w-full rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] py-2 pl-9 pr-3 text-base text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]' />
          </label>
          <div className='flex items-center justify-between gap-2 border-b border-[color:var(--pamo-color-border-default)] px-2 py-1'>
            <button type='button' onClick={selectAll} disabled={selectAllValues.length === 0} className={actionClass}>Select All Available ({selectAllValues.length})</button>
            <button type='button' onClick={clearAll} disabled={selected.length === 0} className={actionClass}>Clear All</button>
          </div>
          <div className='max-h-56 overflow-y-auto p-2'>
            {visibleOptions.map(option => {
              const checked = selected.includes(option.value)
              const unavailable = (option.active === false || option.selectable === false) && !checked
              return (
                <label key={option.value} className='flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--pamo-color-surface-subtle)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-[var(--pamo-color-focus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50'>
                  <input type='checkbox' value={option.value} checked={checked} disabled={unavailable} onChange={() => toggleOption(option.value)} className='peer sr-only' />
                  <span aria-hidden='true' className='inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] text-slate-950 peer-checked:border-[color:var(--pamo-color-brand-yellow)] peer-checked:bg-[var(--pamo-color-brand-yellow)]'>
                    {checked && <Check className='h-3.5 w-3.5' strokeWidth={2.5} />}
                  </span>
                  <span className='min-w-0 flex-1 break-words'>{option.label}</span>
                </label>
              )
            })}
            {visibleOptions.length === 0 && <p className='px-3 py-5 text-center text-sm text-[color:var(--pamo-color-text-secondary)]'>No matching options.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default ClassificationMultiSelect
