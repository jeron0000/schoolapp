import { verifyAuthToken, rejectSession } from '../utils/authTokens.js';

const authUser = async (req, res, next) => {
    let claims;
    try {
        claims = verifyAuthToken(req.headers.token);
    } catch {
        return rejectSession(res);
    }
    if (claims.role !== 'customer') {
        return res.status(403).json({ success: false, message: 'Customer access required.' });
    }
    req.body = req.body || {};
    req.body.userId = claims.sub;
    next();
};

export default authUser;
