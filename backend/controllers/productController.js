import mongoose from 'mongoose'
import { CATEGORY_CODE_PATTERN } from '../models/categoryModel.js'
import orderModel from '../models/orderModel.js'
import productModel from '../models/productModel.js'
import { adjustInventory, replaceProductSizes, validateInitialInventory } from '../utils/inventory.js'
import {
    cleanupProductImages,
    ProductImageError,
    uploadProductImages
} from '../utils/productImages.js'
import {
    addProductPriceChange,
    cancelPendingProductPriceChange,
    getNextProductPriceChangeAt,
    getScheduledProductPriceChanges,
    presentProductPricing,
    presentPublicProduct,
    ProductPricingError,
    replacePendingProductPriceChange,
    scheduleBulkProductPriceChanges
} from '../utils/productPricing.js'
import { phpFromMinorUnits, phpMinorUnits } from '../../shared/money.js'
import { normalizeSizeLabel, sortSizes } from '../../shared/inventory.js'
import { normalizeSizeGuide } from '../../shared/productMeasurements.js'
import { syncRestockAnnouncement } from '../utils/restockAnnouncements.js'
import {
    createProductInVariantGroup, lockVariantAnchor, parseProductOption,
    ProductVariantError, saveProductVariantGroup, unlinkProductVariant
} from '../utils/productVariants.js'
import { MAX_LISTING_ITEMS } from '../../shared/productVariants.js'
import {
    cancelScheduledStockUpdate,
    createScheduledStockUpdate,
    executeDueScheduledStockUpdates,
    presentScheduledStockUpdate,
    resolveDueScheduledStockUpdate,
    ScheduledStockError
} from '../utils/scheduledStock.js'
import { resolveActiveClassification } from '../utils/classificationValidation.js'
import {
    academicPrograms,
    builtInMerchandiseCategoryCodes,
    isBuiltInMerchandiseCategory,
    PRODUCT_GENDER_NOT_APPLICABLE,
    productGenders
} from '../../shared/productTaxonomy.js'

const productImageFields = ['image1', 'image2', 'image3', 'image4']
const productClassificationFields = new Set([
    'category',
    'subCategory',
    'productCategoryCode',
    'academicPrograms',
    'genders',
    'merchandiseCategoryCodes'
])
const toBooleanFlag = value => value === true || value === 'true'

const parseRestockDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
    return date
}

class ProductRemovalError extends Error {
    constructor(message, status, code) {
        super(message)
        this.status = status
        this.code = code
    }
}

const validateProductGender = async value => {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return undefined

    const gender = value.trim()
    if (gender === PRODUCT_GENDER_NOT_APPLICABLE) return gender
    return resolveActiveClassification({
        value: gender,
        scope: 'gender',
        legacyCodes: productGenders
    })
}

const normalizeCategoryCode = value => {
    if (value === null) return null
    if (typeof value !== 'string') return undefined

    const code = value.trim()
    if (builtInMerchandiseCategoryCodes.includes(code)) return code
    return CATEGORY_CODE_PATTERN.test(code) ? code : undefined
}

const validateAcademicProgram = async value => {
    const program = normalizeAcademicProgram(value)
    if (program === undefined) return undefined
    if (program === null) return program
    return resolveActiveClassification({
        value: program,
        scope: 'program',
        legacyCodes: academicPrograms
    })
}

const validateMerchandiseCategory = async value => {
    const code = normalizeCategoryCode(value)
    if (code === undefined) return undefined
    if (code === null) return code
    return resolveActiveClassification({
        value: code,
        scope: 'general',
        legacyCodes: builtInMerchandiseCategoryCodes
    })
}

const normalizeAcademicProgram = value => {
    if (value === null) return null
    if (typeof value !== 'string') return undefined

    const program = value.trim()
    if (isBuiltInMerchandiseCategory(program)) return undefined
    if (academicPrograms.includes(program)) return program
    return CATEGORY_CODE_PATTERN.test(program) ? program : undefined
}

