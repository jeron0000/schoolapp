import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import CollectionFilters from './CollectionFilters';

const actionClassName = [
  'inline-flex min-h-12 min-w-0 items-center justify-center gap-3 rounded-[7px] border',
  'px-4 py-2.5 text-center text-[13px] font-semibold leading-[1.5]'
].join(' ');

const CollectionFilterDrawer = ({
  genders,
  programs,
  merchandiseCategories,
  genderOptions,
  programOptions,
  merchandiseOptions,
  categoriesLoading,
  categoryError,
  onRetryCategories,
  onToggle,
  onReset,
  count,
  onClose,
  fallbackFocusRef,
}) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const fallbackFocus = fallbackFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    // Native showModal supplies the top layer, background inertness and Tab containment.
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current.focus();
    const desktop = window.matchMedia('(min-width: 1180px)');
    const onDesktop = event => {
      if (event.matches) onClose();
    };
    desktop.addEventListener('change', onDesktop);
    return () => {
      desktop.removeEventListener('change', onDesktop);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) {
        previousFocus.focus();
      } else {
        fallbackFocus?.focus();
      }
    };
  }, [onClose, fallbackFocusRef]);

  const onBackdropClick = event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickedOutside = event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom;
    if (clickedOutside) onClose();
  };

  const cancelClose = event => {
    event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      id='collection-filter-drawer'
      className='collection-filter-drawer fixed inset-y-0 left-auto right-0 m-0 ml-auto h-dvh max-h-dvh w-[min(100%,390px)] max-w-full border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[color:var(--pamo-color-text-primary)] [border-radius:9px_0_0_9px]'
      aria-labelledby='collection-filter-drawer-title'
      aria-modal='true'
      onCancel={cancelClose}
      onClick={onBackdropClick}
    >
      <div className='flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--pamo-color-border-default)] px-5 py-4 max-[359px]:px-4'>
        <h2 id='collection-filter-drawer-title' className='text-[19px] font-semibold leading-[1.5]'>Filters</h2>
        <button ref={closeRef} type='button' onClick={onClose} aria-label='Close filters' className='inline-flex min-h-11 min-w-11 items-center justify-center gap-2 py-2 pl-3 text-[13px] font-medium leading-[1.5] text-[color:var(--pamo-color-text-secondary)] hover:text-[color:var(--pamo-color-accent-text)]'>
          Close
          <X size={18} strokeWidth={1.75} aria-hidden='true'/>
        </button>
      </div>
      <div className='min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 max-[359px]:px-4'>
        <CollectionFilters
          genders={genders}
          programs={programs}
          merchandiseCategories={merchandiseCategories}
          genderOptions={genderOptions}
          programOptions={programOptions}
          merchandiseOptions={merchandiseOptions}
          categoriesLoading={categoriesLoading}
          categoryError={categoryError}
          onRetryCategories={onRetryCategories}
          onToggle={onToggle}
          drawer
        />
      </div>
      <div className='mt-auto grid shrink-0 grid-cols-[minmax(80px,0.6fr)_minmax(0,1fr)] gap-3 border-t border-[color:var(--pamo-color-border-default)] px-5 py-4 max-[359px]:px-4'>
        <button type='button' className={actionClassName + ' border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-border-input)] hover:bg-[var(--pamo-color-surface-subtle)]'} onClick={onReset}>Reset</button>
        <button type='button' className={actionClassName + ' border-transparent bg-[var(--pamo-color-brand-yellow)] text-slate-950 hover:bg-[var(--pamo-color-brand-hover)] active:bg-[var(--pamo-color-brand-pressed)]'} onClick={onClose}>Show {count} {count === 1 ? 'result' : 'results'}</button>
      </div>
    </dialog>
  );
};

export default CollectionFilterDrawer;
