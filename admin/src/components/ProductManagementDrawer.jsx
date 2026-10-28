import { useCallback, useEffect, useRef, useState } from 'react'
import { Boxes, CircleDollarSign, Image, Tags, X } from 'lucide-react'
import ClassificationMultiSelect from './ClassificationMultiSelect'
import PriceManagementDrawer from './PriceManagementDrawer'
import StockManagementDrawer from './StockManagementDrawer'
import ColorVariantsEditor from './ColorVariantsEditor'
import StorefrontLabelsEditor from './StorefrontLabelsEditor'
import { PRODUCT_GENDER_NOT_APPLICABLE } from '../../../shared/productTaxonomy.js'

const tabs = [
  { id: 'price', label: 'Price', icon: CircleDollarSign },
  { id: 'stock', label: 'Stock', icon: Boxes },
  { id: 'classification', label: 'Classification', icon: Tags }
]

const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-focus)]'
const secondaryButtonClass = `inline-flex min-h-11 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-input)] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`

const ProductManagementDrawer = ({
  product,
  products = [],
  token,
  classification,
  refreshing = false,
  onClose,
  onProductUpdated,
  onLabelsUpdated,
  onPriceUpdated,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState('price')
  const [dirtyTabs, setDirtyTabs] = useState({ price: false, stock: false })
  const [busyTabs, setBusyTabs] = useState({ price: false, stock: false })
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [variantEditorKey, setVariantEditorKey] = useState(0)
  const panel = useRef(null)
  const tabButtons = useRef({})
  const closeButton = useRef(null)
  const discardButton = useRef(null)

  const updateDirtyTab = useCallback((tab, dirty) => {
    setDirtyTabs(previous => {
      if (previous[tab] === dirty) return previous
      return { ...previous, [tab]: dirty }
    })
  }, [])

  const updateBusyTab = useCallback((tab, busy) => {
    setBusyTabs(previous => {
      if (previous[tab] === busy) return previous
      return { ...previous, [tab]: busy }
    })
  }, [])

  const handlePriceDirty = useCallback(dirty => updateDirtyTab('price', dirty), [updateDirtyTab])
  const handleStockDirty = useCallback(dirty => updateDirtyTab('stock', dirty), [updateDirtyTab])
  const handlePriceBusy = useCallback(busy => updateBusyTab('price', busy), [updateBusyTab])
  const handleStockBusy = useCallback(busy => updateBusyTab('stock', busy), [updateBusyTab])
  const handleVariantDirty = useCallback(dirty => updateDirtyTab('variants', dirty), [updateDirtyTab])
  const handleVariantBusy = useCallback(busy => updateBusyTab('variants', busy), [updateBusyTab])
  const handleLabelsDirty = useCallback(dirty => updateDirtyTab('labels', dirty), [updateDirtyTab])
  const handleLabelsBusy = useCallback(busy => updateBusyTab('labels', busy), [updateBusyTab])

  const hasUnsavedChanges = dirtyTabs.price || dirtyTabs.stock || dirtyTabs.variants || dirtyTabs.labels || classification.changed
  const busy = busyTabs.price || busyTabs.stock || busyTabs.variants || busyTabs.labels || classification.saving

  useEffect(() => {
    const dialog = panel.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()

    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected !== false) previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    if (confirmingClose) discardButton.current?.focus()
  }, [confirmingClose])

  const requestClose = () => {
    if (busy) return
    if (hasUnsavedChanges) {
      setConfirmingClose(true)
      return
    }
    onClose()
  }

  const handleCancel = event => {
    event.preventDefault()
    if (confirmingClose) {
      setConfirmingClose(false)
      closeButton.current?.focus()
      return
    }
    requestClose()
  }

  const containFocus = event => {
    if (event.key !== 'Tab') return
    const focusScope = confirmingClose
      ? event.currentTarget.querySelector('[role="alertdialog"]')
      : event.currentTarget
    const controls = [...focusScope.querySelectorAll('button:not(:disabled), input:not(:disabled)')]
      .filter(control => !control.closest('[hidden]'))
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first) {
      event.preventDefault()
      event.currentTarget.focus()
      return
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
      event.preventDefault()
      first.focus()
    }
  }

  const selectTab = tabId => {
    if (busyTabs.labels) return
    setActiveTab(tabId)
    setConfirmingClose(false)
  }

  const keepEditing = () => {
    setConfirmingClose(false)
    closeButton.current?.focus()
  }

  const handleTabKeyDown = event => {
    const currentIndex = tabs.findIndex(tab => tab.id === activeTab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return

    event.preventDefault()
    const nextTab = tabs[nextIndex].id
    selectTab(nextTab)
    tabButtons.current[nextTab]?.focus()
  }

  return (
    <dialog
      ref={panel}
      aria-labelledby='product-management-heading'
      aria-describedby='product-management-description'
      aria-busy={busy}
      tabIndex={-1}
      onCancel={handleCancel}
      onKeyDown={containFocus}
      className='fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-[680px] border-0 border-l border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-0 text-[length:var(--pamo-staff-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60 open:flex open:flex-col'
    >
      <header className='sticky top-0 z-20 shrink-0 border-b border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] px-6 pb-5 pt-6 max-[539px]:px-4 max-[539px]:pt-4'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex min-w-0 items-center gap-3'>
            <div className='flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)]'>
              {product.image?.[0] ? <img src={product.image[0]} alt='' className='h-full w-full object-contain' /> : <Image aria-hidden='true' className='h-5 w-5' />}
            </div>
            <div className='min-w-0'>
              <p className='text-[11px] font-semibold uppercase tracking-[.12em] text-[color:var(--pamo-color-accent-text)]'>Product management</p>
              <h2 id='product-management-heading' className='mt-1 break-words text-xl font-bold leading-tight'>{product.name}</h2>
              <p id='product-management-description' className='sr-only'>Manage this product's price, stock, classifications, and Storefront Labels.</p>
            </div>
          </div>
          <button ref={closeButton} type='button' onClick={requestClose} disabled={busy} aria-label='Close product management' className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`} autoFocus>
            <X aria-hidden='true' className='h-5 w-5' />
          </button>
        </div>

        <div role='tablist' aria-label='Product management sections' className='mt-5 grid grid-cols-3 gap-1 rounded-lg bg-[var(--pamo-color-surface-subtle)] p-1'>
          {tabs.map(tab => {
            const TabIcon = tab.icon
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                ref={element => { tabButtons.current[tab.id] = element }}
                id={`product-management-${tab.id}-tab`}
                type='button'
                role='tab'
                aria-selected={selected}
                aria-controls={`product-management-${tab.id}-panel`}
                disabled={busyTabs.labels}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={handleTabKeyDown}
                className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-1 py-2 text-xs font-semibold transition-colors sm:gap-2 sm:px-2 sm:text-sm ${focusClass} ${selected ? 'bg-[var(--pamo-color-brand-yellow)] text-slate-950' : 'text-[color:var(--pamo-color-text-secondary)] hover:bg-[var(--pamo-color-surface-default)] hover:text-[color:var(--pamo-color-text-primary)]'}`}
              >
                <TabIcon aria-hidden='true' className='h-4 w-4 shrink-0 max-[359px]:hidden' />
                <span className='whitespace-nowrap max-[359px]:text-[11px]'>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
        <div className='px-6 pt-4 max-[539px]:px-4'>
          <ColorVariantsEditor key={variantEditorKey}
            product={product} products={products.length ? products : [product]} token={token} onRefresh={onRefresh}
            onReset={() => { handleVariantDirty(false); setVariantEditorKey(previous => previous + 1) }}
            disabled={busy || refreshing} onDirtyChange={handleVariantDirty} onBusyChange={handleVariantBusy} />
        </div>
        <section id='product-management-price-panel' role='tabpanel' aria-labelledby='product-management-price-tab' hidden={activeTab !== 'price'}>
          <PriceManagementDrawer
            embedded
            product={product}
            token={token}
            onUpdated={onPriceUpdated}
            onDirtyChange={handlePriceDirty}
            onBusyChange={handlePriceBusy}
          />
        </section>

        <section id='product-management-stock-panel' role='tabpanel' aria-labelledby='product-management-stock-tab' hidden={activeTab !== 'stock'}>
          <StockManagementDrawer
            embedded
            product={product}
            token={token}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onUpdated={onProductUpdated}
            onDirtyChange={handleStockDirty}
            onBusyChange={handleStockBusy}
          />
        </section>

        <section id='product-management-classification-panel' role='tabpanel' aria-labelledby='product-management-classification-tab' hidden={activeTab !== 'classification'} className='p-6 max-[539px]:p-4'>
          <form onSubmit={classification.onSave}>
            <div>
              <h3 className='text-lg font-semibold'>Product Classification</h3>
              <p className='mt-2 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>Assign academic programs, genders, and merchandise categories independently.</p>
            </div>
            <dl className='mt-5 grid grid-cols-3 gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] p-4 text-sm max-[539px]:grid-cols-1'>
              <div><dt className='text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>Academic Programs</dt><dd className='mt-1.5 break-words font-semibold'>{classification.currentLabels.programs}</dd></div>
              <div><dt className='text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>Genders</dt><dd className='mt-1.5 break-words font-semibold'>{classification.currentLabels.genders}</dd></div>
              <div><dt className='text-[10px] font-semibold uppercase tracking-[.06em] text-[color:var(--pamo-color-text-secondary)]'>Merchandise</dt><dd className='mt-1.5 break-words font-semibold'>{classification.currentLabels.merchandise}</dd></div>
            </dl>
            <div className='mt-5 grid gap-4'>
              <ClassificationMultiSelect id='product-program-edit' label='Academic Programs' options={classification.programOptions} selectedValues={classification.selectedPrograms} onChange={classification.onProgramsChange} disabled={classification.saving || classification.loading || busyTabs.labels} loading={classification.loading} />
              <ClassificationMultiSelect id='product-gender-edit' label='Gender' options={classification.genderOptions} selectedValues={classification.selectedGenders} onChange={classification.onGendersChange} disabled={classification.saving || busyTabs.labels} exclusiveValues={[PRODUCT_GENDER_NOT_APPLICABLE]} />
              <ClassificationMultiSelect id='product-merchandise-edit' label='Merchandise Categories' options={classification.merchandiseOptions} selectedValues={classification.selectedMerchandise} onChange={classification.onMerchandiseChange} disabled={classification.saving || classification.loading || busyTabs.labels} loading={classification.loading} />
            </div>
            {classification.loadError && <div role='alert' className='mt-4 text-sm text-[color:var(--pamo-color-error-text)]'><p>{classification.loadError}</p><button type='button' onClick={classification.onRefresh} className={secondaryButtonClass + ' mt-2'}>Try again</button></div>}
            {!classification.loading && !classification.loadError && classification.programOptions.length === 0 && classification.merchandiseOptions.length === 0 && <p className='mt-4 text-sm text-[color:var(--pamo-color-text-secondary)]'>No active managed classifications are available. Use Manage Classifications to create or restore one.</p>}
            {classification.error && <p role='alert' className='mt-4 text-sm text-[color:var(--pamo-color-error-text)]'>{classification.error}</p>}
            {classification.success && <p role='status' className='mt-4 text-sm text-[color:var(--pamo-color-success-text)]'>{classification.success}</p>}
            <button type='submit' disabled={classification.saving || classification.loading || busyTabs.labels || !classification.changed} className={`mt-6 min-h-[52px] w-full rounded-md bg-[var(--pamo-color-brand-yellow)] px-4 py-3 text-sm font-semibold text-slate-950 enabled:hover:bg-[var(--pamo-color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}>{classification.saving ? 'Saving...' : 'Save Classification'}</button>
          </form>
          <StorefrontLabelsEditor key={token} product={product} token={token} disabled={busy || refreshing} onUpdated={onLabelsUpdated} onDirtyChange={handleLabelsDirty} onBusyChange={handleLabelsBusy} />
        </section>
      </div>

      {confirmingClose && (
        <div role='alertdialog' aria-modal='true' aria-labelledby='discard-product-changes-heading' aria-describedby='discard-product-changes-description' className='absolute inset-0 z-30 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center'>
          <div className='w-full max-w-md rounded-xl border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-5 shadow-xl'>
            <h3 id='discard-product-changes-heading' className='text-lg font-semibold'>Discard unsaved changes?</h3>
            <p id='discard-product-changes-description' className='mt-2 text-sm leading-6 text-[color:var(--pamo-color-text-secondary)]'>Unsaved changes to Price, Stock, Classification, Storefront Labels, or Multiple Items will be lost.</p>
            <div className='mt-5 flex flex-col-reverse gap-3 min-[375px]:flex-row'>
              <button type='button' onClick={keepEditing} className={secondaryButtonClass + ' flex-1'}>Keep Editing</button>
              <button ref={discardButton} type='button' onClick={onClose} className='min-h-11 flex-1 rounded-md bg-[var(--pamo-color-brand-yellow)] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[var(--pamo-color-brand-hover)]'>Discard Changes</button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}

export default ProductManagementDrawer
