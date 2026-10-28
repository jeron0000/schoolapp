import mongoose from 'mongoose';
import heroModel, { HERO_CAROUSEL_FILTER, HERO_FALLBACK_ID } from '../models/heroSlideModel.js';
import { HERO_SORT, HeroImageError, heroId, parseHeroMetadata, parseHeroOrder, validateHeroFile, uploadHeroImage, deleteHeroImage } from '../utils/heroImages.js';

const publicSlide = ({ _id, imageUrl, altText, sortOrder }) => ({ _id, imageUrl, altText, sortOrder });
const adminSlide = slide => ({ ...publicSlide(slide), isActive: slide.isActive, deletionPending: slide.deletionPending, createdAt: slide.createdAt, updatedAt: slide.updatedAt });
const failed = (res, error, fallback) => {
    if (!res.headersSent) res.status(error instanceof HeroImageError ? error.status : 500).json({ success: false, message: error instanceof HeroImageError ? error.message : fallback });
};
const fallbackFilter = { _id: HERO_FALLBACK_ID, role: 'fallback' };
const readFallback = () => heroModel.findOne(fallbackFilter, { imageUrl: 1, altText: 1, deletionPending: 1 }).lean();
const fallbackImage = record => record && !record.deletionPending ? publicSlide(record) : null;

export const listHeroSlides = async (req, res) => {
    try {
        const [slides, fallback] = await Promise.all([
            heroModel.find({ ...HERO_CAROUSEL_FILTER, isActive: true, deletionPending: false }, { imageUrl: 1, altText: 1, sortOrder: 1 }).sort(HERO_SORT).lean(),
            readFallback()
        ]);
        res.json({ success: true, slides: slides.map(publicSlide), fallback: fallbackImage(fallback) });
    } catch { res.status(500).json({ success: false, message: 'Unable to load hero images.' }); }
};

export const listAllHeroSlides = async (req, res) => {
    try {
        const [slides, fallback] = await Promise.all([
            heroModel.find(HERO_CAROUSEL_FILTER, { imageUrl: 1, altText: 1, isActive: 1, deletionPending: 1, sortOrder: 1, createdAt: 1, updatedAt: 1 }).sort(HERO_SORT).lean(),
            readFallback()
        ]);
        res.json({ success: true, slides: slides.map(adminSlide), fallback: fallback ? { ...publicSlide(fallback), deletionPending: fallback.deletionPending } : null });
    } catch { res.status(500).json({ success: false, message: 'Unable to load managed hero images.' }); }
};

export const addHeroSlide = async (req, res) => {
    let asset;
    let saved = false;
    try {
        const metadata = parseHeroMetadata(req.body, true);
        validateHeroFile(req.file);
        if (metadata.sortOrder === undefined) {
            const last = await heroModel.findOne(HERO_CAROUSEL_FILTER, { sortOrder: 1 }).sort({ sortOrder: -1, _id: -1 }).lean();
            if (last && (!Number.isSafeInteger(last.sortOrder) || last.sortOrder < 0 || last.sortOrder >= Number.MAX_SAFE_INTEGER)) throw new HeroImageError('The display order cannot be appended. Reorder the hero images first.', 409);
            metadata.sortOrder = last ? last.sortOrder + 1 : 0;
        }
        asset = await uploadHeroImage(req.file);
        const slide = await heroModel.create({ ...asset, ...metadata });
        saved = true;
        res.status(201).json({ success: true, message: 'Hero image added.', slide: adminSlide(slide) });
    } catch (error) {
        if (asset && !saved) {
            try { await deleteHeroImage(asset.imagePublicId); }
            catch {
                console.error('Hero persistence compensation requires cleanup:', asset.imagePublicId);
                return res.status(502).json({ success: false, message: 'Hero image could not be saved and remote cleanup also failed. Contact the administrator before retrying.' });
            }
        }
        failed(res, error, saved ? 'Hero image was saved, but its response could not be sent. Refresh the managed list before retrying.' : 'Unable to save the hero image.');
    }
};

export const updateHeroSlide = async (req, res) => {
    try {
        const id = heroId(req.params.id), metadata = parseHeroMetadata(req.body);
        const slide = await heroModel.findOneAndUpdate({ _id: id, deletionPending: false }, { $set: metadata }, { returnDocument: 'after', runValidators: true });
        if (!slide) {
            if (await heroModel.exists({ _id: id })) throw new HeroImageError('This hero image is pending deletion. Retry deletion instead of editing it.', 409);
            throw new HeroImageError('Hero image not found.', 404);
        }
        res.json({ success: true, message: 'Hero image updated.', slide: adminSlide(slide) });
    } catch (error) { failed(res, error, 'Unable to update the hero image.'); }
};

export const removeHeroSlide = async (req, res) => {
    let pending;
    try {
        const id = heroId(req.params.id);
        pending = await heroModel.findByIdAndUpdate(id, { $set: { isActive: false, deletionPending: true } }, { returnDocument: 'after', runValidators: true });
        if (!pending) throw new HeroImageError('Hero image not found.', 404);
        await deleteHeroImage(pending.imagePublicId);
        const deleted = await heroModel.deleteOne({ _id: id, imagePublicId: pending.imagePublicId, deletionPending: true });
        if (deleted.deletedCount !== 1) throw new HeroImageError('The hero image record changed or was already deleted. Refresh the managed list.', 409);
        res.json({ success: true, message: 'Hero image deleted.' });
    } catch (error) { failed(res, error, pending ? 'Hero image was marked inactive, but deletion could not be confirmed. Refresh the managed list or retry deletion.' : 'Unable to begin hero image deletion.'); }
};

