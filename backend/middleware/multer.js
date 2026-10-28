import multer from 'multer';
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MIME_TYPES } from '../utils/productImages.js';
import { MAX_LISTING_ITEMS } from '../../shared/productVariants.js';

// Keep product images in memory until their signatures are verified and they
// are streamed to Cloudinary. No shared temporary filename is created.
const productUpload = (files, fields, fieldSize) => multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: PRODUCT_IMAGE_MAX_BYTES,
        files,
        fields,
        parts: files + fields,
        fieldSize,
        fieldNameSize: 50,
        fieldArrayIndexLimit: 16
    },
    fileFilter(_req, file, next) {
        if (!PRODUCT_IMAGE_MIME_TYPES.includes(file.mimetype)) {
            return next(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
        }
        next(null, true);
    }
});

const upload = productUpload(4, 32, 64 * 1024);
export const listingUpload = productUpload(MAX_LISTING_ITEMS * 4, 2, MAX_LISTING_ITEMS * 64 * 1024);

export default upload;
