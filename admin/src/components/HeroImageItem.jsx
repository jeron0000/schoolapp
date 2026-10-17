import { ArrowDown, ArrowUp } from 'lucide-react'

const HeroImageItem = ({ image, index, total, disabled, onMove, onEdit, onActiveChange, onDelete }) => (
  <li className='hero-manager-item'>
    <img src={image.imageUrl} alt={image.altText} loading='lazy' className='hero-manager-image' />
    <div className='hero-manager-item-content'>
      <p className='hero-manager-eyebrow'>Alt text</p>
      <h2>{image.altText}</h2>
      <div className='hero-manager-item-meta'>
        <span className={'hero-manager-state' + (image.isActive && !image.deletionPending ? ' is-active' : '')}>
          <span aria-hidden='true' />{image.deletionPending ? 'Inactive · cleanup pending' : image.isActive ? 'Active' : 'Inactive'}
        </span>
        <span>Position {index + 1}</span>
      </div>
      <label className='hero-manager-switch-label'>
        <span>Carousel visibility</span>
        <span className='hero-manager-switch'>
          <input type='checkbox' role='switch' checked={image.isActive} disabled={disabled || image.deletionPending} onChange={event => onActiveChange(image._id, event.target.checked)} aria-label={'Active: ' + image.altText} />
          <span aria-hidden='true' />
        </span>
        <span>{image.isActive ? 'On' : 'Off'}</span>
      </label>
      {image.deletionPending && <p className='hero-manager-pending-note'>Deletion is incomplete. Retry deletion to finish cleanup.</p>}
    </div>
    <div className='hero-manager-item-actions'>
      <h3 className='hero-manager-eyebrow'>Position</h3>
      <div className='hero-manager-move'>
        <button type='button' disabled={disabled || index === 0} aria-label={'Move up: ' + image.altText} onClick={() => onMove(image._id, -1)} className='hero-manager-control'><ArrowUp size={14} aria-hidden='true' />Up</button>
        <button type='button' disabled={disabled || index === total - 1} aria-label={'Move down: ' + image.altText} onClick={() => onMove(image._id, 1)} className='hero-manager-control'><ArrowDown size={14} aria-hidden='true' />Down</button>
      </div>
      <p className='hero-manager-position-note'>{index === 0 ? 'First image' : index === total - 1 ? 'Last image' : `Image ${index + 1} of ${total}`}</p>
      <div className='hero-manager-item-edit'>
        <button id={`hero-edit-${image._id}`} type='button' disabled={disabled || image.deletionPending} onClick={() => onEdit(image)} className='hero-manager-control' aria-label={'Edit details: ' + image.altText}>Edit<span> Details</span></button>
        <button id={`hero-delete-${image._id}`} type='button' disabled={disabled} onClick={() => onDelete(image)} className='hero-manager-delete' aria-label={(image.deletionPending ? 'Retry deletion: ' : 'Delete: ') + image.altText}>{image.deletionPending ? 'Retry deletion' : 'Delete'}</button>
      </div>
    </div>
  </li>
)

export default HeroImageItem
