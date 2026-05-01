import { Router } from 'express';
import { authenticate, completeProfile } from '../services/UserStore.js';
import { createSession, deleteSession, getSession, getSessionData } from '../services/SessionStore.js';
import { logLogin, logLogout } from '../services/ActivityLog.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });

  const result = authenticate(username, password);
  if (!result) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  if (result.blocked) return res.status(403).json({ error: 'blocked', message: 'החשבון שלך חסום. פנה למנהל המערכת.' });

  const token = createSession(result);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '—';
  logLogin(result.id, result.username, ip);
  res.json({ token, user: result });
});

router.post('/logout', (req, res) => {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    const session = getSessionData(token);
    if (session) logLogout(session.user.id, session.user.username, session.loginAt);
    deleteSession(token);
  }
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = getSession(token);
  if (!user) return res.status(401).json({ error: 'לא מחובר' });
  res.json({ user });
});

/**
 * POST /api/auth/complete-profile
 * Body: { firstName, lastName, email }
 * Called once on first login to fill in personal info + privacy consent.
 */
router.post('/complete-profile', requireAuth, (req, res) => {
  const { firstName, lastName, email } = req.body;
  if (!firstName?.trim()) return res.status(400).json({ error: 'שם פרטי נדרש' });
  if (!lastName?.trim()) return res.status(400).json({ error: 'שם משפחה נדרש' });
  if (!email?.trim() || !email.includes('@')) return res.status(400).json({ error: 'כתובת מייל תקינה נדרשת' });
  try {
    const updated = completeProfile(req.user.id, { firstName, lastName, email });
    res.json({ user: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
