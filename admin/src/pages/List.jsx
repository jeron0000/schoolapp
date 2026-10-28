import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { backendUrl, currency } from '../utils/config'
import { money } from '../utils/orderPresentation'
import axios from 'axios'
import { toast } from 'react-toastify'
import CategoryManagementDrawer from '../components/CategoryManagementDrawer'
import ProductManagementDrawer from '../components/ProductManagementDrawer'
import { getTotalStock, getStockLabel } from '../../../shared/inventory'
import { getNewArrivalStatus } from '../../../shared/productLabels.js'
import {
  getAcademicProgramOptions,
  getGenderOptions,
  getMerchandiseCategoryOptions,
  getProductCategoryName,
  getProductGenderName,
  legacyMerchandiseCategories
} from '../../../shared/productTaxonomy.js'
import { ChevronLeft, ChevronRight, Image, Plus, RotateCcw, Search, Tags, Trash2, X } from 'lucide-react'
import './List.css'

const pageSize = 9
const deleteErrorToastId = 'product-delete-error'
const controlClass = 'product-list-control min-h-11 min-w-0 rounded-md border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-3 py-2.5 text-[length:var(--pamo-staff-small)] leading-[var(--pamo-staff-compact-leading)] text-[color:var(--pamo-color-text-primary)] placeholder:text-[color:var(--pamo-color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-[.45]'
const tableHeadingClass = 'bg-[var(--pamo-color-surface-subtle)] px-4 py-[17px] text-[11px] font-semibold uppercase tracking-[.04em] text-[color:var(--pamo-color-text-secondary)] max-xl:px-3'
const tableCellClass = 'border-t border-[color:var(--pamo-color-border-default)] px-4 py-3 align-middle [overflow-wrap:anywhere] max-xl:px-3'
const icons = { search: Search, plus: Plus, reset: RotateCcw, tags: Tags, trash: Trash2, close: X, previous: ChevronLeft, next: ChevronRight, image: Image }

const sortCategories = categories => {
  return [...categories].sort((left, right) => left.name.localeCompare(right.name))
}

const uniqueAssignments = values => {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter(value => typeof value === 'string' && value))]
}

const getAcademicProgramValues = product => {
  if (Array.isArray(product?.academicPrograms)) return uniqueAssignments(product.academicPrograms)
  if (!product?.subCategory || legacyMerchandiseCategories.includes(product.subCategory)) return []
  return [product.subCategory]
}

const getGenderValues = product => {
  if (Array.isArray(product?.genders)) return uniqueAssignments(product.genders)
  return product?.category ? [product.category] : []
}

const getMerchandiseCategoryValues = product => {
  if (Array.isArray(product?.merchandiseCategoryCodes)) {
    return uniqueAssignments(product.merchandiseCategoryCodes)
  }
  if (product?.productCategoryCode) return [product.productCategoryCode]
  if (legacyMerchandiseCategories.includes(product?.subCategory)) return [product.subCategory]
  return []
}

const sameAssignments = (left, right) => {
  if (left.length !== right.length) return false
  const rightValues = new Set(right)
  return left.every(value => rightValues.has(value))
}

const includeAssignedOptions = (options, assignedValues, categoryByCode) => {
  const merged = [...options]
  const knownValues = new Set(options.map(option => option.value))
  for (const value of assignedValues) {
    if (knownValues.has(value)) continue
    const managedCategory = categoryByCode.get(value)
    let label = `${managedCategory?.name || value} · Current assignment`
    if (managedCategory?.active === false) label = `${managedCategory.name} · Inactive`
    merged.push({ value, label, active: false, selectable: false })
    knownValues.add(value)
  }
  return merged
}

const getAcademicProgramLabel = (product, categoryByCode) => {
  const values = getAcademicProgramValues(product)
  if (values.length === 0) {
    if (legacyMerchandiseCategories.includes(product?.subCategory)) {
      return 'Unassigned (legacy merchandise value)'
    }
    return 'Unassigned'
  }
  return values.map(value => {
    const category = categoryByCode.get(value)
    if (category?.active === false) return `${category.name} (Inactive)`
    return category?.name || value
  }).join(', ')
}

