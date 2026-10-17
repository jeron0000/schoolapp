import cors from 'cors';

export const LOCAL_API_HOST = 'localhost';
export const LOCAL_UI_ORIGINS = ['localhost', '127.0.0.1', '[::1]'].flatMap(host =>
    [5173, 5174, 4173, 4174].map(port => `http://${host}:${port}`));

// Local project defaults, not a deployable CORS/HTTPS policy or an auth substitute.
export const configureLocalApiSecurity = app => {
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
            if (!origin || LOCAL_UI_ORIGINS.includes(origin)) return next(null, true);
            next(Object.assign(new Error('Origin is not permitted.'), { status: 403 }));
        }
    }));
};
