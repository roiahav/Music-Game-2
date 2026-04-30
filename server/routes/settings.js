import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSettings, saveSettings } from '../services/SettingsStore.js';

const router = Router();

// GET /api/settings
router.get('/', (req, res) => {
  const s = getSettings();
  // Don't expose tokens to client
  const safe = { ...s, spotify: { clientId: s.spotify.clientId, clientSecret: s.spotify.clientSecret } };
  res.json(safe);
});

// POST /api/settings — full replace (game options, spotify credentials)
router.post('/', (req, res) => {
  const current = getSettings();
  const { game, spotify } = req.body;
  if (game) current.game = { ...current.game, ...game };
  if (spotify) {
    current.spotify.clientId = spotify.clientId ?? current.spotify.clientId;
    current.spotify.clientSecret = spotify.clientSecret ?? current.spotify.clientSecret;
  }
  saveSettings(current);
  res.json({ ok: true });
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
