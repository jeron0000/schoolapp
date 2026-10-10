import multer from 'multer';
import { HERO_MAX_FILE_BYTES, HERO_MIME_TYPES, HeroImageError } from '../utils/heroImages.js';

// One bounded in-memory image avoids leaving temporary files on success or failure.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: HERO_MAX_FILE_BYTES, files: 1, fields: 3, parts: 5, fieldSize: 1024, fieldNameSize: 50 },
    fileFilter(req, file, next) {
        next(HERO_MIME_TYPES.includes(file.mimetype) ? null : new HeroImageError('Only JPEG, PNG and WEBP images are accepted.'), true);
    }
});

export default upload.single('image');
