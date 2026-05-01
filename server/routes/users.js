import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getAllUsers, createUser, resetPassword, deleteUser, updateUser, saveAvatar, getAvatarPath } from '../services/UserStore.js';
import { deleteSessionsByUserId } from '../services/SessionStore.js';
import { logAdminAction } from '../services/ActivityLog.js';

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
  try {
    const created = createUser(username, password, role || 'user');
    logAdminAction(req.user.id, req.user.username, 'create', created, { role: created.role });
    res.json(created);
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/:id', requireAdmin, (req, res) => {
  try {
    // Capture the previous state to detect what actually changed
    const before = getAllUsers().find(u => u.id === req.params.id);
    const updated = updateUser(req.params.id, req.body);

    // Log specific changes
    if (before) {
      if ('blocked' in req.body && before.blocked !== updated.blocked) {
        logAdminAction(req.user.id, req.user.username, updated.blocked ? 'block' : 'unblock', updated);
      }
      if ('role' in req.body && before.role !== updated.role) {
        logAdminAction(req.user.id, req.user.username, updated.role === 'admin' ? 'role_admin' : 'role_user', updated);
      }
      if ('canHostRoom' in req.body && before.canHostRoom !== updated.canHostRoom) {
        logAdminAction(req.user.id, req.user.username, updated.canHostRoom ? 'host_on' : 'host_off', updated);
      }
      if ('username' in req.body && before.username !== updated.username) {
        logAdminAction(req.user.id, req.user.username, 'rename', updated, { from: before.username, to: updated.username });
      }
    }

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
  try {
    resetPassword(req.params.id, password);
    const target = getAllUsers().find(u => u.id === req.params.id);
    if (target) logAdminAction(req.user.id, req.user.username, 'reset_password', target);
    res.json({ ok: true });
  }
  catch (e) { res.status(404).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, (req, res) => {
  if (req.user?.id === req.params.id) return res.status(400).json({ error: 'לא ניתן למחוק את עצמך' });
  try {
    // Capture username before deletion
    const target = getAllUsers().find(u => u.id === req.params.id);
    deleteUser(req.params.id);
    if (target) logAdminAction(req.user.id, req.user.username, 'delete', target);
    res.json({ ok: true });
  }
  catch (e) { res.status(404).json({ error: e.message }); }
});

export default router;
