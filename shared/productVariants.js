export const normalizeColorLabel = value => {
  if (typeof value !== 'string') return ''
  const label = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .&'()/-]{0,39}$/u.test(label)) return ''
  return label
}

export const colorKey = value => normalizeColorLabel(value).toLocaleLowerCase('en-US')

export const MAX_LISTING_ITEMS = 8

export const normalizeOptionLabel = value => {
  if (typeof value !== 'string') return ''
  const label = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,&'+()/-]{0,79}$/u.test(label)) return ''
  return label
}

export const optionKey = value => normalizeOptionLabel(value).toLocaleLowerCase('en-US')

// Managed item labels take precedence; existing color groups need no migration.
export const getProductOptionLabel = product => product?.optionLabel ?? product?.colorLabel ?? ''

// Input order already owns filtering/ranking. Keep the first matching item as
// the image and deep-link representative, and count groups before pagination.
export const groupProductListings = (products, catalog = products) => {
  const byId = new Map(catalog.map(product => [String(product._id), product]))
  const groups = new Map()
  const listings = []
  for (const product of products) {
    const groupId = String(product.variantGroupId || '')
    const anchor = byId.get(groupId)
    const validGroup = anchor && String(anchor.variantGroupId) === groupId && getProductOptionLabel(product)
    if (!validGroup) {
      listings.push(product)
      continue
    }
    let listing = groups.get(groupId)
    if (!listing) {
      listing = { ...product, name: anchor.groupTitle || product.name, priceFrom: false }
      groups.set(groupId, listing)
      listings.push(listing)
    }
    if (product.price !== listing.price) listing.priceFrom = true
    listing.price = Math.min(listing.price, product.price)
  }
  return listings
}