const parseClassificationList = value => {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string') return undefined

    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : undefined
    } catch {
        return undefined
    }
}

const validateAssignmentList = async (value, validateAssignment) => {
    const values = parseClassificationList(value)
    if (!values) return undefined

    const assignments = []
    const uniqueAssignments = new Set()
    for (const valueToValidate of values) {
        const assignment = await validateAssignment(valueToValidate)
        if (assignment === undefined || assignment === null) return undefined
        if (uniqueAssignments.has(assignment)) return undefined
        uniqueAssignments.add(assignment)
        assignments.push(assignment)
    }
    return assignments
}

const validateAcademicProgramAssignments = value => (
    validateAssignmentList(value, validateAcademicProgram)
)

const validateMerchandiseCategoryAssignments = value => (
    validateAssignmentList(value, validateMerchandiseCategory)
)

const validateGenderAssignments = async value => {
    const assignments = await validateAssignmentList(value, validateProductGender)
    if (!assignments) return undefined
    if (assignments.includes('Not Applicable') && assignments.length > 1) return undefined
    return assignments
}

const scalarAssignment = value => value === null ? [] : [value]

const getProductImages = files => {
    return productImageFields
        .map(field => files[field] && files[field][0])
        .filter(image => image !== undefined)
}

const pricingFailure = (res, error, fallbackMessage) => {
    if (error instanceof ProductPricingError) {
        return res.status(error.status).json({ success: false, message: error.message })
    }
    return res.status(500).json({ success: false, message: fallbackMessage })
}

const buildProductData = async body => {
    if (typeof body.name !== 'string' || !body.name.trim() || typeof body.description !== 'string' || !body.description.trim()) {
        throw new ProductVariantError('Enter a product name and description for every item.')
    }
    const {
        name,
        description,
        price,
        category,
        subCategory,
        productCategoryCode,
        sizes,
        BestSeller,
        NewArrival
    } = body

    const hasGenderAssignments = Object.hasOwn(body, 'genders')
    const hasProgramAssignments = Object.hasOwn(body, 'academicPrograms')
    const hasMerchandiseAssignments = Object.hasOwn(
        body,
        'merchandiseCategoryCodes'
    )

    let genderAssignments
    if (hasGenderAssignments) {
        genderAssignments = await validateGenderAssignments(body.genders)
    } else {
        const validatedGender = await validateProductGender(category)
        if (validatedGender !== undefined) {
            genderAssignments = scalarAssignment(validatedGender)
        }
    }
    if (genderAssignments === undefined) {
        throw new ProductVariantError('Select valid product genders without duplicates.')
    }

    let programAssignments
    if (hasProgramAssignments) {
        programAssignments = await validateAcademicProgramAssignments(
            body.academicPrograms
        )
    } else {
        const validatedProgram = await validateAcademicProgram(subCategory ?? null)
        if (validatedProgram !== undefined) {
            programAssignments = scalarAssignment(validatedProgram)
        }
    }
    if (programAssignments === undefined) {
        throw new ProductVariantError('Select active academic programs without duplicates.')
    }

    let merchandiseAssignments
    if (hasMerchandiseAssignments) {
        merchandiseAssignments = await validateMerchandiseCategoryAssignments(
            body.merchandiseCategoryCodes
        )
    } else {
        const validatedMerchandiseCategory = await validateMerchandiseCategory(
            productCategoryCode ?? null
        )
        if (validatedMerchandiseCategory !== undefined) {
            merchandiseAssignments = scalarAssignment(validatedMerchandiseCategory)
        }
    }
    if (merchandiseAssignments === undefined) {
        throw new ProductVariantError('Select active merchandise categories without duplicates.')
    }

    let validatedPrice
    try {
        validatedPrice = phpFromMinorUnits(phpMinorUnits(price))
    } catch {
        throw new ProductVariantError('Enter a valid PHP price with at most two decimal places.')
    }

    let selectedSizes
    let inventory
    try {
        const submittedSizes = JSON.parse(sizes)
        if (!Array.isArray(submittedSizes)) throw new Error('Select valid product sizes.')
        selectedSizes = submittedSizes.map(normalizeSizeLabel)
        const submittedInventory = JSON.parse(body.inventory || '{}')
        const normalizedInventory = Object.fromEntries(
            Object.entries(submittedInventory).map(([size, quantity]) => [normalizeSizeLabel(size), quantity])
        )
        inventory = validateInitialInventory(selectedSizes, normalizedInventory)
    } catch (error) {
        const message = error instanceof SyntaxError ? 'Submit valid sizes and initial stock.' : error.message
        throw new ProductVariantError(message)
    }
    let sizeGuide
    try {
        sizeGuide = normalizeSizeGuide(body.sizeGuide, selectedSizes)
    } catch (error) {
        throw new ProductVariantError(error.message)
    }

    const createdAt = Date.now()
    const newArrival = toBooleanFlag(NewArrival)
    return {
        name,
        description,
        category: genderAssignments[0] ?? null,
        genders: genderAssignments,
        price: validatedPrice,
        subCategory: programAssignments[0] ?? null,
        academicPrograms: programAssignments,
        productCategoryCode: merchandiseAssignments[0] ?? null,
        merchandiseCategoryCodes: merchandiseAssignments,
        BestSeller: toBooleanFlag(BestSeller),
        NewArrival: newArrival,
        ...(newArrival ? { newArrivalMarkedAt: new Date(createdAt) } : {}),
        sizes: sortSizes(selectedSizes),
        inventory,
        ...(sizeGuide ? { sizeGuide } : {}),
        image: [],
        date: createdAt
    }
}

