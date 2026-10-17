import { useEffect, useRef } from 'react'
import { containDialogFocus } from '../utils/dialogFocus'

const CashierPaymentInspector = ({ children, pending, onClose, label = 'Payment Details' }) => {
  const panel = useRef(null)

  useEffect(() => {
    const dialog = panel.current
    const opener = document.activeElement
    const media = window.matchMedia('(min-width: 1280px)')
    const previousOverflow = document.body.style.overflow
    const syncDialog = () => {
      if (dialog.open) dialog.close()
      if (media.matches) {
        dialog.open = true
        document.body.style.overflow = previousOverflow
      } else {
        dialog.showModal()
        document.body.style.overflow = 'hidden'
      }
    }
    syncDialog()
    media.addEventListener('change', syncDialog)
    return () => {
      media.removeEventListener('change', syncDialog)
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog
      ref={panel}
      className='cashier-payment-inspector'
      aria-label={label}
      tabIndex={-1}
      onCancel={event => { event.preventDefault(); if (!pending) onClose() }}
      onKeyDown={event => { if (event.currentTarget.matches(':modal')) containDialogFocus(event) }}
    >
      {children}
    </dialog>
  )
}

export default CashierPaymentInspector
