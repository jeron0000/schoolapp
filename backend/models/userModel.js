import mongoose, { mongo } from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Assigned by trusted administration only; registration never accepts roles.
    role: { type: String, enum: ['customer', 'cashier'], default: 'customer' },
    cartData: { type: Object, default: {} }
}, { minimize: false })

const userModel = mongoose.model.user || mongoose.model('user',userSchema);

export default userModel