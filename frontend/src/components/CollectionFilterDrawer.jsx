import { useEffect, useRef } from 'react'
import CollectionFilters from './CollectionFilters'
import { X } from 'lucide-react'

const CollectionFilterDrawer = ({ genders, programs, onToggle, onReset, count, onClose, fallbackFocusRef }) => {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const fallbackFocus = fallbackFocusRef.current
    const previousOverflow = document.body.style.overflow
    // Native showModal supplies the top layer, background inertness and Tab containment.
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    closeRef.current.focus()
    const desktop = window.matchMedia('(min-width: 1180px)')
    const onDesktop = event => { if (event.matches) onClose() }
    desktop.addEventListener('change', onDesktop)
    return () => {
      desktop.removeEventListener('change', onDesktop)
      if (dialog.open) dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus()
      else fallbackFocus?.focus()
    }
  }, [onClose, fallbackFocusRef])

  const onBackdropClick = event => {
    if (event.target !== event.currentTarget) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
  }

  return (
    <dialog ref={dialogRef} id='collection-filter-drawer' className='collection-filter-drawer' aria-labelledby='collection-filter-drawer-title' aria-modal='true'
      onCancel={event => { event.preventDefault(); onClose() }} onClick={onBackdropClick}>
      <div className='collection-drawer-header'>
        <h2 id='collection-filter-drawer-title'>Filters</h2>
        <button ref={closeRef} type='button' onClick={onClose} aria-label='Close filters'>Close <X size={18} strokeWidth={1.75} aria-hidden='true'/></button>
      </div>
      <div className='collection-drawer-body'>
        <CollectionFilters genders={genders} programs={programs} onToggle={onToggle}/>
      </div>
      <div className='collection-drawer-actions'>
        <button type='button' className='collection-outline-action' onClick={onReset}>Reset</button>
        <button type='button' className='collection-brand-action' onClick={onClose}>Show {count} {count === 1 ? 'result' : 'results'}</button>
      </div>
    </dialog>
  )
}

export default CollectionFilterDrawer
