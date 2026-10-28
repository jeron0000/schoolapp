import mongoose from 'mongoose';
import { CATEGORY_CODE_PATTERN } from './categoryModel.js';
import { isBuiltInMerchandiseCategory } from '../../shared/productTaxonomy.js';

// Optional: historical orders receive no inferred provider identity or evidence.
const stripePaymentSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    paymentIntentId: { type: String },
    accountId: { type: String, required: true },
    livemode: { type: Boolean, required: true },
    currency: { type: String, enum: ['php'], required: true },
    amountMinor: { type: Number, required: true, validate: value => Number.isSafeInteger(value) && value > 0 },
    chargeId: { type: String },
    verifiedAt: { type: Number },
    eventId: { type: String }
}, { _id: false });

// Optional: no inferred PayPal transaction or currency for historical orders.
const paypalPaymentSchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    captureId: { type: String },
    merchantId: { type: String, required: true },
    environment: { type: String, enum: ['sandbox', 'live'], required: true },
    currency: { type: String, enum: ['PHP'], required: true },
    amountMinor: { type: Number, required: true, validate: value => Number.isSafeInteger(value) && value > 0 },
    verifiedAt: { type: Number },
    eventId: { type: String }
}, { _id: false });

// SR-5B: optional journal only. No defaults on orders, release state or execution flag.
const recoveryOperationSchema = new mongoose.Schema({
    id: { type: String, required: true },
    kind: { type: String, enum: ['create', 'capture', 'close'], required: true },
    requestKey: { type: String, required: true },
    payloadHash: { type: String, required: true },
    bindingHash: { type: String, required: true },
    orderHash: { type: String, required: true },
    state: { type: String, enum: ['planned', 'in_flight', 'unknown', 'resolved'], required: true },
    resultHash: { type: String },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true }
}, { _id: false, strict: 'throw' });

const recoveryDecisionSchema = new mongoose.Schema({
    id: { type: String, required: true },
    inputHash: { type: String, required: true },
    orderHash: { type: String, required: true },
    classification: { type: String, enum: ['excluded', 'verified_paid', 'already_released', 'pending', 'processing', 'retryable', 'terminal_nonpayment', 'manual_review'], required: true },
    reason: { type: String, required: true },
    reconciliationRequired: { type: Boolean, required: true },
    releaseEligible: { type: Boolean, required: true, validate: value => value === false },
    recordedAt: { type: Number, required: true }
}, { _id: false, strict: 'throw' });

const paymentRecoverySchema = new mongoose.Schema({
    revision: { type: Number, required: true, validate: value => Number.isSafeInteger(value) && value >= 0 },
    phase: { type: String, enum: ['hold', 'review'], required: true },
    // Attaching metadata to an existing order never establishes complete historical coverage.
    historyComplete: { type: Boolean, required: true },
    operations: { type: [recoveryOperationSchema], required: true, default: undefined },
    decisions: { type: [recoveryDecisionSchema], required: true, default: undefined }
}, { _id: false, strict: 'throw' });

const studentSnapshotSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    // The controller validates the assigned managed program. Snapshots retain
    // its stable code even after a rename or archive.
    academicProgram: {
        type: String, match: CATEGORY_CODE_PATTERN, required: true,
        validate: value => !isBuiltInMerchandiseCategory(value)
    }
}, { _id: false, strict: 'throw' });

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    items: { type: Array, required: true },
    amount: { type: Number, required: true },
    // Historical delivery orders retain their address. New student orders are
    // campus pickup records and carry an authenticated account snapshot instead.
    address: { type: Object, required() { return !this.student } },
    student: { type: studentSnapshotSchema, required() { return !this.address } },
    fulfillmentMethod: {
        type: String,
        enum: ['campus_pickup'],
        required() { return Boolean(this.student) }
    },
    status: { type: String, required: true, default:'Order Placed' },
    paymentMethod: { type: String, required: true },
    paymentCurrency: { type: String },
    stripePayment: { type: stripePaymentSchema },
    paypalPayment: { type: paypalPaymentSchema },
    paymentRecovery: { type: paymentRecoverySchema },
    payment: { type: Boolean, required: true, default: false },
    demoPayment: { type: new mongoose.Schema({
        mode: { type: String, enum: ['demo'], required: true },
        provider: { type: String, enum: ['stripe', 'paypal'], required: true },
        status: { type: String, enum: ['pending', 'succeeded', 'failed', 'cancelled'], required: true },
        transactionId: { type: String, match: /^DEMO-(STRIPE|PAYPAL)-[a-f0-9-]{36}$/ }
    }, { _id: false, strict: 'throw' }) },
    sentToCashierAt: { type: Number },
    receiptNumber: { type: String },
    paidAt: { type: Number },
    confirmedBy: { type: String },
    inventoryStatus: { type: String, enum: ['reserved', 'released'] },
    cancellationSource: { type: String, enum: ['customer', 'admin'] },
    cancelledAt: { type: Number },
    cancellationRequest: { type: new mongoose.Schema({
        status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true },
        reason: { type: String, required: true, maxlength: 1000 },
        requestedAt: { type: Number, required: true },
        reviewedAt: { type: Number },
        rejectionReason: { type: String, maxlength: 1000 }
    }, { strict: 'throw' }) },
    // Optional, one obligation per order. Later states require a separately
    // authorized refund initiation/confirmation process and evidence schema.
    refund: { type: new mongoose.Schema({
        status: { type: String, enum: ['Refund Required'], required: true },
        requiredAt: { type: Number, required: true, validate: value => Number.isSafeInteger(value) && value > 0 }
    }, { _id: false, strict: 'throw' }) },
    requestId: { type: String },
    // Only newly submitted COD checkouts carry revision evidence; no historical backfill.
    checkoutCart: { type: Object },
    date: {type: Number, required: true}
})

orderSchema.index({ userId: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });
for (const identity of ['sessionId', 'paymentIntentId', 'eventId']) {
    orderSchema.index({ 'stripePayment.accountId': 1, 'stripePayment.livemode': 1, ['stripePayment.' + identity]: 1 }, {
        name: 'stripe_' + identity + '_unique', unique: true,
        partialFilterExpression: { ['stripePayment.' + identity]: { $type: 'string' } }
    });
}

for (const identity of ['orderId', 'captureId', 'eventId']) {
    orderSchema.index({ 'paypalPayment.merchantId': 1, 'paypalPayment.environment': 1, ['paypalPayment.' + identity]: 1 }, {
        name: 'paypal_' + identity + '_unique', unique: true,
        partialFilterExpression: { ['paypalPayment.' + identity]: { $type: 'string' } }
    });
}

const orderModel = mongoose.models.order || mongoose.model('order', orderSchema)
export default orderModel;
