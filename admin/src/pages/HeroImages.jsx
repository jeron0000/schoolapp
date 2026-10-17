import { useState } from 'react'
import HeroImageItem from '../components/HeroImageItem'
import HeroImageForm from '../components/HeroImageForm'
import HeroDeleteConfirmation from '../components/HeroDeleteConfirmation'
import useHeroImages from '../hooks/useHeroImages'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import './HeroImages.css'

const primaryClass = 'hero-manager-primary'
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
    <section aria-labelledby='hero-images-heading' className='pamo-hero-manager'>
      <nav className='hero-manager-breadcrumb' aria-label='Breadcrumb'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Storefront content</span><span aria-hidden='true'>/</span><span aria-current='page'>Hero Images</span>
      </nav>
      <header className='hero-manager-heading'>
        <div>
          <h1 id='hero-images-heading'>Hero Images</h1>
          <p>Manage the photographs displayed in the storefront hero.</p>
        </div>
        <button id='hero-manager-add' type='button' disabled={disabled} onClick={() => setForm({ image: null })} className={primaryClass}><Plus size={18} aria-hidden='true' />Add Hero Image</button>
      </header>
      <div className='hero-manager-visibility-note'><h2>Storefront visibility</h2><p>Active images are eligible for the storefront carousel. Inactive images remain saved here.</p></div>
      {manager.notice && <p role={manager.notice.ok ? 'status' : 'alert'} className={manager.notice.ok ? 'hero-manager-feedback' : 'hero-manager-error'}>{manager.notice.message}</p>}
      {manager.status === 'loading' && <p role='status' className='hero-manager-empty'>Loading hero images…</p>}
      {manager.status === 'error' && <div role='alert' className='hero-manager-empty'>
        <p>{manager.error}</p>
        <button type='button' onClick={manager.refresh} disabled={manager.busy} className={primaryClass + ' mt-4'}>Try again</button>
      </div>}
      {manager.status === 'ready' && <div className='hero-manager-list-summary'><p>{manager.images.length} uploaded {manager.images.length === 1 ? 'image' : 'images'}</p><span>Arranged in carousel display order</span></div>}
      {manager.status === 'ready' && (manager.images.length ? <ul aria-label='Managed hero images' aria-busy={manager.busy} className='hero-manager-list'>
        {manager.images.map((image, index) => <HeroImageItem key={image._id} image={image} index={index} total={manager.images.length} disabled={disabled} onMove={manager.move} onEdit={image => setForm({ image })} onActiveChange={(id, isActive) => manager.update(id, { isActive })} onDelete={setDeleting} />)}
      </ul> : <div className='hero-manager-empty'>
        <h2>No hero images have been added yet.</h2>
        <button type='button' disabled={disabled} onClick={() => setForm({ image: null })} className={primaryClass + ' mt-4'}>Add Hero Image</button>
      </div>)}
      <p className='hero-manager-list-note'>Use Up/Down to rearrange slides. Image visibility and saved order determine carousel content.</p>
      {form && <HeroImageForm image={form.image} busy={manager.busy} unavailable={manager.status === 'error' || Boolean(form.image && (!currentEdit || currentEdit.deletionPending))} onClose={() => setForm(null)} onSave={save} />}
      {deleting && <HeroDeleteConfirmation image={currentDelete || deleting} busy={manager.busy} unavailable={manager.status === 'error' || !currentDelete} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </section>
  )
}

export default HeroImages
