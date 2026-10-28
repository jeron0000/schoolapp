import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { toast } from 'react-toastify'
import {
  builtInMerchandiseCategoryCodes,
  getAcademicProgramOptions,
  getGenderOptions,
  getMerchandiseCategoryOptions,
  PRODUCT_GENDER_NOT_APPLICABLE,
  productGenders
} from '../../../shared/productTaxonomy'
import { sizeOptions, sortSizes } from '../../../shared/inventory'
import { ArrowLeft, ArrowRight, Check, Info, Plus, Upload, X } from '../components/DashboardIcons'
import ClassificationMultiSelect from '../components/ClassificationMultiSelect'
import CustomSizeInput from '../components/CustomSizeInput'
import SizeMeasurementsEditor from '../components/SizeMeasurementsEditor'
import { MAX_LISTING_ITEMS, normalizeOptionLabel, optionKey } from '../../../shared/productVariants.js'
import './Add.css'
import { phpMinorUnits } from '../../../shared/money.js'
import {
  editableSizeGuide,
  hasSizeGuideContent,
  normalizeSizeGuide,
  restrictSizeGuideToSizes
} from '../../../shared/productMeasurements.js'

const stockId = size => 'product-stock-' + size.replaceAll(' ', '-')
const fieldClass = 'min-w-0 [&>label]:mb-2 [&>label]:block [&>label]:font-semibold [&>label>span]:text-[color:var(--pamo-color-accent-text)]'
const helpClass = 'text-[length:var(--pamo-staff-small)] leading-[1.7] text-[color:var(--pamo-color-text-secondary)] [overflow-wrap:anywhere]'
const fieldErrorClass = 'mt-2 text-[length:var(--pamo-staff-small)] text-[color:var(--pamo-color-error-text)] [overflow-wrap:anywhere]'
const buttonClass = 'inline-flex min-h-[52px] max-w-full items-center justify-center gap-2 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-6 py-3 text-center text-[length:var(--pamo-staff-body)] font-semibold text-[color:var(--pamo-color-text-primary)] hover:border-[color:var(--pamo-color-accent-text)] disabled:cursor-wait disabled:opacity-60 [&[aria-disabled=true]]:cursor-wait [&[aria-disabled=true]]:opacity-60 [&_svg]:shrink-0'
const brandButtonClass = buttonClass + ' border-transparent bg-[var(--pamo-color-brand-yellow)] text-slate-950 hover:border-transparent hover:bg-[var(--pamo-color-brand-hover)]'
const storefrontLabelClass = 'flex min-h-[76px] cursor-pointer items-start gap-3 rounded-[7px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-subtle)] p-[18px] data-[selected=true]:border-[color:var(--pamo-color-brand-yellow)] data-[selected=true]:shadow-[inset_0_0_0_1px_var(--pamo-color-brand-yellow)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--pamo-color-focus)]'
const stockError = (size, value) => {
  if (value === undefined || String(value).trim() === '') {
    return `Enter an initial quantity for ${size}.`
  }
  return Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? '' : 'Use a non-negative whole number.'
}

const getStockFieldPresentation = (value, validationMessage, fieldError) => {
  if (fieldError) {
    return { className: fieldErrorClass, message: fieldError }
  }
  if (validationMessage) {
    return { className: helpClass, message: 'Enter a starting quantity.' }
  }
  if (Number(value) === 0) {
    return { className: 'text-[length:var(--pamo-staff-small)] text-[color:var(--pamo-color-error-text)]', message: '0 units · intentionally unavailable' }
  }
  return { className: 'text-[length:var(--pamo-staff-small)] text-[color:var(--pamo-color-success-text)]', message: `${value} units configured` }
}

const SectionHeading = ({ id, title, description }) => (
  <header className='border-b border-[color:var(--pamo-color-border-default)] pb-[18px] [&_h2]:border-l-[3px] [&_h2]:border-[color:var(--pamo-color-brand-yellow)] [&_h2]:pl-3.5 [&_h2]:text-[length:var(--pamo-staff-section)] [&_h2]:font-semibold [&_h2]:leading-[var(--pamo-staff-section-leading)] [&_p]:border-l-[3px] [&_p]:border-[color:var(--pamo-color-brand-yellow)] [&_p]:pl-3.5 [&_p]:pt-2 [&_p]:text-[length:var(--pamo-staff-small)] [&_p]:text-[color:var(--pamo-color-text-secondary)]'>
    <h2 id={id}>{title}</h2>
    <p>{description}</p>
  </header>
)

