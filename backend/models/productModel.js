import mongoose from "mongoose";
import { validPhpAmount } from '../../shared/money.js';


const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, validate: validPhpAmount },
    image: { type: Array, required: true },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    sizes: { type: Array, required: true },
    inventory: { type: Map, of: { type: Number, min: 0, validate: Number.isSafeInteger }, default: () => ({}) },
    BestSeller: { type: Boolean },
    NewArrival: { type: Boolean, default: false },
    date: { type: Number, required: true }

})

const productModel = mongoose.models.product || mongoose.model("product",productSchema);

export default productModel