const getGenderLabel = (product, managedCategories) => {
  const values = getGenderValues(product)
  if (values.length === 0) return 'Unassigned'
  return values.map(value => {
    const category = managedCategories.find(item => item.code === value && item.scope === 'gender')
    const name = getProductGenderName(managedCategories, value)
    return category?.active === false ? `${name} (Inactive)` : name
  }).join(', ')
}

const getMerchandiseCategoryLabel = (product, managedCategories) => {
  const values = getMerchandiseCategoryValues(product)
  if (values.length === 0) return 'Unassigned'
  return values.map(value => {
    const category = managedCategories.find(item => item.code === value)
    const name = getProductCategoryName(managedCategories, value)
    return category?.active === false ? `${name} (Inactive)` : name
  }).join(', ')
}

const getStockState = total => {
  if (total === 0) {
    return 'empty'
  }
  if (total <= 5) {
    return 'low'
  }
  return 'available'
}

const getStockStateClassName = total => {
  const state = getStockState(total)
  const className = 'product-list-stock ' + tableCellClass
  if (state === 'available') return className + ' [&>span]:text-[color:var(--pamo-color-success-text)]'
  if (state === 'low') return className + ' [&>span]:text-amber-800 dark:[&>span]:text-[color:var(--pamo-color-brand-hover)]'
  return className + ' [&>span]:text-[color:var(--pamo-color-error-text)]'
}

