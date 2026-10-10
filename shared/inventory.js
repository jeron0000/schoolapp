// Missing inventory is unavailable, including products created before stock tracking.
export const getInventorySizes = (product) => product?.sizes?.length ? product.sizes : ['One Size'];

export const getSizeStock = (product, size) => {
  if (!product || !getInventorySizes(product).includes(size)) return 0;
  const quantity = product.inventory?.[size];
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
};

export const getTotalStock = (product) =>
  getInventorySizes(product).reduce((total, size) => total + getSizeStock(product, size), 0);

export const getStockLabel = (total) => total === 0 ? 'Out of Stock' : total <= 5 ? 'Low Stock' : 'In Stock';
