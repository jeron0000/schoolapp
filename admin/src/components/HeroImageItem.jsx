const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'

const HeroImageItem = ({ image, index, total, disabled, onMove, onEdit, onActiveChange, onDelete }) => (
  <li className='min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60'>
    <div className='grid min-w-0 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]'>
      <img src={image.imageUrl} alt={image.altText} loading='lazy' className='aspect-[16/9] w-full rounded-md bg-slate-100 object-cover dark:bg-slate-800' />
      <div className='min-w-0'>
        <p className='break-words font-medium text-slate-950 [overflow-wrap:anywhere] dark:text-slate-100'>{image.altText}</p>
        <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
          <span className={image.deletionPending ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}>{image.deletionPending ? 'Inactive · cleanup pending' : image.isActive ? 'Active' : 'Inactive'}</span>
          <span>Position {index + 1}</span>
        </div>
        {image.deletionPending && <p className='mt-2 text-xs leading-5'>Deletion is incomplete. Retry deletion to finish cleanup.</p>}
        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <button type='button' disabled={disabled || index === 0} aria-label={'Move up: ' + image.altText} onClick={() => onMove(image._id, -1)} className={buttonClass}>↑ <span className='ml-1'>Up</span></button>
          <button type='button' disabled={disabled || index === total - 1} aria-label={'Move down: ' + image.altText} onClick={() => onMove(image._id, 1)} className={buttonClass}>↓ <span className='ml-1'>Down</span></button>
          <label className='inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-slate-700 dark:text-slate-200'>
            <input type='checkbox' checked={image.isActive} disabled={disabled || image.deletionPending} onChange={event => onActiveChange(image._id, event.target.checked)} aria-label={'Active: ' + image.altText} className='h-4 w-4 shrink-0 accent-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500' />Active
          </label>
          <button type='button' disabled={disabled || image.deletionPending} onClick={() => onEdit(image)} className={buttonClass}>Edit</button>
          <button type='button' disabled={disabled} onClick={() => onDelete(image)} className='inline-flex min-h-11 items-center justify-center rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10'>{image.deletionPending ? 'Retry deletion' : 'Delete'}</button>
        </div>
      </div>
    </div>
  </li>
)

export default HeroImageItem
