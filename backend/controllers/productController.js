import mongoose from "mongoose"
import productModel from "../models/productModel.js"
import orderModel from "../models/orderModel.js"
import { adjustInventory, validateInitialInventory } from '../utils/inventory.js'
import {
    cleanupProductImages,
    ProductImageError,
    uploadProductImages
} from '../utils/productImages.js'
import { phpFromMinorUnits, phpMinorUnits } from '../../shared/money.js'

// function for add product
const addProduct = async (req, res) => {
    let uploadedImages = []
    let productSaved = false

    try {
        const {
            name,
            description,
            price,
            category,
            subCategory,
            sizes,
            BestSeller,
            NewArrival
        } = req.body

        let validatedPrice
        try {
            validatedPrice = phpFromMinorUnits(phpMinorUnits(price))
        } catch {
            return res.status(400).json({
                success: false,
                message: 'Enter a valid PHP price with at most two decimal places.'
            })
        }

        const selectedSizes = JSON.parse(sizes)
        const inventory = validateInitialInventory(
            selectedSizes,
            JSON.parse(req.body.inventory || '{}')
        )

        const files = req.files || {}
        const image1 = files.image1 && files.image1[0]
        const image2 = files.image2 && files.image2[0]
        const image3 = files.image3 && files.image3[0]
        const image4 = files.image4 && files.image4[0]

        const images = [image1, image2, image3, image4].filter((item) => item !== undefined)

        uploadedImages = await uploadProductImages(images)

        const productData = {
            name,
            description,
            category,
            price: validatedPrice,
            subCategory,
            BestSeller: BestSeller === true || BestSeller === "true",
            NewArrival: NewArrival === true || NewArrival === "true",
            sizes: selectedSizes,
            inventory,
            image: uploadedImages.map(image => image.imageUrl),
            date: Date.now()
        }

        const product = new productModel(productData);
        await product.save()
        productSaved = true

        res.json({ success: true, message: "Product Added" })
    } catch (error) {
        if (productSaved) {
            if (!res.headersSent) {
                return res.status(500).json({
                    success: false,
                    message: 'The product was saved. Refresh the product list before retrying.'
                })
            }
            return
        }

        if (uploadedImages.length) {
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

        res.json({
            success: false,
            message: 'Unable to add product. Check its details and try again.'
        })
    }
}

// function for list product
const listProducts = async (req, res) => {
    try {
        const products = await productModel.find({});
        res.json({ success: true, products })
    } catch {
        res.json({
            success: false,
            message: 'Unable to load products. Please try again.'
        })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        await mongoose.connection.transaction(async session => {
            const reserved = await orderModel.exists({
                'items._id': req.body.id,
                inventoryStatus: 'reserved',
                status: { $nin: ['Claimed', 'Completed', 'Cancelled'] }
            }).session(session)

            if (reserved) throw new Error('This product has active reserved orders and cannot be deleted yet.')

            await productModel.findByIdAndDelete(req.body.id).session(session)
        })

        res.json({ success: true, message: "Product Removed" })
    } catch {
        res.json({
            success: false,
            message: 'Unable to remove product. It may have reserved orders. Refresh and try again.'
        })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        const { productId } = req.body
        const product = await productModel.findById(productId)
        res.json({ success: true, product })
    } catch {
        res.json({
            success: false,
            message: 'Unable to load this product. Please try again.'
        })
    }
}

const updateProductFlags = async (req, res) => {
    try {
        const { id } = req.body
        if (typeof id !== "string" || !mongoose.isObjectIdOrHexString(id)) {
            return res.json({ success: false, message: "Invalid product ID" })
        }

        const flags = {}
        for (const field of ["NewArrival", "BestSeller"]) {
            if (!Object.hasOwn(req.body, field)) continue
            if (typeof req.body[field] !== "boolean") {
                return res.json({ success: false, message: `${field} must be a boolean` })
            }
            flags[field] = req.body[field]
        }
        if (!Object.keys(flags).length) {
            return res.json({ success: false, message: "No product flags provided" })
        }

        const product = await productModel.findByIdAndUpdate(
            id,
            { $set: flags },
            { returnDocument: "after", runValidators: true }
        )

        if (!product) return res.json({ success: false, message: "Product not found" })

        res.json({ success: true, message: "Product flags updated", product })
    } catch {
        res.json({
            success: false,
            message: 'Unable to update product flags. Please try again.'
        })
    }
}

const updateStock = async (req, res) => {
    try {
        const product = await adjustInventory(req.body.id, req.body.adjustments)
        res.json({ success: true, message: 'Stock updated', product })
    } catch {
        res.status(400).json({
            success: false,
            message: 'Unable to update stock. Check the adjustment and try again.'
        })
    }
}

export { addProduct, listProducts, removeProduct, singleProduct, updateProductFlags, updateStock }
