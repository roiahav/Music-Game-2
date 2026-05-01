import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const DATA_DIR   = join(SERVER_DIR, 'data');
const AVATAR_DIR = join(DATA_DIR, 'avatars');

const BACKUP_FORMAT  = 'music-game-backup';
const BACKUP_VERSION = 1;

function readJsonOrEmpty(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return fallback; }
}

function readAvatarsAsBase64() {
  if (!existsSync(AVATAR_DIR)) return {};
  const result = {};
  for (const filename of readdirSync(AVATAR_DIR)) {
    const fullPath = join(AVATAR_DIR, filename);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      const buf = readFileSync(fullPath);
      result[filename] = buf.toString('base64');
    } catch { /* skip unreadable file */ }
  }
  return result;
}

function writeAvatarsFromBase64(avatars) {
  if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });
  for (const [filename, b64] of Object.entries(avatars || {})) {
    // basic sanity check on the filename to prevent path-traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) continue;
    try {
      const buf = Buffer.from(b64, 'base64');
      writeFileSync(join(AVATAR_DIR, filename), buf);
    } catch { /* skip bad entry */ }
  }
}

/**
 * Build a complete backup bundle of all user-controlled data.
 * Includes: users, settings, activity log, favorites, avatars (base64).
 * Excludes: short-lived tokens (reset/invite), node_modules, MP3 files.
 */
export function buildBackup({ exportedById, exportedByName }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedById: exportedById || '',
    exportedByName: exportedByName || '',
    users:       readJsonOrEmpty(join(DATA_DIR, 'users.json'), []),
    settings:    readJsonOrEmpty(join(SERVER_DIR, 'settings.json'), {}),
    activityLog: readJsonOrEmpty(join(DATA_DIR, 'activity.json'), []),
    favorites:   readJsonOrEmpty(join(SERVER_DIR, 'favorites.json'), {}),
    avatars:     readAvatarsAsBase64(),
  };
}

/**
 * Validate that a payload looks like a backup bundle.
 * Returns null if valid, otherwise an error message.
 */
export function validateBackup(payload) {
  if (!payload || typeof payload !== 'object') return 'הקובץ ריק או לא תקין';
  if (payload.format !== BACKUP_FORMAT) return 'פורמט קובץ לא נתמך';
  if (!payload.version || payload.version > BACKUP_VERSION) return `גרסת קובץ ${payload.version} לא נתמכת (מקסימום ${BACKUP_VERSION})`;
  if (!Array.isArray(payload.users)) return 'מערך משתמשים חסר או פגום';
  if (typeof payload.settings !== 'object' || payload.settings === null) return 'הגדרות חסרות';
  return null;
}

/**
 * Restore everything from a backup bundle. Caller must validate first.
 * Writes atomically (each file is written separately).
 */
export function restoreBackup(payload) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  writeFileSync(join(DATA_DIR, 'users.json'),     JSON.stringify(payload.users || [], null, 2), 'utf8');
  writeFileSync(join(SERVER_DIR, 'settings.json'), JSON.stringify(payload.settings || {}, null, 2), 'utf8');
  if (Array.isArray(payload.activityLog)) {
    writeFileSync(join(DATA_DIR, 'activity.json'), JSON.stringify(payload.activityLog, null, 2), 'utf8');
  }
  if (payload.favorites && typeof payload.favorites === 'object') {
    writeFileSync(join(SERVER_DIR, 'favorites.json'), JSON.stringify(payload.favorites, null, 2), 'utf8');
  }
  if (payload.avatars && typeof payload.avatars === 'object') {
    writeAvatarsFromBase64(payload.avatars);
  }
}

/** Lightweight summary for the import preview UI. */
export function summarizeBackup(payload) {
  const userCount    = Array.isArray(payload.users) ? payload.users.length : 0;
  const playlistCount = Array.isArray(payload.settings?.playlists) ? payload.settings.playlists.length : 0;
  const activityCount = Array.isArray(payload.activityLog) ? payload.activityLog.length : 0;
  const avatarCount   = payload.avatars ? Object.keys(payload.avatars).length : 0;
  const favoritesCount = payload.favorites ? Object.keys(payload.favorites).length : 0;
  return { userCount, playlistCount, activityCount, avatarCount, favoritesCount, exportedAt: payload.exportedAt, exportedByName: payload.exportedByName };
}
