import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAllUsers } from '../services/UserStore.js';
import { getLog } from '../services/ActivityLog.js';
import { getSettings } from '../services/SettingsStore.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const FAVORITES  = join(SERVER_DIR, 'favorites.json');

const router = Router();

const SERVER_START = Date.now();

function readFavorites() {
  if (!existsSync(FAVORITES)) return {};
  try { return JSON.parse(readFileSync(FAVORITES, 'utf8')); }
  catch { return {}; }
}

router.get('/stats', requireAdmin, (req, res) => {
  const users = getAllUsers();
  const log   = getLog();
  const fav   = readFavorites();
  const settings = getSettings();

  const now    = Date.now();
  const day    = 24 * 60 * 60 * 1000;
  const ago7d  = now - 7  * day;
  const ago30d = now - 30 * day;

  // ── User stats ──
  const totals = {
    users:    users.length,
    admins:   users.filter(u => u.role === 'admin').length,
    hosts:    users.filter(u => u.canHostRoom && u.role !== 'admin').length,
    pending:  users.filter(u => u.approved === false).length,
    blocked:  users.filter(u => u.blocked).length,
    timeLimited: users.filter(u => u.expiresAt).length,
  };

  // Login activity per user
  const loginCountByUser = {};
  const lastLoginByUser  = {};
  let totalSessionMs = 0;
  let sessionCount   = 0;

  for (const e of log) {
    if (e.type === 'login') {
      loginCountByUser[e.userId] = (loginCountByUser[e.userId] || 0) + 1;
      const ts = new Date(e.timestamp).getTime();
      if (!lastLoginByUser[e.userId] || lastLoginByUser[e.userId] < ts) {
        lastLoginByUser[e.userId] = ts;
      }
    } else if (e.type === 'logout' && e.durationMs && e.durationMs > 0) {
      totalSessionMs += e.durationMs;
      sessionCount++;
    }
  }

  // Active users — at least one login in window
  const active7d  = Object.values(lastLoginByUser).filter(t => t >= ago7d).length;
  const active30d = Object.values(lastLoginByUser).filter(t => t >= ago30d).length;

  // New users (id is a Date.now() string for self-registered, '1'/'2' for founders)
  const newThisWeek  = users.filter(u => {
    const t = Number(u.id);
    return !isNaN(t) && t > 1e12 && t >= ago7d;
  }).length;
  const newThisMonth = users.filter(u => {
    const t = Number(u.id);
    return !isNaN(t) && t > 1e12 && t >= ago30d;
  }).length;

  // ── Login history (last 14 days, daily buckets) ──
  const dayLabels = [];
  const dayCounts = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const count = log.filter(e =>
      e.type === 'login' &&
      new Date(e.timestamp) >= start &&
      new Date(e.timestamp) < end
    ).length;
    dayLabels.push(`${start.getDate()}/${start.getMonth() + 1}`);
    dayCounts.push(count);
  }
  const dailyLogins = dayLabels.map((label, i) => ({ label, count: dayCounts[i] }));

  // ── Top users (by login count) ──
  const topUsers = Object.entries(loginCountByUser)
    .map(([userId, count]) => {
      const u = users.find(uu => uu.id === userId);
      return u ? {
        id: u.id, username: u.username, hasAvatar: u.hasAvatar,
        firstName: u.firstName, lastName: u.lastName,
        loginCount: count,
        lastLogin: lastLoginByUser[userId] || null,
      } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.loginCount - a.loginCount)
    .slice(0, 5);

  // ── Favorites stats ──
  const totalFavorites = Object.values(fav).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const usersWithFavorites = Object.keys(fav).filter(uid => Array.isArray(fav[uid]) && fav[uid].length > 0).length;

  // Most favorited songs
  const songCounts = new Map(); // songId -> { song, count }
  for (const list of Object.values(fav)) {
    if (!Array.isArray(list)) continue;
    for (const song of list) {
      if (!song?.id) continue;
      const e = songCounts.get(song.id) || { song, count: 0 };
      e.count++;
      songCounts.set(song.id, e);
    }
  }
  const topSongs = [...songCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(e => ({
      id: e.song.id,
      title: e.song.title || (e.song.filePath?.split(/[\\/]/).pop() ?? '—'),
      artist: e.song.artist || '',
      year: e.song.year || '',
      count: e.count,
    }));

  // ── Activity counts ──
  const adminActions24h = log.filter(e => e.type === 'admin_action' && Date.now() - new Date(e.timestamp).getTime() < day).length;
  const loginsToday = log.filter(e => e.type === 'login' && isToday(new Date(e.timestamp))).length;
  const loginsTotal = log.filter(e => e.type === 'login').length;

  // ── System health ──
  const emailConfigured = !!(settings.email?.smtpHost && settings.email?.smtpUser && settings.email?.smtpPass);
  const spotifyConnected = !!(settings.spotify?.accessToken && settings.spotify?.tokenExpiresAt > now);
  const playlistsCount = (settings.playlists || []).length;
  const blacklistCount = (settings.blacklist || []).length;
  const inviteTemplates = (settings.inviteTemplates || []).length;
  const uptimeMs = now - SERVER_START;

  res.json({
    totals,
    activity: {
      active7d,
      active30d,
      newThisWeek,
      newThisMonth,
      loginsToday,
      loginsTotal,
      adminActions24h,
      avgSessionMin: sessionCount > 0 ? Math.round((totalSessionMs / sessionCount) / 60000) : 0,
      totalSessionHours: Math.round(totalSessionMs / 3600000),
    },
    favorites: {
      total: totalFavorites,
      activeUsers: usersWithFavorites,
      avg: usersWithFavorites > 0 ? +(totalFavorites / usersWithFavorites).toFixed(1) : 0,
    },
    dailyLogins,
    topUsers,
    topSongs,
    system: {
      emailConfigured,
      spotifyConnected,
      playlistsCount,
      blacklistCount,
      inviteTemplates,
      uptimeMs,
      nodeVersion: process.version,
    },
  });
});

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export default router;
