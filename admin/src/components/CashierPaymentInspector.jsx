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
      className='cashier-payment-inspector mb-3 ml-auto mr-3 mt-3 max-h-[calc(100dvh-24px)] w-[min(520px,calc(100%-24px))] max-w-none overflow-hidden rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 max-md:fixed max-md:inset-0 max-md:m-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:rounded-none max-md:border-0 xl:sticky xl:top-4 xl:m-0 xl:max-h-[calc(100dvh-32px)] xl:w-full'
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
