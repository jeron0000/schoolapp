import cors from 'cors';

export const LOCAL_API_HOST = 'localhost';
export const LOCAL_UI_ORIGINS = ['localhost', '127.0.0.1', '[::1]'].flatMap(host =>
    [5173, 5174, 4173, 4174].map(port => `http://${host}:${port}`));

export const allowedOrigins = env => {
    const production = env.NODE_ENV === 'production' || env.VERCEL === '1';
    const configured = (env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (production && configured.length === 0) {
        throw new Error('Configure explicit HTTPS CORS_ALLOWED_ORIGINS before deployment.');
    }
    for (const origin of configured) {
        let url;
        try {
            url = new URL(origin);
        } catch {
            throw new Error('CORS_ALLOWED_ORIGINS contains an invalid origin.');
        }
        const validProtocol = url.protocol === 'https:' || (!production && url.protocol === 'http:');
        if (!validProtocol || url.origin !== origin || url.username || url.password) {
            throw new Error('CORS_ALLOWED_ORIGINS must contain exact permitted origins.');
        }
    }
    if (production) return configured;
    return [...LOCAL_UI_ORIGINS, ...configured];
};

export const configureLocalApiSecurity = (app, env = process.env) => {
    const origins = allowedOrigins(env);
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    app.use((_req, res, next) => {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'no-referrer',
            'Cache-Control': 'no-store'
        });
        next();
    });
    app.use(cors({
        origin(origin, next) {
            if (!origin || origins.includes(origin)) return next(null, true);
            next(Object.assign(new Error('Origin is not permitted.'), { status: 403 }));
        }
    }));
};
