import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { backendUrl } from '../utils/config'
import ProductSelector from './ProductSelector'
import { getProductOptionLabel, optionKey, normalizeOptionLabel } from '../../../shared/productVariants.js'

const inputClass = 'mt-2 min-h-11 w-full min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2 text-base'
const buttonClass = 'min-h-11 rounded-md border border-[color:var(--pamo-color-border-input)] px-4 py-2 text-sm font-semibold disabled:opacity-50'

const ColorVariantsEditor = ({ product, products, token, onRefresh, onReset, onDirtyChange, onBusyChange, disabled }) => {
  const [baseline] = useState(() => {
    const anchor = products.find(item => item._id === product.variantGroupId) || product
    const members = products.filter(item => item.variantGroupId === anchor._id)
    if (!members.length) members.push(product)
    return { anchor, ids: members.map(item => item._id),
      labels: Object.fromEntries(members.map(item => [item._id, getProductOptionLabel(item) || item.name])),
      title: anchor.groupTitle || product.name }
  })
  const { anchor, ids: initialIds, labels: initialLabels, title: initialTitle } = baseline
  const [selectedIds, setSelectedIds] = useState(initialIds)
  const [labels, setLabels] = useState(initialLabels)
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const changed = title !== initialTitle
    || JSON.stringify([...selectedIds].sort()) !== JSON.stringify([...initialIds].sort())
    || selectedIds.some(id => (labels[id] || '') !== (initialLabels[id] || ''))

  useEffect(() => { onDirtyChange(changed) }, [changed, onDirtyChange])
  const availableProducts = products.filter(item => !item.variantGroupId || item.variantGroupId === anchor._id)
  const updateSelection = ids => setSelectedIds([...new Set([anchor._id, ...ids])])

  const save = async (unlink = false) => {
    if (pending.current || disabled) return
    if (unlink && !window.confirm(product._id === anchor._id
      ? 'Ungroup all items? Products, stock, and order history will be preserved.'
      : 'Unlink this item? The product and stock will be preserved.')) return
    const selectedLabels = selectedIds.map(id => normalizeOptionLabel(labels[id] || products.find(item => item._id === id)?.name))
    if (!unlink && (!title.trim() || title.trim().length > 120 || selectedLabels.some(label => !label))) {
      setError('Enter a listing title and a valid item label for every selected product.')
      return
    }
    if (!unlink && new Set(selectedLabels.map(optionKey)).size !== selectedLabels.length) {
      setError('Each item label must be unique within the listing.')
      return
    }
    pending.current = true
    setSaving(true)
    setError('')
    onBusyChange(true)
    try {
      let response
      if (unlink) {
        response = await axios.delete(`${backendUrl}/api/product/variants/${product._id}`, { headers: { token } })
      } else {
        response = await axios.put(`${backendUrl}/api/product/variants/${anchor._id}`, {
          groupTitle: title.trim(), version: anchor.__v || 0,
          members: selectedIds.map((productId, index) => ({ productId, optionLabel: selectedLabels[index] }))
        }, { headers: { token } })
      }
      if (!response.data.success) throw new Error(response.data.message || 'Unable to save multiple items.')
      toast.success(response.data.message || 'Multiple items saved.')
      onDirtyChange(false)
      await onRefresh()
      onReset()
    } catch (failure) {
      setError(failure.response?.data?.message || failure.message)
    } finally {
      pending.current = false
      setSaving(false)
      onBusyChange(false)
    }
  }

  return (
    <details className='mb-5 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4'>
      <summary className='min-h-11 cursor-pointer py-2 text-sm font-semibold'>Multiple Items {getProductOptionLabel(product) && `· ${getProductOptionLabel(product)}`}</summary>
      <fieldset disabled={disabled || saving} className='mt-3 grid min-w-0 gap-4 border-0 p-0'>
        <label className='text-sm font-medium'>Listing title<input className={inputClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></label>
        <ProductSelector products={availableProducts} selectedIds={selectedIds} requiredIds={[anchor._id]} onChange={updateSelection} disabled={disabled || saving} legend='Products in this listing' description='The anchor stays selected. Unchecked items become standalone products when you save. Manage each item’s price, stock, and classification from its Product List row.' />
        {selectedIds.map(id => {
          const item = products.find(entry => entry._id === id)
          return <label key={id} className='min-w-0 text-sm font-medium'>Item option for {item?.name || id}{id === anchor._id && ' (anchor)'}
            <input className={inputClass} value={labels[id] ?? item?.name ?? ''} onChange={event => setLabels(previous => ({ ...previous, [id]: event.target.value }))} maxLength={80} placeholder='Use product name' />
          </label>
        })}
        {error && <p role='alert' className='break-words text-sm text-[color:var(--pamo-color-error-text)]'>{error}</p>}
        <div className='flex flex-wrap gap-2'>
          <button type='button' className={buttonClass + ' bg-[var(--pamo-color-brand-yellow)] text-slate-950'} disabled={!changed && Boolean(product.variantGroupId)} onClick={() => save()}>{saving ? 'Saving…' : 'Save Multiple Items'}</button>
          <button type='button' className={buttonClass} disabled={!changed} onClick={onReset}>Cancel Changes</button>
          {product.variantGroupId && <button type='button' className={buttonClass} onClick={() => save(true)}>{product._id === anchor._id ? 'Ungroup All Items' : 'Unlink This Item'}</button>}
        </div>
      </fieldset>
    </details>
  )
}

export default ColorVariantsEditor
