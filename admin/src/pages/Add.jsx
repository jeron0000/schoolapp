import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { toast } from 'react-toastify'
import { productGenders, productPrograms } from '../../../shared/productTaxonomy'
import { ArrowLeft, ArrowRight, Check, Info, Plus, Upload, X } from '../components/DashboardIcons'
import './Add.css'
import { phpMinorUnits } from '../../../shared/money.js'

const sizeOptions = ['S', 'M', 'L', 'XL', 'XXL', 'One Size']
const stockId = size => 'product-stock-' + size.replaceAll(' ', '-')
const stockError = (size, value) => {
  if (value === undefined || String(value).trim() === '') return `Enter an initial quantity for ${size}.`
  return Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? '' : 'Use a non-negative whole number.'
}

const SectionHeading = ({ id, title, description }) => (
  <header className='add-section-heading'>
    <h2 id={id}>{title}</h2><p>{description}</p>
  </header>
)

const ImageUpload = ({ id, file, onChange, main = false, cover = false }) => {
  const preview = useRef(null)
  const input = useRef(null)
  const label = main ? 'main image' : `image ${id.slice(-1)}`
  useEffect(() => {
    if (!file) { input.current.value = ''; return }
    const url = URL.createObjectURL(file)
    preview.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  const removeImage = () => {
    onChange(false)
    input.current.value = ''
    input.current.focus()
  }
  return <div className={'add-image-slot' + (main ? ' add-image-main' : '')}>
    <label htmlFor={id} className='add-image-chooser'>
      <input ref={input} id={id} aria-label={`${file ? 'Replace' : 'Upload'} ${label}`} aria-describedby='product-images-help' onChange={event => { const selected = event.target.files[0]; if (selected) onChange(selected) }} type='file' className='sr-only' />
      {file ? <><img ref={preview} alt={`Selected ${label} preview`} className='add-image-preview' />{cover && <span className='add-cover-label'>Cover image</span>}</> : <>
        {main ? <Upload size={36} aria-hidden='true' /> : <Plus size={24} aria-hidden='true' />}
        <span className='add-image-title'>{main ? 'Main image' : `Image ${id.slice(-1)}`}</span>
        {main && <><span className='add-image-description'>Used as the cover in the collection</span><span className='add-button add-button-brand'>Choose main image</span></>}
        {!main && <span className='add-image-description'>Add photo</span>}
      </>}
    </label>
    {file && <div className='add-image-review'>
      <p>{file.name}{cover && <span> · Cover</span>}</p>
      <div className='add-image-actions'>
        <button type='button' onClick={() => input.current.click()} aria-label={`Replace ${label}`}>Replace</button>
        <button type='button' onClick={removeImage} aria-label={`Remove ${label}`}><X size={16} aria-hidden='true' />Remove</button>
      </div>
    </div>}
  </div>
}

const Add = ({ token }) => {
  const [image1, setImage1] = useState(false)
  const [image2, setImage2] = useState(false)
  const [image3, setImage3] = useState(false)
  const [image4, setImage4] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState(productGenders[0])
  const [subCategory, setSubCategory] = useState(productPrograms[0])
  const [BestSeller, setBestSeller] = useState(false)
  const [NewArrival, setNewArrival] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submissionPending = useRef(false)
  const [sizes, setSizes] = useState([])
  const [inventory, setInventory] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [feedback, setFeedback] = useState(null)
  const discardDialog = useRef(null)
  const keepEditing = useRef(null)
  const cancelButton = useRef(null)

  const clearError = id => setFieldErrors(previous => previous[id] ? { ...previous, [id]: '' } : previous)
  const recordInvalid = event => setFieldErrors(previous => ({ ...previous, [event.target.id]: event.target.validationMessage }))
  const dirty = Boolean(name || description || price || image1 || image2 || image3 || image4 || sizes.length || BestSeller || NewArrival || category !== productGenders[0] || subCategory !== productPrograms[0])
  const cancel = event => {
    if (submissionPending.current) { event.preventDefault(); return }
    if (!dirty) return
    event.preventDefault()
    discardDialog.current.showModal()
    keepEditing.current.focus()
  }

  const onSubmitHandler = async event => {
    event.preventDefault()
    if (submissionPending.current) return
    const errors = {}
    try { phpMinorUnits(price) } catch { errors['product-price'] = 'Enter a non-negative PHP price with at most two decimal places.' }
    if (!sizes.length) errors.sizes = 'Select at least one size.'
    sizes.forEach(size => { const message = stockError(size, inventory[size]); if (message) errors[stockId(size)] = message })
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      document.getElementById(Object.keys(errors)[0] === 'sizes' ? 'product-size-S' : Object.keys(errors)[0])?.focus()
      return
    }
    submissionPending.current = true
    setSubmitting(true)
    setFieldErrors({})
    setFeedback(null)
    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('description', description)
      formData.append('price', price)
      formData.append('category', category)
      formData.append('subCategory', subCategory)
      formData.append('BestSeller', BestSeller)
      formData.append('NewArrival', NewArrival)
      formData.append('sizes', JSON.stringify(sizes))
      const initialStock = Object.fromEntries(sizes.map(size => [size, Number(inventory[size])]))
      formData.append('inventory', JSON.stringify(initialStock))
      image1 && formData.append('image1', image1)
      image2 && formData.append('image2', image2)
      image3 && formData.append('image3', image3)
      image4 && formData.append('image4', image4)
      const response = await axios.post(backendUrl + '/api/product/add', formData, { headers: { token } })
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
      } else {
        const message = response.data.message || 'Product could not be added. Your entries have been kept.'
        toast.error(message)
        setFeedback({ type: 'error', message })
      }
    } catch (error) {
      const message = error.message || 'Product could not be added. Your entries have been kept.'
      toast.error(message)
      setFeedback({ type: 'error', message })
    } finally {
      submissionPending.current = false
      setSubmitting(false)
    }
  }

  const images = [image1, image2, image3, image4]
  const coverIndex = images.findIndex(Boolean)
  const imageSetters = [setImage1, setImage2, setImage3, setImage4]
  return <main aria-labelledby='add-product-heading' className='pamo-add-product'>
    <nav aria-label='Breadcrumb' className='add-breadcrumb'>
      <Link to='/orders'>Admin</Link><span aria-hidden='true'>/</span><Link to='/list'>Products</Link><span aria-hidden='true'>/</span><span aria-current='page'>Add Product</span>
    </nav>
    <header className='add-page-heading'><h1 id='add-product-heading'>Add Product</h1><p>Create an item with accurate details, images, and size-based stock.</p></header>
    {feedback && <p className={'add-feedback is-' + feedback.type}>{feedback.message}</p>}
    <form onSubmit={onSubmitHandler} onInvalid={recordInvalid} aria-busy={submitting}>
      <fieldset disabled={submitting} className='add-form-sections'>
        <legend className='sr-only'>Product creation fields</legend>
        <section aria-labelledby='product-details-heading' className='add-panel add-details'>
          <SectionHeading id='product-details-heading' title='Product Details' description='Name and describe the merchandise for students.' />
          <div className='add-field-stack'>
            <div className='add-field'><label htmlFor='product-name'>Product Name <span aria-hidden='true'>*</span></label>
              <input id='product-name' onChange={event => { setName(event.target.value); clearError('product-name') }} value={name} className='add-input' type='text' placeholder='Enter a clear product name' required aria-invalid={!!fieldErrors['product-name']} aria-describedby={fieldErrors['product-name'] ? 'product-name-error' : undefined} />
              {fieldErrors['product-name'] && <p id='product-name-error' className='add-field-error'>{fieldErrors['product-name']}</p>}
            </div>
            <div className='add-field'><label htmlFor='product-description'>Product Description <span aria-hidden='true'>*</span></label>
              <textarea id='product-description' onChange={event => { setDescription(event.target.value); clearError('product-description') }} value={description} className='add-input' rows={3} placeholder='Describe the merchandise' required aria-invalid={!!fieldErrors['product-description']} aria-describedby={fieldErrors['product-description'] ? 'product-description-error' : undefined} />
              {fieldErrors['product-description'] && <p id='product-description-error' className='add-field-error'>{fieldErrors['product-description']}</p>}
            </div>
          </div>
        </section>
        <section aria-labelledby='product-classification-heading' className='add-panel add-classification'>
          <SectionHeading id='product-classification-heading' title='Classification & Pricing' description='Choose the correct audience, program, and price.' />
          <div className='add-classification-fields'>
            <div className='add-field'><label htmlFor='product-gender'>Gender</label><select id='product-gender' value={category} onChange={event => setCategory(event.target.value)} className='add-input'>{productGenders.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
            <div className='add-field'><label htmlFor='product-program'>Program</label><select id='product-program' value={subCategory} onChange={event => setSubCategory(event.target.value)} className='add-input'>{productPrograms.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
            <div className='add-field add-price'><label htmlFor='product-price'>Price (PHP)</label><div className='add-price-input'><span aria-hidden='true'>₱</span><input id='product-price' onChange={event => { setPrice(event.target.value); clearError('product-price') }} value={price} className='add-input' type='number' min='0' step='0.01' required inputMode='decimal' placeholder='Enter price in PHP' aria-invalid={!!fieldErrors['product-price']} aria-describedby={fieldErrors['product-price'] ? 'product-price-error' : undefined} /></div>{fieldErrors['product-price'] && <p id='product-price-error' className='add-field-error'>{fieldErrors['product-price']}</p>}</div>
          </div>
        </section>
        <section aria-labelledby='product-images-heading' className='add-panel add-images'>
          <SectionHeading id='product-images-heading' title='Product Images' description='Up to 4 images. First selected image becomes the cover.' />
          <div className='add-image-grid'><ImageUpload id='image1' file={image1} onChange={setImage1} main cover={coverIndex === 0} /><div className='add-extra-images'>{images.slice(1).map((file, index) => <ImageUpload key={index + 2} id={`image${index + 2}`} file={file} onChange={imageSetters[index + 1]} cover={coverIndex === index + 1} />)}</div></div>
          <p id='product-images-help' className='add-help'>Choose image files to preview, replace, or remove before submission. Uploaded images are validated by the server when saved.</p>
        </section>
        <section aria-labelledby='product-stock-heading' className='add-panel add-stock'>
          <SectionHeading id='product-stock-heading' title='Available Sizes & Initial Stock' description='Select a size, then enter the exact starting quantity for each selected size.' />
          <p className='add-stock-notice'><Info size={18} aria-hidden='true' /><span>An empty quantity needs attention. Enter 0 only when a size is intentionally out of stock.</span></p>
          <fieldset className='add-size-options' aria-describedby={'product-size-help' + (fieldErrors.sizes ? ' product-sizes-error' : '')}>
            <legend>Size options <span aria-hidden='true'>*</span></legend>
            <div className='add-size-buttons'>{sizeOptions.map(size => <button key={size} id={`product-size-${size.replaceAll(' ', '-')}`} type='button' aria-pressed={sizes.includes(size)} onClick={() => { setSizes(previous => previous.includes(size) ? previous.filter(item => item !== size) : [...previous, size]); clearError('sizes') }} className='add-size-button'>{sizes.includes(size) && <Check size={16} aria-hidden='true' />}{size}</button>)}</div>
            <p id='product-size-help' className='add-help'>One Size can be selected alongside clothing sizes. Deselecting a size keeps its entered quantity for reselection.</p>
            {fieldErrors.sizes && <p id='product-sizes-error' className='add-field-error'>{fieldErrors.sizes}</p>}
          </fieldset>
          <fieldset className='add-stock-fields'><legend>Initial stock for selected sizes</legend>
            {sizes.length ? <div className='add-stock-grid'>{sizes.map(size => {
              const id = stockId(size), value = inventory[size] ?? '', message = stockError(size, value), configured = !message
              return <div key={size} className='add-stock-item'><div className='add-stock-control'><label htmlFor={id}>Size {size}</label><input id={id} aria-label={`Initial stock for ${size}`} type='number' inputMode='numeric' min='0' step='1' required value={value} onChange={event => { setInventory(previous => ({ ...previous, [size]: event.target.value })); clearError(id) }} className='add-input' aria-invalid={!!fieldErrors[id]} aria-describedby={id + '-help'} /><span>units</span></div><p id={id + '-help'} className={fieldErrors[id] ? 'add-field-error' : configured ? 'add-stock-result' + (Number(value) === 0 ? ' is-zero' : '') : 'add-help'}>{fieldErrors[id] || (configured ? Number(value) === 0 ? '0 units · intentionally unavailable' : `${value} units configured` : 'Enter a starting quantity.')}</p></div>
            })}</div> : <p className='add-help'>Select available sizes to enter their initial stock.</p>}
          </fieldset>
        </section>
        <section aria-labelledby='product-labels-heading' className='add-panel add-labels'>
          <SectionHeading id='product-labels-heading' title='Storefront Labels' description='Optional flags that change how the product is presented.' />
          <div className='add-label-options'>
            <label htmlFor='BestSeller'><input onChange={() => setBestSeller(previous => !previous)} checked={BestSeller} type='checkbox' id='BestSeller' /><span><strong>Feature in Best Sellers</strong><span>Displays this item in the curated Best Sellers section.</span></span></label>
            <label htmlFor='NewArrival'><input onChange={() => setNewArrival(previous => !previous)} checked={NewArrival} type='checkbox' id='NewArrival' /><span><strong>Mark as New Arrival</strong><span>Displays this item in the New Arrivals section.</span></span></label>
          </div>
        </section>
      </fieldset>
      <footer className='add-form-actions'><p className='add-help'>Review all required fields and selected size quantities before adding.</p><div><Link ref={cancelButton} to='/list' onClick={cancel} aria-disabled={submitting} className='add-button'><ArrowLeft size={18} aria-hidden='true' />Cancel</Link><button type='submit' disabled={submitting} className='add-button add-button-brand'>{submitting ? 'Adding Product…' : 'Add Product'}<ArrowRight size={18} aria-hidden='true' /></button></div><p className='add-help'>You will receive confirmation after the product has been added.</p></footer>
    </form>
    <dialog ref={discardDialog} aria-labelledby='add-discard-heading' aria-describedby='add-discard-description' onClose={() => cancelButton.current?.focus()} className='add-discard-dialog'>
      <h2 id='add-discard-heading'>Discard this product?</h2><p id='add-discard-description'>Your unsaved details and selected images will be lost.</p><div><button ref={keepEditing} type='button' className='add-button add-button-brand' onClick={() => discardDialog.current.close()}>Keep editing</button><Link to='/list' className='add-button' onClick={() => discardDialog.current.close()}>Discard changes</Link></div>
    </dialog>
  </main>
}

export default Add
