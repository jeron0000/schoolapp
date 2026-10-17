import { useEffect, useRef, useState } from 'react'
import { containDialogFocus } from '../utils/dialogFocus'

const buttonClass = 'hero-manager-control'

const HeroDeleteConfirmation = ({ image, busy, unavailable, onClose, onConfirm }) => {
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

  return (
    <dialog ref={dialog} tabIndex={-1} onKeyDown={containDialogFocus} aria-labelledby='hero-delete-heading' aria-describedby='hero-delete-description' aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='hero-delete-dialog'>
      <h2 id='hero-delete-heading' className='text-lg font-semibold'>{image.deletionPending ? 'Retry hero image deletion?' : 'Delete hero image?'}</h2>
      <p className='hero-delete-name'>“{image.altText}”</p>
      <p id='hero-delete-description' className='hero-delete-description'>{image.deletionPending ? 'Retry cleanup of this inactive image and remove its managed record.' : 'This removes the image from hero management and storefront eligibility. This action cannot be undone.'}</p>
      {error && <p role='alert' className='hero-manager-error'>{error}</p>}
      {unavailable && <p role='alert' className='hero-manager-warning'>The record is no longer available or its state could not be refreshed. Close and retry loading the list.</p>}
      <div className='hero-delete-actions'>
        <button ref={cancelButton} type='button' disabled={busy} onClick={onClose} className={buttonClass}>Cancel</button>
        <button type='button' disabled={busy || unavailable} onClick={confirm} className='hero-manager-delete'>{busy ? 'Deleting…' : image.deletionPending ? 'Retry deletion' : 'Delete'}</button>
      </div>
    </dialog>
  )
}

export default HeroDeleteConfirmation
