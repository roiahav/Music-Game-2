import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSettings, saveSettings } from '../services/SettingsStore.js';
import { testSmtp } from '../services/EmailService.js';

const router = Router();

// GET /api/settings
router.get('/', (req, res) => {
  const s = getSettings();
  // Don't expose OAuth tokens, but do send email config (minus password — show only whether set)
  const safe = {
    ...s,
    spotify: { clientId: s.spotify.clientId, clientSecret: s.spotify.clientSecret },
    email: {
      ...(s.email || {}),
      smtpPass: s.email?.smtpPass ? '••••••••' : '',  // mask password in GET
    },
  };
  res.json(safe);
});

// POST /api/settings — full replace (game options, spotify credentials, email)
router.post('/', (req, res) => {
  const current = getSettings();
  const { game, spotify, email } = req.body;
  if (game) current.game = { ...current.game, ...game };
  if (spotify) {
    current.spotify.clientId = spotify.clientId ?? current.spotify.clientId;
    current.spotify.clientSecret = spotify.clientSecret ?? current.spotify.clientSecret;
  }
  if (email) {
    if (!current.email) current.email = {};
    // Preserve original password (in case client sent masked placeholder)
    const originalPass = current.email.smtpPass;
    // Copy all fields except password
    const { smtpPass: incomingPass, ...rest } = email;
    Object.assign(current.email, rest);
    // Handle password specially: only update if user typed a real new value
    if (incomingPass && incomingPass !== '••••••••') {
      current.email.smtpPass = incomingPass;
    } else if (incomingPass === '••••••••' || incomingPass === undefined) {
      // Keep existing password
      current.email.smtpPass = originalPass || '';
    } else {
      // Empty string — user cleared it intentionally
      current.email.smtpPass = '';
    }
  }
  saveSettings(current);
  res.json({ ok: true });
});

// POST /api/settings/test-email — verify SMTP connection
router.post('/test-email', async (req, res) => {
  try {
    await testSmtp();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/settings/playlists — add or update a playlist
router.post('/playlists', (req, res) => {
  const s = getSettings();
  const { id, name, type, path, spotifyUri } = req.body;
  const existing = id ? s.playlists.find(p => p.id === id) : null;
  if (existing) {
    existing.name = name ?? existing.name;
    existing.type = type ?? existing.type;
    existing.path = path ?? existing.path;
    existing.spotifyUri = spotifyUri ?? existing.spotifyUri;
  } else {
    s.playlists.push({ id: uuidv4(), name: name || 'פלייליסט חדש', type: type || 'local', path: path || '', spotifyUri: spotifyUri || '' });
  }
  saveSettings(s);
  res.json({ ok: true });
});

// DELETE /api/settings/playlists/:id
router.delete('/playlists/:id', (req, res) => {
  const s = getSettings();
  s.playlists = s.playlists.filter(p => p.id !== req.params.id);
  saveSettings(s);
  res.json({ ok: true });
});

export default router;
