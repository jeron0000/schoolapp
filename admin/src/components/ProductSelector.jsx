import { Package, Search, X } from 'lucide-react'
import { useState } from 'react'

const focusClass =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pamo-color-accent-text)]'
const searchClass = `min-h-12 w-full min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] py-2.5 pl-10 pr-3 text-base text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-60 md:text-sm ${focusClass}`

const ProductThumbnail = ({ product }) => {
  const source = Array.isArray(product.image) ? product.image[0] : null
  if (source) {
    return <img src={source} alt='' className='h-10 w-10 shrink-0 rounded-md object-cover' />
  }
  return (
    <span className='grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--pamo-color-surface-default)] text-[color:var(--pamo-color-text-secondary)]'>
      <Package size={17} aria-hidden='true' />
    </span>
  )
}

const ProductSelector = ({
  products,
  selectedIds,
  requiredIds = [],
  disabled,
  onChange,
  legend = 'Linked products',
  description = 'Optionally connect this notice to one or more products from the public catalog.',
}) => {
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const selectedProducts = selectedIds.map(productId => {
    return products.find(product => product._id === productId) || {
      _id: productId,
      name: 'Unavailable product',
      image: [],
    }
  })
  const visibleProducts = products.filter(product => {
    if (!search) return true
    return [product.name, product.category, product.subCategory, product._id]
      .some(value => String(value || '').toLowerCase().includes(search))
  })

  const toggleProduct = productId => {
    if (selectedIds.includes(productId)) {
      onChange(selectedIds.filter(id => id !== productId))
      return
    }
    onChange([...selectedIds, productId])
  }

  return (
    <fieldset className='grid min-w-0 gap-3 border-t border-[color:var(--pamo-color-border-default)] pt-6'>
      <legend className='text-sm font-semibold'>{legend}</legend>
      <p className='text-xs leading-5 text-[color:var(--pamo-color-text-secondary)]'>{description}</p>

      {selectedProducts.length > 0 && (
        <ul aria-label='Selected products' className='flex min-w-0 flex-wrap gap-2'>
          {selectedProducts.map(product => (
            <li key={product._id} className='inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-subtle)] py-1 pl-3 pr-1 text-xs'>
              <span className='min-w-0 truncate'>{product.name}</span>
              <button type='button' disabled={disabled || requiredIds.includes(product._id)} onClick={() => toggleProduct(product._id)} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[var(--pamo-color-surface-default)] ${focusClass}`} aria-label={`Remove ${product.name}`}>
                <X size={14} aria-hidden='true' />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className='relative'>
        <Search className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' size={17} aria-hidden='true' />
        <input type='search' value={query} onChange={event => setQuery(event.target.value)} disabled={disabled} placeholder='Search products by name, category, or ID…' className={searchClass} />
      </div>

      <div className='max-h-60 overflow-y-auto overscroll-contain rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-2'>
        {visibleProducts.length === 0 && (
          <p className='px-3 py-5 text-center text-sm text-[color:var(--pamo-color-text-secondary)]'>No matching products.</p>
        )}
        {visibleProducts.map(product => {
          const selected = selectedIds.includes(product._id)
          return (
            <label key={product._id} className='flex min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[var(--pamo-color-surface-default)]'>
              <input type='checkbox' checked={selected} disabled={disabled || requiredIds.includes(product._id)} onChange={() => toggleProduct(product._id)} className='h-5 w-5 shrink-0 accent-[var(--pamo-color-brand-yellow)]' />
              <ProductThumbnail product={product} />
              <span className='min-w-0'>
                <span className='block break-words text-sm font-semibold'>{product.name}</span>
                <span className='mt-1 block break-words text-xs text-[color:var(--pamo-color-text-secondary)]'>{[product.category, product.subCategory].filter(Boolean).join(' · ')}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default ProductSelector
