import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import HeroDeleteConfirmation from '../components/HeroDeleteConfirmation'
import HeroImageForm from '../components/HeroImageForm'
import HeroImageItem from '../components/HeroImageItem'
import useHeroImages from '../hooks/useHeroImages'
import originalHeroImage from '../../../frontend/src/assets/hero_students.jpg'
import './HeroImages.css'

const primaryClass = 'hero-manager-primary inline-flex min-h-12 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[7px] border border-transparent bg-[var(--pamo-color-brand-yellow)] px-6 py-3 text-[13px] font-semibold text-slate-900 [&:not(:disabled):hover]:bg-[var(--pamo-color-brand-hover)]'
const emptyClass = 'hero-manager-empty rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-5 py-8 text-center'
const controlClass = 'hero-manager-control inline-flex min-h-11 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--pamo-color-surface-default)]'
const HeroImages = ({ token }) => {
  const manager = useHeroImages(token)
  const [form, setForm] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const disabled = manager.busy || manager.status !== 'ready'
  const currentEdit = form?.image && manager.images.find(image => image._id === form.image._id)
  let currentDelete = deleting && manager.images.find(image => image._id === deleting._id)
  if (deleting?.resetToOriginal) currentDelete = manager.fallback
  const noticeRole = manager.notice?.ok ? 'status' : 'alert'
  const noticeClass = manager.notice?.ok ? 'hero-manager-feedback' : 'hero-manager-error'
  const imageLabel = manager.images.length === 1 ? 'image' : 'images'
  const showImageList = manager.status === 'ready' && manager.images.length > 0
  const showEmptyState = manager.status === 'ready' && manager.images.length === 0
  const defaultImageId = manager.images.find(image => image.isActive && !image.deletionPending)?._id
  const replacement = manager.fallback && !manager.fallback.deletionPending ? manager.fallback : null

  const save = async values => {
    let result
    if (form.fallback) {
      result = await manager.replaceFallback(values)
    } else if (form.image) {
      result = await manager.update(form.image._id, {
        altText: values.altText,
        isActive: values.isActive,
      })
    } else {
      result = await manager.create(values)
    }
    if (result?.ok) {
      setForm(null)
    }
    return result
  }
  const remove = async id => {
    const result = deleting.resetToOriginal ? await manager.resetFallback() : await manager.remove(id)
    if (result?.ok) {
      setDeleting(null)
    }
    return result
  }

  return (
    <section aria-labelledby='hero-images-heading' className='pamo-hero-manager mx-auto grid max-w-[2160px] min-w-0 gap-6 text-[length:var(--dashboard-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] max-sm:gap-[18px]'>
      <nav className='hero-manager-breadcrumb flex flex-wrap items-center gap-2 text-[length:var(--pamo-staff-small)] uppercase text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center' aria-label='Breadcrumb'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Storefront content</span><span aria-hidden='true'>/</span><span aria-current='page'>Hero Images</span>
      </nav>
      <header className='hero-manager-heading mb-3 flex items-center justify-between gap-6 max-sm:mb-0 max-sm:flex-col max-sm:items-stretch'>
        <div className='min-w-0 border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4'>
          <h1 id='hero-images-heading' className='text-[length:var(--pamo-staff-heading)] font-bold leading-[var(--pamo-staff-heading-leading)] tracking-[-.025em]'>Hero Images</h1>
          <p className='mt-2.5 text-[length:var(--pamo-staff-body)] text-[color:var(--pamo-color-text-secondary)]'>Manage the photographs displayed in the storefront hero.</p>
        </div>
      </header>
      {manager.notice && (
        <p role={noticeRole} className={noticeClass}>{manager.notice.message}</p>
      )}
      <section aria-labelledby='default-hero-heading' className='grid min-w-0 gap-5 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-5 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]'>
        <img src={replacement?.imageUrl || originalHeroImage} alt={replacement?.altText || 'Original built-in Hero image: STI students in campus uniforms'} className='aspect-[2412/1752] w-full rounded-md bg-[var(--pamo-color-surface-subtle)] object-cover object-top' />
        <div className='flex min-w-0 flex-col items-start justify-center gap-3'>
          <h2 id='default-hero-heading' className='text-lg font-semibold'>Default Hero Image</h2>
          <p className='text-sm text-[color:var(--pamo-color-text-secondary)]'>Shown only when no usable carousel images remain. This does not change the carousel’s first slide.</p>
          <p className='text-xs font-medium'>{replacement ? 'Admin replacement configured' : 'Using original built-in image'}</p>
          {manager.fallback?.deletionPending && <p role='alert' className='hero-manager-warning'>Reset cleanup is pending. Retry Reset to Original before replacing this image.</p>}
          <div className='flex flex-wrap gap-3'>
            <button id='hero-manager-replace-fallback' type='button' disabled={disabled || manager.fallback?.deletionPending} onClick={() => setForm({ image: null, fallback: true })} className={controlClass}>Replace Image</button>
            <button type='button' disabled={disabled || !manager.fallback} onClick={() => setDeleting({ ...manager.fallback, resetToOriginal: true })} className={controlClass}>Reset to Original</button>
          </div>
        </div>
      </section>
      <div className='flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--pamo-color-border-default)] pt-6'>
        <h2 className='text-lg font-semibold'>Carousel Images</h2>
        <button id='hero-manager-add' type='button' disabled={disabled} onClick={() => setForm({ image: null })} className={primaryClass}><Plus size={18} aria-hidden='true' />Add Hero Image</button>
      </div>
      <div className='hero-manager-visibility-note rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-5 max-sm:p-3.5'><h2 className='text-[10px] font-semibold uppercase text-[color:var(--pamo-color-accent-text)]'>Storefront visibility</h2><p className='mt-2.5 text-[13px] max-sm:text-xs'>The first active image is the default. Set as Default activates an image and places it first. Other inactive images remain saved here.</p></div>
      {manager.status === 'loading' && <p role='status' className={emptyClass}>Loading hero images…</p>}
      {manager.status === 'error' && <div role='alert' className={emptyClass}>
        <p>{manager.error}</p>
        <button type='button' onClick={manager.refresh} disabled={manager.busy} className={primaryClass + ' mt-4'}>Try again</button>
      </div>}
      {manager.status === 'ready' && (
        <div className='hero-manager-list-summary -mb-2 mt-2 flex flex-wrap justify-between gap-2.5 text-xs text-[color:var(--pamo-color-text-secondary)] max-sm:mt-1'>
          <p>{manager.images.length} uploaded {imageLabel}</p>
          <span>Arranged in carousel display order</span>
        </div>
      )}
      {showImageList && (
        <ul aria-label='Managed hero images' aria-busy={manager.busy} className='hero-manager-list grid min-w-0 gap-5'>
          {manager.images.map((image, index) => (
            <HeroImageItem
              key={image._id}
              image={image}
              index={index}
              total={manager.images.length}
              disabled={disabled}
              isDefault={image._id === defaultImageId}
              onSetDefault={manager.setDefault}
              onMove={manager.move}
              onEdit={image => setForm({ image })}
              onActiveChange={(id, isActive) => manager.update(id, { isActive })}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}
      {showEmptyState && (
        <div className={emptyClass}>
          <h2 className='font-semibold'>No hero images have been added yet.</h2>
          <button type='button' disabled={disabled} onClick={() => setForm({ image: null })} className={primaryClass + ' mt-4'}>Add Hero Image</button>
        </div>
      )}
      <p className='hero-manager-list-note mt-3 text-[11px] text-[color:var(--pamo-color-text-secondary)] max-sm:text-[10px]'>Use Up/Down to rearrange slides. The first active image starts the carousel; if none are usable, the Default Hero Image is used.</p>
      {form && <HeroImageForm image={form.image} fallback={form.fallback} busy={manager.busy} unavailable={manager.status === 'error' || Boolean(form.image && (!currentEdit || currentEdit.deletionPending))} onClose={() => setForm(null)} onSave={save} />}
      {deleting && <HeroDeleteConfirmation image={currentDelete || deleting} resetToOriginal={deleting.resetToOriginal} busy={manager.busy} unavailable={manager.status === 'error' || !currentDelete} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </section>
  )
}

export default HeroImages