const addProduct = async (req, res) => {
    let uploadedImages = []
    let productSaved = false
    try {
        const productData = await buildProductData(req.body)
        const joiningGroup = req.body.variantGroupId
        const optionLabel = req.body.optionLabel ?? req.body.colorLabel
        if (joiningGroup) {
            if (!mongoose.isObjectIdOrHexString(joiningGroup)) throw new ProductVariantError('Select a valid product listing.')
            parseProductOption(optionLabel)
        }
        uploadedImages = await uploadProductImages(getProductImages(req.files || {}))
        productData.image = uploadedImages.map(image => image.imageUrl)

        if (joiningGroup) {
            await createProductInVariantGroup(productData, joiningGroup, optionLabel, !Object.hasOwn(req.body, 'optionLabel'))
        } else {
            const product = new productModel(productData)
            await product.save()
        }
        productSaved = true

        return res.json({ success: true, message: 'Product Added' })
    } catch (error) {
        if (productSaved || error.hasErrorLabel?.('UnknownTransactionCommitResult')) {
            if (res.headersSent) return
            return res.status(500).json({
                success: false,
                message: 'The product was saved. Refresh the product list before retrying.'
            })
        }

        if (uploadedImages.length > 0) {
            const cleanupComplete = await cleanupProductImages(uploadedImages)
            if (!cleanupComplete) {
                return res.status(502).json({
                    success: false,
                    message: 'Product creation failed and image cleanup could not be confirmed. Contact the administrator before retrying.'
                })
            }
        }

        if (error instanceof ProductImageError) {
            return res.status(error.status).json({
                success: false,
                message: error.message
            })
        }
        if (error instanceof ProductVariantError || error.code === 11000) {
            return res.status(error.status || 409).json({ success: false,
                message: error.code === 11000 ? 'That item label already exists in this listing.' : error.message })
        }

        return res.json({
            success: false,
            message: 'Unable to add product. Check its details and try again.'
        })
    }
}

