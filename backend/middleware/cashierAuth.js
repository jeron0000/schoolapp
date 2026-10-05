import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';

// Existing admin tokens retain access; cashier permissions are checked in the DB.
const cashierAuth = async (req, res, next) => {
    try {
        const decoded = jwt.verify(req.headers.token, process.env.JWT_SECRET);
        if (decoded === process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD) {
            req.staff = { role: 'admin', identity: process.env.ADMIN_EMAIL };
        } else {
            if (typeof decoded?.id !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.id)) {
                return res.status(403).json({ success: false, message: 'Cashier access required.' });
            }
            const cashier = await userModel.findOne({ _id: decoded.id, role: 'cashier' });
            if (!cashier) return res.status(403).json({ success: false, message: 'Cashier access required.' });
            req.staff = { role: 'cashier', identity: cashier.email };
        }
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Unable to authorize this session. Please sign in again.' });
    }
};

export default cashierAuth;
