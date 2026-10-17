// Shared claim policy; only the backend verifies signatures and grants access.
export const ADMIN_SUBJECT = 'pamo-admin';
export const SESSION_SECONDS = Object.freeze({ customer: 7 * 24 * 60 * 60, admin: 8 * 60 * 60, cashier: 8 * 60 * 60 });

export const validAuthClaims = (claims, now = Math.floor(Date.now() / 1000)) => {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  if (Object.keys(claims).sort().join(',') !== 'exp,iat,role,sub') return false;
  const lifetime = typeof claims.role === 'string' && Object.hasOwn(SESSION_SECONDS, claims.role)
    ? SESSION_SECONDS[claims.role] : 0;
  if (!lifetime || typeof claims.sub !== 'string') return false;
  if (claims.role === 'admin' ? claims.sub !== ADMIN_SUBJECT : !/^[a-f\d]{24}$/i.test(claims.sub)) return false;
  return Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp)
    && claims.iat > 0 && claims.iat <= now && claims.exp > now
    && claims.exp > claims.iat && claims.exp - claims.iat <= lifetime;
};