const addProductListing = async (req, res) => {
    let uploadedImages = []
    let committed = false
    try {
        let items
        try {
            items = JSON.parse(req.body.items)
        } catch {
            throw new ProductVariantError('Submit a valid item list.')
        }
        const groupTitle = typeof req.body.groupTitle === 'string' ? req.body.groupTitle.trim() : ''
        if (!groupTitle || groupTitle.length > 120) throw new ProductVariantError('Enter a listing title up to 120 characters.')
        if (!Array.isArray(items) || items.length < 2 || items.length > MAX_LISTING_ITEMS) {
            throw new ProductVariantError(`A new multi-item listing requires 2–${MAX_LISTING_ITEMS} items.`)
        }
        const options = items.map(item => parseProductOption(item?.optionLabel || item?.name))
        if (new Set(options.map(option => option.colorKey)).size !== items.length) {
            throw new ProductVariantError('Each item label must be unique within the listing.')
        }
        const anchorId = new mongoose.Types.ObjectId()
        const products = []
        const files = []
        const owners = []
        const allowedImageFields = new Set()
        for (const [index, item] of items.entries()) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ProductVariantError('Submit valid product details for every item.')
            const product = await buildProductData(item)
            product._id = index === 0 ? anchorId : new mongoose.Types.ObjectId()
            product.variantGroupId = anchorId
            Object.assign(product, options[index])
            if (index === 0) product.groupTitle = groupTitle
            await new productModel(product).validate()
            products.push(product)
            for (const field of productImageFields) {
                const fileField = `item${index}${field}`
                allowedImageFields.add(fileField)
                for (const file of req.files?.[fileField] || []) {
                    files.push(file)
                    owners.push(index)
                }
            }
        }
        if (Object.keys(req.files || {}).some(field => !allowedImageFields.has(field))) {
            throw new ProductVariantError('Images must belong to an item in this listing.')
        }
        // Upload once outside the retryable transaction; compensation owns all images.
        uploadedImages = await uploadProductImages(files)
        uploadedImages.forEach((image, index) => products[owners[index]].image.push(image.imageUrl))
        await mongoose.connection.transaction(session => productModel.create(products, { session, ordered: true }))
        committed = true
        return res.json({ success: true, message: 'Product listing and all items added.' })
    } catch (error) {
        const uncertainCommit = error.hasErrorLabel?.('UnknownTransactionCommitResult')
        if (committed || uncertainCommit) {
            if (res.headersSent) return
            return res.status(503).json({ success: false, message: 'Creation may have completed. Refresh the Product List before retrying.' })
        }
        if (uploadedImages.length && !await cleanupProductImages(uploadedImages)) {
            return res.status(502).json({ success: false, message: 'Listing creation failed and image cleanup could not be confirmed. Contact the administrator before retrying.' })
        }
        if (error instanceof ProductVariantError || error instanceof ProductImageError) {
            return res.status(error.status).json({ success: false, message: error.message })
        }
        return res.status(500).json({ success: false, message: 'Unable to create this listing. No items were saved. Check the item details and try again.' })
    }
}

const listProducts = async (req, res) => {
    try {
        const pricingTime = Date.now()
        await executeDueScheduledStockUpdates(new Date(pricingTime))
        const products = await productModel.find({})
        return res.json({
            success: true,
            products: products.map(product => presentPublicProduct(product, pricingTime)),
            nextPriceChangeAt: getNextProductPriceChangeAt(products, pricingTime)
        })
    } catch {
        return res.json({
            success: false,
            message: 'Unable to load products. Please try again.'
        })
    }
}

