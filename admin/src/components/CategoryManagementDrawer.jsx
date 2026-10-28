import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { containDialogFocus } from '../utils/dialogFocus'
import {
  academicPrograms,
  builtInMerchandiseCategories,
  productGenders
} from '../../../shared/productTaxonomy.js'

const codePattern = /^[A-Za-z][A-Za-z0-9-]{1,39}$/
const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'
const fieldClass = `min-h-12 w-full min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2.5 text-base text-[color:var(--pamo-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const secondaryButtonClass = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const primaryButtonClass = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-[var(--pamo-color-brand-yellow)] px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const dangerButtonClass = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-[color:var(--pamo-color-error-text)] hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`
const statusClass = 'rounded-full border px-2 py-1 text-[10px] font-semibold uppercase'
const scopeOrder = ['program', 'general', 'gender']
const scopeDetails = {
  program: {
    heading: 'Academic Programs',
    singular: 'Program',
    addLabel: 'Add Program',
    namePlaceholder: 'e.g. Digital Arts',
    codePlaceholder: 'digital-arts'
  },
  general: {
    heading: 'Merchandise Categories',
    singular: 'Category',
    addLabel: 'Add Category',
    namePlaceholder: 'e.g. School Supplies',
    codePlaceholder: 'school-supplies'
  },
  gender: {
    heading: 'Gender',
    singular: 'Gender option',
    addLabel: 'Add Gender',
    namePlaceholder: 'e.g. Unisex',
    codePlaceholder: 'unisex'
  }
}
const defaultClassifications = {
  program: academicPrograms.map(code => ({ code, name: code })),
  general: builtInMerchandiseCategories.map(option => ({
    code: option.value,
    name: option.label
  })),
  gender: productGenders.map(code => ({ code, name: code }))
}

const comparableKey = value => value.trim().normalize('NFKC').toLocaleLowerCase('en-US')

const apiMessage = (error, fallback) => {
  return error.response?.data?.message || error.message || fallback
}

