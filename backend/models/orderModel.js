import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    items: { type: Array, required: true },
    amount: { type: Number, required: true },
    address: { type: Object, required: true },
    status: { type: String, required: true, default:'Order Placed' },
    paymentMethod: { type: String, required: true },
    paymentCurrency: { type: String },
    payment: { type: Boolean, required: true, default: false },
    sentToCashierAt: { type: Number },
    receiptNumber: { type: String },
    paidAt: { type: Number },
    confirmedBy: { type: String },
    inventoryStatus: { type: String, enum: ['reserved', 'released'] },
    cancellationSource: { type: String, enum: ['customer', 'admin'] },
    requestId: { type: String },
    date: {type: Number, required: true}
})

orderSchema.index({ userId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

const orderModel = mongoose.models.order || mongoose.model('order', orderSchema)
export default orderModel;
