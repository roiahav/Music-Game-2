import { randomBytes } from 'crypto';

const sessions = new Map(); // token → { user, expiresAt }
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSession(user) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { user, loginAt: new Date().toISOString(), expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { sessions.delete(token); return null; }
  return session.user;
}

export function getSessionData(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { sessions.delete(token); return null; }
  return session;
}

export function deleteSession(token) {
  sessions.delete(token);
}

/** Kill all active sessions for a given userId (e.g. when blocking a user) */
export function deleteSessionsByUserId(userId) {
  for (const [token, session] of sessions.entries()) {
    if (session.user?.id === userId) sessions.delete(token);
  }
}