const suggestedCode = name => {
  return name
    .trim()
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const isDefaultClassification = (value, scope) => {
  if (typeof value !== 'string') return false
  const key = comparableKey(value)
  return defaultClassifications[scope].some(classification => {
    return comparableKey(classification.code) === key
      || comparableKey(classification.name) === key
  })
}

const validateCategory = ({ name, code, categories, scope }) => {
  const trimmedName = name.trim()
  if (trimmedName.length < 2 || trimmedName.length > 80) {
    return 'Classification names must be between 2 and 80 characters.'
  }
  if (!codePattern.test(code)) {
    return 'Use a code with letters, numbers, or hyphens.'
  }
  if (isDefaultClassification(trimmedName, scope) || isDefaultClassification(code, scope)) {
    return 'This default classification is already available.'
  }
  const nameKey = comparableKey(trimmedName)
  const codeKey = comparableKey(code)
  const duplicate = categories.some(category => {
    return comparableKey(category.code) === codeKey
      || (category.scope === scope && comparableKey(category.name) === nameKey)
  })
  if (duplicate) return 'A classification with this name or code already exists.'
  return ''
}

const getVisibleClassifications = (categories, scope) => {
  const scopedCategories = categories.filter(category => category.scope === scope)
  const managedCodes = new Set(scopedCategories.map(category => comparableKey(category.code)))
  const defaults = defaultClassifications[scope]
    .filter(classification => !managedCodes.has(comparableKey(classification.code)))
    .map(classification => ({
      ...classification,
      scope,
      active: true,
      managed: false,
      removed: false
    }))
  const managed = scopedCategories
    .filter(category => !category.removed)
    .map(category => ({ ...category, managed: true }))
  return [...managed, ...defaults]
    .sort((left, right) => left.name.localeCompare(right.name))
}

const classificationIdentity = category => {
  return category._id || `default-${category.scope}-${category.code}`
}

const categoryApiPath = category => {
  if (category.managed) return backendUrl + '/api/category/admin/' + category._id
  return backendUrl + '/api/category/admin/default/'
    + encodeURIComponent(category.scope) + '/' + encodeURIComponent(category.code)
}

const confirmationContent = target => {
  if (!target) return null
  const { action, category } = target
  if (action === 'remove') {
    return {
      title: 'Remove classification?',
      description: `${category.name} will be deleted when unused. If existing products, students, or orders still reference it, the classification will be archived instead.`,
      confirmLabel: 'Remove',
      confirmAriaLabel: `Confirm remove ${category.name}`,
      destructive: true
    }
  }
  if (category.active) {
    return {
      title: 'Archive classification?',
      description: `${category.name} will remain identifiable on existing records but cannot be selected for new assignments.`,
      confirmLabel: 'Archive',
      confirmAriaLabel: `Confirm archive ${category.name}`,
      destructive: false
    }
  }
  return {
    title: 'Restore classification?',
    description: `${category.name} will become available for new assignments.`,
    confirmLabel: 'Restore',
    confirmAriaLabel: `Confirm restore ${category.name}`,
    destructive: false
  }
}

const CategoryManagementDrawer = ({
  categories,
  loading,
  loadError,
  token,
  onClose,
  onRefresh,
  onCreated,
  onUpdated,
  onDeleted,
  initialScope = 'program'
}) => {
  const startingScope = scopeDetails[initialScope] ? initialScope : 'program'
  const [activeScope, setActiveScope] = useState(startingScope)
  const [creationOpen, setCreationOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeEdited, setCodeEdited] = useState(false)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [confirmationTarget, setConfirmationTarget] = useState(null)
  const [notice, setNotice] = useState('')
  const panel = useRef(null)
  const firstField = useRef(null)
  const confirmationCancel = useRef(null)
  const programTab = useRef(null)
  const generalTab = useRef(null)
  const genderTab = useRef(null)
  const tabRefs = { program: programTab, general: generalTab, gender: genderTab }
  const pending = creating || busyId !== null
  const currentScope = scopeDetails[activeScope]
  const visibleClassifications = getVisibleClassifications(categories, activeScope)
  const confirmation = confirmationContent(confirmationTarget)

  useEffect(() => {
    const dialog = panel.current
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    if (creationOpen) firstField.current?.focus()
  }, [creationOpen])

  useEffect(() => {
    if (confirmationTarget) confirmationCancel.current?.focus()
  }, [confirmationTarget])

  const closeUnlessPending = event => {
    event.preventDefault()
    if (pending) return
    if (confirmationTarget) {
      setConfirmationTarget(null)
      return
    }
    onClose()
  }

  const resetCreation = () => {
    setCreationOpen(false)
    setName('')
    setCode('')
    setCodeEdited(false)
    setCreateError('')
  }

  const selectScope = nextScope => {
    if (pending || nextScope === activeScope) return
    setActiveScope(nextScope)
    setEditingId(null)
    setActionError('')
    setNotice('')
    resetCreation()
  }

  const handleTabKeyDown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let nextIndex = scopeOrder.indexOf(activeScope)
    if (event.key === 'ArrowLeft') nextIndex = (nextIndex - 1 + scopeOrder.length) % scopeOrder.length
    if (event.key === 'ArrowRight') nextIndex = (nextIndex + 1) % scopeOrder.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = scopeOrder.length - 1
    const nextScope = scopeOrder[nextIndex]
    selectScope(nextScope)
    tabRefs[nextScope].current?.focus()
  }

  const beginCreation = () => {
    setCreationOpen(true)
    setName('')
    setCode('')
    setCodeEdited(false)
    setCreateError('')
    setActionError('')
    setNotice('')
  }

  const changeName = event => {
    const nextName = event.target.value
    setName(nextName)
    if (!codeEdited) setCode(suggestedCode(nextName))
  }

  const changeCode = event => {
    setCode(event.target.value.trim())
    setCodeEdited(true)
  }

  const refreshAfterMutation = async () => {
    if (typeof onRefresh === 'function') await onRefresh()
  }

  const createCategory = async event => {
    event.preventDefault()
    if (pending) return

    const message = validateCategory({ name, code, categories, scope: activeScope })
    if (message) {
      setCreateError(message)
      return
    }

    setCreating(true)
    setCreateError('')
    setNotice('')
    try {
      const { data } = await axios.post(
        backendUrl + '/api/category/admin',
        { name: name.trim(), code, scope: activeScope, active: true },
        { headers: { token } }
      )
      if (!data.success) {
        throw new Error(data.message || `Unable to create the ${currentScope.singular.toLowerCase()}.`)
      }
      onCreated?.(data.category)
      resetCreation()
      setNotice(`${currentScope.singular} created.`)
      await refreshAfterMutation()
    } catch (error) {
      setCreateError(apiMessage(error, `Unable to create the ${currentScope.singular.toLowerCase()}.`))
    } finally {
      setCreating(false)
    }
  }

  const startEditing = category => {
    resetCreation()
    setEditingId(classificationIdentity(category))
    setEditName(category.name)
    setActionError('')
    setNotice('')
  }

  const saveName = async (event, category) => {
    event.preventDefault()
    if (busyId) return
    const nextName = editName.trim()
    if (nextName.length < 2 || nextName.length > 80) {
      setActionError('Classification names must be between 2 and 80 characters.')
      return
    }
    const nameKey = comparableKey(nextName)
    const duplicateName = categories.some(item => {
      return classificationIdentity(item) !== classificationIdentity(category)
        && item.scope === category.scope
        && comparableKey(item.name) === nameKey
    })
    if (duplicateName) {
      setActionError('A classification with this name already exists.')
      return
    }

    const identity = classificationIdentity(category)
    setBusyId(identity)
    setActionError('')
    try {
      const { data } = await axios.patch(
        categoryApiPath(category),
        { name: nextName },
        { headers: { token } }
      )
      if (!data.success) throw new Error(data.message || 'Unable to rename the classification.')
      onUpdated?.(data.category)
      setEditingId(null)
      setNotice(`${currentScope.singular} renamed.`)
      await refreshAfterMutation()
    } catch (error) {
      setActionError(apiMessage(error, 'Unable to rename the classification.'))
    } finally {
      setBusyId(null)
    }
  }

  const confirmAction = async () => {
    if (!confirmationTarget || busyId) return
    const { action, category } = confirmationTarget
    const identity = classificationIdentity(category)
    setBusyId(identity)
    setActionError('')
    try {
      if (action === 'remove') {
        const { data } = await axios.delete(
          categoryApiPath(category),
          { headers: { token } }
        )
        if (!data.success) throw new Error(data.message || 'Unable to remove the classification.')
        if (data.action === 'archived' && data.category) {
          onUpdated?.(data.category)
          setNotice(data.message || 'Classification archived because it is still referenced.')
        } else {
          if (category._id) onDeleted?.(category._id)
          setNotice(data.message || 'Classification deleted.')
        }
      } else {
        const { data } = await axios.patch(
          backendUrl + '/api/category/admin/' + category._id,
          { active: !category.active },
          { headers: { token } }
        )
        if (!data.success) throw new Error(data.message || 'Unable to update the classification status.')
        onUpdated?.(data.category)
        setNotice(data.category.active ? 'Classification restored.' : 'Classification archived.')
      }
      setConfirmationTarget(null)
      await refreshAfterMutation()
    } catch (error) {
      setActionError(apiMessage(error, 'Unable to update the classification.'))
      setConfirmationTarget(null)
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmationKeyDown = event => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!pending) setConfirmationTarget(null)
      return
    }
    containDialogFocus(event)
  }

  return (
    <dialog
      ref={panel}
      tabIndex={-1}
      aria-labelledby='category-manager-heading'
      aria-busy={pending}
      onKeyDown={containDialogFocus}
      onCancel={closeUnlessPending}
      className='fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-[min(100%,640px)] max-w-full border-0 border-l border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 open:flex open:flex-col'
    >
      <div className='contents' inert={confirmationTarget ? true : undefined} aria-hidden={confirmationTarget ? 'true' : undefined}>
        <header className='flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--pamo-color-border-default)] px-6 py-5 max-sm:px-[18px]'>
          <div className='min-w-0'>
            <p className='text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--pamo-color-accent-text)]'>Product organization</p>
            <h2 id='category-manager-heading' className='mt-1.5 text-2xl font-bold leading-tight tracking-[-.02em]'>Manage Classifications</h2>
          </div>
          <button type='button' aria-label='Close classification management' onClick={onClose} disabled={pending} className={secondaryButtonClass + ' shrink-0 px-0'}><X size={20} aria-hidden='true' /></button>
        </header>

        <div role='tablist' aria-label='Classification management' className='grid shrink-0 grid-cols-3 border-b border-[color:var(--pamo-color-border-default)] px-6 pt-3 max-sm:px-[18px]'>
          {scopeOrder.map(scope => (
            <button
              key={scope}
              ref={tabRefs[scope]}
              id={`category-tab-${scope}`}
              type='button'
              role='tab'
              aria-selected={activeScope === scope}
              aria-controls='category-panel'
              tabIndex={activeScope === scope ? 0 : -1}
              disabled={pending}
              onClick={() => selectScope(scope)}
              onKeyDown={handleTabKeyDown}
              className='min-h-12 border-b-2 border-transparent px-2 py-2 text-xs font-semibold text-[color:var(--pamo-color-text-secondary)] aria-selected:border-[color:var(--pamo-color-brand-yellow)] aria-selected:text-[color:var(--pamo-color-text-primary)] sm:text-sm'
            >
              {scopeDetails[scope].heading}
            </button>
          ))}
        </div>

        <div id='category-panel' role='tabpanel' aria-labelledby={`category-tab-${activeScope}`} className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 max-sm:p-[18px]'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h3 className='font-semibold'>{currentScope.heading}</h3>
              <p className='mt-1 text-xs text-[color:var(--pamo-color-text-secondary)]'>
                {visibleClassifications.length} available
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button type='button' onClick={onRefresh} disabled={loading || pending} className={secondaryButtonClass} aria-label={`Refresh ${currentScope.heading.toLowerCase()}`}><RefreshCw size={16} aria-hidden='true' /></button>
              <button type='button' onClick={beginCreation} disabled={pending || creationOpen} className={primaryButtonClass}><Plus size={16} aria-hidden='true' />{currentScope.addLabel}</button>
            </div>
          </div>

          {creationOpen && (
            <form onSubmit={createCategory} noValidate className='mt-4 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-4'>
              <h4 className='font-semibold'>{currentScope.addLabel}</h4>
              <div className='mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1'>
                <label className='grid gap-2 text-sm font-semibold'>Classification Name<input ref={firstField} type='text' value={name} onChange={changeName} required maxLength={80} disabled={pending} placeholder={currentScope.namePlaceholder} className={fieldClass} /></label>
                <label className='grid gap-2 text-sm font-semibold'>Classification Code<input type='text' value={code} onChange={changeCode} required maxLength={40} disabled={pending} placeholder={currentScope.codePlaceholder} aria-describedby='category-code-help' className={fieldClass} /></label>
              </div>
              <p id='category-code-help' className='mt-2 text-xs text-[color:var(--pamo-color-text-secondary)]'>Suggested from the name. Codes cannot be changed after creation.</p>
              {createError && <p role='alert' className='mt-3 text-sm text-[color:var(--pamo-color-error-text)]'>{createError}</p>}
              <div className='mt-4 flex flex-col-reverse gap-2 min-[375px]:flex-row min-[375px]:justify-end'>
                <button type='button' disabled={pending} onClick={resetCreation} className={secondaryButtonClass}>Cancel</button>
                <button type='submit' disabled={pending} className={primaryButtonClass}><Plus size={16} aria-hidden='true' />{creating ? 'Creating...' : `Create ${currentScope.singular}`}</button>
              </div>
            </form>
          )}

          {notice && <p role='status' className='mt-4 rounded-md border border-green-600/30 bg-green-500/10 px-3 py-2 text-sm text-[color:var(--pamo-color-success-text)]'>{notice}</p>}
          {actionError && <p role='alert' className='mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[color:var(--pamo-color-error-text)]'>{actionError}</p>}
          {loading && <p role='status' className='mt-4 rounded-lg border border-[color:var(--pamo-color-border-default)] p-6 text-center'>Loading classifications...</p>}
          {!loading && loadError && <div role='alert' className='mt-4 rounded-lg border border-[color:var(--pamo-color-border-default)] p-5 text-center'><p>{loadError}</p><button type='button' onClick={onRefresh} className={secondaryButtonClass + ' mt-3'}>Try again</button></div>}
          {!loading && !loadError && (
            <ul aria-label={currentScope.heading} className='mt-4 grid gap-2'>
              {visibleClassifications.map(category => {
                const identity = classificationIdentity(category)
                return (
                <li key={identity} className='rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-3 py-2.5'>
                  {editingId === identity && (
                    <form onSubmit={event => saveName(event, category)} className='grid gap-3'>
                      <label className='grid gap-2 text-sm font-semibold'>Classification Name<input type='text' value={editName} onChange={event => setEditName(event.target.value)} maxLength={80} disabled={busyId === identity} className={fieldClass} autoFocus /></label>
                      <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Code <code className='font-semibold text-[color:var(--pamo-color-text-primary)]'>{category.code}</code> remains unchanged.</p>
                      <div className='flex flex-wrap justify-end gap-2'>
                        <button type='button' disabled={busyId === identity} onClick={() => setEditingId(null)} className={secondaryButtonClass}>Cancel</button>
                        <button type='submit' disabled={busyId === identity || editName.trim() === category.name} className={primaryButtonClass}><Check size={16} aria-hidden='true' />Save Name</button>
                      </div>
                    </form>
                  )}
                  {editingId !== identity && (
                    <div className='flex items-center justify-between gap-3 max-[479px]:items-start max-[479px]:flex-col'>
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h4 className='break-words font-semibold'>{category.name}</h4>
                          <span className={category.active ? statusClass + ' border-green-600/40 text-[color:var(--pamo-color-success-text)]' : statusClass + ' border-[color:var(--pamo-color-border-default)] text-[color:var(--pamo-color-text-secondary)]'}>{category.active ? 'Active' : 'Archived'}</span>
                        </div>
                        <p className='mt-0.5 text-xs text-[color:var(--pamo-color-text-secondary)]'>Code: <code>{category.code}</code></p>
                      </div>
                      <div className='flex shrink-0 flex-wrap gap-2'>
                        <button type='button' onClick={() => startEditing(category)} disabled={pending} className={secondaryButtonClass} aria-label={`Edit ${category.name}`}><Pencil size={15} aria-hidden='true' /><span className='max-[360px]:sr-only'>Edit</span></button>
                        {!category.active && <button type='button' onClick={() => setConfirmationTarget({ action: 'status', category })} disabled={pending} className={secondaryButtonClass} aria-label={`Restore ${category.name}`}><RotateCcw size={16} aria-hidden='true' /><span className='max-[420px]:sr-only'>Restore</span></button>}
                        <button type='button' onClick={() => setConfirmationTarget({ action: 'remove', category })} disabled={pending} className={dangerButtonClass} aria-label={`Remove ${category.name}`}><Trash2 size={16} aria-hidden='true' /><span className='max-[420px]:sr-only'>Remove</span></button>
                      </div>
                    </div>
                  )}
                </li>
              )})}
              {visibleClassifications.length === 0 && <li className='rounded-lg border border-dashed border-[color:var(--pamo-color-border-default)] px-4 py-5 text-center text-sm text-[color:var(--pamo-color-text-secondary)]'>No classifications in this group.</li>}
            </ul>
          )}
        </div>
      </div>

      {confirmationTarget && confirmation && (
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-slate-950/60 p-4'>
          <div role='alertdialog' aria-modal='true' aria-labelledby='classification-confirmation-heading' aria-describedby='classification-confirmation-description' aria-busy={pending} tabIndex={-1} onKeyDown={handleConfirmationKeyDown} className='w-full max-w-md rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-5 shadow-xl sm:p-6'>
            <h3 id='classification-confirmation-heading' className='text-xl font-semibold'>{confirmation.title}</h3>
            <p id='classification-confirmation-description' className='mt-3 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>{confirmation.description}</p>
            <div className='mt-6 flex flex-col-reverse gap-3 min-[375px]:flex-row'>
              <button ref={confirmationCancel} type='button' disabled={pending} onClick={() => setConfirmationTarget(null)} className={secondaryButtonClass + ' flex-1'}>Cancel</button>
              <button type='button' aria-label={confirmation.confirmAriaLabel} disabled={pending} onClick={confirmAction} className={(confirmation.destructive ? dangerButtonClass : primaryButtonClass) + ' flex-1'}>{pending ? 'Saving...' : confirmation.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}

export default CategoryManagementDrawer
