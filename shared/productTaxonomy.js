// Existing product API: category stores Gender; subCategory stores Program.
export const productGenders = ['Men', 'Women']
export const PRODUCT_GENDER_NOT_APPLICABLE = 'Not Applicable'
export const assignableProductGenders = [
  ...productGenders,
  PRODUCT_GENDER_NOT_APPLICABLE,
]
export const productPrograms = ['BSHM', 'EXTRA', 'BSBAOM', 'SHS', 'BSIT', 'BSTM', 'BSCpE']
export const academicPrograms = productPrograms.filter(program => program !== 'EXTRA')
export const legacyMerchandiseCategories = ['EXTRA']
export const builtInMerchandiseCategories = [
  { value: 'TOP', label: 'Tops' },
  { value: 'BOTTOM', label: 'Bottoms' },
  { value: 'EXTRA', label: 'Extras' },
]
export const builtInMerchandiseCategoryCodes = builtInMerchandiseCategories.map(option => option.value)
export const defaultManagedClassifications = [
  ...academicPrograms.map(code => ({ code, name: code, scope: 'program' })),
  ...builtInMerchandiseCategories.map(option => ({
    code: option.value,
    name: option.label,
    scope: 'general',
  })),
  ...productGenders.map(code => ({ code, name: code, scope: 'gender' })),
]
export const isBuiltInMerchandiseCategory = value => {
  if (typeof value !== 'string') return false
  const key = value.trim().toLocaleLowerCase('en-US')
  return builtInMerchandiseCategories.some(option => {
    return option.value.toLocaleLowerCase('en-US') === key
      || option.label.toLocaleLowerCase('en-US') === key
  })
}

const uniqueProductAssignments = values => {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter(value => typeof value === 'string' && value))]
}

export const getProductAcademicPrograms = product => {
  if (Array.isArray(product?.academicPrograms)) {
    return uniqueProductAssignments(product.academicPrograms)
      .filter(value => !legacyMerchandiseCategories.includes(value))
  }
  if (!product?.subCategory || legacyMerchandiseCategories.includes(product.subCategory)) return []
  return [product.subCategory]
}

export const getProductGenders = product => {
  if (Array.isArray(product?.genders)) return uniqueProductAssignments(product.genders)
  return product?.category ? [product.category] : []
}

export const getProductMerchandiseCategoryCodes = product => {
  if (Array.isArray(product?.merchandiseCategoryCodes)) {
    return uniqueProductAssignments(product.merchandiseCategoryCodes)
  }
  if (product?.productCategoryCode) return [product.productCategoryCode]
  if (legacyMerchandiseCategories.includes(product?.subCategory)) return [product.subCategory]
  return []
}

const asOptions = values => values.map(value => {
  if (typeof value === 'string') return { value, label: value }
  return { value: value.value, label: value.label }
})

const classificationKey = value => value.normalize('NFKC').toLocaleLowerCase('en-US')

const scopedManagedCategories = (categories, scope) => {
  if (!Array.isArray(categories)) return []
  return categories.filter(category => {
    const validCategory = category
      && category.scope === scope
      && typeof category.code === 'string'
      && typeof category.name === 'string'
    if (!validCategory) return false
    if (scope !== 'program') return true
    return !isBuiltInMerchandiseCategory(category.code)
      && !isBuiltInMerchandiseCategory(category.name)
  })
}

const mergeOptions = (defaultValues, categories, scope) => {
  const defaults = asOptions(defaultValues)
  const managedCategories = scopedManagedCategories(categories, scope)
  const managedByCode = new Map(managedCategories.map(category => (
    [classificationKey(category.code), category]
  )))
  const consumedCodes = new Set()
  const options = []
  const knownValues = new Set()
  const knownLabels = new Set()

  const addOption = option => {
    const valueKey = classificationKey(option.value)
    const labelKey = classificationKey(option.label)
    if (knownValues.has(valueKey) || knownLabels.has(labelKey)) return
    options.push(option)
    knownValues.add(valueKey)
    knownLabels.add(labelKey)
  }

  for (const fallback of defaults) {
    const codeKey = classificationKey(fallback.value)
    const managed = managedByCode.get(codeKey)
    if (!managed) {
      addOption(fallback)
      continue
    }
    consumedCodes.add(codeKey)
    if (managed.active !== false) {
      addOption({ value: managed.code, label: managed.name })
    }
  }

  for (const category of managedCategories) {
    const codeKey = classificationKey(category.code)
    if (consumedCodes.has(codeKey) || category.active === false) continue
    addOption({ value: category.code, label: category.name })
  }

  return options
}

export const getCollectionProgramOptions = categories => (
  mergeOptions(academicPrograms, categories, 'program')
)

export const getAcademicProgramOptions = categories => (
  mergeOptions(academicPrograms, categories, 'program')
)

export const getMerchandiseCategoryOptions = categories => (
  mergeOptions(builtInMerchandiseCategories, categories, 'general')
)

export const getGenderOptions = (categories, { includeNotApplicable = false } = {}) => {
  const options = mergeOptions(productGenders, categories, 'gender')
  if (includeNotApplicable) {
    options.push({
      value: PRODUCT_GENDER_NOT_APPLICABLE,
      label: PRODUCT_GENDER_NOT_APPLICABLE,
    })
  }
  return options
}

const managedClassificationName = (categories, code, scope) => {
  if (!Array.isArray(categories)) return ''
  const codeKey = classificationKey(code)
  const category = categories.find(item => {
    return item?.scope === scope
      && typeof item.code === 'string'
      && classificationKey(item.code) === codeKey
  })
  return category?.name || ''
}

export const getProductCategoryName = (categories, code) => {
  if (typeof code !== 'string' || !code) return ''
  const managedName = managedClassificationName(categories, code, 'general')
  if (managedName) return managedName
  const builtInCategory = builtInMerchandiseCategories.find(option => option.value === code)
  if (builtInCategory) return builtInCategory.label
  return code
}

export const getAcademicProgramName = (categories, code) => {
  if (typeof code !== 'string' || !code) return ''
  if (legacyMerchandiseCategories.includes(code)) return ''
  return managedClassificationName(categories, code, 'program') || code
}

export const getProductGenderName = (categories, code) => {
  if (typeof code !== 'string' || !code) return ''
  if (code === PRODUCT_GENDER_NOT_APPLICABLE) return code
  return managedClassificationName(categories, code, 'gender') || code
}
