import { Router } from 'express';
import { authenticate } from '../services/UserStore.js';
import { createSession, deleteSession, getSession, getSessionData } from '../services/SessionStore.js';
import { logLogin, logLogout } from '../services/ActivityLog.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
  const user = authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  const token = createSession(user);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '—';
  logLogin(user.id, user.username, ip);
  res.json({ token, user });
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

export default router;
