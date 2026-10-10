import mongoose from 'mongoose';

export const HERO_ALT_TEXT_LIMIT = 250;
export const HERO_PUBLIC_ID_PATTERN = /^pamo\/hero\/[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
export const validHeroAltText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= HERO_ALT_TEXT_LIMIT && !/[\u0000-\u001f\u007f\u2028\u2029]/.test(value);
export const secureHeroUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
};

const heroSlideSchema = new mongoose.Schema({
    imageUrl: { type: String, required: true, validate: secureHeroUrl },
    imagePublicId: { type: String, required: true, unique: true, match: HERO_PUBLIC_ID_PATTERN },
    altText: { type: String, required: true, trim: true, maxlength: HERO_ALT_TEXT_LIMIT, validate: validHeroAltText },
    isActive: { type: Boolean, default: false, required: true },
    sortOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    // A failed remote/DB deletion remains hidden and cannot be reactivated.
    deletionPending: { type: Boolean, default: false, required: true }
}, { timestamps: true });

heroSlideSchema.index({ isActive: 1, deletionPending: 1, sortOrder: 1, _id: 1 });

const heroModel = mongoose.models.heroSlide || mongoose.model('heroSlide', heroSlideSchema);
export default heroModel;
