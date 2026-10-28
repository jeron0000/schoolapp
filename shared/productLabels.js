export const NEW_ARRIVAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000

const validTime = value => {
  if (value === undefined || value === null || value === '') return null
  if (!['number', 'string'].includes(typeof value) && !(value instanceof Date)) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time > 0 ? time : null
}

// Keep the saved flag intact for Admin renewal. Expiration is read-time only.
export const getNewArrivalStatus = (product, now = Date.now()) => {
  const markedAt = product?.newArrivalMarkedAt == null
    ? validTime(product?.date)
    : validTime(product.newArrivalMarkedAt)
  const expiresAt = markedAt === null ? null : validTime(markedAt + NEW_ARRIVAL_DURATION_MS)
  const enabled = product?.NewArrival === true
  const active = enabled && expiresAt !== null && now >= markedAt && now < expiresAt
  return { enabled, active, expired: enabled && !active, expiresAt }
}
