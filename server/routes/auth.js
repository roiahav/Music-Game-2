import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, completeProfile, getAllUsers, resetPassword } from '../services/UserStore.js';
import { createSession, deleteSession, getSession, getSessionData } from '../services/SessionStore.js';
import { logLogin, logLogout } from '../services/ActivityLog.js';
import { requireAuth } from '../middleware/auth.js';
import { createResetToken, validateResetToken, consumeResetToken } from '../services/ResetTokenStore.js';
import { sendResetEmail } from '../services/EmailService.js';

const router = Router();

// Rate limit auth endpoints to slow brute-force attempts. Counted per IP.
// Standard headers are returned so clients can read remaining quota.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד כמה דקות.' },
});
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'יותר מדי בקשות איפוס. נסה שוב מאוחר יותר.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });

  const result = authenticate(username, password);
  if (!result) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
  if (result.pending) return res.status(403).json({ error: 'pending', message: 'החשבון שלך ממתין לאישור מנהל. נא להמתין לאישור.' });
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

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Finds the user with that email, generates a reset token, sends an email.
 */
router.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'כתובת מייל נדרשת' });

  // Find user by email (case-insensitive)
  const users = getAllUsers();
  const user = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());

  // Always return 200 to prevent user enumeration — but only actually send if found
  if (!user || !user.email) {
    return res.json({ ok: true }); // silent — no hint whether email exists
  }

  try {
    const token = createResetToken(user.id, user.email);
    // Build reset URL from request host
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const resetUrl = `${protocol}://${host}/?reset_token=${token}`;
    await sendResetEmail(user.email, user.firstName || '', resetUrl);
    res.json({ ok: true });
  } catch (e) {
    console.error('[forgot-password]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 */
router.post('/reset-password', resetLimiter, (req, res) => {
  const { token, newPassword } = req.body;
  if (!token) return res.status(400).json({ error: 'טוקן חסר' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' });

  const entry = validateResetToken(token);
  if (!entry) return res.status(400).json({ error: 'הקישור אינו בתוקף או שפג תוקפו. בקש קישור חדש.' });

  try {
    resetPassword(entry.userId, newPassword);
    consumeResetToken(token);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
