import { getStockLabel } from '../../../shared/inventory'
import { ChevronDown, Package } from './DashboardIcons'

const StockSize = ({ size, stock, formatCount }) => {
  const label = getStockLabel(stock)
  return <li className={'dashboard-stock-size ' + (label === 'Out of Stock' ? 'is-out' : 'is-low')}>
    <p>{size}</p><p className='dashboard-stock-quantity'>{formatCount(stock)}</p><p>remaining · {label}</p>
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

  if (message) return <div aria-busy={status === 'loading'} className='dashboard-state'>
    <p role='status'>{message}</p>
  </div>

  return <>
  <ul role='list' aria-label='Products needing restocking, most urgent first' className='dashboard-stock-list'>
    {products.map(product => {
      const unavailable = product.affectedSizes.filter(entry => getStockLabel(entry.stock) === 'Out of Stock').length
      const low = product.affectedSizes.length - unavailable
      return <li key={product.productId} className='dashboard-stock-item'>
      <div className='dashboard-product-title'><span className='dashboard-product-icon'><Package size={20} aria-hidden='true' /></span><h3>{product.name}</h3></div>
      <p className={'dashboard-stock-summary ' + (unavailable ? 'is-out' : 'is-low')}>{unavailable
        ? `Out of Stock · ${formatCount(unavailable)} ${unavailable === 1 ? 'size unavailable' : 'sizes unavailable'}${low ? ` · ${formatCount(low)} low-stock ${low === 1 ? 'size' : 'sizes'}` : ''}`
        : `Low Stock · ${formatCount(low)} ${low === 1 ? 'size needs' : 'sizes need'} restocking`}</p>
      <details className='dashboard-stock-details'>
        <summary>Size breakdown<ChevronDown size={16} aria-hidden='true' /></summary>
          <ul role='list' aria-label={`Affected sizes and remaining stock for ${product.name}`} className='dashboard-stock-sizes'>
            {product.affectedSizes.map(entry => <StockSize key={entry.size} {...entry} formatCount={formatCount} />)}
          </ul>
      </details>
    </li>})}
  </ul>
  <p className='dashboard-panel-note'>Inspect each size breakdown for exact available quantities.</p>
  </>
}

export default LowStockProducts
