export const sizeOptions = ['S', 'M', 'L', 'XL', 'XXL', 'One Size'];

const protectedSizeLabels = new Set(['constructor', 'prototype', '__proto__']);
const sizeLabelPattern = /^[A-Z0-9][A-Z0-9 _-]{0,39}$/i;

export const normalizeSizeLabel = (value) => {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim().replace(/\s+/g, ' ');
  const standardSize = sizeOptions.find(size => size.toLowerCase() === trimmed.toLowerCase());
  return standardSize || trimmed.toUpperCase();
};

export const isValidSizeLabel = (value) => {
  const normalized = normalizeSizeLabel(value);
  return Boolean(normalized)
    && sizeLabelPattern.test(normalized)
    && !protectedSizeLabels.has(normalized.toLowerCase());
};

export const hasSizeLabel = (sizes, value) => {
  const normalized = normalizeSizeLabel(value);
  return sizes.some(size => normalizeSizeLabel(size) === normalized);
};

export const sortSizes = (sizes) => [...sizes].sort((a, b) => {
  const aIndex = sizeOptions.indexOf(a);
  const bIndex = sizeOptions.indexOf(b);
  // Keep unrecognized historical sizes after known sizes, in their original order.
  const aRank = aIndex === -1 ? sizeOptions.length : aIndex;
  const bRank = bIndex === -1 ? sizeOptions.length : bIndex;
  return aRank - bRank;
});

// Missing inventory is unavailable, including products created before stock tracking.
export const getInventorySizes = (product) => product?.sizes?.length ? sortSizes(product.sizes) : ['One Size'];

export const getSizeStock = (product, size) => {
  if (!product || !getInventorySizes(product).includes(size)) return 0;
  const quantity = product.inventory?.[size];
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
};

export const getTotalStock = (product) =>
  getInventorySizes(product).reduce((total, size) => total + getSizeStock(product, size), 0);

export const getStockLabel = (total) => {
  if (total === 0) return 'Out of Stock';
  if (total <= 5) return 'Low Stock';
  return 'In Stock';
};
