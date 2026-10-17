import { Package } from './DashboardIcons'

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

  if (message) return <div aria-busy={status === 'loading'} className='dashboard-state'>
    <p role='status'>{message}</p>
  </div>

  return <div className='dashboard-top-products'>
    <ol role='list' aria-label='Top products by quantity sold'>
      {products.map((product, index) => <li key={productKey(product)} className='dashboard-top-product'>
        <span className='dashboard-rank'><span className='sr-only'>Rank </span>{formatCount(index + 1)}</span>
        <div className='dashboard-product-title'>
          <span className='dashboard-product-icon'><Package size={20} aria-hidden='true' /></span>
          <p>{product.name}</p>
        </div>
        <div className='dashboard-product-sales'>
          <p>{formatCount(product.quantitySold)} sold</p>
          <p>Merchandise sales</p>
          <p>{formatMoney(product.sales)}</p>
        </div>
      </li>)}
    </ol>
    {!complete && <p role='status' className='dashboard-panel-note'>Product sales for this period are incomplete.</p>}
  </div>
}

export default TopSellingProducts
