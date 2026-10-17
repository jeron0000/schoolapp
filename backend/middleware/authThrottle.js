// Local-only protection: bounded memory, no proxy-header trust or background timers.
export const createAuthThrottle = ({ limit = 20, windowMs = 60000, maxClients = 1000, now = Date.now } = {}) => {
    const clients = new Map();
    return (req, res, next) => {
        const time = now();
        const key = req.ip || req.socket?.remoteAddress || 'unknown';
        let entry = clients.get(key);
        if (entry && entry.resetAt <= time) {
            clients.delete(key);
            entry = undefined;
        }
        if (!entry && clients.size >= maxClients) {
            for (const [client, saved] of clients) if (saved.resetAt <= time) clients.delete(client);
        }
        if ((!entry && clients.size >= maxClients) || (entry && entry.count >= limit)) {
            const retryAfter = Math.max(1, Math.ceil(((entry?.resetAt ?? time + windowMs) - time) / 1000));
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ success: false, message: 'Too many authentication attempts. Please wait and try again.' });
        }
        if (!entry) {
            entry = { count: 0, resetAt: time + windowMs };
            clients.set(key, entry);
        }
        entry.count++;
        res.once('finish', () => {
            // Successful authentication refunds only this request, never other failures.
            if (res.locals.authenticationSucceeded && clients.get(key) === entry) {
                entry.count--;
                if (entry.count === 0) clients.delete(key);
            }
        });
        next();
    };
};