const removeProduct = async (req, res) => {
    const productId = req.body?.id
    if (typeof productId !== 'string' || !mongoose.isObjectIdOrHexString(productId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PRODUCT_ID',
            message: 'Select a valid product to delete.'
        })
    }

    try {
        await mongoose.connection.transaction(async session => {
            const productExists = await productModel.findById(productId).session(session).lean()
            if (!productExists) {
                throw new ProductRemovalError(
                    'This product no longer exists. Refresh the product list.',
                    404,
                    'PRODUCT_NOT_FOUND'
                )
            }

            if (productExists.variantGroupId) {
                const groupId = String(productExists.variantGroupId)
                await lockVariantAnchor(groupId, session)
                if (groupId === productId) {
                    const hasMembers = await productModel.exists({ variantGroupId: groupId, _id: { $ne: productId } }).session(session)
                    if (hasMembers) throw new ProductRemovalError('Unlink this multi-item listing before deleting its anchor product.', 409, 'PRODUCT_HAS_COLOR_VARIANTS')
                }
            }

            const reserved = await orderModel.exists({
                'items._id': productId,
                inventoryStatus: 'reserved',
                status: { $nin: ['Claimed', 'Completed', 'Cancelled'] }
            }).session(session)

            if (reserved) {
                throw new ProductRemovalError(
                    'This product is linked to an active order and cannot be deleted until that order is completed or cancelled.',
                    409,
                    'PRODUCT_HAS_ACTIVE_ORDERS'
                )
            }

            const result = await productModel.deleteOne({ _id: productId }, { session })
            if (result.deletedCount !== 1) {
                throw new ProductRemovalError(
                    'This product no longer exists. Refresh the product list.',
                    404,
                    'PRODUCT_NOT_FOUND'
                )
            }
        })

        return res.json({ success: true, message: 'Product removed.' })
    } catch (error) {
        if (error instanceof ProductRemovalError) {
            return res.status(error.status).json({
                success: false,
                code: error.code,
                message: error.message
            })
        }

        return res.status(500).json({
            success: false,
            code: 'PRODUCT_DELETE_FAILED',
            message: 'Unable to remove this product right now. Please try again.'
        })
    }
}

const singleProduct = async (req, res) => {
    try {
        const { productId } = req.body
        if (mongoose.isObjectIdOrHexString(productId)) {
            await resolveDueScheduledStockUpdate(productId, new Date())
        }
        const product = await productModel.findById(productId)
        return res.json({
            success: true,
            product: presentPublicProduct(product, Date.now())
        })
    } catch {
        return res.json({
            success: false,
            message: 'Unable to load this product. Please try again.'
        })
    }
}

const updateProductVariants = async (req, res) => {
    try {
        const products = await saveProductVariantGroup(req.params.id.toLowerCase(), req.body)
        return res.json({ success: true, message: 'Multiple items saved.', products: products.map(product => presentPublicProduct(product)) })
    } catch (error) {
        return variantFailure(res, error)
    }
}

const removeProductVariant = async (req, res) => {
    try {
        await unlinkProductVariant(req.params.id.toLowerCase())
        return res.json({ success: true, message: 'Item unlinked. Products and stock were preserved.' })
    } catch (error) {
        return variantFailure(res, error)
    }
}

const variantFailure = (res, error) => {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'That item label already exists in this listing.' })
    return res.status(error instanceof ProductVariantError ? error.status : 500).json({ success: false,
        message: error instanceof ProductVariantError ? error.message : 'Unable to update multiple items. Refresh and try again.' })
}

const getProductPricing = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isObjectIdOrHexString(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product.' })
        }

        const product = await productModel.findById(id)
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' })
        }
        return res.json({
            success: true,
            pricing: presentProductPricing(product, Date.now())
        })
    } catch (error) {
        return pricingFailure(res, error, 'Unable to load product pricing. Please try again.')
    }
}

const listScheduledProductPricing = async (_req, res) => {
    try {
        const scheduledChanges = await getScheduledProductPriceChanges(Date.now())
        return res.json({ success: true, scheduledChanges })
    } catch (error) {
        return pricingFailure(res, error, 'Unable to load scheduled price changes. Please try again.')
    }
}

