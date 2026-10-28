import { ArrowDown, ArrowUp, Star } from 'lucide-react'

const controlClass = 'hero-manager-control inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-medium leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] [&:not(:disabled):hover]:bg-[var(--pamo-color-surface-default)]'
const deleteClass = 'hero-manager-delete inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-transparent bg-transparent px-3.5 py-2.5 text-[length:var(--pamo-staff-small)] font-medium leading-[var(--pamo-staff-compact-leading)] text-[color:var(--hero-manager-error)] [&:not(:disabled):hover]:border-current'

const HeroImageItem = ({ image, index, total, disabled, isDefault = false, onSetDefault, onMove, onEdit, onActiveChange, onDelete }) => {
  let stateLabel = image.isActive ? 'Active' : 'Inactive'
  if (image.deletionPending) stateLabel = 'Inactive · cleanup pending'

  let positionLabel = 'Image ' + (index + 1) + ' of ' + total
  if (index === 0) positionLabel = 'First image'
  else if (index === total - 1) positionLabel = 'Last image'

  return (
  <li className='hero-manager-item grid min-w-0 grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,340px)] items-start gap-5 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4 max-sm:grid-cols-1 max-sm:gap-[18px] max-sm:p-3'>
    <img src={image.imageUrl} alt={image.altText} loading='lazy' className='hero-manager-image aspect-video w-full rounded-[7px] border-[6px] border-[color:var(--pamo-color-surface-subtle)] bg-[var(--pamo-color-surface-subtle)] object-contain' />
    <div className='hero-manager-item-content min-w-0 pt-0.5 max-sm:px-0.5'>
      <p className='hero-manager-eyebrow text-[10px] font-medium uppercase text-[color:var(--pamo-color-text-secondary)]'>Alt text</p>
      <h2 className='mt-2 break-words text-[length:var(--pamo-staff-section)] font-semibold leading-[var(--pamo-staff-section-leading)]'>{image.altText}</h2>
      <div className='hero-manager-item-meta mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--pamo-color-text-secondary)] max-sm:gap-2.5'>
        <span className={'hero-manager-state inline-flex items-center gap-1.5 rounded-full border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-1 text-[11px]' + (image.isActive && !image.deletionPending ? ' is-active text-[color:var(--hero-manager-success)]' : '')}>
          <span aria-hidden='true' className='h-1.5 w-1.5 rounded-full border border-current [.is-active_&]:bg-current' />{stateLabel}
        </span>
        <span>Position {index + 1}</span>
        {isDefault && <span className='inline-flex items-center gap-1 rounded-full bg-[var(--pamo-color-brand-yellow)] px-2.5 py-1 text-[11px] font-semibold text-slate-950'><Star size={12} aria-hidden='true' />Default image</span>}
      </div>
      <label className='hero-manager-switch-label'>
        <span>Carousel visibility</span>
        <span className='hero-manager-switch'>
          <input type='checkbox' role='switch' checked={image.isActive} disabled={disabled || image.deletionPending} onChange={event => onActiveChange(image._id, event.target.checked)} aria-label={'Active: ' + image.altText} />
          <span aria-hidden='true' />
        </span>
        <span>{image.isActive ? 'On' : 'Off'}</span>
      </label>
      {image.deletionPending && <p className='hero-manager-pending-note mt-2.5 text-[11px] text-[color:var(--pamo-color-text-secondary)]'>Deletion is incomplete. Retry deletion to finish cleanup.</p>}
    </div>
    <div className='hero-manager-item-actions grid min-w-0 gap-3 border-l border-[color:var(--pamo-color-border-default)] pl-5'>
      <button type='button' disabled={disabled || isDefault || image.deletionPending} onClick={() => onSetDefault(image._id)} className={controlClass} aria-label={'Set as default: ' + image.altText}><Star size={14} aria-hidden='true' />{isDefault ? 'Current Default' : 'Set as Default'}</button>
      <h3 className='hero-manager-eyebrow text-[10px] font-medium uppercase text-[color:var(--pamo-color-text-secondary)]'>Position</h3>
      <div className='hero-manager-move grid grid-cols-2 gap-2.5'>
        <button type='button' disabled={disabled || index === 0} aria-label={'Move up: ' + image.altText} onClick={() => onMove(image._id, -1)} className={controlClass}><ArrowUp size={14} aria-hidden='true' />Up</button>
        <button type='button' disabled={disabled || index === total - 1} aria-label={'Move down: ' + image.altText} onClick={() => onMove(image._id, 1)} className={controlClass}><ArrowDown size={14} aria-hidden='true' />Down</button>
      </div>
      <p className='hero-manager-position-note text-[11px] text-[color:var(--pamo-color-text-secondary)]'>{positionLabel}</p>
      <div className='hero-manager-item-edit grid grid-cols-2 gap-2.5'>
        <button id={`hero-edit-${image._id}`} type='button' disabled={disabled || image.deletionPending} onClick={() => onEdit(image)} className={controlClass} aria-label={'Edit details: ' + image.altText}>Edit<span> Details</span></button>
        <button id={`hero-delete-${image._id}`} type='button' disabled={disabled} onClick={() => onDelete(image)} className={deleteClass} aria-label={(image.deletionPending ? 'Retry deletion: ' : 'Delete: ') + image.altText}>{image.deletionPending ? 'Retry deletion' : 'Delete'}</button>
      </div>
    </div>
    </li>
  )
}

export default HeroImageItem
