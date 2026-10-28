export const MAX_MEASUREMENT_FIELDS = 12
export const MAX_MEASUREMENT_CM = 500

export const measurementPresets = {
  tops: [
    { key: 'chest-circumference', label: 'Chest circumference' },
    { key: 'shoulder-width', label: 'Shoulder width' },
    { key: 'garment-length', label: 'Garment length' },
    { key: 'sleeve-length', label: 'Sleeve length' }
  ],
  bottoms: [
    { key: 'waist-circumference', label: 'Waist circumference' },
    { key: 'hip-circumference', label: 'Hip circumference' },
    { key: 'inseam', label: 'Inseam' },
    { key: 'garment-length', label: 'Garment length' }
  ]
}

const fieldKeyPattern = /^[a-z][a-z0-9-]{0,39}$/
const fieldLabelPattern = /^[A-Za-z0-9][A-Za-z0-9 /&()'.,+-]{1,39}$/

const parseGuide = value => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('Measurements must use a valid data format.')
  }
}

const plainValues = values => {
  if (values instanceof Map) return Object.fromEntries(values)
  return values
}

export const emptySizeGuide = () => ({ fields: [], measurements: [] })

export const measurementFieldKey = (label, existingFields = []) => {
  const base = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'measurement'
  const used = new Set(existingFields.map(field => field.key))
  if (!used.has(base)) return base

  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`.slice(0, 40)
}

export const measurementValueError = value => {
  if (value === undefined || value === null || String(value).trim() === '') return ''
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue > MAX_MEASUREMENT_CM) {
    return `Use a value greater than 0 and no more than ${MAX_MEASUREMENT_CM} cm.`
  }
  if (Math.round(numericValue * 100) !== numericValue * 100) {
    return 'Use no more than two decimal places.'
  }
  return ''
}

export const normalizeSizeGuide = (value, sizes) => {
  const guide = parseGuide(value)
  if (guide === undefined || guide === null || guide === '') return undefined
  if (!guide || typeof guide !== 'object' || Array.isArray(guide)) {
    throw new Error('Measurements must use a valid data format.')
  }
  if (!Array.isArray(guide.fields) || !Array.isArray(guide.measurements)) {
    throw new Error('Measurements must include valid fields and sizes.')
  }
  if (guide.fields.length > MAX_MEASUREMENT_FIELDS) {
    throw new Error(`Use no more than ${MAX_MEASUREMENT_FIELDS} measurement fields.`)
  }

  const fields = guide.fields.map(field => ({
    key: typeof field?.key === 'string' ? field.key.trim() : '',
    label: typeof field?.label === 'string' ? field.label.trim().replace(/\s+/g, ' ') : ''
  }))
  const fieldKeys = fields.map(field => field.key)
  const fieldLabels = fields.map(field => field.label.toLowerCase())
  const validFields = fields.every(field => fieldKeyPattern.test(field.key)
      && fieldLabelPattern.test(field.label))
    && new Set(fieldKeys).size === fieldKeys.length
    && new Set(fieldLabels).size === fieldLabels.length
  if (!validFields) {
    throw new Error('Measurement field names must be unique and use 2 to 40 supported characters.')
  }

  const availableSizes = new Set(Array.isArray(sizes) ? sizes : [])
  const seenSizes = new Set()
  const measurements = guide.measurements.map(entry => {
    const size = typeof entry?.size === 'string' ? entry.size : ''
    const rawValues = plainValues(entry?.values)
    if (!availableSizes.has(size) || seenSizes.has(size) || !rawValues
        || typeof rawValues !== 'object' || Array.isArray(rawValues)) {
      throw new Error('Measurements must reference each available size at most once.')
    }
    seenSizes.add(size)

    const values = {}
    for (const [key, rawValue] of Object.entries(rawValues)) {
      if (!fieldKeys.includes(key)) {
        throw new Error('Measurements contain an unknown field.')
      }
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue
      const error = measurementValueError(rawValue)
      if (error) throw new Error(`${fields.find(field => field.key === key)?.label || key}: ${error}`)
      values[key] = Number(rawValue)
    }
    return { size, values }
  }).filter(entry => Object.keys(entry.values).length > 0)
    .sort((left, right) => sizes.indexOf(left.size) - sizes.indexOf(right.size))

  if (fields.length === 0 && measurements.length > 0) {
    throw new Error('Add a measurement field before entering values.')
  }
  return { fields, measurements }
}

export const editableSizeGuide = value => {
  if (!value) return emptySizeGuide()
  const fields = Array.isArray(value.fields)
    ? value.fields.map(field => ({ key: field.key, label: field.label }))
    : []
  const measurements = Array.isArray(value.measurements)
    ? value.measurements.map(entry => ({
        size: entry.size,
        values: { ...(plainValues(entry.values) || {}) }
      }))
    : []
  return { fields, measurements }
}

export const restrictSizeGuideToSizes = (value, sizes) => {
  const availableSizes = new Set(sizes)
  const guide = editableSizeGuide(value)
  return {
    fields: guide.fields,
    measurements: guide.measurements.filter(entry => availableSizes.has(entry.size))
  }
}

export const hasSizeGuideContent = value => {
  return Boolean(value?.fields?.length || value?.measurements?.length)
}
