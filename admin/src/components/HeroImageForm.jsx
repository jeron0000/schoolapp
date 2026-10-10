import { useEffect, useRef, useState } from 'react'

const fieldClass = 'min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
const fileError = file => {
  if (!file) return 'Choose an image to upload.'
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG or WEBP image.'
  if (file.size > 5 * 1024 * 1024) return 'Hero images must be 5 MiB or smaller.'
  return ''
}

const HeroImageForm = ({ image, busy, unavailable, onClose, onSave }) => {
  const [file, setFile] = useState(null)
  const [altText, setAltText] = useState(image?.altText || '')
  const [isActive, setIsActive] = useState(image?.isActive || false)
  const [error, setError] = useState('')
  const dialog = useRef(null)
  const preview = useRef(null)
  const firstField = useRef(null)

  useEffect(() => {
    const modal = dialog.current
    modal.showModal()
    firstField.current.focus()
    return () => modal.close()
  }, [])

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    preview.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const selectFile = event => {
    const selected = event.target.files[0]
    const message = fileError(selected)
    setError(message)
    setFile(message ? null : selected)
    if (message) event.target.value = ''
  }

  const submit = async event => {
    event.preventDefault()
    if (busy || unavailable) return
    const message = !image ? fileError(file) : ''
    if (message) { setError(message); return }
    const invalidCharacter = [...altText].some(character => {
      const code = character.codePointAt(0)
      return code < 32 || [127, 8232, 8233].includes(code)
    })
    if (!altText.trim() || altText.length > 250 || invalidCharacter) {
      setError('Enter a single-line image description of at most 250 characters.')
      return
    }
    setError('')
    const result = await onSave({ image: file, altText, isActive })
    if (result && !result.ok) setError(result.message)
  }

  return (
    <dialog ref={dialog} aria-labelledby='hero-form-heading' aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='!m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg backdrop:bg-slate-950/50 sm:p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
      <h2 id='hero-form-heading' className='text-xl font-semibold'>{image ? 'Edit Hero Image' : 'Add Hero Image'}</h2>
      <form onSubmit={submit} className='mt-5 space-y-4'>
        {image ? <img src={image.imageUrl} alt={image.altText} className='aspect-[16/9] w-full rounded-md bg-slate-100 object-cover dark:bg-slate-800' /> : <div>
          <label htmlFor='hero-file' className='relative flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-400 bg-slate-50 px-3 py-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-amber-500 dark:border-slate-600 dark:bg-slate-800'>
            <input ref={firstField} id='hero-file' type='file' accept='image/jpeg,image/png,image/webp' disabled={busy} onChange={selectFile} aria-describedby='hero-file-help' className='sr-only' />{file ? 'Choose another image' : 'Choose image'}
          </label>
          <p id='hero-file-help' className='mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400'>JPEG, PNG or WEBP · Up to 5 MiB. Uploaded when you save.</p>
          {file && <><p className='mt-2 break-all text-xs text-slate-500 dark:text-slate-400'>{file.name}</p><img ref={preview} alt='Selected hero image preview' className='mt-3 aspect-[16/9] w-full rounded-md bg-slate-100 object-contain dark:bg-slate-800' /></>}
        </div>}
        <div>
          <label htmlFor='hero-alt' className='mb-2 block text-sm font-medium'>Alt text</label>
          <input ref={image ? firstField : undefined} id='hero-alt' type='text' value={altText} onChange={event => setAltText(event.target.value)} required maxLength={250} disabled={busy} aria-describedby='hero-alt-help' className={fieldClass} />
          <p id='hero-alt-help' className='mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400'>Describe the image for accessibility. Up to 250 characters.</p>
        </div>
        <label className='flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm'>
          <input type='checkbox' checked={isActive} disabled={busy} onChange={event => setIsActive(event.target.checked)} className='mt-0.5 h-4 w-4 shrink-0 accent-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500' />
          <span>Active<span className='mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400'>Eligible for the storefront carousel. Inactive images stay in Admin.</span></span>
        </label>
        {error && <p role='alert' className='break-words text-sm leading-6 text-red-600 dark:text-red-400'>{error}</p>}
        {unavailable && <p role='alert' className='text-sm leading-6 text-amber-700 dark:text-amber-300'>This image cannot be edited, or the list could not be refreshed. Close this form and check the managed list.</p>}
        <div className='flex flex-col gap-3 border-t border-slate-200 pt-4 min-[375px]:flex-row dark:border-slate-700'>
          <button type='button' disabled={busy} onClick={onClose} className={fieldClass + ' flex-1 font-semibold hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700'}>Cancel</button>
          <button type='submit' disabled={busy || unavailable} className='min-h-11 flex-1 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50'>{busy ? 'Saving…' : image ? 'Save changes' : 'Add Hero Image'}</button>
        </div>
      </form>
    </dialog>
  )
}

export default HeroImageForm
