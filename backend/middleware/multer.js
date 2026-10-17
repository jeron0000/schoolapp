import multer from 'multer';
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MIME_TYPES } from '../utils/productImages.js';

// Keep product images in memory until their signatures are verified and they
// are streamed to Cloudinary. No shared temporary filename is created.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: PRODUCT_IMAGE_MAX_BYTES,
        files: 4,
        fields: 9,
        parts: 13,
        fieldSize: 64 * 1024,
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

export default upload;
