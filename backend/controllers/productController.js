import { v2 as cloudinary } from "cloudinary"
import mongoose from "mongoose"
import productModel from "../models/productModel.js"

// function for add product
const addProduct = async (req, res) => {
    try {
        const { name, description, price, category, subCategory, sizes, BestSeller, NewArrival } = req.body

        const image1 = req.files.image1 && req.files.image1[0]
        const image2 = req.files.image2 && req.files.image2[0]
        const image3 = req.files.image3 && req.files.image3[0]
        const image4 = req.files.image4 && req.files.image4[0]

        const images = [image1, image2, image3, image4].filter((item) => item !== undefined)

        let imagesUrl = await Promise.all(
            images.map(async (item) => {
                let result = await cloudinary.uploader.upload(item.path, { resource_type: 'image' });
                return result.secure_url
            })
        )

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            subCategory,
            BestSeller: BestSeller === true || BestSeller === "true",
            NewArrival: NewArrival === true || NewArrival === "true",
            sizes: JSON.parse(sizes),
            image: imagesUrl,
            date: Date.now()
        }

        console.log(productData);

        const product = new productModel(productData);
        await product.save()


        res.json({ success: true, message: "Product Added" })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for list product
const listProducts = async (req, res) => {
    try {

        const products = await productModel.find({});
        res.json({ success: true, products })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {

        await productModel.findByIdAndDelete(req.body.id)
        res.json({ success: true, message: "Product Removed" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        
        const { productId } = req.body
        const product = await productModel.findById(productId)
        res.json({success:true,product})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
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

        const product = await productModel.findByIdAndUpdate(id, { $set: flags }, { returnDocument: "after", runValidators: true })
        if (!product) return res.json({ success: false, message: "Product not found" })
        res.json({ success: true, message: "Product flags updated", product })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { addProduct, listProducts, removeProduct, singleProduct, updateProductFlags }