const updateProductPricing = async (req, res) => {
    try {
        const now = Date.now()
        const body = req.body || {}
        const product = await addProductPriceChange({
            id: req.params.id,
            amount: body.price,
            effectiveAt: body.effectiveAt,
            now
        })
        return res.json({
            success: true,
            message: body.effectiveAt ? 'Price change scheduled.' : 'Price updated.',
            pricing: presentProductPricing(product, now)
        })
    } catch (error) {
        return pricingFailure(res, error, 'Unable to update product pricing. Please try again.')
    }
}

const cancelPendingProductPricing = async (req, res) => {
    try {
        const now = Date.now()
        const product = await cancelPendingProductPriceChange({ id: req.params.id, now })
        return res.json({
            success: true,
            message: 'Pending price change cancelled.',
            pricing: presentProductPricing(product, now)
        })
    } catch (error) {
        return pricingFailure(res, error, 'Unable to cancel the pending price change. Please try again.')
    }
}

const replacePendingProductPricing = async (req, res) => {
    try {
        const now = Date.now()
        const body = req.body || {}
        const product = await replacePendingProductPriceChange({
            id: req.params.id,
            pendingChangeId: body.pendingChangeId,
            amount: body.price,
            effectiveAt: body.effectiveAt,
            now
        })
        return res.json({
            success: true,
            message: 'Pending price change replaced.',
            pricing: presentProductPricing(product, now)
        })
    } catch (error) {
        return pricingFailure(res, error, 'Unable to replace the pending price change. Please try again.')
    }
}

const scheduleBulkProductPricing = async (req, res) => {
    try {
        const schedule = await scheduleBulkProductPriceChanges({
            body: req.body,
            now: Date.now()
        })
        return res.status(201).json({
            success: true,
            message: 'Bulk price changes scheduled.',
            schedule
        })
    } catch (error) {
        return pricingFailure(res, error, 'Unable to schedule bulk price changes. Please try again.')
    }
}

const updateProductFlags = async (req, res) => {
    try {
        const { id } = req.body
        if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
            return res.json({ success: false, message: 'Invalid product ID' })
        }

        const flags = {}
        for (const field of ['NewArrival', 'BestSeller']) {
            if (!Object.hasOwn(req.body, field)) continue
            if (typeof req.body[field] !== 'boolean') {
                return res.json({ success: false, message: `${field} must be a boolean` })
            }
            flags[field] = req.body[field]
        }
        if (!Object.keys(flags).length) {
            return res.json({ success: false, message: 'No product flags provided' })
        }

        // Only an explicit NewArrival enable/renew request starts a new window.
        // Other product edits and BestSeller-only changes never touch this date.
        if (flags.NewArrival === true) flags.newArrivalMarkedAt = new Date(Date.now())

        const product = await productModel.findByIdAndUpdate(
            id,
            { $set: flags },
            { returnDocument: 'after', runValidators: true }
        )

        if (!product) return res.json({ success: false, message: 'Product not found' })

        return res.json({ success: true, message: 'Product flags updated', product })
    } catch {
        return res.json({
            success: false,
            message: 'Unable to update product flags. Please try again.'
        })
    }
}

