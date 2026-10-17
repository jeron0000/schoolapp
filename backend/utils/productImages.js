import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { detectImageMimeType } from './imageSignature.js';

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class ProductImageError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export const validateProductImage = file => {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
        throw new ProductImageError('Upload a valid JPEG, PNG or WEBP product image.');
    }
    if (file.buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
        throw new ProductImageError('Product images must be 5 MiB or smaller.', 413);
    }
    if (detectImageMimeType(file.buffer) !== file.mimetype) {
        throw new ProductImageError('Upload a valid JPEG, PNG or WEBP image matching its declared type.');
    }
};

const validUpload = (result, publicId) => {
    try {
        const url = new URL(result?.secure_url);
        return result?.public_id === publicId
            && url.protocol === 'https:'
            && url.hostname === 'res.cloudinary.com'
            && result.resource_type === 'image'
            && ['jpg', 'png', 'webp'].includes(result.format)
            && Number.isSafeInteger(result.width) && result.width > 0
            && Number.isSafeInteger(result.height) && result.height > 0;
    } catch {
        return false;
    }
};

const deleteProductImages = async publicIds => {
    let complete = true;
    for (const publicId of publicIds) {
        try {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
            if (!['ok', 'not found'].includes(result?.result)) complete = false;
        } catch {
            complete = false;
        }
    }
    return complete;
};

const streamProductImage = (file, publicId) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
        public_id: publicId,
        overwrite: false,
        resource_type: 'image',
        allowed_formats: ['jpg', 'png', 'webp']
    }, (error, result) => error ? reject(error) : resolve(result));
    stream.once('error', reject);
    stream.end(file.buffer);
});

export const uploadProductImages = async files => {
    files.forEach(validateProductImage);
    const uploaded = [];

    for (const file of files) {
        const publicId = `pamo/products/${randomUUID()}`;
        try {
            const result = await streamProductImage(file, publicId);
            if (!validUpload(result, publicId)) throw new Error('Invalid image provider response');
            uploaded.push({ imageUrl: result.secure_url, imagePublicId: publicId });
        } catch {
            const cleanupComplete = await deleteProductImages([...uploaded.map(image => image.imagePublicId), publicId]);
            if (!cleanupComplete) {
                throw new ProductImageError('Product image upload failed and remote cleanup could not be confirmed. Contact the administrator before retrying.', 502);
            }
            throw new ProductImageError('Unable to upload the product images. No product was created.', 502);
        }
    }

    return uploaded;
};

export const cleanupProductImages = async images => deleteProductImages(images.map(image => image.imagePublicId));
