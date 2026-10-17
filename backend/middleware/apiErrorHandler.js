import multer from 'multer';

export const apiErrorHandler = (error, req, res, next) => {
    if (res.headersSent) return next(new Error('Unable to finish the request.'));
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'Request is too large.' });
    }
    if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Request must contain valid JSON.' });
    }
    if (error instanceof multer.MulterError) {
        return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
            .json({ success: false, message: 'Unable to accept this upload. Check the files and try again.' });
    }
    const malformedMultipart = typeof req.is === 'function' && req.is('multipart/form-data')
        && /Multipart: Boundary not found|Unexpected end of (form|file)|Malformed part header/.test(error?.message || '');
    if (malformedMultipart) {
        return res.status(400).json({ success: false, message: 'Malformed upload request.' });
    }
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
        return res.status(error.status).json({ success: false, message: 'Unable to process this request. Check its format and try again.' });
    }
    return res.status(500).json({ success: false, message: 'Unable to process your request. Please try again.' });
};