const updateProductCategory = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isObjectIdOrHexString(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product.' })
        }

        const body = req.body || {}
        if (typeof body !== 'object' || Array.isArray(body)) {
            return res.status(400).json({
                success: false,
                message: 'Provide valid product classifications.'
            })
        }

        const fields = Object.keys(body)
        const unsupportedField = fields.find(field => !productClassificationFields.has(field))
        if (fields.length === 0 || unsupportedField) {
            return res.status(400).json({
                success: false,
                message: unsupportedField
                    ? `Unsupported product classification field: ${unsupportedField}.`
                    : 'Provide at least one product classification change.'
            })
        }

        const updates = {}
        if (Object.hasOwn(body, 'genders')) {
            const genders = await validateGenderAssignments(body.genders)
            if (genders === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Select valid product genders without duplicates.'
                })
            }
            updates.genders = genders
            updates.category = genders[0] ?? null
        } else if (Object.hasOwn(body, 'category')) {
            const gender = await validateProductGender(body.category)
            if (gender === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Select a valid product gender.'
                })
            }
            updates.category = gender
            updates.genders = scalarAssignment(gender)
        }

        if (Object.hasOwn(body, 'academicPrograms')) {
            const programs = await validateAcademicProgramAssignments(body.academicPrograms)
            if (programs === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Select active academic programs without duplicates.'
                })
            }
            updates.academicPrograms = programs
            updates.subCategory = programs[0] ?? null
        } else if (Object.hasOwn(body, 'subCategory')) {
            const program = await validateAcademicProgram(body.subCategory)
            if (program === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Select an active academic program.'
                })
            }
            updates.subCategory = program
            updates.academicPrograms = scalarAssignment(program)
        }

        if (Object.hasOwn(body, 'merchandiseCategoryCodes')) {
            const codes = await validateMerchandiseCategoryAssignments(
                body.merchandiseCategoryCodes
            )
            if (codes === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Select active merchandise categories without duplicates.'
                })
            }
            updates.merchandiseCategoryCodes = codes
            updates.productCategoryCode = codes[0] ?? null
        } else if (Object.hasOwn(body, 'productCategoryCode')) {
            const code = await validateMerchandiseCategory(body.productCategoryCode)
            if (code === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Select an active merchandise category.'
                })
            }
            updates.productCategoryCode = code
            updates.merchandiseCategoryCodes = scalarAssignment(code)
        }

        const product = await productModel.findByIdAndUpdate(
            id,
            { $set: updates },
            { returnDocument: 'after', runValidators: true }
        )
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' })
        }

        return res.json({
            success: true,
            message: 'Product category updated.',
            product: presentPublicProduct(product, Date.now())
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: 'Unable to update the product category. Please try again.'
        })
    }
}

const updateStock = async (req, res) => {
    try {
        const product = await adjustInventory(req.body.id, req.body.adjustments)
        return res.json({ success: true, message: 'Stock updated', product })
    } catch {
        return res.status(400).json({
            success: false,
            message: 'Unable to update stock. Check the adjustment and try again.'
        })
    }
}

const scheduledStockError = (res, error, fallback) => {
    const status = error instanceof ScheduledStockError ? error.status : 500
    const message = error instanceof ScheduledStockError ? error.message : fallback
    return res.status(status).json({ success: false, message })
}

const scheduleStockUpdate = async (req, res) => {
    try {
        const result = await createScheduledStockUpdate({
            productId: req.body?.id,
            adjustments: req.body?.adjustments,
            executeAt: req.body?.executeAt
        })
        return res.status(201).json({
            success: true,
            message: 'Stock update scheduled.',
            product: presentPublicProduct(result.product, Date.now()),
            scheduledStockUpdate: result.schedule
        })
    } catch (error) {
        return scheduledStockError(res, error, 'Unable to schedule the stock update.')
    }
}

const getScheduledStockUpdate = async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.params.id)) {
            throw new ScheduledStockError('Invalid product.')
        }
        await resolveDueScheduledStockUpdate(req.params.id, new Date())
        const product = await productModel.findById(req.params.id)
            .select('scheduledStockUpdate')
            .lean()
        if (!product) throw new ScheduledStockError('Product not found.', 404)
        return res.json({
            success: true,
            scheduledStockUpdate: presentScheduledStockUpdate(product.scheduledStockUpdate)
        })
    } catch (error) {
        return scheduledStockError(res, error, 'Unable to load the scheduled stock update.')
    }
}

const cancelStockUpdate = async (req, res) => {
    try {
        const result = await cancelScheduledStockUpdate(req.params.id)
        return res.json({
            success: true,
            message: 'Scheduled stock update cancelled.',
            product: presentPublicProduct(result.product, Date.now()),
            scheduledStockUpdate: result.schedule
        })
    } catch (error) {
        return scheduledStockError(res, error, 'Unable to cancel the scheduled stock update.')
    }
}

