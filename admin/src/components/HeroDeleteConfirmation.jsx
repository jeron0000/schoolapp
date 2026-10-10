import { useEffect, useRef, useState } from 'react'

const buttonClass = 'min-h-11 flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800'

const HeroDeleteConfirmation = ({ image, busy, unavailable, onClose, onConfirm }) => {
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const cancelButton = useRef(null)
  useEffect(() => {
    const modal = dialog.current
    modal.showModal()
    cancelButton.current.focus()
    return () => modal.close()
  }, [])

  const confirm = async () => {
    if (busy || unavailable) return
    setError('')
    const result = await onConfirm(image._id)
    if (result && !result.ok) setError(result.message)
  }

  return (
    <dialog ref={dialog} aria-labelledby='hero-delete-heading' aria-describedby='hero-delete-description' aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='!m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-950/50 sm:p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
      <h2 id='hero-delete-heading' className='text-lg font-semibold'>{image.deletionPending ? 'Retry hero image deletion?' : 'Delete hero image?'}</h2>
      <p className='mt-3 break-words text-sm font-medium [overflow-wrap:anywhere]'>“{image.altText}”</p>
      <p id='hero-delete-description' className='mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300'>{image.deletionPending ? 'Retry cleanup of this inactive image and remove its managed record.' : 'This removes the image from hero management and storefront eligibility. This action cannot be undone.'}</p>
      {error && <p role='alert' className='mt-3 break-words text-sm leading-6 text-red-600 dark:text-red-400'>{error}</p>}
      {unavailable && <p role='alert' className='mt-3 text-sm leading-6 text-amber-700 dark:text-amber-300'>The record is no longer available or its state could not be refreshed. Close and retry loading the list.</p>}
      <div className='mt-5 flex flex-col gap-3 min-[375px]:flex-row'>
        <button ref={cancelButton} type='button' disabled={busy} onClick={onClose} className={buttonClass}>Cancel</button>
        <button type='button' disabled={busy || unavailable} onClick={confirm} className='min-h-11 flex-1 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10'>{busy ? 'Deleting…' : image.deletionPending ? 'Retry deletion' : 'Delete'}</button>
      </div>
    </dialog>
  )
}

export default HeroDeleteConfirmation
