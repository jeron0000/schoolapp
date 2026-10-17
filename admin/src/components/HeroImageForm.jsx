import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Upload, X } from 'lucide-react'
import { containDialogFocus } from '../utils/dialogFocus'

const fieldClass = 'hero-manager-field'
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
  const [dimensions, setDimensions] = useState(null)
  const dialog = useRef(null)
  const preview = useRef(null)
  const firstField = useRef(null)

  useEffect(() => {
    const modal = dialog.current
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    firstField.current.focus()
    return () => {
      modal.close()
      document.body.style.overflow = previousOverflow
      const target = opener?.isConnected ? opener : document.getElementById(opener?.id) || document.getElementById('hero-manager-add')
      target?.focus()
    }
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
    setDimensions(null)
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
    <dialog ref={dialog} tabIndex={-1} aria-labelledby='hero-form-heading' aria-busy={busy} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose() }} className='hero-form-dialog'>
      <header className='hero-form-header'>
        <div className='hero-form-top'>
          <button type='button' className='hero-form-back' onClick={onClose} disabled={busy}><ArrowLeft size={14} aria-hidden='true' />Hero Images</button>
          <button type='button' className='hero-dialog-close' aria-label='Close hero image form' onClick={onClose} disabled={busy}><X size={18} aria-hidden='true' /></button>
        </div>
        <div className='hero-form-heading'>
          <h2 id='hero-form-heading'>{image ? 'Edit Image Details' : 'Add Hero Image'}</h2>
          <p>{image ? 'Update accessibility text or visibility. The image file stays unchanged.' : 'Choose a photo and describe its purpose on the storefront.'}</p>
        </div>
      </header>
      <form onSubmit={submit}>
        <div className='hero-form-body'>
          {image || file ? <figure className='hero-form-preview'>
            <img
              ref={image ? undefined : preview}
              src={image ? image.imageUrl : undefined}
              alt={image ? image.altText : 'Selected hero image preview'}
              onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
            <figcaption>{image ? 'Current image file stays unchanged.' : file.name + ' · Not uploaded yet'}{dimensions && ` · ${dimensions.width} × ${dimensions.height}px`}</figcaption>
          </figure> : null}
          {!image && <div className={file ? 'hero-form-reselect' : 'hero-form-upload'}>
            {!file && <><Upload size={32} aria-hidden='true' /><h3>No image selected</h3></>}
            <label htmlFor='hero-file' className='hero-manager-primary'>
              <input ref={firstField} id='hero-file' type='file' accept='image/jpeg,image/png,image/webp' disabled={busy} onChange={selectFile} aria-describedby='hero-file-help' className='sr-only' />
              {file ? 'Choose another image' : 'Choose image'}
            </label>
            {!file && <p>Uploaded when you save</p>}
          </div>}
          <div className='hero-form-file-help'>
            {image ? <p>Photo cannot be replaced from this form.</p> : <>
              <p id='hero-file-help'>JPEG, PNG or WEBP · Up to 5 MiB. Uploaded only when you save.</p>
              <p>Recommended: a wide landscape photo for the storefront hero.</p>
            </>}
          </div>
          <div className='hero-form-alt'>
            <label htmlFor='hero-alt'>Alt text</label>
            <input ref={image ? firstField : undefined} id='hero-alt' type='text' placeholder='Describe what the image shows' value={altText} onChange={event => setAltText(event.target.value)} required maxLength={250} disabled={busy} aria-describedby='hero-alt-help' className={fieldClass} />
            <p id='hero-alt-help'>Describe meaningful image content · Max 250 characters.</p>
          </div>
          <fieldset className='hero-form-visibility'>
            <legend>Storefront visibility</legend>
            <label className='hero-manager-switch-label'>
              <span className='hero-manager-switch'>
                <input type='checkbox' role='switch' aria-label='Active' checked={isActive} disabled={busy} onChange={event => setIsActive(event.target.checked)} />
                <span aria-hidden='true' />
              </span>
              <span>{isActive ? 'Active' : 'Inactive'}</span>
            </label>
            <p>Active images become eligible for the carousel after saving.</p>
          </fieldset>
          {error && <p role='alert' className='hero-manager-error'>{error}</p>}
          {unavailable && <p role='alert' className='hero-manager-warning'>This image cannot be edited, or the list could not be refreshed. Close this form and check the managed list.</p>}
        </div>
        <footer className='hero-form-footer'>
          <button type='button' disabled={busy} onClick={onClose} className='hero-manager-control'>Cancel</button>
          <button type='submit' disabled={busy || unavailable} className='hero-manager-primary'>{busy ? 'Saving…' : image ? 'Save changes' : 'Add Hero Image'}</button>
        </footer>
      </form>
    </dialog>
  )
}

export default HeroImageForm
