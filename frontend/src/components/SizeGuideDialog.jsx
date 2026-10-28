import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const SizeGuideDialog = ({ productName, fields, rows, selectedSize, onClose }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    // Native modal dialogs provide background inertness and keyboard containment.
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current.focus();

    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) {
        previousFocus.focus();
      }
    };
  }, []);

  const handleCancel = event => {
    event.preventDefault();
    onClose();
  };

  const handleBackdropClick = event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id='product-size-guide'
      aria-labelledby='size-guide-title'
      aria-describedby='size-guide-description'
      aria-modal='true'
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className='fixed inset-0 m-0 mt-auto max-h-[85dvh] w-full max-w-full rounded-t-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 font-body text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 open:flex open:flex-col sm:m-auto sm:max-h-[80dvh] sm:w-[calc(100%-48px)] sm:max-w-4xl sm:rounded-xl'
    >
      <header className='flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--pamo-color-border-default)] px-4 py-4 sm:px-6 sm:py-5'>
        <div className='min-w-0'>
          <h2 id='size-guide-title' className='font-display text-xl font-semibold'>Size Guide</h2>
          <p className='mt-1 break-words text-sm text-[color:var(--pamo-color-text-secondary)]'>{productName}</p>
        </div>
        <button ref={closeRef} type='button' onClick={onClose} aria-label='Close size guide' className='flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-default)] hover:bg-[var(--pamo-color-surface-subtle)]'>
          <X size={20} strokeWidth={1.75} aria-hidden='true' />
        </button>
      </header>
      <div className='min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-5'>
        <p id='size-guide-description' className='text-sm leading-relaxed text-[color:var(--pamo-color-text-secondary)]'>Finished-garment measurements in centimeters (cm). — means no measurement has been provided.</p>
        <div role='region' aria-label='Size measurements comparison, scroll horizontally for more fields' tabIndex={0} className='mt-4 max-w-full overflow-x-auto rounded-md border border-[color:var(--pamo-color-border-default)]'>
          <table className='w-full border-collapse text-left text-sm'>
            <caption className='sr-only'>Garment size measurements in centimeters</caption>
            <thead className='bg-[var(--pamo-color-surface-subtle)]'>
              <tr>
                <th scope='col' className='min-w-20 border-b border-[color:var(--pamo-color-border-default)] px-4 py-3 font-semibold'>Size</th>
                {fields.map(field => (
                  <th key={field.key} scope='col' className='min-w-36 border-b border-[color:var(--pamo-color-border-default)] px-4 py-3 font-semibold'>{field.label} (cm)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.size} aria-current={row.size === selectedSize ? 'true' : undefined} className='border-b border-[color:var(--pamo-color-border-default)] last:border-b-0 aria-[current=true]:bg-[var(--pamo-color-brand-yellow)]/10'>
                  <th scope='row' className='px-4 py-3 font-semibold'>
                    {row.size}{row.size === selectedSize && <span className='sr-only'> (selected)</span>}
                  </th>
                  {fields.map(field => (
                    <td key={field.key} className='px-4 py-3 tabular-nums'>{row.values[field.key] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
};

export default SizeGuideDialog;
