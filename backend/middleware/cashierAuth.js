import { verifyAuthToken, rejectSession } from '../utils/authTokens.js';
import userModel from '../models/userModel.js';

// Signed admin sessions retain access; cashier permissions are checked in the DB.
const cashierAuth = async (req, res, next) => {
    try {
        const decoded = verifyAuthToken(req.headers.token);
        if (decoded.role === 'admin') {
            req.staff = { role: 'admin', identity: process.env.ADMIN_EMAIL };
        } else {
            if (decoded.role !== 'cashier') {
                return res.status(403).json({ success: false, message: 'Cashier access required.' });
            }
            const cashier = await userModel.findOne({ _id: decoded.sub, role: 'cashier' });
            if (!cashier) return res.status(403).json({ success: false, message: 'Cashier access required.' });
            req.staff = { role: 'cashier', identity: cashier.email };
        }
        next();
    } catch {
        return rejectSession(res);
    }
};

export default cashierAuth;