export const reorderHeroSlides = async (req, res) => {
    try {
        const ids = parseHeroOrder(req.body);
        await mongoose.connection.transaction(async session => {
            const slides = await heroModel.find(HERO_CAROUSEL_FILTER, { _id: 1 }).session(session).lean();
            const existing = new Set(slides.map(slide => String(slide._id)));
            if (ids.some(id => !existing.has(id))) throw new HeroImageError('A hero image no longer exists. Refresh the managed list.', 404);
            if (ids.length !== existing.size) throw new HeroImageError('Include every managed hero image when reordering. Refresh the list.', 409);
            if (!ids.length) return;
            const operations = ids.map((id, sortOrder) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder } } } }));
            const result = await heroModel.bulkWrite(operations, { session, ordered: true });
            if (result.matchedCount !== ids.length) throw new HeroImageError('The hero image list changed. Refresh and retry ordering.', 409);
        });
        res.json({ success: true, message: 'Hero image order updated.' });
    } catch (error) { failed(res, error, 'Unable to confirm hero image ordering. Refresh the managed list before retrying.'); }
};

// The first active slide is the default. Reuse saved ordering rather than
// maintaining a second default flag that could disagree with carousel order.
export const setDefaultHeroSlide = async (req, res) => {
    try {
        const id = heroId(req.params.id);
        await mongoose.connection.transaction(async session => {
            const slides = await heroModel.find(HERO_CAROUSEL_FILTER, { _id: 1, deletionPending: 1 }).sort(HERO_SORT).session(session).lean();
            const selected = slides.find(slide => String(slide._id) === id);
            if (!selected) throw new HeroImageError('Hero image not found. Refresh the managed list.', 404);
            if (selected.deletionPending) throw new HeroImageError('This image is pending deletion and cannot be the default.', 409);
            const ordered = [selected, ...slides.filter(slide => String(slide._id) !== id)];
            const operations = ordered.map((slide, sortOrder) => {
                const filter = { _id: slide._id };
                const values = { sortOrder };
                if (sortOrder === 0) {
                    filter.deletionPending = false;
                    values.isActive = true;
                }
                return { updateOne: { filter, update: { $set: values } } };
            });
            const result = await heroModel.bulkWrite(operations, { session, ordered: true });
            if (result.matchedCount !== slides.length) throw new HeroImageError('The hero image list changed. Refresh and retry.', 409);
        });
        res.json({ success: true, message: 'Default hero image updated.' });
    } catch (error) { failed(res, error, 'Unable to set the default hero image. Refresh the managed list before retrying.'); }
};

export const replaceFallbackHeroImage = async (req, res) => {
    let asset;
    let saved = false;
    try {
        const metadata = parseHeroMetadata(req.body, true);
        if (Object.keys(req.body).some(key => key !== 'altText')) throw new HeroImageError('Only an image and altText are supported for the default Hero image.');
        asset = await uploadHeroImage(req.file);
        // A fixed _id provides singleton persistence without another collection/index.
        // Returning the previous value makes concurrent replacements clean up only
        // the asset they actually replaced, never another request's current image.
        const previous = await heroModel.findOneAndUpdate(
            { ...fallbackFilter, deletionPending: false },
            { $set: { ...asset, altText: metadata.altText, role: 'fallback', isActive: false, sortOrder: 0, deletionPending: false } },
            { upsert: true, returnDocument: 'before', runValidators: true }
        );
        saved = true;
        if (previous) await deleteHeroImage(previous.imagePublicId);
        res.json({ success: true, message: 'Default Hero image replaced.' });
    } catch (error) {
        if (asset && !saved) {
            try {
                // An interrupted write can have committed. Never destroy a live asset.
                const current = await heroModel.findOne(fallbackFilter, { imagePublicId: 1 }).lean();
                if (current?.imagePublicId !== asset.imagePublicId) await deleteHeroImage(asset.imagePublicId);
            } catch {
                console.error('Default Hero image cleanup requires review:', asset.imagePublicId);
                return failed(res, new HeroImageError('Unable to confirm default image persistence or cleanup. Refresh before retrying.', 502));
            }
        }
        if (saved) return failed(res, new HeroImageError('The replacement was saved, but previous image cleanup or its response could not be confirmed. Refresh before retrying.', 502));
        if (error.code === 11000) return failed(res, new HeroImageError('The default image changed or is pending reset. Refresh and retry.', 409));
        failed(res, error, 'Unable to replace the default Hero image.');
    }
};

export const resetFallbackHeroImage = async (req, res) => {
    try {
        const pending = await heroModel.findOneAndUpdate(fallbackFilter,
            { $set: { deletionPending: true, isActive: false } }, { returnDocument: 'after', runValidators: true });
        if (pending) {
            await deleteHeroImage(pending.imagePublicId);
            const result = await heroModel.deleteOne({ ...fallbackFilter, imagePublicId: pending.imagePublicId, deletionPending: true });
            if (result.deletedCount !== 1) throw new HeroImageError('Default image reset changed concurrently. Refresh before retrying.', 409);
        }
        res.json({ success: true, message: 'Original Hero image restored.' });
    } catch (error) { failed(res, error, 'Unable to confirm default image reset. Refresh or retry Reset to Original.'); }
};
