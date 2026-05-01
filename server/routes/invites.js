import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  createInviteToken, validateInviteToken, consumeInviteToken,
  listInviteTokens, deleteInviteToken,
} from '../services/InviteTokenStore.js';
import { registerFromInvite } from '../services/UserStore.js';
import { sendInviteEmail } from '../services/EmailService.js';
import { logAdminAction } from '../services/ActivityLog.js';

const router = Router();

/** Build the registration URL for an invite token using the request's host. */
function buildInviteUrl(req, token) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${protocol}://${host}/?invite_token=${token}`;
}

// ── Public: validate token + get prefilled info ──────────────────────────────
router.get('/:token', (req, res) => {
  const entry = validateInviteToken(req.params.token);
  if (!entry) return res.status(400).json({ error: 'הקישור אינו בתוקף או שפג תוקפו' });
  res.json({
    valid: true,
    prefilledEmail: entry.prefilledEmail || '',
    prefilledFirstName: entry.prefilledFirstName || '',
    prefilledLastName: entry.prefilledLastName || '',
    invitedBy: entry.createdByName || '',
  });
});

// ── Public: register new user from invite ────────────────────────────────────
router.post('/:token/register', (req, res) => {
  const entry = validateInviteToken(req.params.token);
  if (!entry) return res.status(400).json({ error: 'הקישור אינו בתוקף או שפג תוקפו' });

  const { username, password, firstName, lastName, email } = req.body;
  if (!username?.trim()) return res.status(400).json({ error: 'שם משתמש נדרש' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'סיסמה חייבת להיות לפחות 4 תווים' });
  if (!firstName?.trim()) return res.status(400).json({ error: 'שם פרטי נדרש' });
  if (!lastName?.trim()) return res.status(400).json({ error: 'שם משפחה נדרש' });
  if (!email?.trim() || !email.includes('@')) return res.status(400).json({ error: 'כתובת מייל תקינה נדרשת' });

  try {
    const newUser = registerFromInvite({ username: username.trim(), password, firstName, lastName, email });
    consumeInviteToken(req.params.token, newUser.id);
    res.json({ ok: true, pending: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Admin: list all invites ──────────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  res.json(listInviteTokens());
});

// ── Admin: create invite, optionally send email ──────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  const { email, firstName, lastName, sendEmail } = req.body;
  const token = createInviteToken({
    createdById: req.user.id,
    createdByName: req.user.username,
    prefilledEmail: email || '',
    prefilledFirstName: firstName || '',
    prefilledLastName: lastName || '',
  });
  const url = buildInviteUrl(req, token);
  let emailSent = false;
  let emailError = null;

  if (sendEmail && email?.trim()) {
    try {
      await sendInviteEmail(email.trim(), firstName || '', url, req.user.username);
      emailSent = true;
    } catch (e) {
      emailError = e.message;
    }
  }

  logAdminAction(req.user.id, req.user.username, 'invite_create',
    { id: '-', username: email || '(ללא מייל)' },
    { sentEmail: emailSent });

  res.json({ token, url, emailSent, emailError });
});

// ── Admin: revoke invite ─────────────────────────────────────────────────────
router.delete('/:token', requireAdmin, (req, res) => {
  const ok = deleteInviteToken(req.params.token);
  res.json({ ok });
});

export default router;
