import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { detectImageMimeType } from './imageSignature.js';
import { HERO_ALT_TEXT_LIMIT, HERO_PUBLIC_ID_PATTERN, validHeroAltText, secureHeroUrl } from '../models/heroSlideModel.js';

export const HERO_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const HERO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const HERO_SORT = { sortOrder: 1, _id: 1 };

export class HeroImageError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

export const heroId = value => {
    if (typeof value !== 'string' || !mongoose.isObjectIdOrHexString(value)) throw new HeroImageError('Invalid hero image ID.');
    return value.toLowerCase();
};

export const parseHeroMetadata = (body, creating = false) => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['altText', 'isActive', 'sortOrder'].includes(key))) {
        throw new HeroImageError('Only altText, isActive and sortOrder are supported.');
    }
    const metadata = {};
    if (creating || Object.hasOwn(body, 'altText')) {
        if (!validHeroAltText(body.altText)) throw new HeroImageError(`Alt text must be a non-empty, single-line string of at most ${HERO_ALT_TEXT_LIMIT} characters.`);
        metadata.altText = body.altText.trim();
    }
    if (Object.hasOwn(body, 'isActive')) {
        const value = creating && ['true', 'false'].includes(body.isActive) ? body.isActive === 'true' : body.isActive;
        if (typeof value !== 'boolean') throw new HeroImageError('isActive must be a boolean.');
        metadata.isActive = value;
    } else if (creating) metadata.isActive = false;
    if (Object.hasOwn(body, 'sortOrder')) {
        const value = creating && typeof body.sortOrder === 'string' && /^(0|[1-9]\d*)$/.test(body.sortOrder) ? Number(body.sortOrder) : body.sortOrder;
        if (!Number.isSafeInteger(value) || value < 0) throw new HeroImageError('sortOrder must be a non-negative safe integer.');
        metadata.sortOrder = value;
    }
    if (!Object.keys(metadata).length) throw new HeroImageError('Provide hero image metadata to update.');
    return metadata;
};

export const parseHeroOrder = body => {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Array.isArray(body.orderedIds)) throw new HeroImageError('Provide an orderedIds array.');
    const ids = body.orderedIds.map(heroId);
    if (new Set(ids).size !== ids.length) throw new HeroImageError('Hero image IDs must be unique.');
    return ids;
};

export const validateHeroFile = file => {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new HeroImageError('A hero image file is required.');
    if (file.buffer.length > HERO_MAX_FILE_BYTES) throw new HeroImageError('Hero images must be 5 MiB or smaller.', 413);
    const type = detectImageMimeType(file.buffer);
    if (!type || type !== file.mimetype) throw new HeroImageError('Upload a valid JPEG, PNG or WEBP image matching its declared type.');
};

export const deleteHeroImage = async publicId => {
    if (typeof publicId !== 'string' || !HERO_PUBLIC_ID_PATTERN.test(publicId)) throw new HeroImageError('The stored hero asset identifier is invalid. Contact the administrator.', 502);
    try {
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
        if (!['ok', 'not found'].includes(result?.result)) throw new Error('Cleanup not confirmed');
    } catch { throw new HeroImageError('Hero image cleanup could not be confirmed. The inactive record can be deleted again to retry.', 502); }
};

export const uploadHeroImage = async file => {
    validateHeroFile(file);
    const publicId = `pamo/hero/${randomUUID()}`;
    try {
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({ public_id: publicId, overwrite: false, resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp'] },
                (error, uploaded) => error ? reject(error) : resolve(uploaded));
            stream.once('error', reject);
            stream.end(file.buffer);
        });
        if (result?.public_id !== publicId || !secureHeroUrl(result?.secure_url) || result.resource_type !== 'image' || !['jpg', 'png', 'webp'].includes(result.format)
            || !Number.isSafeInteger(result.width) || result.width <= 0 || !Number.isSafeInteger(result.height) || result.height <= 0) throw new Error('Invalid image provider response');
        return { imageUrl: result.secure_url, imagePublicId: result.public_id };
    } catch {
        // The server-generated ID is safe to compensate even after an uncertain upload result.
        try { await deleteHeroImage(publicId); }
        catch {
            console.error('Hero upload compensation requires cleanup:', publicId);
            throw new HeroImageError('Hero upload failed and remote cleanup could not be confirmed. Contact the administrator before retrying.', 502);
        }
        throw new HeroImageError('Unable to upload the hero image. No hero record was created.', 502);
    }
};
