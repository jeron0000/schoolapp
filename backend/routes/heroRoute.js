import express from 'express';
import multer from 'multer';
import adminAuth from '../middleware/adminAuth.js';
import heroUpload from '../middleware/heroUpload.js';
import { HeroImageError } from '../utils/heroImages.js';
import { listHeroSlides, listAllHeroSlides, addHeroSlide, updateHeroSlide, removeHeroSlide, reorderHeroSlides } from '../controllers/heroController.js';

const heroRouter = express.Router();
heroRouter.get('/list', listHeroSlides);
heroRouter.get('/admin/list', adminAuth, listAllHeroSlides);
heroRouter.post('/add', adminAuth, heroUpload, addHeroSlide);
heroRouter.patch('/reorder', adminAuth, reorderHeroSlides);
heroRouter.patch('/:id', adminAuth, updateHeroSlide);
heroRouter.delete('/:id', adminAuth, removeHeroSlide);

// Also mounted after the router to catch upstream JSON parse/size failures for this feature only.
export const heroErrorHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HeroImageError) return res.status(error.status).json({ success: false, message: error.message });
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false,
        message: error.code === 'LIMIT_FILE_SIZE' ? 'Hero images must be 5 MiB or smaller.' : 'Upload one image and only the supported metadata fields.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Hero metadata request is too large.' });
    const malformedMultipart = req.is('multipart/form-data') && /Multipart: Boundary not found|Unexpected end of (form|file)|Malformed part header/.test(error.message || '');
    if (error.type === 'entity.parse.failed' || malformedMultipart) return res.status(400).json({ success: false, message: 'Malformed hero image request.' });
    res.status(500).json({ success: false, message: 'Unable to process the hero image request.' });
};

export default heroRouter;
