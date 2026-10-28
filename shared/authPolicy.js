// Shared claim policy; only the backend verifies signatures and grants access.
export const ADMIN_SUBJECT = 'pamo-admin';
export const SESSION_SECONDS = Object.freeze({ customer: 7 * 24 * 60 * 60, admin: 8 * 60 * 60, cashier: 8 * 60 * 60 });

const validSubject = (role, subject) => {
  if (typeof subject !== 'string') return false;
  if (role === 'admin') return subject === ADMIN_SUBJECT;
  return /^[a-f\d]{24}$/i.test(subject);
};

export const validAuthClaims = (claims, now = Math.floor(Date.now() / 1000)) => {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  if (Object.keys(claims).sort().join(',') !== 'exp,iat,role,sub') return false;
  if (typeof claims.role !== 'string' || !Object.hasOwn(SESSION_SECONDS, claims.role)) return false;
  if (!validSubject(claims.role, claims.sub)) return false;
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return false;
  if (claims.iat <= 0 || claims.iat > now || claims.exp <= now) return false;
  if (claims.exp <= claims.iat) return false;
  return claims.exp - claims.iat <= SESSION_SECONDS[claims.role];
};
