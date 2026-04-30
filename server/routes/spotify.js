import { Router } from 'express';
import { getSettings, saveSettings, updateSpotifyTokens } from '../services/SettingsStore.js';
import * as Spotify from '../services/SpotifyService.js';

const router = Router();
const REDIRECT_URI = 'http://127.0.0.1:3000/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

// GET /api/spotify/login
router.get('/login', (req, res) => {
  const { clientId } = getSettings().spotify;
  if (!clientId) return res.status(400).json({ error: 'Spotify Client ID not configured' });
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// GET /api/spotify/callback
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.send(`<h2>שגיאה: ${error || 'אין קוד'}</h2>`);

  const s = getSettings();
  const { clientId, clientSecret } = s.spotify;

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });

  if (!tokenRes.ok) return res.send('<h2>שגיאה בקבלת טוקן מ-Spotify</h2>');
  const data = await tokenRes.json();
  updateSpotifyTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: Date.now() + data.expires_in * 1000,
  });

  res.send('<html><body dir="rtl"><h2>התחברת בהצלחה לSpotify!</h2><p>ניתן לסגור חלון זה.</p><script>setTimeout(()=>window.close(),2000)</script></body></html>');
});

// GET /api/spotify/status
router.get('/status', async (req, res) => {
  try {
    const status = await Spotify.getStatus();
    res.json(status);
  } catch {
    res.json({ connected: false });
  }
});

// GET /api/spotify/playlists
router.get('/playlists', async (req, res) => {
  try {
    const playlists = await Spotify.getUserPlaylists();
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spotify/playlist/:id/tracks
router.get('/playlist/:id/tracks', async (req, res) => {
  try {
    const tracks = await Spotify.getPlaylistTracks(req.params.id);
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spotify/play
router.post('/play', async (req, res) => {
  try {
    await Spotify.play(req.body.deviceId, req.body.uris);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spotify/pause
router.post('/pause', async (req, res) => {
  try {
    await Spotify.pause();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spotify/resume
router.post('/resume', async (req, res) => {
  try {
    await Spotify.resume();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spotify/seek
router.post('/seek', async (req, res) => {
  try {
    await Spotify.seek(req.body.positionMs);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/spotify/volume
router.post('/volume', async (req, res) => {
  try {
    await Spotify.setVolume(req.body.volume);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/spotify/player
router.get('/player', async (req, res) => {
  try {
    const state = await Spotify.getPlayerState();
    res.json(state || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
