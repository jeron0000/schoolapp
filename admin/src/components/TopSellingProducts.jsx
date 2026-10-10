import { assets } from '../assets/assets'

const productKey = product => product.productId === null ? 'snapshot:' + product.name : 'product:' + product.productId

const TopSellingProducts = ({ status, products, complete, formatCount, formatMoney }) => {
  const valid = Array.isArray(products) && products.length <= 5
    && products.every(product => product && (product.productId === null || (typeof product.productId === 'string' && product.productId.trim()))
      && typeof product.name === 'string' && product.name.trim()
      && Number.isSafeInteger(product.quantitySold) && product.quantitySold > 0
      && Number.isFinite(product.sales) && product.sales >= 0)
    && new Set(products.map(productKey)).size === products.length
  let message = ''
  if (status === 'loading') message = 'Loading top-selling products…'
  else if (status !== 'success' || !valid || typeof complete !== 'boolean') message = 'Product sales data unavailable.'
  else if (!products.length) message = complete ? 'No product sales yet.' : 'No product sales in the available data. This period is incomplete.'

  if (message) return <div aria-busy={status === 'loading'} className='flex min-h-24 min-w-0 flex-1 items-center justify-center py-6'>
    <p role='status' className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
  </div>

  return <div className='min-w-0 pt-4 [container-type:inline-size]'>
    <ol role='list' aria-label='Top products by quantity sold' className='min-w-0'>
      {products.map((product, index) => <li key={productKey(product)} className='grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-slate-100 py-3 last:border-b-0 [@container(min-width:28rem)]:grid-cols-[2rem_minmax(0,1fr)_12rem] dark:border-slate-800'>
        <span className='text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400'><span className='sr-only'>Rank </span>{formatCount(index + 1)}</span>
        <div className='flex min-w-0 items-start gap-3'>
          <img src={assets.parcel_icon} alt='' className='h-10 w-10 shrink-0 rounded object-contain' />
          <p className='min-w-0 [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-950 dark:text-slate-100'>{product.name}</p>
        </div>
        <div className='col-start-2 min-w-0 [overflow-wrap:anywhere] text-xs leading-5 [@container(min-width:28rem)]:col-start-auto [@container(min-width:28rem)]:text-right'>
          <p className='font-semibold tabular-nums text-slate-950 dark:text-slate-100'>{formatCount(product.quantitySold)} sold</p>
          <p className='mt-1 text-slate-500 dark:text-slate-400'>Merchandise sales</p>
          <p className='font-medium tabular-nums text-slate-700 dark:text-slate-200'>{formatMoney(product.sales)}</p>
        </div>
      </li>)}
    </ol>
    {!complete && <p role='status' className='mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400'>Product sales for this period are incomplete.</p>}
  </div>
}

export default TopSellingProducts
