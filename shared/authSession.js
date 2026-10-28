import { useCallback, useEffect, useRef, useState } from 'react';
import { validAuthClaims } from './authPolicy.js';

export const SESSION_MESSAGE = 'Your session is invalid or expired. Please sign in again.';

const roleMatchesScope = (role, scope) => {
  if (scope === 'customer') {
    return role === 'customer';
  }
  if (scope === 'staff') {
    return ['admin', 'cashier'].includes(role);
  }
  return false;
};

// Decoding only controls local session UX. It never authenticates a signature.
export const sessionClaims = (token, scope) => {
  try {
    const parts = typeof token === 'string' ? token.split('.') : [];
    if (parts.length !== 3 || parts.some(part => !/^[\w-]+$/.test(part))) {
      return null;
    }
    const decode = part => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    if (header.alg !== 'HS256' || !validAuthClaims(claims)) {
      return null;
    }
    if (!roleMatchesScope(claims.role, scope)) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
};

const storedToken = () => {
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

const persistToken = token => {
  try {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  } catch {
    // A blocked browser storage policy must not prevent logout.
  }
};

export const isSessionFailure = (error, token, backendUrl) => {
  if (error?.response?.status !== 401 || !token) {
    return false;
  }
  const config = error.config || error.response.config;
  const requestToken = config?.headers?.get?.('token') || config?.headers?.token;
  if (requestToken !== token) {
    return false;
  }
  try {
    const backend = new URL(backendUrl);
    const request = new URL(config.url, config.baseURL || backendUrl);
    const prefix = backend.pathname.replace(/\/$/, '') + '/';
    return request.origin === backend.origin && request.pathname.startsWith(prefix);
  } catch {
    return false;
  }
};

export const monitorSession = ({ token, scope, client, backendUrl, onInvalid }) => {
  let stopped = false;
  const expire = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    onInvalid();
  };
  const checkExpiry = () => {
    if (!sessionClaims(token, scope)) {
      expire();
    }
  };
  const claims = sessionClaims(token, scope);
  const timer = window.setTimeout(checkExpiry, claims ? Math.max(0, claims.exp * 1000 - Date.now()) : 0);
  const interceptor = client.interceptors.response.use(undefined, error => {
    if (isSessionFailure(error, token, backendUrl)) expire();
    return Promise.reject(error);
  });
  window.addEventListener('focus', checkExpiry);
  document.addEventListener('visibilitychange', checkExpiry);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    client.interceptors.response.eject(interceptor);
    window.removeEventListener('focus', checkExpiry);
    document.removeEventListener('visibilitychange', checkExpiry);
  };
};

const noSessionCleanup = () => {};

export const useAuthSession = (client, backendUrl, scope, onSessionEnd = noSessionCleanup) => {
  const [session, setSession] = useState(() => {
    const saved = storedToken();
    const token = sessionClaims(saved, scope) ? saved : '';
    return { token, message: saved && !token ? SESSION_MESSAGE : '' };
  });
  const monitor = useRef(null);
  const setToken = useCallback(nextToken => {
    const token = sessionClaims(nextToken, scope) ? nextToken : '';
    if (token && monitor.current?.token === token) {
      return;
    }
    monitor.current?.stop();
    monitor.current = null;
    persistToken(token);
    if (!token) {
      onSessionEnd();
    }
    setSession({ token, message: nextToken && !token ? SESSION_MESSAGE : '' });
  }, [scope, onSessionEnd]);

  const invalidateSession = useCallback(expectedToken => {
    if (expectedToken && monitor.current?.token !== expectedToken) {
      return;
    }
    monitor.current?.stop();
    monitor.current = null;
    persistToken('');
    onSessionEnd();
    setSession({ token: '', message: SESSION_MESSAGE });
  }, [onSessionEnd]);

  const isCurrentSession = useCallback(expectedToken => {
    const matchesMonitoredToken = monitor.current?.token === expectedToken;
    return matchesMonitoredToken && Boolean(sessionClaims(expectedToken, scope));
  }, [scope]);

  useEffect(() => {
    if (!session.token) {
      if (session.message) {
        persistToken('');
      }
      return;
    }
    const stop = monitorSession({
      token: session.token,
      scope,
      client,
      backendUrl,
      onInvalid: () => invalidateSession(session.token),
    });
    monitor.current = { token: session.token, stop };
    return stop;
  }, [session.token, session.message, scope, client, backendUrl, invalidateSession]);

  return { token: session.token, setToken, sessionMessage: session.message, invalidateSession, isCurrentSession };
};
