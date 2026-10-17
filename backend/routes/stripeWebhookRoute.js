import express from 'express';

// Intentionally NOT mounted by server.js. Future mounting must precede express.json().
export const createStripeWebhookRouter = ({ stripe, webhookSecret, verifier }) => {
    if (typeof webhookSecret !== 'string' || !/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)) throw new Error('Stripe webhook verification is unavailable.');
    const router = express.Router();
    router.post('/', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
        let event;
        try {
            if (!Buffer.isBuffer(req.body) || typeof req.headers['stripe-signature'] !== 'string') throw new Error();
            event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret, 300);
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid Stripe webhook signature.' });
        }
        try {
            const result = await verifier.processEvent(event);
            res.json({ success: true, ...result });
        } catch (error) {
            // A valid completion notification may precede settlement. No paid write occurred.
            if (error.code === 'not_settled') return res.json({ success: true, paid: false, pending: true });
            res.status(error.status || 503).json({ success: false, message: 'Stripe payment requires review or a later verification retry.' });
        }
    });
    router.use((error, _req, res, _next) => {
        res.status(error.status === 413 ? 413 : 400).json({ success: false, message: 'Invalid Stripe webhook request.' });
    });
    return router;
};
