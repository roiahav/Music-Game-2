import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getAllUsers, createUser, resetPassword, deleteUser, updateUser, saveAvatar, getAvatarPath } from '../services/UserStore.js';
import { deleteSessionsByUserId } from '../services/SessionStore.js';

const router = Router();

// ── Avatar (public GET, auth POST) ───────────────────────────────────────────
router.get('/:id/avatar', (req, res) => {
  const p = getAvatarPath(req.params.id);
  if (!p) return res.status(404).send('');
  res.sendFile(p);
});

router.post('/me/avatar', requireAuth, (req, res) => {
  const { imageData } = req.body;
  if (!imageData) return res.status(400).json({ error: 'תמונה נדרשת' });
  try { saveAvatar(req.user.id, imageData); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Admin routes ─────────────────────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => res.json(getAllUsers()));

router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
  try { res.json(createUser(username, password, role || 'user')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', requireAdmin, (req, res) => {
  try {
    const updated = updateUser(req.params.id, req.body);
    // If just blocked — kill all active sessions immediately
    if (req.body.blocked === true) {
      deleteSessionsByUserId(req.params.id);
    }
    res.json(updated);
  } catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/:id/reset-password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'סיסמה נדרשת' });
  try { resetPassword(req.params.id, password); res.json({ ok: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, (req, res) => {
  if (req.user?.id === req.params.id) return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
  try { deleteUser(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

export default router;
