import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { backendUrl, currency } from '../utils/config'
import { money } from '../utils/orderPresentation'
import axios from 'axios'
import { toast } from 'react-toastify'
import StockManagementDrawer from '../components/StockManagementDrawer'
import { getTotalStock, getStockLabel } from '../../../shared/inventory'
import { ChevronLeft, ChevronRight, Image, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import './List.css'

const pageSize = 9
const controlClass = 'product-list-control'
const icons = { search: Search, plus: Plus, reset: RotateCcw, trash: Trash2, close: X, previous: ChevronLeft, next: ChevronRight, image: Image }

const Icon = ({ name, className = 'h-5 w-5' }) => {
  const Component = icons[name]
  return <Component aria-hidden='true' strokeWidth={1.7} className={className} />
}

const List = ({ token }) => {
  const [list, setList] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [tag, setTag] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [productToDelete, setProductToDelete] = useState(null)
  const deleteDialog = useRef(null)
  const cancelDeleteButton = useRef(null)
  const deletionPending = useRef(false)
  const productRequestId = useRef(0)
  const productsActive = useRef(false)
  const [stockProductId, setStockProductId] = useState(null)
  const closeStock = useCallback(() => setStockProductId(null), [])
  const stockProduct = list.find(product => product._id === stockProductId)

  const fetchList = useCallback(async () => {
    if (!productsActive.current) return
    const requestId = ++productRequestId.current
    setLoading(true)
    setError('')
    try {
      const response = await axios.get(backendUrl + '/api/product/list')
      if (!productsActive.current || requestId !== productRequestId.current) return
      if (!response.data.success) throw new Error(response.data.message || 'Unable to load products.')
      setList(response.data.products)
    } catch (error) {
      if (!productsActive.current || requestId !== productRequestId.current) return
      setError(error.message)
      toast.error(error.message)
    } finally {
      if (productsActive.current && requestId === productRequestId.current) setLoading(false)
    }
  }, [])

  const removeProduct = async product => {
    if (!product || deletionPending.current) return
    deletionPending.current = true
    setDeletingId(product._id)
    try {
      const response = await axios.post(backendUrl + '/api/product/remove', { id: product._id }, { headers: { token } })
      if (response.data.success) {
        toast.success(response.data.message)
        setProductToDelete(null)
        await fetchList()
      } else {
        toast.error(response.data.message)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      deletionPending.current = false
      setDeletingId(null)
    }
  }

  useEffect(() => {
    productsActive.current = true
    fetchList()
    return () => {
      productsActive.current = false
      productRequestId.current += 1
    }
  }, [fetchList, token])

  useEffect(() => {
    const dialog = deleteDialog.current
    if (productToDelete && !dialog.open) {
      dialog.showModal()
      cancelDeleteButton.current.focus()
    } else if (!productToDelete && dialog.open) {
      dialog.close()
    }
  }, [productToDelete])

  const categories = [...new Set(list.map(product => product.category).filter(Boolean))].sort()
  const search = query.trim().toLowerCase()
  const filtered = list.filter(product =>
    (!category || product.category === category) &&
    (!tag || product[tag] === true) &&
    (!search || [product.name, product.category, product.subCategory, product._id].some(value => String(value || '').toLowerCase().includes(search)))
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const visibleProducts = filtered.slice(start, start + pageSize)

  const resetFilters = () => {
    setQuery('')
    setCategory('')
    setTag('')
    setPage(1)
  }

  return (
    <section aria-labelledby='product-list-heading' className='pamo-product-list'>
      <nav aria-label='Breadcrumb' className='product-list-breadcrumb'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Products</span><span aria-hidden='true'>/</span><span aria-current='page'>All Items</span>
      </nav>
      <header className='product-list-heading'>
        <div>
          <h1 id='product-list-heading'>Product List</h1>
          <p>Manage and organize merchandise, pricing and available stock.</p>
        </div>
        <Link to='/add' className='product-list-primary'><Icon name='plus' /> Add New Item</Link>
      </header>

      <div role='search' aria-label='Search and filter products' className='product-list-filters'>
        <label className='product-list-search'>
          <span className='sr-only'>Search products</span>
          <Icon name='search' />
          <input type='search' value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder='Search products by name, category, or ID…' className={controlClass} />
        </label>
        <select aria-label='Filter by category' value={category} onChange={event => { setCategory(event.target.value); setPage(1) }} className={controlClass}>
          <option value=''>All Categories</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label='Filter by tag' value={tag} onChange={event => { setTag(event.target.value); setPage(1) }} className={controlClass}>
          <option value=''>All Tags</option>
          <option value='NewArrival'>New Arrival</option>
          <option value='BestSeller'>Best Seller</option>
        </select>
        <button type='button' onClick={resetFilters} className={controlClass + ' product-list-reset'}>
          <Icon name='reset' className='h-4 w-4' /> Reset
        </button>
      </div>

      {!loading && !error && <div className='product-list-summary'>
        <p>{visibleProducts.length} products on this page · {filtered.length} total</p>
        <span>Inventory overview</span>
      </div>}
      <div className='product-list-panel' aria-busy={loading}>
        {loading ? <p role='status' className='product-list-empty'>Loading products…</p>
          : error ? <div role='alert' className='product-list-empty'><p>{error}</p><button type='button' onClick={fetchList} className={controlClass}>Try again</button></div>
          : visibleProducts.length === 0 ? <div className='product-list-empty'>
            <h2>{list.length ? 'No matching products' : 'No products yet'}</h2>
            <p>{list.length ? 'Try another search or reset your filters.' : 'Add your first item to start your product list.'}</p>
            {list.length > 0 && <button type='button' onClick={resetFilters} className={controlClass}>Clear filters</button>}
          </div>
          : <table className='product-list-table'>
            <caption className='sr-only'>PAMO products with categories, prices, stock, merchandising tags, and actions</caption>
            <thead>
              <tr>
                <th scope='col'>Product</th>
                <th scope='col' className='product-list-category'>Category</th>
                <th scope='col'>Price</th>
                <th scope='col'>Stock</th>
                <th scope='col' className='product-list-tags'>Tags</th>
                <th scope='col'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map(product => {
                const total = getTotalStock(product)
                const stockState = total === 0 ? 'empty' : total <= 5 ? 'low' : 'available'
                const tags = [[product.NewArrival === true, 'NEW'], [product.BestSeller === true, 'BEST SELLER']]
                  .filter(([enabled]) => enabled)
                return (
                  <tr key={product._id}>
                    <td className='product-list-product'>
                      <div className='product-list-identity'>
                        <div className='product-list-image'>
                          {product.image?.[0] ? <img src={product.image[0]} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true }} /> : <Icon name='image' />}
                        </div>
                        <div className='product-list-name'>
                          <span>{product.name}</span>
                          <span className='product-list-compact-category'>{product.category || '—'}{product.subCategory ? ' · ' + product.subCategory : ''}</span>
                          <div className='product-list-compact-tags'>
                            {tags.map(([, label]) => <span key={label} className='product-list-tag'>{label}</span>)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className='product-list-category'>
                      <span className='product-list-category-label'>{product.category || '—'}</span>
                      {product.subCategory && <span className='product-list-subcategory'>{product.subCategory}</span>}
                    </td>
                    <td className='product-list-price'><span className='product-list-mobile-label'>Price: </span>{money(product.price, currency)}</td>
                    <td className={'product-list-stock is-' + stockState}>
                      <strong>{total}</strong><span>{getStockLabel(total)}</span>
                    </td>
                    <td className='product-list-tags'>
                      <div>{tags.map(([, label]) => <span key={label} className='product-list-tag'>{label}</span>)}</div>
                    </td>
                    <td className='product-list-actions'>
                      <div>
                        <button type='button' aria-label={`Manage stock for ${product.name}`} onClick={() => setStockProductId(product._id)} className={controlClass + ' product-list-manage'}><span>Manage </span>Stock</button>
                        <button type='button' aria-label={`Delete ${product.name}`} title='Delete product' disabled={deletingId !== null} onClick={() => setProductToDelete(product)} className='product-list-delete'>
                          <Icon name='trash' className='h-4 w-4' />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>}
        {!loading && !error && <div className='product-list-pagination'>
          <p role='status'>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} products</p>
          <nav aria-label='Product list pagination'>
            <span className='product-list-page-size'>9 per page</span>
            <button type='button' aria-label='Previous page' disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={controlClass}><Icon name='previous' className='h-4 w-4' /></button>
            <span aria-current='page' className='product-list-current-page'>{currentPage} <span>/ {pageCount}</span></span>
            <button type='button' aria-label='Next page' disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className={controlClass}><Icon name='next' className='h-4 w-4' /></button>
          </nav>
        </div>}
      </div>
      <p className='product-list-note'>Select Manage Stock to review each size before making an adjustment.</p>
      <dialog ref={deleteDialog} aria-labelledby='delete-item-heading' aria-describedby='delete-item-description delete-item-warning' aria-busy={deletingId !== null} onCancel={event => { event.preventDefault(); if (!deletionPending.current) setProductToDelete(null) }} className='!m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-lg backdrop:bg-slate-950/50 sm:p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
        <div className='flex items-center justify-between gap-3'>
          <h2 id='delete-item-heading' className='text-lg font-semibold'>Delete Item</h2>
          <button type='button' aria-label='Close delete confirmation' disabled={deletingId !== null} onClick={() => setProductToDelete(null)} className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800'><Icon name='close' className='h-5 w-5' /></button>
        </div>
        <p id='delete-item-description' className='mt-3 break-words text-sm leading-6 text-slate-600 dark:text-slate-300'>Are you sure you want to delete <span className='font-medium text-slate-900 dark:text-slate-100'>"{productToDelete?.name}"</span>?</p>
        <p id='delete-item-warning' className='mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400'>This action cannot be undone.</p>
        <div className='mt-6 flex flex-col gap-3 min-[375px]:flex-row'>
          <button ref={cancelDeleteButton} type='button' disabled={deletingId !== null} onClick={() => setProductToDelete(null)} className='min-h-11 flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800'>Cancel</button>
          <button type='button' disabled={deletingId !== null} onClick={() => removeProduct(productToDelete)} className='min-h-11 flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-wait disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10'>{deletingId !== null ? 'Deleting...' : 'Delete Item'}</button>
        </div>
      </dialog>
      {stockProduct && <StockManagementDrawer key={stockProduct._id} product={stockProduct} token={token} onClose={closeStock} onRefresh={fetchList} refreshing={loading} onUpdated={updated => setList(previous => previous.map(product => product._id === updated._id ? updated : product))}/>}
    </section>
  )
}

export default List
