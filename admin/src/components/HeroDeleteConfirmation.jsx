import { useEffect, useRef, useState } from 'react'
import { containDialogFocus } from '../utils/dialogFocus'

const buttonClass = 'hero-manager-control inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-medium leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] [&:not(:disabled):hover]:bg-[var(--pamo-color-surface-default)]'
const deleteClass = 'hero-manager-delete inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-transparent bg-transparent px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-medium leading-[var(--pamo-staff-compact-leading)] text-[color:var(--hero-manager-error)] [&:not(:disabled):hover]:border-current'

const HeroDeleteConfirmation = ({ image, resetToOriginal = false, busy, unavailable, onClose, onConfirm }) => {
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const cancelButton = useRef(null)
  useEffect(() => {
    const modal = dialog.current
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    cancelButton.current.focus()
    return () => {
      modal.close()
      document.body.style.overflow = previousOverflow
      const target = opener?.isConnected ? opener : document.getElementById(opener?.id) || document.getElementById('hero-manager-add')
      target?.focus()
    }
  }, [])

  const confirm = async () => {
    if (busy || unavailable) return
    setError('')
    const result = await onConfirm(image._id)
    if (result && !result.ok) setError(result.message)
  }

  let confirmLabel = image.deletionPending ? 'Retry deletion' : 'Delete'
  let heading = image.deletionPending ? 'Retry hero image deletion?' : 'Delete hero image?'
  let description = image.deletionPending ? 'Retry cleanup of this inactive image and remove its managed record.' : 'This removes the image from hero management and storefront eligibility. This action cannot be undone.'
  if (resetToOriginal) {
    confirmLabel = 'Reset to Original'
    heading = 'Restore original Hero image?'
    description = 'Remove the fallback replacement and use the bundled original image. Carousel images and their order stay unchanged.'
  }
  if (busy) confirmLabel = 'Deleting…'

  return (
    <dialog ref={dialog} tabIndex={-1} onKeyDown={containDialogFocus} aria-labelledby='hero-delete-heading' aria-describedby='hero-delete-description' aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='hero-delete-dialog'>
      <h2 id='hero-delete-heading' className='text-lg font-semibold'>{heading}</h2>
      <p className='hero-delete-name mt-4 break-words font-semibold'>“{image.altText}”</p>
      <p id='hero-delete-description' className='hero-delete-description mt-3 text-[color:var(--pamo-color-text-secondary)]'>{description}</p>
      {error && <p role='alert' className='hero-manager-error'>{error}</p>}
      {unavailable && <p role='alert' className='hero-manager-warning'>The record is no longer available or its state could not be refreshed. Close and retry loading the list.</p>}
      <div className='hero-delete-actions mt-6 flex flex-wrap gap-3'>
        <button ref={cancelButton} type='button' disabled={busy} onClick={onClose} className={buttonClass}>Cancel</button>
        <button type='button' disabled={busy || unavailable} onClick={confirm} className={deleteClass}>{confirmLabel}</button>
      </div>
    </dialog>
  )
}

export default HeroDeleteConfirmation