const ImageUpload = ({ id, file, onChange, main = false, cover = false }) => {
  const preview = useRef(null)
  const input = useRef(null)
  const label = main ? 'main image' : `image ${id.slice(-1)}`
  useEffect(() => {
    if (!file) {
      input.current.value = ''
      return
    }
    const url = URL.createObjectURL(file)
    preview.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  const removeImage = () => {
    onChange(false)
    input.current.value = ''
    input.current.focus()
  }
  const selectImage = event => {
    const selected = event.target.files[0]
    if (selected) {
      onChange(selected)
    }
  }
  const chooserClass = 'relative flex min-h-[136px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] px-2 py-4 text-center text-[color:var(--pamo-color-text-secondary)] hover:border-[color:var(--pamo-color-accent-text)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--pamo-color-accent-text)]' + (main ? ' min-h-[clamp(220px,19vw,300px)]' : '')
  const inputAction = file ? 'Replace' : 'Upload'
  const emptyIcon = main
    ? <Upload size={36} aria-hidden='true' />
    : <Plus size={24} aria-hidden='true' />
  const imageTitle = main ? 'Main image' : `Image ${id.slice(-1)}`

  return (
    <div className='min-w-0'>
      <label htmlFor={id} className={chooserClass} data-image-chooser>
        <input ref={input} id={id} aria-label={`${inputAction} ${label}`} aria-describedby='product-images-help' onChange={selectImage} type='file' className='sr-only' />
        {file && (
          <>
            <img ref={preview} alt={`Selected ${label} preview`} className='absolute inset-0 h-full w-full object-contain p-2.5' />
            {cover && <span className='absolute inset-x-2 bottom-2 rounded bg-[var(--pamo-color-surface-default)] px-2 py-[3px] text-[length:var(--pamo-staff-small)] font-semibold text-[color:var(--pamo-color-text-primary)]'>Cover image</span>}
          </>
        )}
        {!file && (
          <>
            {emptyIcon}
            <span className={'font-semibold text-[color:var(--pamo-color-text-primary)]' + (main ? '' : ' text-[length:var(--pamo-staff-small)]')}>{imageTitle}</span>
            {main && (
              <>
                <span className='text-[length:var(--pamo-staff-small)]'>Used as the cover in the collection</span>
                <span className={brandButtonClass + ' mt-2.5'}>Choose main image</span>
              </>
            )}
            {!main && <span className='text-[length:var(--pamo-staff-small)]'>Add photo</span>}
          </>
        )}
      </label>
      {file && (
        <div className='pt-2 text-[length:var(--pamo-staff-small)]'>
          <p className='text-[color:var(--pamo-color-text-secondary)] [overflow-wrap:anywhere]'>{file.name}{cover && <span> · Cover</span>}</p>
          <div className='flex flex-wrap gap-x-2.5 gap-y-1'>
            <button type='button' onClick={() => input.current.click()} aria-label={`Replace ${label}`} className='inline-flex min-h-11 items-center justify-center gap-1 px-0.5 py-2 font-semibold hover:text-[color:var(--pamo-color-accent-text)]'>Replace</button>
            <button type='button' onClick={removeImage} aria-label={`Remove ${label}`} className='inline-flex min-h-11 items-center justify-center gap-1 px-0.5 py-2 font-semibold hover:text-[color:var(--pamo-color-accent-text)]'>
              <X size={16} aria-hidden='true' />Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const Add = ({ token }) => {
  const [image1, setImage1] = useState(false)
  const [image2, setImage2] = useState(false)
  const [image3, setImage3] = useState(false)
  const [image4, setImage4] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [genders, setGenders] = useState([productGenders[0]])
  const [academicPrograms, setAcademicPrograms] = useState([])
  const [merchandiseCategoryCodes, setMerchandiseCategoryCodes] = useState([builtInMerchandiseCategoryCodes[0]])
  const [managedCategories, setManagedCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesError, setCategoriesError] = useState('')
  const [BestSeller, setBestSeller] = useState(false)
  const [NewArrival, setNewArrival] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submissionPending = useRef(false)
  const [sizes, setSizes] = useState([])
  const [inventory, setInventory] = useState({})
  const [sizeGuide, setSizeGuide] = useState(() => editableSizeGuide())
  const [variantGroupId, setVariantGroupId] = useState('')
  const [optionLabel, setOptionLabel] = useState('')
  const [listingItems, setListingItems] = useState([])
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [listingTitle, setListingTitle] = useState('')
  const [variantGroups, setVariantGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState('')
  const groupRequestId = useRef(0)
  const [fieldErrors, setFieldErrors] = useState({})
  const [feedback, setFeedback] = useState(null)
  const discardDialog = useRef(null)
  const keepEditing = useRef(null)
  const cancelButton = useRef(null)
  const categoriesActive = useRef(false)
  const categoryRequestId = useRef(0)

  const fetchCategories = useCallback(async () => {
    if (!categoriesActive.current) return

    const requestId = ++categoryRequestId.current
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const { data } = await axios.get(
        backendUrl + '/api/category/admin',
        { headers: { token } }
      )
      if (!categoriesActive.current || requestId !== categoryRequestId.current) return
      if (!data.success) {
        throw new Error(data.message || 'Unable to load classifications.')
      }
      setManagedCategories(data.categories)
    } catch (error) {
      if (!categoriesActive.current || requestId !== categoryRequestId.current) return
      setCategoriesError(error.response?.data?.message || error.message)
    } finally {
      if (categoriesActive.current && requestId === categoryRequestId.current) {
        setCategoriesLoading(false)
      }
    }
  }, [token])

  useEffect(() => {
    categoriesActive.current = true
    fetchCategories()
    return () => {
      categoriesActive.current = false
      categoryRequestId.current += 1
      groupRequestId.current += 1
    }
  }, [fetchCategories])

  const loadVariantGroups = async () => {
    const request = ++groupRequestId.current
    setGroupsLoading(true)
    setGroupsError('')
    try {
      const { data } = await axios.get(backendUrl + '/api/product/list')
      if (!categoriesActive.current || request !== groupRequestId.current) return
      if (!data.success || !Array.isArray(data.products)) throw new Error('Unable to load product listings.')
      setVariantGroups(data.products.filter(item => item.variantGroupId === item._id))
    } catch (error) {
      if (categoriesActive.current && request === groupRequestId.current) setGroupsError(error.response?.data?.message || error.message)
    } finally {
      if (categoriesActive.current && request === groupRequestId.current) setGroupsLoading(false)
    }
  }

  const clearError = id => {
    setFieldErrors(previous => {
      if (!previous[id]) {
        return previous
      }
      return { ...previous, [id]: '' }
    })
  }
  const multipleItems = listingItems.length > 0
  const currentDraft = () => ({
    name, description, price, genders, academicPrograms, merchandiseCategoryCodes,
    BestSeller, NewArrival, sizes, inventory, sizeGuide, optionLabel,
    images: [image1, image2, image3, image4]
  })
  const loadDraft = draft => {
    setName(draft.name)
    setDescription(draft.description)
    setPrice(draft.price)
    setGenders(draft.genders)
    setAcademicPrograms(draft.academicPrograms)
    setMerchandiseCategoryCodes(draft.merchandiseCategoryCodes)
    setBestSeller(draft.BestSeller)
    setNewArrival(draft.NewArrival)
    setSizes(draft.sizes)
    setInventory(draft.inventory)
    setSizeGuide(draft.sizeGuide)
    setOptionLabel(draft.optionLabel)
    setImage1(draft.images[0])
    setImage2(draft.images[1])
    setImage3(draft.images[2])
    setImage4(draft.images[3])
    setFieldErrors({})
  }
  const switchItem = index => {
    if (index === activeItemIndex) return
    const drafts = listingItems.map((draft, position) => position === activeItemIndex ? currentDraft() : draft)
    setListingItems(drafts)
    setActiveItemIndex(index)
    loadDraft(drafts[index])
  }
  const addListingItem = () => {
    if (listingItems.length >= MAX_LISTING_ITEMS) return
    const draft = {
      name: '', description: '', price: '', genders: [productGenders[0]],
      academicPrograms: [], merchandiseCategoryCodes: [builtInMerchandiseCategoryCodes[0]],
      BestSeller: false, NewArrival: false, sizes: [], inventory: {},
      sizeGuide: editableSizeGuide(), optionLabel: '', images: [false, false, false, false]
    }
    setListingItems([...listingItems.map((item, index) => index === activeItemIndex ? currentDraft() : item), draft])
    setActiveItemIndex(listingItems.length)
    loadDraft(draft)
  }
  const removeListingItem = () => {
    if (listingItems.length < 2) return
    const remaining = listingItems.filter((_, index) => index !== activeItemIndex)
    setListingItems(remaining)
    setActiveItemIndex(0)
    loadDraft(remaining[0])
  }
  const toggleSize = size => {
    setSizes(previous => {
      if (previous.includes(size)) {
        return previous.filter(item => item !== size)
      }
      return sortSizes([...previous, size])
    })
    clearError('sizes')
  }
  const addCustomSize = size => {
    setSizes(previous => sortSizes([...previous, size]))
    clearError('sizes')
  }
  const recordInvalid = event => {
    setFieldErrors(previous => ({
      ...previous,
      [event.target.id]: event.target.validationMessage,
    }))
  }
  const classificationChanged = genders.length !== 1
    || genders[0] !== productGenders[0]
    || academicPrograms.length > 0
    || merchandiseCategoryCodes.length !== 1
    || merchandiseCategoryCodes[0] !== builtInMerchandiseCategoryCodes[0]
  const dirty = Boolean(name || description || price || image1 || image2 || image3 || image4 || sizes.length || BestSeller || NewArrival || classificationChanged || hasSizeGuideContent(sizeGuide) || variantGroupId || optionLabel || multipleItems)
  const cancel = event => {
    if (submissionPending.current) {
      event.preventDefault()
      return
    }
    if (!dirty) {
      return
    }
    event.preventDefault()
    discardDialog.current.showModal()
    keepEditing.current.focus()
  }

  const onSubmitHandler = async event => {
    event.preventDefault()
    if (submissionPending.current) {
      return
    }
    const errors = {}
    try {
      phpMinorUnits(price)
    } catch {
      errors['product-price'] = 'Enter a non-negative PHP price with at most two decimal places.'
    }
    if (!sizes.length) {
      errors.sizes = 'Select at least one size.'
    }
    sizes.forEach(size => {
      const message = stockError(size, inventory[size])
      if (message) {
        errors[stockId(size)] = message
      }
    })
    let normalizedSizeGuide
    try {
      normalizedSizeGuide = normalizeSizeGuide(
        restrictSizeGuideToSizes(sizeGuide, sizes),
        sizes
      )
    } catch (error) {
      errors.measurements = error.message
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      const firstError = Object.keys(errors)[0]
      let focusTarget = firstError
      if (firstError === 'sizes') focusTarget = 'product-size-S'
      if (firstError === 'measurements') focusTarget = 'product-measurements-heading'
      document.getElementById(focusTarget)?.focus()
      return
    }
    submissionPending.current = true
    setSubmitting(true)
    setFieldErrors({})
    setFeedback(null)
    try {
      if (variantGroupId && !normalizeOptionLabel(optionLabel || name)) throw new Error('Enter a valid item option label up to 80 characters.')
      const formData = new FormData()
      formData.append('name', name)
      formData.append('description', description)
      formData.append('price', price)
      if (variantGroupId) {
        formData.append('variantGroupId', variantGroupId)
        formData.append('optionLabel', normalizeOptionLabel(optionLabel || name))
      }
      formData.append('academicPrograms', JSON.stringify(academicPrograms))
      formData.append('genders', JSON.stringify(genders))
      formData.append('merchandiseCategoryCodes', JSON.stringify(merchandiseCategoryCodes))
      formData.append('BestSeller', BestSeller)
      formData.append('NewArrival', NewArrival)
      formData.append('sizes', JSON.stringify(sizes))
      const initialStock = Object.fromEntries(sizes.map(size => [size, Number(inventory[size])]))
      formData.append('inventory', JSON.stringify(initialStock))
      if (hasSizeGuideContent(normalizedSizeGuide)) {
        formData.append('sizeGuide', JSON.stringify(normalizedSizeGuide))
      }
      if (image1) {
        formData.append('image1', image1)
      }
      if (image2) {
        formData.append('image2', image2)
      }
      if (image3) {
        formData.append('image3', image3)
      }
      if (image4) {
        formData.append('image4', image4)
      }
      let requestBody = formData
      let endpoint = '/api/product/add'
      if (multipleItems) {
        if (listingItems.length < 2) throw new Error('Add at least two items, or switch to single-item creation.')
        if (!listingTitle.trim()) throw new Error('Enter a common listing title.')
        const drafts = listingItems.map((draft, index) => index === activeItemIndex ? currentDraft() : draft)
        const labels = drafts.map(draft => normalizeOptionLabel(draft.optionLabel || draft.name))
        if (labels.some(label => !label)) throw new Error('Every item needs a valid name or option label up to 80 characters.')
        if (new Set(labels.map(optionKey)).size !== labels.length) throw new Error('Each item option label must be unique.')
        requestBody = new FormData()
        const items = drafts.map((draft, index) => {
          try {
            if (!draft.name.trim() || !draft.description.trim()) throw new Error('Enter the name and description.')
            phpMinorUnits(draft.price)
            if (!draft.sizes.length) throw new Error('Select at least one size.')
            for (const size of draft.sizes) {
              const message = stockError(size, draft.inventory[size])
              if (message) throw new Error(message)
            }
            const measurements = normalizeSizeGuide(restrictSizeGuideToSizes(draft.sizeGuide, draft.sizes), draft.sizes)
            draft.images.forEach((file, imageIndex) => {
              if (file) requestBody.append(`item${index}image${imageIndex + 1}`, file)
            })
            return {
              name: draft.name, description: draft.description, price: draft.price,
              optionLabel: labels[index], genders: draft.genders, academicPrograms: draft.academicPrograms,
              merchandiseCategoryCodes: draft.merchandiseCategoryCodes,
              BestSeller: draft.BestSeller, NewArrival: draft.NewArrival,
              sizes: JSON.stringify(draft.sizes),
              inventory: JSON.stringify(Object.fromEntries(draft.sizes.map(size => [size, Number(draft.inventory[size])]))),
              ...(hasSizeGuideContent(measurements) ? { sizeGuide: JSON.stringify(measurements) } : {})
            }
          } catch (error) {
            setListingItems(drafts)
            setActiveItemIndex(index)
            loadDraft(draft)
            throw new Error(`Item ${index + 1}: ${error.message}`)
          }
        })
        requestBody.append('items', JSON.stringify(items))
        requestBody.append('groupTitle', listingTitle.trim())
        endpoint = '/api/product/add-listing'
      }
      const response = await axios.post(backendUrl + endpoint, requestBody, { headers: { token } })
      if (response.data.success) {
        const message = response.data.message || 'Product added successfully.'
        toast.success(message)
        setFeedback({ type: 'success', message })
        setName('')
        setDescription('')
        setImage1(false)
        setImage2(false)
        setImage3(false)
        setImage4(false)
        setPrice('')
        setInventory({})
        setSizeGuide(editableSizeGuide())
        setVariantGroupId('')
        setOptionLabel('')
        if (multipleItems) {
          setListingItems([])
          setActiveItemIndex(0)
          setListingTitle('')
          setSizes([])
        }
      } else {
        const message = response.data.message || 'Product could not be added. Your entries have been kept.'
        toast.error(message)
        setFeedback({ type: 'error', message })
      }
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Product could not be added. Your entries have been kept.'
      toast.error(message)
      setFeedback({ type: 'error', message })
    } finally {
      submissionPending.current = false
      setSubmitting(false)
    }
  }

  const images = [image1, image2, image3, image4]
  const programOptions = getAcademicProgramOptions(managedCategories)
  const merchandiseOptions = getMerchandiseCategoryOptions(managedCategories)
  const genderOptions = getGenderOptions(managedCategories, { includeNotApplicable: true })
  const coverIndex = images.findIndex(Boolean)
  const imageSetters = [setImage1, setImage2, setImage3, setImage4]
  const customSizes = sizes.filter(size => !sizeOptions.includes(size))
  const availableSizeOptions = [...sizeOptions, ...customSizes]
  let feedbackClass = 'rounded-[7px] border border-current bg-[var(--pamo-color-surface-default)] p-4 [overflow-wrap:anywhere]'
  if (feedback?.type === 'success') feedbackClass += ' text-[color:var(--pamo-color-success-text)]'
  if (feedback?.type === 'error') feedbackClass += ' text-[color:var(--pamo-color-error-text)]'
  let submitLabel = 'Add Product'
  if (multipleItems) submitLabel = 'Add Listing & All Items'
  if (submitting) submitLabel = 'Adding Product…'

  return <main aria-labelledby='add-product-heading' className='pamo-add-product mx-auto grid min-w-0 max-w-[2160px] gap-[clamp(24px,2vw,36px)] text-[length:var(--dashboard-body)] leading-[var(--pamo-staff-leading)] text-[color:var(--pamo-color-text-primary)]'>
    <nav aria-label='Breadcrumb' className='flex min-w-0 flex-wrap items-center gap-2.5 text-[length:var(--pamo-staff-small)] font-semibold uppercase tracking-[.09em] text-[color:var(--pamo-color-text-secondary)] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded [&_a]:hover:text-[color:var(--pamo-color-accent-text)]'>
      <Link to='/orders'>Admin</Link><span aria-hidden='true'>/</span><Link to='/list'>Products</Link><span aria-hidden='true'>/</span><span aria-current='page'>Add Product</span>
    </nav>
    <header className='border-l-4 border-[color:var(--pamo-color-brand-yellow)] pl-4 [&_h1]:text-[length:var(--pamo-staff-heading)] [&_h1]:font-bold [&_h1]:leading-[var(--pamo-staff-heading-leading)] [&_h1]:tracking-[-.025em] [&_p]:mt-2 [&_p]:max-w-[70ch] [&_p]:text-[color:var(--pamo-color-text-secondary)]'><h1 id='add-product-heading'>Add Product</h1><p>Create an item with accurate details, images, and size-based stock.</p></header>
    {feedback && <p className={feedbackClass}>{feedback.message}</p>}
    <form onSubmit={onSubmitHandler} onInvalid={recordInvalid} aria-busy={submitting} className='min-w-0'>
      <section aria-label='Listing items' className='mb-5 min-w-0 rounded-lg border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h2 className='font-semibold'>Multiple Items</h2>
          {!multipleItems && <button type='button' disabled={submitting || Boolean(variantGroupId)} className={buttonClass + ' min-h-11 px-4 py-2'} onClick={() => { setListingItems([currentDraft()]); setActiveItemIndex(0); setListingTitle(name) }}>Create Multi-Item Listing</button>}
          {multipleItems && <button type='button' disabled={submitting || listingItems.length > 1} className={buttonClass + ' min-h-11 px-4 py-2'} onClick={() => { setListingItems([]); setListingTitle('') }}>Use Single Item</button>}
        </div>
        {multipleItems && <>
          <label className='mt-3 block text-sm font-semibold'>Listing title<input className='add-input mt-2' value={listingTitle} maxLength={120} required onChange={event => setListingTitle(event.target.value)} disabled={submitting} /></label>
          <div className='mt-3 flex flex-wrap gap-2' aria-label='Edit listing item'>
            {listingItems.map((draft, index) => <button key={index} type='button' aria-pressed={index === activeItemIndex} disabled={submitting} onClick={() => switchItem(index)} className={buttonClass + ' min-h-11 px-3 py-2 aria-pressed:border-[color:var(--pamo-color-brand-yellow)]'}>{index + 1}. {(index === activeItemIndex ? name : draft.name) || 'New item'}</button>)}
            <button type='button' disabled={submitting || listingItems.length >= MAX_LISTING_ITEMS} onClick={addListingItem} className={buttonClass + ' min-h-11 px-3 py-2'}>+ Add Item</button>
            <button type='button' disabled={submitting || listingItems.length < 2} onClick={removeListingItem} className={buttonClass + ' min-h-11 px-3 py-2'}>Remove Current Draft</button>
          </div>
          <p className={helpClass + ' mt-3'} role='status'>Editing item {activeItemIndex + 1} of {listingItems.length}. Each item has its own details, images, price, sizes, and stock. All items save together (up to {MAX_LISTING_ITEMS}).</p>
        </>}
      </section>
      <fieldset disabled={submitting} className="grid min-w-0 gap-[var(--dashboard-gap)] border-0 p-0 [grid-template-areas:'details'_'classification'_'images'_'stock'_'labels'] disabled:[&_[data-image-chooser]]:cursor-wait disabled:[&_[data-image-chooser]]:opacity-[.65] min-[1180px]:grid-cols-[minmax(0,1.24fr)_minmax(0,1fr)] min-[1180px]:items-start min-[1180px]:[grid-template-areas:'details_images'_'classification_images'_'stock_stock'_'labels_labels']">
        <legend className='sr-only'>Product creation fields</legend>
        <section aria-labelledby='product-details-heading' className='min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[var(--dashboard-padding)] [grid-area:details]'>
          <SectionHeading id='product-details-heading' title='Product Details' description='Name and describe the merchandise for students.' />
          <div className='mt-5 grid gap-5'>
            <div className={fieldClass}><label htmlFor='product-name'>Product Name <span aria-hidden='true'>*</span></label>
              <input id='product-name' onChange={event => { setName(event.target.value); clearError('product-name') }} value={name} className='add-input' type='text' placeholder='Enter a clear product name' required aria-invalid={!!fieldErrors['product-name']} aria-describedby={fieldErrors['product-name'] ? 'product-name-error' : undefined} />
              {fieldErrors['product-name'] && <p id='product-name-error' className={fieldErrorClass}>{fieldErrors['product-name']}</p>}
            </div>
            <div className={fieldClass}><label htmlFor='product-description'>Product Description <span aria-hidden='true'>*</span></label>
              <textarea id='product-description' onChange={event => { setDescription(event.target.value); clearError('product-description') }} value={description} className='add-input' rows={3} placeholder='Describe the merchandise' required aria-invalid={!!fieldErrors['product-description']} aria-describedby={fieldErrors['product-description'] ? 'product-description-error' : undefined} />
              {fieldErrors['product-description'] && <p id='product-description-error' className={fieldErrorClass}>{fieldErrors['product-description']}</p>}
            </div>
            <details onToggle={event => { if (event.currentTarget.open && !multipleItems) loadVariantGroups() }} className='rounded-md border border-[color:var(--pamo-color-border-default)] p-3'>
              <summary className='min-h-11 cursor-pointer py-2 font-semibold'>Item Option / Existing Listing</summary>
              {!multipleItems && <label className='mt-3 block text-sm'>Join existing listing
                <select className='add-input mt-2' value={variantGroupId} onChange={event => setVariantGroupId(event.target.value)} disabled={groupsLoading}>
                  <option value=''>Standalone product</option>
                  {variantGroups.map(group => <option key={group._id} value={group._id}>{group.groupTitle || group.name}</option>)}
                </select>
              </label>}
              {(variantGroupId || multipleItems) && <label className='mt-3 block text-sm'>Item option label (optional)<input className='add-input mt-2' maxLength={80} value={optionLabel} onChange={event => setOptionLabel(event.target.value)} placeholder='Use product name' /></label>}
              {groupsLoading && <p role='status' className={helpClass}>Loading product listings…</p>}
              {groupsError && <p role='alert' className={fieldErrorClass}>{groupsError}</p>}
              <p className={helpClass + ' mt-3'}>Link existing products from Product List → Manage → Multiple Items.</p>
            </details>
          </div>
        </section>
        <section aria-labelledby='product-classification-heading' className='min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[var(--dashboard-padding)] [grid-area:classification]'>
          <SectionHeading id='product-classification-heading' title='Classification & Pricing' description='Assign the academic program, gender, merchandise category, and PHP price independently.' />
          <div className='mt-5 grid gap-5 min-[540px]:grid-cols-2'>
            <ClassificationMultiSelect id='product-program' label='Academic Programs' options={programOptions} selectedValues={academicPrograms} onChange={setAcademicPrograms} disabled={submitting || categoriesLoading} loading={categoriesLoading} />
            <ClassificationMultiSelect id='product-gender' label='Gender' options={genderOptions} selectedValues={genders} onChange={setGenders} disabled={submitting} exclusiveValues={[PRODUCT_GENDER_NOT_APPLICABLE]} />
            <ClassificationMultiSelect id='product-merchandise-category' label='Merchandise Categories' options={merchandiseOptions} selectedValues={merchandiseCategoryCodes} onChange={setMerchandiseCategoryCodes} disabled={submitting || categoriesLoading} loading={categoriesLoading} />
            {categoriesLoading && <p role='status' className={helpClass + ' min-[540px]:col-span-2'}>Loading Admin-created classifications...</p>}
            {!categoriesLoading && categoriesError && <div role='alert' className={fieldErrorClass + ' min-[540px]:col-span-2'}><p>{categoriesError}</p><button type='button' onClick={fetchCategories} className={buttonClass + ' mt-2 min-h-11 px-4 py-2'}>Try again</button></div>}
            <div className={fieldClass}><label htmlFor='product-price'>Price (PHP)</label><div className='relative [--add-input-padding-left:36px]'><span aria-hidden='true' className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--pamo-color-text-secondary)]'>₱</span><input id='product-price' onChange={event => { setPrice(event.target.value); clearError('product-price') }} value={price} className='add-input' type='number' min='0' step='0.01' required inputMode='decimal' placeholder='Enter price in PHP' aria-invalid={!!fieldErrors['product-price']} aria-describedby={fieldErrors['product-price'] ? 'product-price-error' : undefined} /></div>{fieldErrors['product-price'] && <p id='product-price-error' className={fieldErrorClass}>{fieldErrors['product-price']}</p>}</div>
          </div>
        </section>
        <section aria-labelledby='product-images-heading' className='min-w-0 self-start rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[var(--dashboard-padding)] [grid-area:images]'>
          <SectionHeading id='product-images-heading' title='Product Images' description='Up to 4 images. First selected image becomes the cover.' />
          <div className='mt-5 grid min-w-0 gap-3'><ImageUpload id='image1' file={image1} onChange={setImage1} main cover={coverIndex === 0} /><div className='grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,96px),1fr))] gap-2.5'>{images.slice(1).map((file, index) => <ImageUpload key={index + 2} id={`image${index + 2}`} file={file} onChange={imageSetters[index + 1]} cover={coverIndex === index + 1} />)}</div></div>
          <p id='product-images-help' className={helpClass + ' mt-5'}>Choose image files to preview, replace, or remove before submission. Uploaded images are validated by the server when saved.</p>
        </section>
        <section aria-labelledby='product-stock-heading' className='min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] border-t-[3px] border-t-[color:var(--pamo-color-brand-yellow)] bg-[var(--pamo-color-surface-default)] p-[var(--dashboard-padding)] [grid-area:stock]'>
          <SectionHeading id='product-stock-heading' title='Available Sizes & Initial Stock' description='Select a size, then enter the exact starting quantity for each selected size.' />
          <p className='mt-5 flex items-start gap-2.5 rounded-[7px] bg-[var(--pamo-color-surface-subtle)] p-4 text-[length:var(--pamo-staff-small)] text-[color:var(--pamo-color-text-secondary)] [&_svg]:mt-0.5 [&_svg]:shrink-0'><Info size={18} aria-hidden='true' /><span>An empty quantity needs attention. Enter 0 only when a size is intentionally out of stock.</span></p>
          <fieldset className='mt-5 min-w-0 [&>legend]:mb-3 [&>legend]:text-[length:var(--pamo-staff-small)] [&>legend]:font-semibold [&>legend]:uppercase [&>legend>span]:text-[color:var(--pamo-color-accent-text)]' aria-describedby={'product-size-help' + (fieldErrors.sizes ? ' product-sizes-error' : '')}>
            <legend>Size options <span aria-hidden='true'>*</span></legend>
            <div className='grid max-w-[800px] grid-cols-[repeat(auto-fit,minmax(min(100%,90px),1fr))] gap-2.5'>
              {availableSizeOptions.map(size => (
                <button
                  key={size}
                  id={`product-size-${size.replaceAll(' ', '-')}`}
                  type='button'
                  aria-pressed={sizes.includes(size)}
                  onClick={() => toggleSize(size)}
                  className='flex min-h-12 items-center justify-center gap-1.5 rounded-[7px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-subtle)] p-2.5 text-[length:var(--pamo-staff-small)] font-semibold hover:border-[color:var(--pamo-color-accent-text)] aria-pressed:border-transparent aria-pressed:bg-[var(--pamo-color-brand-yellow)] aria-pressed:text-slate-950'
                >
                  {sizes.includes(size) && <Check size={16} aria-hidden='true' />}
                  {size}
                </button>
              ))}
            </div>
            <div className='mt-3'>
              <CustomSizeInput selectedSizes={sizes} onAdd={addCustomSize} disabled={submitting} />
            </div>
            <p id='product-size-help' className={helpClass + ' mt-2.5'}>One Size can be selected alongside clothing sizes. Deselecting a size keeps its entered quantity for reselection.</p>
            {fieldErrors.sizes && <p id='product-sizes-error' className={fieldErrorClass}>{fieldErrors.sizes}</p>}
          </fieldset>
          <fieldset className='mt-5 min-w-0 border-t border-[color:var(--pamo-color-border-default)] pt-5 [&>legend]:float-left [&>legend]:mb-3 [&>legend]:w-full [&>legend]:text-[length:var(--pamo-staff-small)] [&>legend]:font-semibold [&>legend]:uppercase'><legend>Initial stock for selected sizes</legend>
            {sizes.length > 0 && (
              <div className='clear-both grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3.5'>
                {sizes.map(size => {
                  const id = stockId(size)
                  const value = inventory[size] ?? ''
                  const validationMessage = stockError(size, value)
                  const presentation = getStockFieldPresentation(value, validationMessage, fieldErrors[id])
                  const changeStock = event => {
                    setInventory(previous => ({ ...previous, [size]: event.target.value }))
                    clearError(id)
                  }

                  return (
                    <div key={size} className='min-w-0 rounded-[7px] bg-[var(--pamo-color-surface-subtle)] p-3.5 [&>p]:mt-2.5'>
                      <div className='flex flex-wrap items-center gap-x-3 gap-y-2 [--add-input-align:center] [--add-input-height:44px] [--add-input-padding:8px] [--add-input-surface:var(--pamo-color-surface-default)]'>
                        <label htmlFor={id} className='min-w-0 flex-[1_1_80px] text-[length:var(--pamo-staff-small)] font-semibold uppercase'>Size {size}</label>
                        <input
                          id={id}
                          aria-label={`Initial stock for ${size}`}
                          type='number'
                          inputMode='numeric'
                          min='0'
                          step='1'
                          required
                          value={value}
                          onChange={changeStock}
                          className='add-input !w-[100px] flex-[0_1_100px] [font-variant-numeric:tabular-nums]'
                          aria-invalid={Boolean(fieldErrors[id])}
                          aria-describedby={id + '-help'}
                        />
                        <span className='text-[length:var(--pamo-staff-small)] text-[color:var(--pamo-color-text-secondary)]'>units</span>
                      </div>
                      <p id={id + '-help'} className={presentation.className}>{presentation.message}</p>
                    </div>
                  )
                })}
              </div>
            )}
            {!sizes.length && <p className={helpClass}>Select available sizes to enter their initial stock.</p>}
          </fieldset>
          <SizeMeasurementsEditor
            idPrefix='product-measurements'
            sizes={sizes}
            value={sizeGuide}
            onChange={nextGuide => { setSizeGuide(nextGuide); clearError('measurements') }}
            disabled={submitting}
          />
          {fieldErrors.measurements && <p className={fieldErrorClass} role='alert'>{fieldErrors.measurements}</p>}
        </section>
        <section aria-labelledby='product-labels-heading' className='add-labels min-w-0 rounded-[9px] border border-[color:var(--pamo-color-border-default)] bg-[var(--pamo-color-surface-default)] p-[var(--dashboard-padding)] [grid-area:labels]'>
          <SectionHeading id='product-labels-heading' title='Storefront Labels' description='Optional flags that change how the product is presented.' />
          <div className='mt-5 grid gap-3.5 min-[540px]:grid-cols-2 [&_input]:mt-0.5 [&_input]:h-5 [&_input]:w-5 [&_input]:shrink-0 [&_input]:accent-[var(--pamo-color-brand-yellow)] [&_strong]:block [&_strong]:font-semibold [&_strong+span]:mt-1.5 [&_strong+span]:block [&_strong+span]:text-[length:var(--pamo-staff-small)] [&_strong+span]:text-[color:var(--pamo-color-text-secondary)]'>
            <label htmlFor='BestSeller' data-selected={BestSeller} className={storefrontLabelClass}><input onChange={() => setBestSeller(previous => !previous)} checked={BestSeller} type='checkbox' id='BestSeller' /><span><strong>Feature Product</strong><span>Adds a Featured badge, includes this item in the curated Collection filter, and helps prioritize recommendations. Stays enabled until removed.</span></span></label>
            <label htmlFor='NewArrival' data-selected={NewArrival} className={storefrontLabelClass}><input onChange={() => setNewArrival(previous => !previous)} checked={NewArrival} type='checkbox' id='NewArrival' /><span><strong>Mark as New Arrival</strong><span>Helps prioritize recommendations for 30 days. Manage or renew this label from Product Management.</span></span></label>
          </div>
        </section>
      </fieldset>
      <footer className='mt-7 grid gap-5 border-t border-[color:var(--pamo-color-border-default)] pt-5 [&>div]:flex [&>div]:flex-wrap [&>div]:justify-between [&>div]:gap-3 max-[359px]:[&_a]:w-full max-[359px]:[&_button]:w-full'>
        <p className={helpClass}>Review all required fields and selected size quantities before adding.</p>
        <div>
          <Link ref={cancelButton} to='/list' onClick={cancel} aria-disabled={submitting} className={buttonClass}>
            <ArrowLeft size={18} aria-hidden='true' />Cancel
          </Link>
          <button type='submit' disabled={submitting} className={brandButtonClass + ' min-w-0 flex-[1_1_160px] max-w-60'}>
            {submitLabel}
            <ArrowRight size={18} aria-hidden='true' />
          </button>
        </div>
        <p className={helpClass}>You will receive confirmation after the product has been added.</p>
      </footer>
    </form>
    <dialog ref={discardDialog} aria-labelledby='add-discard-heading' aria-describedby='add-discard-description' onClose={() => cancelButton.current?.focus()} className='m-auto max-h-[calc(100svh-32px)] w-[calc(100%-32px)] max-w-[480px] overflow-y-auto rounded-[9px] border border-[color:var(--pamo-color-border-input)] bg-[var(--pamo-color-surface-default)] p-6 text-[color:var(--pamo-color-text-primary)] backdrop:bg-slate-950/60'>
      <h2 id='add-discard-heading' className='text-[22px] font-semibold'>Discard this product?</h2>
      <p id='add-discard-description' className='mt-3 text-[color:var(--pamo-color-text-secondary)]'>Your unsaved details and selected images will be lost.</p>
      <div className='mt-6 flex flex-wrap gap-3'>
        <button ref={keepEditing} type='button' className={brandButtonClass} onClick={() => discardDialog.current.close()}>Keep editing</button>
        <Link to='/list' className={buttonClass} onClick={() => discardDialog.current.close()}>Discard changes</Link>
      </div>
    </dialog>
  </main>
}

export default Add