const updateProductSizes = async (req, res) => {
    try {
        const product = await replaceProductSizes(req.params.id, req.body?.sizes)
        return res.json({
            success: true,
            message: 'Available sizes updated.',
            product: presentPublicProduct(product, Date.now())
        })
    } catch (error) {
        const status = error.status || 500
        const message = error.status
            ? error.message
            : 'Unable to update available sizes. Please try again.'
        return res.status(status).json({
            success: false,
            code: error.code || 'PRODUCT_SIZE_UPDATE_FAILED',
            message
        })
    }
}

const updateProductMeasurements = async (req, res) => {
    try {
        const id = req.params.id
        if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product.' })
        }
        const current = await productModel.findById(id).lean()
        if (!current) {
            return res.status(404).json({ success: false, message: 'Product not found.' })
        }

        const sizeGuide = normalizeSizeGuide(req.body?.sizeGuide, current.sizes || [])
            || { fields: [], measurements: [] }
        const product = await productModel.findOneAndUpdate(
            { _id: id, sizes: current.sizes || [] },
            { $set: { sizeGuide } },
            { returnDocument: 'after', runValidators: true }
        )
        if (!product) {
            return res.status(409).json({
                success: false,
                message: 'Product sizes changed. Refresh before saving measurements.'
            })
        }
        return res.json({
            success: true,
            message: 'Measurements updated.',
            product: presentPublicProduct(product, Date.now())
        })
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Unable to update measurements.'
        })
    }
}

const updateProductRestock = async (req, res) => {
    try {
        const id = req.params.id
        if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product.' })
        }

        const status = req.body?.status
        const announce = req.body?.announceRestock === true
        const publicationTiming = req.body?.publicationTiming || 'immediate'
        if (req.body?.announceRestock !== undefined && typeof req.body.announceRestock !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Choose whether to announce this restock.' })
        }
        if (announce && !['immediate', 'arrival'].includes(publicationTiming)) {
            return res.status(400).json({ success: false, message: 'Choose a valid announcement publication time.' })
        }
        let update
        if (status === 'none') {
            update = { $unset: { restockPlan: 1 } }
        } else if (status === 'soon') {
            if (announce && publicationTiming === 'arrival') {
                return res.status(400).json({
                    success: false,
                    message: 'An expected arrival date is required for scheduled publication.'
                })
            }
            update = { $set: { restockPlan: { status: 'soon', announce, publicationTiming: 'immediate' } } }
        } else if (status === 'scheduled') {
            const estimatedDate = parseRestockDate(req.body?.estimatedDate)
            if (!estimatedDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Choose a valid estimated restock date.'
                })
            }
            update = {
                $set: {
                    restockPlan: { status: 'scheduled', estimatedDate, announce, publicationTiming }
                }
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Choose a valid restock status.'
            })
        }

        const product = await productModel.findByIdAndUpdate(
            id,
            update,
            { returnDocument: 'after', runValidators: true }
        )
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' })
        }

        await syncRestockAnnouncement(product)

        return res.json({
            success: true,
            message: status === 'none' ? 'Restock plan cleared.' : 'Restock plan updated.',
            product: presentPublicProduct(product, Date.now())
        })
    } catch {
        return res.status(500).json({
            success: false,
            message: 'Unable to update the restock plan. Please try again.'
        })
    }
}

export {
    addProductListing,
    updateProductVariants,
    removeProductVariant,
    addProduct,
    cancelStockUpdate,
    cancelPendingProductPricing,
    getScheduledStockUpdate,
    getProductPricing,
    listScheduledProductPricing,
    listProducts,
    removeProduct,
    scheduleBulkProductPricing,
    scheduleStockUpdate,
    singleProduct,
    updateProductCategory,
    updateProductFlags,
    replacePendingProductPricing,
    updateProductPricing,
    updateProductMeasurements,
    updateProductRestock,
    updateProductSizes,
    updateStock
}
