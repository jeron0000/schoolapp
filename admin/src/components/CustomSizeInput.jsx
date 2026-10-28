import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { hasSizeLabel, isValidSizeLabel, normalizeSizeLabel } from '../../../shared/inventory'

const CustomSizeInput = ({ selectedSizes, onAdd, disabled = false }) => {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const close = () => {
    setOpen(false)
    setValue('')
    setError('')
  }

  const addSize = () => {
    const normalized = normalizeSizeLabel(value)
    if (!isValidSizeLabel(normalized)) {
      setError('Use 1–40 letters, numbers, spaces, hyphens, or underscores.')
      return
    }
    if (hasSizeLabel(selectedSizes, normalized)) {
      setError(`${normalized} is already selected.`)
      return
    }

    onAdd(normalized)
    close()
  }

  const handleKeyDown = event => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addSize()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  if (!open) {
    return (
      <button type='button' onClick={() => setOpen(true)} disabled={disabled} className='inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-[color:var(--pamo-color-border-input)] px-3 py-2 text-sm font-semibold hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-not-allowed disabled:opacity-50'>
        <Plus aria-hidden='true' className='h-4 w-4' />Add Custom Size
      </button>
    )
  }

  return (
    <div className='min-w-0 rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-3'>
      <label htmlFor='custom-size-label' className='text-xs font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>Custom size label</label>
      <div className='mt-2 flex min-w-0 flex-wrap gap-2'>
        <input
          id='custom-size-label'
          type='text'
          value={value}
          maxLength={40}
          autoFocus
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'custom-size-error' : 'custom-size-help'}
          placeholder='Example: 4XL'
          onChange={event => { setValue(event.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          className='min-h-11 min-w-[120px] flex-1 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] px-3 py-2 text-base uppercase text-[color:var(--pamo-color-text-primary)] outline-none focus:border-[color:var(--pamo-color-focus)] focus:ring-2 focus:ring-[color:var(--pamo-color-focus)]/20'
        />
        <button type='button' onClick={addSize} disabled={disabled} className='min-h-11 rounded-md bg-[var(--pamo-color-brand-yellow)] px-4 py-2 text-sm font-semibold text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:opacity-50'>Add Size</button>
        <button type='button' onClick={close} disabled={disabled} aria-label='Cancel custom size' className='flex h-11 w-11 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-input)] disabled:opacity-50'>
          <X aria-hidden='true' className='h-4 w-4' />
        </button>
      </div>
      <p id='custom-size-help' className='mt-2 text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>Labels are normalized to uppercase. Spaces, hyphens, and underscores are supported.</p>
      {error && <p id='custom-size-error' role='alert' className='mt-2 text-xs text-[color:var(--pamo-color-error-text)]'>{error}</p>}
    </div>
  )
}

export default CustomSizeInput
