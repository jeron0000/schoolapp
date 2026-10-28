import { getSizeStock } from '../../../shared/inventory.js'

const restockDateFormatter = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Manila'
})

const manilaDateKey = value => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila'
  }).formatToParts(new Date(value))
  const part = type => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export const getRestockPresentation = (product, sizes, now = Date.now()) => {
  const status = product.restockPlan?.status
  if (status !== 'soon' && status !== 'scheduled') return null

  const unavailableSizes = sizes.filter(value => getSizeStock(product, value) === 0)
  if (unavailableSizes.length === 0) return null

  let availability = 'All product sizes are currently out of stock.'
  if (unavailableSizes.length < sizes.length) {
    availability = `Currently unavailable: ${unavailableSizes.map(value => `Size ${value}`).join(', ')}.`
  }

  if (status === 'soon') {
    return {
      title: 'Restocking Soon',
      detail: `${availability} Timing is estimated and not guaranteed.`
    }
  }

  const estimatedDate = new Date(product.restockPlan.estimatedDate)
  if (Number.isNaN(estimatedDate.getTime())) return null
  const formattedDate = restockDateFormatter.format(estimatedDate)
  if (manilaDateKey(estimatedDate) < manilaDateKey(now)) {
    return {
      title: 'Restock Update Pending',
      detail: `${availability} The estimated restock date was ${formattedDate}; availability is awaiting an update. Estimates are not guaranteed.`
    }
  }

  return {
    title: `Expected Restock: ${formattedDate}`,
    detail: `${availability} This date is an estimate and is not guaranteed.`
  }
}
