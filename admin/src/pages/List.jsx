import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { backendUrl, currency } from '../utils/config'
import { money } from '../utils/orderPresentation'
import axios from 'axios'
import { toast } from 'react-toastify'
import StockManagementDrawer from '../components/StockManagementDrawer'
import { getTotalStock, getStockLabel } from '../../../shared/inventory'

const pageSize = 9
const controlClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
const iconPaths = {
  search: 'm21 21-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  close: 'm6 6 12 12M6 18 18 6',
  previous: 'm14 6-6 6 6 6',
  next: 'm10 6 6 6-6 6',
  image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01'
}

const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className={className}>
    <path d={iconPaths[name]} />
  </svg>
)

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
  const [stockProductId, setStockProductId] = useState(null)
  const closeStock = useCallback(() => setStockProductId(null), [])
  const stockProduct = list.find(product => product._id === stockProductId)

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await axios.get(backendUrl + '/api/product/list')
      if (!response.data.success) throw new Error(response.data.message || 'Unable to load products.')
      setList(response.data.products)
    } catch (error) {
      setError(error.message)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

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
    fetchList()
  }, [])

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
    <section aria-labelledby='product-list-heading' className='min-w-0 space-y-6 text-slate-600 dark:text-slate-400'>
      <header className='flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center'>
        <div className='min-w-0 border-l-4 border-amber-400 pl-4'>
          <h1 id='product-list-heading' className='text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100'>Product List</h1>
          <p className='mt-1 text-sm leading-6'>Manage, update, and organize all products in the PAMO school merchandise store.</p>
        </div>
        <Link to='/add' className='inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500'>
          <Icon name='plus' /> Add New Item
        </Link>
      </header>

      <div role='search' aria-label='Search and filter products' className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]'>
        <label className='relative min-w-0 sm:col-span-3 xl:col-span-1'>
          <span className='sr-only'>Search products</span>
          <Icon name='search' className='pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500 dark:text-slate-400' />
          <input type='search' value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} placeholder='Search products by name, category, or ID…' className={controlClass + ' w-full pl-10 placeholder:text-slate-500 dark:placeholder:text-slate-400'} />
        </label>
        <select aria-label='Filter by category' value={category} onChange={event => { setCategory(event.target.value); setPage(1) }} className={controlClass + ' min-w-0 w-full'}>
          <option value=''>All Categories</option>
          {categories.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label='Filter by tag' value={tag} onChange={event => { setTag(event.target.value); setPage(1) }} className={controlClass + ' min-w-0 w-full'}>
          <option value=''>All Tags</option>
          <option value='NewArrival'>New Arrival</option>
          <option value='BestSeller'>Best Seller</option>
        </select>
        <button type='button' onClick={resetFilters} className={controlClass + ' inline-flex items-center justify-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800'}>
          <Icon name='reset' className='h-4 w-4' /> Reset
        </button>
      </div>

      <div className='overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40'>
        {loading ? <p role='status' className='px-5 py-12 text-center text-sm'>Loading products…</p>
          : error ? <div role='alert' className='space-y-3 px-5 py-12 text-center text-sm'><p>{error}</p><button type='button' onClick={fetchList} className={controlClass}>Try again</button></div>
          : visibleProducts.length === 0 ? <div className='px-5 py-12 text-center'><h2 className='font-semibold text-slate-950 dark:text-slate-100'>{list.length ? 'No matching products' : 'No products yet'}</h2><p className='mt-2 text-sm'>{list.length ? 'Try another search or reset your filters.' : 'Add your first item to start your product list.'}</p></div>
          : <div className='overflow-x-auto'>
            <table className='block w-full text-left text-sm sm:table'>
              <caption className='sr-only'>PAMO products with categories, prices, merchandising tags, and delete actions</caption>
              <thead className='hidden border-b border-slate-200 bg-slate-50 text-slate-700 sm:table-header-group dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200'>
                <tr><th scope='col' className='px-4 py-3 font-medium'>Product</th><th scope='col' className='px-4 py-3 font-medium'>Category</th><th scope='col' className='px-4 py-3 font-medium'>Price</th><th scope='col' className='px-4 py-3 font-medium'>Stock</th><th scope='col' className='px-4 py-3 font-medium'>Tags</th><th scope='col' className='px-4 py-3 text-right font-medium'>Action</th></tr>
              </thead>
              <tbody className='block sm:table-row-group'>
                {visibleProducts.map(product => (
                  <tr key={product._id} className='grid grid-cols-2 gap-x-3 gap-y-3 border-b border-slate-200 p-4 last:border-b-0 hover:bg-slate-50 sm:table-row sm:p-0 dark:border-slate-800 dark:hover:bg-slate-800/40'>
                    <td className='col-span-2 min-w-0 sm:px-4 sm:py-2'>
                      <div className='flex min-w-0 items-center gap-3'>
                        <div className='flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'>
                          {product.image?.[0] ? <img src={product.image[0]} alt='' loading='lazy' className='h-full w-full object-contain' onError={event => { event.currentTarget.hidden = true }} /> : <Icon name='image' />}
                        </div>
                        <span className='min-w-0 break-words font-medium text-slate-950 dark:text-slate-100'>{product.name}</span>
                      </div>
                    </td>
                    <td className='min-w-0 sm:px-4 sm:py-2'>
                      <span className='mb-1 block text-xs sm:hidden'>Category</span>
                      {product.category ? <span className='inline-block rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'>{product.category}</span> : <span>—</span>}
                      {product.subCategory && <span className='mt-1 block text-xs'>{product.subCategory}</span>}
                    </td>
                    <td className='sm:px-4 sm:py-2'>
                      <span className='mb-1 block text-xs font-normal text-slate-500 sm:hidden dark:text-slate-400'>Price</span>
                      <span className='whitespace-nowrap font-semibold text-slate-950 dark:text-slate-100'>{money(product.price, currency)}</span>
                    </td>
                    <td className='self-center sm:px-4 sm:py-2'>
                      <span className='block font-semibold'>{getTotalStock(product)}</span>
                      <span className={'whitespace-nowrap text-xs ' + (getTotalStock(product) === 0 ? 'text-red-600 dark:text-red-400' : getTotalStock(product) <= 5 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{getStockLabel(getTotalStock(product))}</span>
                    </td>
                    <td className='self-center sm:px-4 sm:py-2'>
                      <div className='flex flex-wrap gap-1.5'>
                        {[[product.NewArrival === true, 'NEW'], [product.BestSeller === true, 'BEST SELLER']].filter(([enabled]) => enabled).map(([, label]) => <span key={label} className='whitespace-nowrap rounded-full border border-amber-500 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:border-amber-400 dark:text-amber-300'>{label}</span>)}
                      </div>
                    </td>
                    <td className='text-right sm:px-4 sm:py-2'>
                      <button type='button' onClick={() => setStockProductId(product._id)} className={controlClass + ' mb-1 mr-2 text-xs'}>Manage Stock</button>
                      <button type='button' aria-label={`Delete ${product.name}`} title='Delete product' disabled={deletingId !== null} onClick={() => setProductToDelete(product)} className='inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-wait disabled:opacity-50 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-400 dark:hover:bg-red-400/20'>
                        <Icon name='trash' className='h-4 w-4' />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        {!loading && !error && <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs dark:border-slate-800'>
          <p role='status'>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} products</p>
          {pageCount > 1 && <nav aria-label='Product list pagination' className='flex items-center gap-2'>
            <button type='button' aria-label='Previous page' disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={controlClass + ' inline-flex w-11 items-center justify-center px-0 disabled:opacity-40'}><Icon name='previous' className='h-4 w-4' /></button>
            <span aria-current='page' className='rounded-lg bg-amber-400 px-3 py-3 font-semibold text-slate-950'>{currentPage} <span className='font-normal'>/ {pageCount}</span></span>
            <button type='button' aria-label='Next page' disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className={controlClass + ' inline-flex w-11 items-center justify-center px-0 disabled:opacity-40'}><Icon name='next' className='h-4 w-4' /></button>
          </nav>}
        </div>}
      </div>
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
      {stockProduct && <StockManagementDrawer product={stockProduct} token={token} onClose={closeStock} onUpdated={updated => setList(previous => previous.map(product => product._id === updated._id ? updated : product))}/>}
    </section>
  )
}

export default List
