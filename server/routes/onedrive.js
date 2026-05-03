/**
 * OneDrive sync API — admin-only endpoints to view status, trigger a sync,
 * and update sync settings.
 */
import { Router } from 'express';
import { getStatus, runSync, probeRemote } from '../services/OneDriveSync.js';
import { getSettings, saveSettings } from '../services/SettingsStore.js';

const router = Router();

// GET /api/onedrive/status — connection + last-run snapshot
router.get('/status', async (_req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/onedrive/probe — verify the configured remote folder is reachable
router.post('/probe', async (_req, res) => {
  const od = getSettings().onedrive || {};
  const result = await probeRemote(od.remoteName || 'onedrive', od.remoteFolder || '');
  res.json(result);
});

// POST /api/onedrive/sync — kick off a sync now (returns when done)
// Body: { deleteMissing?: boolean }
router.post('/sync', async (req, res) => {
  const deleteMissing = !!req.body?.deleteMissing;
  try {
    const result = await runSync({ deleteMissing });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /api/onedrive/settings — update OneDrive section in settings.json
// Accepts a partial — merges into existing config.
router.put('/settings', (req, res) => {
  const s = getSettings();
  const cur = s.onedrive || {};
  const incoming = req.body || {};

  // Whitelist editable fields (don't let client overwrite lastSync* metadata)
  const editable = ['enabled', 'remoteName', 'remoteFolder', 'localFolder', 'syncIntervalMinutes'];
  for (const key of editable) {
    if (incoming[key] !== undefined) cur[key] = incoming[key];
  }
  // Coerce types
  cur.enabled = !!cur.enabled;
  cur.syncIntervalMinutes = Math.max(0, Math.min(1440, Number(cur.syncIntervalMinutes) || 0));
  if (typeof cur.remoteName === 'string') cur.remoteName = cur.remoteName.trim() || 'onedrive';
  if (typeof cur.remoteFolder === 'string') cur.remoteFolder = cur.remoteFolder.replace(/^\/+|\/+$/g, '');

  s.onedrive = cur;
  saveSettings(s);
  res.json({ ok: true, onedrive: cur });
});

export default router;
