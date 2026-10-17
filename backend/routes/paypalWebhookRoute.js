import express from 'express';

// Intentionally NOT mounted. Future integration must place this before express.json().
export const createPayPalWebhookRouter = ({ verifier }) => {
    const router = express.Router();
    router.post('/', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).json({ success: false, message: 'Invalid PayPal webhook request.' });
        }
        try {
            const result = await verifier.processWebhook({ rawBody: req.body, headers: req.headers });
            res.json({ success: true, ...result });
        } catch (error) {
            // No acknowledgement of an unsettled payment: provider/database races can retry.
            res.status(error.status || 503).json({ success: false, message: 'PayPal payment requires review or a later verification retry.' });
        }
    });
    router.use((error, _req, res, _next) => {
        res.status(error.status === 413 ? 413 : 400).json({ success: false, message: 'Invalid PayPal webhook request.' });
    });
    return router;
};
