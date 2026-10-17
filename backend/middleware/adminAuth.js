import { verifyAuthToken, rejectSession } from '../utils/authTokens.js';

const adminAuth = async (req, res, next) => {
    let claims;
    try {
        claims = verifyAuthToken(req.headers.token);
    } catch {
        return rejectSession(res);
    }
    if (claims.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Administrator access required.' });
    }
    next();
};

export default adminAuth;
