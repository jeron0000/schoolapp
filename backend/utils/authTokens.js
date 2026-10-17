import jwt from 'jsonwebtoken';
import { SESSION_SECONDS, validAuthClaims } from '../../shared/authPolicy.js';

const signingSecret = () => {
    if (typeof process.env.JWT_SECRET !== 'string' || !process.env.JWT_SECRET.trim()) {
        throw new Error('Authentication is temporarily unavailable.');
    }
    return process.env.JWT_SECRET;
};

export const issueAuthToken = (subject, role) => {
    const iat = Math.floor(Date.now() / 1000);
    const claims = { sub: String(subject), role, iat, exp: iat + SESSION_SECONDS[role] };
    if (!validAuthClaims(claims, iat)) throw new Error('Unable to create this session.');
    return jwt.sign(claims, signingSecret(), { algorithm: 'HS256' });
};

export const verifyAuthToken = token => {
    if (typeof token !== 'string' || !token) throw new Error('Invalid session.');
    const claims = jwt.verify(token, signingSecret(), { algorithms: ['HS256'] });
    if (!validAuthClaims(claims)) throw new Error('Invalid session.');
    return claims;
};

export const rejectSession = res => res.status(401).json({
    success: false, message: 'Your session is invalid or expired. Please sign in again.'
});
