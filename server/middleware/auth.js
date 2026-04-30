import { getSession } from '../services/SessionStore.js';

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  const user = getSession(token);
  if (!user) return res.status(401).json({ error: 'לא מחובר' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const token = extractToken(req);
  const user = getSession(token);
  if (!user) return res.status(401).json({ error: 'לא מחובר' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'אין הרשאה' });
  req.user = user;
  next();
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}
