import { assets } from '../assets/assets'
import { getStockLabel } from '../../../shared/inventory'

const StockSize = ({ size, stock, formatCount }) => {
  const label = getStockLabel(stock)
  return <li className='min-w-0 max-w-full [overflow-wrap:anywhere] text-xs leading-5'>
    <p className='text-slate-600 dark:text-slate-300'>{size}: <span className='font-semibold tabular-nums text-slate-950 dark:text-slate-100'>{formatCount(stock)}</span> remaining</p>
    <p className={label === 'Out of Stock' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}>{label}</p>
  </li>
}

const LowStockProducts = ({ status, products, formatCount }) => {
  const valid = Array.isArray(products) && products.length <= 5
    && products.every(product => product && typeof product.productId === 'string' && product.productId.trim()
      && typeof product.name === 'string' && product.name.trim()
      && Array.isArray(product.affectedSizes) && product.affectedSizes.length > 0
      && product.affectedSizes.every(entry => entry && typeof entry.size === 'string' && entry.size.trim()
        && Number.isSafeInteger(entry.stock) && entry.stock >= 0 && getStockLabel(entry.stock) !== 'In Stock')
      && new Set(product.affectedSizes.map(entry => entry.size)).size === product.affectedSizes.length)
    && new Set(products.map(product => product.productId)).size === products.length
  let message = ''
  if (status === 'loading') message = 'Loading low-stock products…'
  else if (status !== 'success' || !valid) message = 'Low-stock data unavailable.'
  else if (!products.length) message = 'Inventory levels look healthy.'

  if (message) return <div aria-busy={status === 'loading'} className='flex min-h-32 min-w-0 flex-1 items-center justify-center py-6'>
    <p role='status' className='max-w-xs text-center text-sm leading-6 text-slate-500 dark:text-slate-400'>{message}</p>
  </div>

  return <ul role='list' aria-label='Products needing restocking, most urgent first' className='min-w-0 pt-4'>
    {products.map(product => <li key={product.productId} className='min-w-0 border-b border-slate-100 py-3 last:border-b-0 dark:border-slate-800'>
      <div className='flex min-w-0 items-start gap-3'>
        <img src={assets.parcel_icon} alt='' className='h-10 w-10 shrink-0 rounded object-contain' />
        <div className='min-w-0 flex-1'>
          <p className='[overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-950 dark:text-slate-100'>{product.name}</p>
          <ul role='list' aria-label='Affected sizes and remaining stock' className='mt-2 flex min-w-0 flex-wrap gap-x-5 gap-y-2'>
            {product.affectedSizes.map(entry => <StockSize key={entry.size} {...entry} formatCount={formatCount} />)}
          </ul>
        </div>
      </div>
    </li>)}
  </ul>
}

export default LowStockProducts
