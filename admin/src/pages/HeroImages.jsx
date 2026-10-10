import { useState } from 'react'
import HeroImageItem from '../components/HeroImageItem'
import HeroImageForm from '../components/HeroImageForm'
import HeroDeleteConfirmation from '../components/HeroDeleteConfirmation'
import useHeroImages from '../hooks/useHeroImages'

const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-50'
const HeroImages = ({ token }) => {
  const manager = useHeroImages(token)
  const [form, setForm] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const disabled = manager.busy || manager.status !== 'ready'
  const currentEdit = form?.image && manager.images.find(image => image._id === form.image._id)
  const currentDelete = deleting && manager.images.find(image => image._id === deleting._id)

  const save = async values => {
    const result = form.image ? await manager.update(form.image._id, { altText: values.altText, isActive: values.isActive }) : await manager.create(values)
    if (result?.ok) setForm(null)
    return result
  }
  const remove = async id => {
    const result = await manager.remove(id)
    if (result?.ok) setDeleting(null)
    return result
  }

  return (
    <section aria-labelledby='hero-images-heading' className='mx-auto min-w-0 max-w-[1280px] space-y-5 text-slate-600 dark:text-slate-400'>
      <header className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div className='min-w-0 border-l-4 border-amber-400 pl-4'>
          <h1 id='hero-images-heading' className='text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100'>Hero Images</h1>
          <p className='mt-1 text-sm leading-6'>Manage the images shown in the storefront hero.</p>
        </div>
        <button type='button' disabled={disabled} onClick={() => setForm({ image: null })} className={primaryClass + ' shrink-0'}><span aria-hidden='true'>+</span>Add Hero Image</button>
      </header>
      <p className='text-xs leading-5'>Active images are eligible for the storefront carousel. Inactive images remain in Admin.</p>
      {manager.notice && <p role={manager.notice.ok ? 'status' : 'alert'} className={'break-words text-sm leading-6 ' + (manager.notice.ok ? 'text-slate-700 dark:text-slate-300' : 'text-red-600 dark:text-red-400')}>{manager.notice.message}</p>}
      {manager.status === 'loading' && <p role='status' className='rounded-lg border border-slate-200 bg-white p-6 text-center text-sm dark:border-slate-800 dark:bg-slate-900/60'>Loading hero images…</p>}
      {manager.status === 'error' && <div role='alert' className='rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900/60'>
        <p className='break-words text-sm leading-6'>{manager.error}</p>
        <button type='button' onClick={manager.refresh} disabled={manager.busy} className={primaryClass + ' mt-4'}>Try again</button>
      </div>}
      {manager.status === 'ready' && (manager.images.length ? <ul aria-label='Managed hero images' aria-busy={manager.busy} className='space-y-3'>
        {manager.images.map((image, index) => <HeroImageItem key={image._id} image={image} index={index} total={manager.images.length} disabled={disabled} onMove={manager.move} onEdit={image => setForm({ image })} onActiveChange={(id, isActive) => manager.update(id, { isActive })} onDelete={setDeleting} />)}
      </ul> : <div className='rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900/60'>
        <h2 className='font-semibold text-slate-950 dark:text-slate-100'>No hero images have been added yet.</h2>
        <button type='button' disabled={disabled} onClick={() => setForm({ image: null })} className={primaryClass + ' mt-4'}>Add Hero Image</button>
      </div>)}
      {form && <HeroImageForm image={form.image} busy={manager.busy} unavailable={manager.status === 'error' || Boolean(form.image && (!currentEdit || currentEdit.deletionPending))} onClose={() => setForm(null)} onSave={save} />}
      {deleting && <HeroDeleteConfirmation image={currentDelete || deleting} busy={manager.busy} unavailable={manager.status === 'error' || !currentDelete} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </section>
  )
}

export default HeroImages
