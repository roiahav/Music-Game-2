import { Router } from 'express';
import { getSettings, saveSettings } from '../services/SettingsStore.js';

const router = Router();

// GET /api/blacklist
router.get('/', (req, res) => {
  const { blacklist = [] } = getSettings();
  res.json(blacklist);
});

// POST /api/blacklist/:songId  — add song to blacklist
router.post('/:songId', (req, res) => {
  const s = getSettings();
  if (!s.blacklist) s.blacklist = [];
  if (!s.blacklist.includes(req.params.songId)) {
    s.blacklist.push(req.params.songId);
    saveSettings(s);
  }
  res.json({ ok: true });
});

// DELETE /api/blacklist/:songId  — remove from blacklist
router.delete('/:songId', (req, res) => {
  const s = getSettings();
  if (!s.blacklist) s.blacklist = [];
  s.blacklist = s.blacklist.filter(id => id !== req.params.songId);
  saveSettings(s);
  res.json({ ok: true });
});

export default router;
