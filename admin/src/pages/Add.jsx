import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { backendUrl } from '../utils/config'
import { toast } from 'react-toastify'
import { productGenders, productPrograms } from '../../../shared/productTaxonomy'

const panelClass = 'min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/60'
const labelClass = 'mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100'
const fieldClass = 'min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400'
const iconPaths = {
  details: 'M4 3h16v18H4ZM8 7h8M8 11h8M8 15h5',
  image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M16 7h.01',
  tag: 'M3 3h8l10 10-8 8L3 11ZM7 7h.01',
  options: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  upload: 'M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5',
  back: 'M20 12H4m6-6-6 6 6 6',
  product: 'm12 3 9 5v9l-9 5-9-5V8ZM3 8l9 5 9-5M12 13v9'
}
const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg aria-hidden='true' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' className={className}><path d={iconPaths[name]} /></svg>
)
const SectionHeading = ({ id, icon, title, description }) => (
  <div className='flex items-start gap-3 border-b border-slate-200 pb-3 dark:border-slate-800'>
    <Icon name={icon} className='mt-0.5 h-6 w-6 shrink-0 text-amber-500 dark:text-amber-400' />
    <div><h2 id={id} className='text-sm font-semibold text-slate-950 dark:text-slate-100'>{title}</h2><p className='mt-1 text-xs leading-5'>{description}</p></div>
  </div>
)
const ImageUpload = ({ id, file, onChange, main = false }) => {
  const preview = useRef(null)
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    preview.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    <label htmlFor={id} className={'relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-slate-400 bg-slate-50 p-3 text-center hover:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400 dark:border-slate-600 dark:bg-slate-950/20 ' + (main ? 'h-56 sm:h-60' : 'h-32 sm:h-40')}>
      <input id={id} aria-label={main ? 'Upload main image' : `Upload image ${id.slice(-1)}`} onChange={event => onChange(event.target.files[0])} type='file' className='sr-only' />
      {file ? <img ref={preview} alt={main ? 'Selected main product image' : `Selected product image ${id.slice(-1)}`} className='h-full w-full object-contain' /> : <>
        <Icon name='upload' className={main ? 'h-9 w-9 text-slate-400' : 'h-7 w-7 text-slate-400'} />
        <span className='text-sm font-medium text-slate-900 dark:text-slate-100'>{main ? 'Upload Main Image' : 'Upload Image'}</span>
        {main && <span className='mt-2 rounded-md bg-amber-400 px-5 py-2 text-xs font-semibold text-slate-950'>Choose Image</span>}
      </>}
    </label>
  )
}
const Add = ({token}) => {

  const [image1, setImage1] = useState(false)
  const [image2, setImage2] = useState(false)
  const [image3, setImage3] = useState(false)
  const [image4, setImage4] = useState(false)

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState(productGenders[0]);
  const [subCategory, setSubCategory] = useState(productPrograms[0]);
  const [BestSeller, setBestSeller] = useState(false);
  const [NewArrival, setNewArrival] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const [sizes, setSizes] = useState([]);
  const [inventory, setInventory] = useState({});

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    if (submissionPending.current) return;
    submissionPending.current = true;
    setSubmitting(true);

    try {
      const formData = new FormData()

      formData.append("name", name)
      formData.append("description", description)
      formData.append("price", price)
      formData.append("category", category)
      formData.append("subCategory", subCategory)
      formData.append("BestSeller", BestSeller)
      formData.append("NewArrival", NewArrival)
      formData.append("sizes", JSON.stringify(sizes))
      if (!sizes.length) throw new Error('Select at least one size.');
      const initialStock = Object.fromEntries(sizes.map(size => [size, Number(inventory[size] ?? 0)]));
      if (Object.values(initialStock).some(quantity => !Number.isSafeInteger(quantity) || quantity < 0)) throw new Error('Initial stock must be non-negative whole numbers.');
      formData.append('inventory', JSON.stringify(initialStock))

      image1 && formData.append("image1", image1)
      image2 && formData.append("image2", image2)
      image3 && formData.append("image3", image3)
      image4 && formData.append("image4", image4)

      const response = await axios.post(backendUrl + "/api/product/add", formData,{headers:{token}})

       if (response.data.success) {
          toast.success(response.data.message)
          setName('')
          setDescription('')
          setImage1(false)
          setImage2(false)
          setImage3(false)
          setImage4(false)
          setPrice('')
          setInventory({})
       } else {
            toast.error(response.data.message)
        }

      } catch (error) {
        console.log(error);
        toast.error(error.message)
      } finally {
        submissionPending.current = false;
        setSubmitting(false);
      }
    }


    return (
      <section aria-labelledby='add-product-heading' className='mx-auto max-w-[1280px] space-y-5 text-slate-600 dark:text-slate-400'>
        <nav aria-label='Breadcrumb' className='flex flex-wrap items-center gap-2 text-sm'>
          <Link to='/orders' className='hover:text-slate-950 dark:hover:text-slate-100'>Admin</Link><span aria-hidden='true'>›</span>
          <Link to='/list' className='hover:text-slate-950 dark:hover:text-slate-100'>Products</Link><span aria-hidden='true'>›</span>
          <span aria-current='page' className='text-slate-900 dark:text-slate-200'>Add New Item</span>
        </nav>
        <header className='border-l-4 border-amber-400 pl-5'>
          <h1 id='add-product-heading' className='text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl dark:text-slate-100'>Add New Item</h1>
          <p className='mt-1 text-sm leading-6'>Add a new product to the PAMO school merchandise store.</p>
        </header>

        <form onSubmit={onSubmitHandler} className='grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]'>
          <section aria-labelledby='product-details-heading' className={panelClass + ' lg:col-start-1 lg:row-start-1'}>
            <SectionHeading id='product-details-heading' icon='details' title='Product Details' description='Provide the basic information about the product.' />
            <div className='mt-4 space-y-4'>
              <div>
                <label htmlFor='product-name' className={labelClass}>Product Name <span className='text-red-500' aria-hidden='true'>*</span></label>
                <input id='product-name' onChange={(e) => setName(e.target.value)} value={name} className={fieldClass} type='text' placeholder='Enter product name' required />
              </div>
              <div>
                <label htmlFor='product-description' className={labelClass}>Product Description</label>
                <textarea id='product-description' onChange={(e) => setDescription(e.target.value)} value={description} className={fieldClass + ' min-h-28 resize-y'} rows={4} placeholder='Write a detailed description about this product…' />
              </div>
            </div>
          </section>

          <section aria-labelledby='product-images-heading' className={panelClass + ' lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start'}>
            <SectionHeading id='product-images-heading' icon='image' title='Product Images' description='Upload up to 4 images. The first image will be used as the main photo.' />
            <div className='mt-4 space-y-3'>
              <ImageUpload id='image1' file={image1} onChange={setImage1} main />
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                <ImageUpload id='image2' file={image2} onChange={setImage2} />
                <ImageUpload id='image3' file={image3} onChange={setImage3} />
                <ImageUpload id='image4' file={image4} onChange={setImage4} />
              </div>
            </div>
          </section>

          <section aria-labelledby='product-classification-heading' className={panelClass + ' lg:col-start-1 lg:row-start-2'}>
            <SectionHeading id='product-classification-heading' icon='tag' title='Classification & Pricing' description='Set the product gender, program, and price.' />
            <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div>
                <label htmlFor='product-gender' className={labelClass}>Gender</label>
                <select id='product-gender' value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
                  {productGenders.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor='product-program' className={labelClass}>Program</label>
                <select id='product-program' value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className={fieldClass}>
                  {productPrograms.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div className='sm:col-span-2'>
                <label htmlFor='product-price' className={labelClass}>Price (₱)</label>
                <div className='relative'>
                  <span aria-hidden='true' className='pointer-events-none absolute left-3 top-3 text-sm'>₱</span>
                  <input id='product-price' onChange={(e) => setPrice(e.target.value)} value={price} className={fieldClass + ' pl-8'} type='number' placeholder='0' />
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby='product-options-heading' className={panelClass + ' lg:col-span-2'}>
            <SectionHeading id='product-options-heading' icon='options' title='Additional Options' description='Set available sizes and special labels for this product.' />
            <div className='mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
              <fieldset>
                <legend className={labelClass}>Available Sizes / Initial Stock</legend>
                <div className='flex flex-wrap gap-2 sm:gap-3'>
                  {['S', 'M', 'L', 'XL', 'XXL', 'One Size'].map(size => (
                    <button key={size} type='button' aria-pressed={sizes.includes(size)} onClick={() => setSizes(prev => prev.includes(size) ? prev.filter(item => item !== size) : [...prev, size])} className={'min-h-11 min-w-11 rounded-md border px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ' + (sizes.includes(size) ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500')}>
                      {size}
                    </button>
                  ))}
                </div>
                <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3'>
                  {sizes.map(size => <label key={size} className='min-w-0 text-xs'>{size} stock<input aria-label={`Initial stock for ${size}`} type='number' min='0' step='1' required value={inventory[size] ?? 0} onChange={event => setInventory(previous => ({ ...previous, [size]: event.target.value }))} className={fieldClass + ' mt-1'} /></label>)}
                </div>
              </fieldset>
              <fieldset className='border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-slate-800'>
                <legend className={labelClass}>Special Labels</legend>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='flex min-h-11 cursor-pointer items-start gap-3' htmlFor='BestSeller'>
                    <input onChange={() => setBestSeller(prev => !prev)} checked={BestSeller} type='checkbox' id='BestSeller' className='mt-0.5 h-5 w-5 shrink-0 accent-amber-400' />
                    <span><span className='block text-sm font-medium text-slate-900 dark:text-slate-100'>Add to Bestsellers</span><span className='mt-1 block text-xs leading-5'>Show this product in the Best Sellers section</span></span>
                  </label>
                  <label className='flex min-h-11 cursor-pointer items-start gap-3' htmlFor='NewArrival'>
                    <input onChange={() => setNewArrival(prev => !prev)} checked={NewArrival} type='checkbox' id='NewArrival' className='mt-0.5 h-5 w-5 shrink-0 accent-amber-400' />
                    <span><span className='block text-sm font-medium text-slate-900 dark:text-slate-100'>Mark as New Arrival</span><span className='mt-1 block text-xs leading-5'>Show this product in the New Arrivals section</span></span>
                  </label>
                </div>
              </fieldset>
            </div>
          </section>

          <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 lg:col-span-2 dark:border-slate-800'>
            <Link to='/list' className='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'><Icon name='back' /> Cancel</Link>
            <button type='submit' disabled={submitting} className='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-400 px-6 text-sm font-semibold text-slate-950 hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-wait disabled:opacity-60'><Icon name='product' /> {submitting ? 'Adding Product…' : 'Add Product'}</button>
          </div>
        </form>
      </section>
    )
  }

  export default Add
