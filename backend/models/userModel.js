import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Dynamic program values are validated against the category collection at
    // registration/profile HTTP boundaries; legacy records remain readable.
    academicProgram: { type: String, trim: true },
    // Assigned by trusted administration only; registration never accepts roles.
    role: { type: String, enum: ['customer', 'cashier'], default: 'customer' },
    cartData: { type: Object, default: {} },
    // Optional per-entry revisions; removal keeps a tombstone, without migrating old carts.
    cartVersions: { type: Object }
}, { minimize: false })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel
