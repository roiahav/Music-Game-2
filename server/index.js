import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { networkInterfaces } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import playlistsRouter from './routes/playlists.js';
import audioRouter from './routes/audio.js';
import coverRouter from './routes/cover.js';
import settingsRouter from './routes/settings.js';
import spotifyRouter from './routes/spotify.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import activityRouter from './routes/activity.js';
import browseRouter from './routes/browse.js';
import blacklistRouter from './routes/blacklist.js';
import favoritesRouter from './routes/favorites.js';
import invitesRouter from './routes/invites.js';
import backupRouter from './routes/backup.js';
import adminStatsRouter from './routes/admin-stats.js';
import adminMusicRouter from './routes/admin-music.js';
import onedriveRouter from './routes/onedrive.js';
import { startSyncScheduler } from './services/OneDriveSync.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { updateSpotifyTokens, getSettings } from './services/SettingsStore.js';
import { lockExpiredUsers } from './services/UserStore.js';
import { deleteSessionsByUserId } from './services/SessionStore.js';
import { setupMultiplayer } from './multiplayer-socket.js';
import { setupYearsMultiplayer } from './years-multiplayer-socket.js';
import { setupChampionMultiplayer } from './champion-multiplayer-socket.js';
import { setupLaddersHits } from './ladders-hits-socket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
// Trust the first proxy hop so X-Forwarded-* headers from Caddy /
// Cloudflare / Tailscale-Funnel are honoured (correct client IP in
// activity logs + secure-cookie detection if/when we add cookies).
// Harmless when there's no proxy in front.
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
setupMultiplayer(io);
setupYearsMultiplayer(io);
setupChampionMultiplayer(io);
setupLaddersHits(io);

app.use(cors());
app.use(express.json());

// Serve built client (production)
const clientDist = join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// Short invite link: /i/<token> → /?invite_token=<token>
app.get('/i/:token', (req, res) => {
  res.redirect(302, `/?invite_token=${encodeURIComponent(req.params.token)}`);
});

// Spotify OAuth callback at root level (matches Spotify Dashboard redirect URI)
app.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.send(`<h2 dir="rtl">שגיאה: ${error || 'אין קוד'}</h2>`);

  const { clientId, clientSecret } = getSettings().spotify;
  const REDIRECT_URI = 'http://127.0.0.1:3000/callback';

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });
    if (!tokenRes.ok) return res.send('<h2 dir="rtl">שגיאה בקבלת טוקן מ-Spotify</h2>');
    const data = await tokenRes.json();
    updateSpotifyTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: Date.now() + data.expires_in * 1000,
    });
    res.send('<html><body dir="rtl" style="font-family:sans-serif;padding:2em;background:#1e1e1e;color:#fff"><h2>✅ התחברת בהצלחה לSpotify!</h2><p>ניתן לסגור חלון זה ולחזור לאפליקציה.</p><script>setTimeout(()=>window.close(),2000)</script></body></html>');
  } catch (err) {
    res.send(`<h2 dir="rtl">שגיאה: ${err.message}</h2>`);
  }
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter); // per-route auth inside
app.use('/api/activity', activityRouter);
app.use('/api/browse', browseRouter);
app.use('/api/playlists', requireAuth, playlistsRouter);
app.use('/api/audio', audioRouter);   // public — needed by <audio> element (no custom headers)
app.use('/api/cover', coverRouter);   // public — same reason
// Public-safe view of the games config — needed by every authenticated user
// (the home screen filters games by gamesConfig.hidden / order). The full
// /api/settings endpoint stays admin-only because it exposes secrets.
app.get('/api/games-config', requireAuth, (req, res) => {
  const s = getSettings();
  res.json(s.games || { order: [], hidden: [], allowedUsers: {} });
});
app.use('/api/settings', requireAdmin, settingsRouter);
app.use('/api/spotify', requireAdmin, spotifyRouter);
app.use('/api/blacklist', requireAdmin, blacklistRouter);
app.use('/api/favorites', requireAuth, favoritesRouter);
app.use('/api/invites', invitesRouter); // mixed: GET/:token + POST/:token/register are public; admin endpoints require admin (handled per-route)
// Backup bundle can be large (avatars are base64), bump body limit for this route only
app.use('/api/backup', express.json({ limit: '50mb' }), backupRouter);
app.use('/api/admin', adminStatsRouter);
app.use('/api/admin/music', requireAdmin, adminMusicRouter);
app.use('/api/onedrive', requireAdmin, onedriveRouter);

// SPA fallback
app.get('*', (req, res) => {
  const index = join(clientDist, 'index.html');
  res.sendFile(index, err => {
    if (err) res.status(200).send('<h2>Build the client first: cd client && npm run build</h2>');
  });
});

// Background job: every 60s, auto-lock users whose expiresAt has passed
// and immediately invalidate their sessions
setInterval(() => {
  try {
    const lockedIds = lockExpiredUsers();
    for (const id of lockedIds) deleteSessionsByUserId(id);
    if (lockedIds.length) console.log(`[expiry] auto-locked ${lockedIds.length} expired user(s)`);
  } catch (e) { console.error('[expiry] check failed:', e.message); }
}, 60 * 1000);

httpServer.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log('\n🎵 Music Game Server is running!\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  if (lanIp) console.log(`  Network: http://${lanIp}:${PORT}  ← open this on your phone\n`);
  // Kick off the OneDrive sync scheduler — it reads settings.json each tick
  // so toggling enabled/interval in the UI takes effect within 30s.
  try { startSyncScheduler(); } catch (e) { console.error('[onedrive] scheduler failed:', e.message); }
});

function getLanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}