const getProductDeletionError = error => {
  const apiMessage = error.response?.data?.message
  if (apiMessage) return apiMessage
  if (!error.response) return 'Unable to reach the server. Check your connection and try again.'
  if (error.response.status === 401) return 'Your administrator session has expired. Sign in again.'
  if (error.response.status === 403) return 'Administrator access is required to delete products.'
  if (error.response.status === 404) return 'This product no longer exists. Refresh the product list.'
  return 'Unable to remove this product right now. Please try again.'
}

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
  const [deleteError, setDeleteError] = useState('')
  const [managedProductId, setManagedProductId] = useState(null)
  const [selectedPrograms, setSelectedPrograms] = useState([])
  const [selectedGenders, setSelectedGenders] = useState([])
  const [selectedMerchandiseCodes, setSelectedMerchandiseCodes] = useState([])
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [categorySuccess, setCategorySuccess] = useState('')
  const [managedCategories, setManagedCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [categoriesError, setCategoriesError] = useState('')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const deleteDialog = useRef(null)
  const cancelDeleteButton = useRef(null)
  const deletionPending = useRef(false)
  const classificationPending = useRef(false)
  const productRequestId = useRef(0)
  const categoryRequestId = useRef(0)
  const productsActive = useRef(false)
  const managedProduct = list.find(product => product._id === managedProductId)
  const categoryProduct = managedProduct
  const categoryByCode = new Map(managedCategories.map(item => [item.code, item]))
  const currentPrograms = getAcademicProgramValues(categoryProduct)
  const currentGenders = getGenderValues(categoryProduct)
  const currentMerchandiseCodes = getMerchandiseCategoryValues(categoryProduct)
  const programOptions = includeAssignedOptions(
    getAcademicProgramOptions(managedCategories),
    currentPrograms,
    categoryByCode
  )
  const genderOptions = includeAssignedOptions(
    getGenderOptions(managedCategories, { includeNotApplicable: true }),
    currentGenders,
    categoryByCode
  )
  const merchandiseOptions = includeAssignedOptions(
    getMerchandiseCategoryOptions(managedCategories),
    currentMerchandiseCodes,
    categoryByCode
  )
  const classificationChanged = !sameAssignments(selectedPrograms, currentPrograms)
    || !sameAssignments(selectedGenders, currentGenders)
    || !sameAssignments(selectedMerchandiseCodes, currentMerchandiseCodes)

  const fetchList = useCallback(async () => {
    if (!productsActive.current) {
      return
    }
    const requestId = ++productRequestId.current
    setLoading(true)
    setError('')
    try {
      const response = await axios.get(backendUrl + '/api/product/list')
      if (!productsActive.current || requestId !== productRequestId.current) {
        return
      }
      if (!response.data.success) {
        throw new Error(response.data.message || 'Unable to load products.')
      }
      setList(response.data.products)
    } catch (error) {
      if (!productsActive.current || requestId !== productRequestId.current) {
        return
      }
      setError(error.message)
      toast.error(error.message)
    } finally {
      if (productsActive.current && requestId === productRequestId.current) {
        setLoading(false)
      }
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    if (!productsActive.current) return
    const requestId = ++categoryRequestId.current
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const response = await axios.get(
        backendUrl + '/api/category/admin',
        { headers: { token } }
      )
      if (!productsActive.current || requestId !== categoryRequestId.current) return
      if (!response.data.success) {
        throw new Error(response.data.message || 'Unable to load categories.')
      }
      setManagedCategories(sortCategories(response.data.categories))
      setCategoriesLoaded(true)
    } catch (error) {
      if (!productsActive.current || requestId !== categoryRequestId.current) return
      setCategoriesError(error.response?.data?.message || error.message)
    } finally {
      if (productsActive.current && requestId === categoryRequestId.current) {
        setCategoriesLoading(false)
      }
    }
  }, [token])

  const removeProduct = async product => {
    if (!product || deletionPending.current) {
      return
    }
    deletionPending.current = true
    setDeletingId(product._id)
    setDeleteError('')
    try {
      const response = await axios.post(backendUrl + '/api/product/remove', { id: product._id }, { headers: { token } })
      if (!response.data.success) {
        const message = response.data.message || 'Unable to remove this product right now. Please try again.'
        setDeleteError(message)
        toast.error(message, { toastId: deleteErrorToastId })
        return
      }

      toast.dismiss(deleteErrorToastId)
      toast.success(response.data.message)
      setProductToDelete(null)
      await fetchList()
    } catch (error) {
      const message = getProductDeletionError(error)
      setDeleteError(message)
      if (error.response?.status !== 401) {
        toast.error(message, { toastId: deleteErrorToastId })
      }
    } finally {
      deletionPending.current = false
      setDeletingId(null)
    }
  }

  useEffect(() => {
    productsActive.current = true
    setManagedCategories([])
    setCategoriesLoaded(false)
    setCategoriesError('')
    fetchList()
    fetchCategories()
    return () => {
      productsActive.current = false
      productRequestId.current += 1
      categoryRequestId.current += 1
    }
  }, [fetchCategories, fetchList, token])

  useEffect(() => {
    const dialog = deleteDialog.current
    if (productToDelete && !dialog.open) {
      dialog.showModal()
      cancelDeleteButton.current.focus()
    } else if (!productToDelete && dialog.open) {
      dialog.close()
    }
  }, [productToDelete])

  const genders = [...new Set(list.flatMap(getGenderValues))].sort()
  const search = query.trim().toLowerCase()
  const filtered = list.filter(product =>
    (!category || getGenderValues(product).includes(category)) &&
    (!tag || (tag === 'NewArrival' ? getNewArrivalStatus(product).active : product[tag] === true)) &&
    (!search || [
      product.name,
      product._id,
      ...getAcademicProgramValues(product),
      ...getGenderValues(product),
      ...getMerchandiseCategoryValues(product)
    ].some(value => String(value || '').toLowerCase().includes(search)))
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const visibleProducts = filtered.slice(start, start + pageSize)
  const showEmptyState = !loading && !error && visibleProducts.length === 0
  const showTable = !loading && !error && visibleProducts.length > 0
  const emptyHeading = list.length ? 'No matching products' : 'No products yet'
  const emptyMessage = list.length
    ? 'Try another search or reset your filters.'
    : 'Add your first item to start your product list.'

  const resetFilters = () => {
    setQuery('')
    setCategory('')
    setTag('')
    setPage(1)
  }
  const changeQuery = event => {
    setQuery(event.target.value)
    setPage(1)
  }
  const changeCategory = event => {
    setCategory(event.target.value)
    setPage(1)
  }
  const changeTag = event => {
    setTag(event.target.value)
    setPage(1)
  }
  const cancelDeletion = event => {
    event.preventDefault()
    if (!deletionPending.current) {
      setProductToDelete(null)
      setDeleteError('')
    }
  }
  const openDeleteConfirmation = product => {
    setDeleteError('')
    setProductToDelete(product)
  }
  const closeDeleteConfirmation = () => {
    if (deletionPending.current) return
    setProductToDelete(null)
    setDeleteError('')
  }
  const updateProductLabels = updated => {
    setList(previous => previous.map(product => {
      if (product._id !== updated._id) return product
      return { ...product, BestSeller: updated.BestSeller, NewArrival: updated.NewArrival, newArrivalMarkedAt: updated.newArrivalMarkedAt }
    }))
  }
  const updateProduct = updated => {
    setList(previous => previous.map(product => {
      if (product._id === updated._id) {
        return updated
      }
      return product
    }))
  }
  const updateProductPrice = (productId, currentPrice) => {
    setList(previous => previous.map(product => {
      if (product._id === productId) {
        return { ...product, price: currentPrice }
      }
      return product
    }))
  }
  const openProductManager = product => {
    setManagedProductId(product._id)
    setSelectedPrograms(getAcademicProgramValues(product))
    setSelectedGenders(getGenderValues(product))
    setSelectedMerchandiseCodes(getMerchandiseCategoryValues(product))
    setCategoryError('')
    setCategorySuccess('')
    if (!categoriesLoaded) fetchCategories()
  }
  const openCategoryManager = () => {
    setCategoryManagerOpen(true)
    if (!categoriesLoaded) fetchCategories()
  }
  const addManagedCategory = created => {
    setManagedCategories(previous => sortCategories([...previous, created]))
    setCategoriesLoaded(true)
  }
  const updateManagedCategory = updated => {
    setManagedCategories(previous => {
      const exists = previous.some(item => item._id === updated._id)
      if (!exists) return sortCategories([...previous, updated])
      return sortCategories(previous.map(item => {
        if (item._id === updated._id) return updated
        return item
      }))
    })
  }
  const removeManagedCategory = categoryId => {
    setManagedCategories(previous => previous.filter(item => item._id !== categoryId))
  }
  const closeProductManager = () => {
    if (categorySaving) return
    setManagedProductId(null)
    setCategoryError('')
    setCategorySuccess('')
  }
  const saveCategory = async event => {
    event.preventDefault()
    if (!categoryProduct || classificationPending.current || !classificationChanged) return

    classificationPending.current = true
    setCategorySaving(true)
    setCategoryError('')
    setCategorySuccess('')
    try {
      const updates = {}
      if (!sameAssignments(selectedPrograms, currentPrograms)) {
        updates.academicPrograms = selectedPrograms
      }
      if (!sameAssignments(selectedGenders, currentGenders)) {
        updates.genders = selectedGenders
      }
      if (!sameAssignments(selectedMerchandiseCodes, currentMerchandiseCodes)) {
        updates.merchandiseCategoryCodes = selectedMerchandiseCodes
      }

      const response = await axios.patch(
        backendUrl + '/api/product/category/' + categoryProduct._id,
        updates,
        { headers: { token } }
      )
      if (!response.data.success) {
        throw new Error(response.data.message || 'Unable to update the product category.')
      }
      if (!productsActive.current) return
      updateProduct(response.data.product)
      toast.success(response.data.message)
      setCategorySuccess(response.data.message)
    } catch (error) {
      if (!productsActive.current) return
      const message = error.response?.data?.message || error.message
      setCategoryError(message)
      toast.error(message)
    } finally {
      classificationPending.current = false
      if (productsActive.current) setCategorySaving(false)
    }
  }

  return (
    <section aria-labelledby='product-list-heading' className='pamo-product-list mx-auto grid min-w-0 max-w-[2160px] gap-6 text-[length:var(--dashboard-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)] max-sm:gap-5'>
      <nav aria-label='Breadcrumb' className='flex min-w-0 flex-wrap items-center gap-2.5 text-[length:var(--pamo-staff-small)] font-semibold uppercase tracking-[.09em] text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_[aria-current]]:text-[color:var(--pamo-color-accent-text)]'>
        <Link to='/dashboard'>Admin</Link><span aria-hidden='true'>/</span><span>Products</span><span aria-hidden='true'>/</span><span aria-current='page'>All Items</span>
      </nav>
      <header className='flex items-center justify-between gap-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-5'>
        <div className='min-w-0 border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4'>
          <h1 className='text-[length:var(--pamo-staff-heading)] font-bold leading-[var(--pamo-staff-heading-leading)] tracking-[-.025em]' id='product-list-heading'>Product List</h1>
          <p className='mt-2 text-[color:var(--pamo-color-text-secondary)]'>Manage and organize merchandise, pricing and available stock.</p>
        </div>
        <div className='flex shrink-0 flex-wrap gap-3 max-sm:w-full max-sm:flex-col'>
          <button type='button' onClick={openCategoryManager} className={controlClass + ' inline-flex min-h-[52px] items-center justify-center gap-2.5 bg-[var(--pamo-color-surface-default)] px-5 font-semibold'}><Icon name='tags' />Manage Classifications</button>
          <Link to='/add' className='inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2.5 rounded-lg bg-[var(--pamo-color-brand-yellow)] px-6 py-3 font-semibold text-slate-900 hover:bg-[var(--pamo-color-brand-hover)]'><Icon name='plus' /> Add New Item</Link>
        </div>
      </header>

      <div role='search' aria-label='Search and filter products' className='grid grid-cols-[minmax(0,1fr)_minmax(0,180px)_minmax(0,150px)_auto] gap-3 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-6 max-[1279px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-sm:grid-cols-2 max-sm:gap-2.5 max-sm:p-3.5'>
        <label className='relative min-w-0 max-xl:col-span-full'>
          <span className='sr-only'>Search products</span>
          <Icon name='search' className='pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]' />
          <input type='search' value={query} onChange={changeQuery} placeholder='Search products by name, category, or ID…' className={controlClass + ' h-full w-full pl-11 max-md:!text-base'} />
        </label>
        <select aria-label='Filter by gender' value={category} onChange={changeCategory} className={controlClass}>
          <option value=''>All Genders</option>
          {genders.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label='Filter by tag' value={tag} onChange={changeTag} className={controlClass}>
          <option value=''>All Tags</option>
          <option value='NewArrival'>New Arrival</option>
          <option value='BestSeller'>Featured</option>
        </select>
        <button type='button' onClick={resetFilters} className={controlClass + ' flex items-center justify-center gap-2 max-sm:col-span-full max-sm:justify-self-center max-sm:border-transparent max-sm:bg-transparent max-sm:text-[color:var(--pamo-color-accent-text)]'}>
          <Icon name='reset' className='h-4 w-4' /> Reset
        </button>
      </div>

      {!loading && !error && <div className='-mb-3 flex flex-wrap justify-between gap-3 text-xs text-[color:var(--pamo-color-text-secondary)] [&>span]:text-[10px] [&>span]:font-semibold [&>span]:uppercase [&>span]:tracking-[.1em] [&>span]:text-[color:var(--pamo-color-accent-text)] max-sm:[&>span]:hidden'>
        <p>{visibleProducts.length} products on this page · {filtered.length} total</p>
        <span>Inventory overview</span>
      </div>}
      <div className='min-w-0 overflow-hidden rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent' aria-busy={loading}>
        {loading && <p role='status' className='px-5 py-12 text-center'>Loading products…</p>}
        {!loading && error && (
          <div role='alert' className='px-5 py-12 text-center'>
            <p className='my-2.5'>{error}</p>
            <button type='button' onClick={fetchList} className={controlClass + ' mt-3'}>Try again</button>
          </div>
        )}
        {showEmptyState && (
          <div className='px-5 py-12 text-center'>
            <h2 className='font-semibold'>{emptyHeading}</h2>
            <p className='my-2.5'>{emptyMessage}</p>
            {list.length > 0 && <button type='button' onClick={resetFilters} className={controlClass + ' mt-3'}>Clear filters</button>}
          </div>
        )}
        {showTable && (
          <table className='product-list-table w-full table-fixed border-collapse text-left text-sm'>
            <caption className='sr-only'>PAMO products with classifications, prices, stock, merchandising tags, and actions</caption>
            <thead>
              <tr>
                <th scope='col' className={tableHeadingClass}>Product</th>
                <th scope='col' className={tableHeadingClass + ' product-list-category max-xl:hidden'}>Classifications</th>
                <th scope='col' className={tableHeadingClass}>Price</th>
                <th scope='col' className={tableHeadingClass}>Stock</th>
                <th scope='col' className={tableHeadingClass + ' product-list-tags max-xl:hidden'}>Tags</th>
                <th scope='col' className={tableHeadingClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map(product => {
                const total = getTotalStock(product)
                const programLabel = getAcademicProgramLabel(product, categoryByCode)
                const genderLabel = getGenderLabel(product, managedCategories)
                const productCategoryLabel = getMerchandiseCategoryLabel(product, managedCategories)
                const tags = [[getNewArrivalStatus(product).active, 'NEW'], [product.BestSeller === true, 'FEATURED']]
                  .filter(([enabled]) => enabled)
                return (
                  <tr key={product._id} className='hover:bg-[var(--pamo-color-surface-subtle)]'>
                    <td className={tableCellClass + ' product-list-product'}>
                      <div className='product-list-identity flex min-w-0 items-center gap-3 max-sm:items-start'>
                        <div className='flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] text-[color:var(--pamo-color-text-secondary)] max-sm:h-11 max-sm:w-11'>
                          {product.image?.[0] ? <img src={product.image[0]} alt='' loading='lazy' onError={event => { event.currentTarget.hidden = true }} className='h-full w-full object-contain' /> : <Icon name='image' />}
                        </div>
                        <div className='min-w-0 font-semibold'>
                          <span>{product.name}</span>
                          <span className='mt-1 hidden text-[11px] font-normal text-[color:var(--pamo-color-text-secondary)] max-xl:block'>Programs: {programLabel} · Genders: {genderLabel} · Merchandise: {productCategoryLabel}</span>
                          <div className='mt-1 hidden flex-wrap gap-1 max-xl:flex'>
                            {tags.map(([, label]) => <span key={label} className='inline-block rounded border border-[color:var(--pamo-color-accent-text)] px-1.5 py-[3px] text-[9px] font-semibold tracking-[.04em] text-[color:var(--pamo-color-accent-text)]'>{label}</span>)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={tableCellClass + ' product-list-category max-xl:hidden'}>
                      <span className='block text-[11px] text-[color:var(--pamo-color-text-secondary)]'><strong className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Programs:</strong> {programLabel}</span>
                      <span className='mt-1 block text-[11px] text-[color:var(--pamo-color-text-secondary)]'><strong className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Genders:</strong> {genderLabel}</span>
                      <span className='mt-1 block text-[11px] text-[color:var(--pamo-color-text-secondary)]'><strong className='font-semibold text-[color:var(--pamo-color-text-primary)]'>Merchandise:</strong> {productCategoryLabel}</span>
                    </td>
                    <td className={tableCellClass + ' product-list-price font-semibold tabular-nums [overflow-wrap:anywhere]'}><span className='hidden font-normal text-[color:var(--pamo-color-text-secondary)] max-sm:inline'>Price: </span>{money(product.price, currency)}</td>
                    <td className={getStockStateClassName(total)}>
                      <strong className='block font-semibold tabular-nums max-sm:mr-2 max-sm:inline'>{total}</strong><span className='text-[11px]'>{getStockLabel(total)}</span>
                    </td>
                    <td className={tableCellClass + ' product-list-tags max-xl:hidden'}>
                      <div className='flex flex-wrap gap-1'>{tags.map(([, label]) => <span key={label} className='inline-block rounded border border-[color:var(--pamo-color-accent-text)] px-1.5 py-[3px] text-[9px] font-semibold tracking-[.04em] text-[color:var(--pamo-color-accent-text)]'>{label}</span>)}</div>
                    </td>
                    <td className={tableCellClass + ' product-list-actions'}>
                      <div className='flex flex-wrap items-center gap-2'>
                        <button type='button' aria-label={`Manage ${product.name}`} onClick={() => openProductManager(product)} className={controlClass + ' min-w-[88px] flex-1 px-3 text-[11px] font-semibold'}>Manage</button>
                        <button type='button' aria-label={`Delete ${product.name}`} title='Delete product' disabled={deletingId !== null} onClick={() => openDeleteConfirmation(product)} className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-current text-[color:var(--pamo-color-error-text)] hover:bg-[var(--pamo-color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-[.45]'>
                          <Icon name='trash' className='h-4 w-4' />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!loading && !error && <div className='flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--pamo-color-border-default)] p-4 text-xs text-[color:var(--pamo-color-text-secondary)] max-sm:justify-center max-sm:rounded-lg max-sm:border max-sm:bg-[var(--pamo-color-surface-default)] max-sm:px-2.5'>
          <p role='status'>Showing {filtered.length ? start + 1 : 0} to {Math.min(start + pageSize, filtered.length)} of {filtered.length} products</p>
          <nav aria-label='Product list pagination' className='flex items-center gap-2'>
            <span className='mr-3 max-xl:hidden'>9 per page</span>
            <button type='button' aria-label='Previous page' disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={controlClass + ' inline-flex w-11 items-center justify-center p-0'}><Icon name='previous' className='h-4 w-4' /></button>
            <span aria-current='page' className='rounded-md bg-[var(--pamo-color-brand-yellow)] p-3 font-semibold text-slate-900'>{currentPage} <span className='font-normal'>/ {pageCount}</span></span>
            <button type='button' aria-label='Next page' disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className={controlClass + ' inline-flex w-11 items-center justify-center p-0'}><Icon name='next' className='h-4 w-4' /></button>
          </nav>
        </div>}
      </div>
      <p className='text-xs text-[color:var(--pamo-color-text-secondary)]'>Use Manage to update pricing, stock, and product classifications.</p>
      <dialog ref={deleteDialog} aria-labelledby='delete-item-heading' aria-describedby='delete-item-description delete-item-warning' aria-busy={deletingId !== null} onCancel={cancelDeletion} className='!m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-lg backdrop:bg-slate-950/50 sm:p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
        <div className='flex items-center justify-between gap-3'>
          <h2 id='delete-item-heading' className='text-lg font-semibold'>Delete Item</h2>
          <button type='button' aria-label='Close delete confirmation' disabled={deletingId !== null} onClick={closeDeleteConfirmation} className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800'><Icon name='close' className='h-5 w-5' /></button>
        </div>
        <p id='delete-item-description' className='mt-3 break-words text-sm leading-6 text-slate-600 dark:text-slate-300'>Are you sure you want to delete <span className='font-medium text-slate-900 dark:text-slate-100'>"{productToDelete?.name}"</span>?</p>
        <p id='delete-item-warning' className='mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400'>This action cannot be undone.</p>
        {deleteError && <p role='alert' className='mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm leading-5 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300'>{deleteError}</p>}
        <div className='mt-6 flex flex-col gap-3 min-[375px]:flex-row'>
          <button ref={cancelDeleteButton} type='button' disabled={deletingId !== null} onClick={closeDeleteConfirmation} className='min-h-11 flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800'>Cancel</button>
          <button type='button' disabled={deletingId !== null} onClick={() => removeProduct(productToDelete)} className='min-h-11 flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-wait disabled:opacity-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/10'>{deletingId !== null ? 'Deleting...' : 'Delete Item'}</button>
        </div>
      </dialog>
      {categoryManagerOpen && <CategoryManagementDrawer categories={managedCategories} loading={categoriesLoading} loadError={categoriesError} token={token} onClose={() => setCategoryManagerOpen(false)} onRefresh={fetchCategories} onCreated={addManagedCategory} onUpdated={updateManagedCategory} onDeleted={removeManagedCategory} />}
      {managedProduct && (
        <ProductManagementDrawer
          key={managedProduct._id}
          product={managedProduct}
          products={list}
          token={token}
          refreshing={loading}
          onClose={closeProductManager}
          onRefresh={fetchList}
          onProductUpdated={updateProduct}
          onLabelsUpdated={updateProductLabels}
          onPriceUpdated={updateProductPrice}
          classification={{
            programOptions,
            genderOptions,
            merchandiseOptions,
            selectedPrograms,
            selectedGenders,
            selectedMerchandise: selectedMerchandiseCodes,
            currentLabels: {
              programs: getAcademicProgramLabel(managedProduct, categoryByCode),
              genders: getGenderLabel(managedProduct, managedCategories),
              merchandise: getMerchandiseCategoryLabel(managedProduct, managedCategories)
            },
            onProgramsChange: setSelectedPrograms,
            onGendersChange: setSelectedGenders,
            onMerchandiseChange: setSelectedMerchandiseCodes,
            onSave: saveCategory,
            onRefresh: fetchCategories,
            changed: classificationChanged,
            saving: categorySaving,
            loading: categoriesLoading,
            loadError: categoriesError,
            error: categoryError,
            success: categorySuccess
          }}
        />
      )}
    </section>
  )
}

export default List
