import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { buildBackup, validateBackup, restoreBackup, summarizeBackup } from '../services/BackupService.js';
import { logAdminAction } from '../services/ActivityLog.js';

const router = Router();

/**
 * GET /api/backup/export
 * Returns the full backup bundle as a JSON download.
 */
router.get('/export', requireAdmin, (req, res) => {
  try {
    const bundle = buildBackup({
      exportedById:   req.user.id,
      exportedByName: req.user.username,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const filename = `music-game-backup-${stamp}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    logAdminAction(req.user.id, req.user.username, 'backup_export',
      { id: '-', username: 'system' }, { filename });
    res.send(JSON.stringify(bundle, null, 2));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/backup/preview
 * Validates a backup payload and returns a summary (no changes made).
 * Body: the backup JSON itself (parsed).
 */
router.post('/preview', requireAdmin, (req, res) => {
  const err = validateBackup(req.body);
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true, summary: summarizeBackup(req.body) });
});

/**
 * POST /api/backup/import
 * Validates and restores the backup. CAUTION: replaces all data.
 * Body: the backup JSON itself.
 */
router.post('/import', requireAdmin, (req, res) => {
  const err = validateBackup(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const summary = summarizeBackup(req.body);
    restoreBackup(req.body);
    logAdminAction(req.user.id, req.user.username, 'backup_import',
      { id: '-', username: 'system' }, summary);
    res.json({ ok: true, summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
