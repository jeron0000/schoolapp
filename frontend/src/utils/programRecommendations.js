import { getStockLabel, getTotalStock } from '../../../shared/inventory.js'
import { getProductAcademicPrograms } from '../../../shared/productTaxonomy.js'
import { groupProductListings } from '../../../shared/productVariants.js'
import { getNewArrivalStatus } from '../../../shared/productLabels.js'

const recommendationLimit = 4

const normalizeProgram = value => {
  if (typeof value !== 'string') return ''
  return value.trim().toLocaleUpperCase('en-US')
}

const getAssignedPrograms = product => (
  [...new Set(
    getProductAcademicPrograms(product)
      .map(normalizeProgram)
      .filter(Boolean),
  )]
)

const getProductTimestamp = product => {
  const catalogDate = Number(product?.date)
  if (Number.isFinite(catalogDate)) return catalogDate

  const createdAt = Date.parse(product?.createdAt)
  return Number.isNaN(createdAt) ? 0 : createdAt
}

const getProductIdentity = (product, index) => {
  const productId = product?._id ?? product?.id
  if (productId !== undefined && productId !== null && String(productId)) {
    return String(productId)
  }
  return `catalog-product-${index}`
}

const compareRankedProducts = (left, right) => {
  const stockDifference = right.totalStock - left.totalStock
  if (stockDifference !== 0) return stockDifference

  const merchandisingDifference = right.merchandisingScore - left.merchandisingScore
  if (merchandisingDifference !== 0) return merchandisingDifference

  const dateDifference = right.productTimestamp - left.productTimestamp
  if (dateDifference !== 0) return dateDifference

  const identityDifference = left.identity.localeCompare(right.identity, 'en-US')
  if (identityDifference !== 0) return identityDifference

  return left.index - right.index
}

export const getProgramRecommendations = (products, academicProgram, now = Date.now()) => {
  const normalizedProgram = normalizeProgram(academicProgram)
  if (!normalizedProgram || !Array.isArray(products)) return []

  const seenProducts = new Set()
  const eligibleProducts = products
    .map((product, index) => {
      const assignedPrograms = getAssignedPrograms(product)
      return {
        product,
        index,
        assignedPrograms,
        identity: getProductIdentity(product, index),
        totalStock: getTotalStock(product),
        merchandisingScore: Number(getNewArrivalStatus(product, now).active)
          + Number(Boolean(product.BestSeller)),
        productTimestamp: getProductTimestamp(product),
      }
    })
    .filter(({ assignedPrograms, identity }) => {
      if (!assignedPrograms.includes(normalizedProgram)) return false
      if (seenProducts.has(identity)) return false
      seenProducts.add(identity)
      return true
    })

  const exclusiveProducts = []
  const sharedProducts = []
  for (const item of eligibleProducts) {
    if (item.assignedPrograms.length === 1) {
      exclusiveProducts.push(item)
    } else {
      sharedProducts.push(item)
    }
  }

  const rankedProducts = [
    ...exclusiveProducts.sort(compareRankedProducts),
    ...sharedProducts.sort(compareRankedProducts),
  ].map(item => item.product)
  return groupProductListings(rankedProducts, products)
    .slice(0, recommendationLimit)
    .map(product => ({
      product,
      stockLabel: getStockLabel(getTotalStock(product)),
    }))
}
