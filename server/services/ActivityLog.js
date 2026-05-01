import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const LOG_FILE = join(DATA_DIR, 'activity.json');

function load() {
  if (!existsSync(LOG_FILE)) return [];
  try { return JSON.parse(readFileSync(LOG_FILE, 'utf8')); } catch { return []; }
}

function save(entries) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(LOG_FILE, JSON.stringify(entries.slice(-2000), null, 2), 'utf8');
}

export function logLogin(userId, username, ip) {
  const entries = load();
  entries.push({ type: 'login', userId, username, ip: ip || '—', timestamp: new Date().toISOString() });
  save(entries);
}

export function logLogout(userId, username, loginTimestamp) {
  const entries = load();
  const durationMs = loginTimestamp ? Date.now() - new Date(loginTimestamp).getTime() : null;
  entries.push({ type: 'logout', userId, username, durationMs, timestamp: new Date().toISOString() });
  save(entries);
}

/**
 * Log an admin action performed on another user.
 * @param {string} adminId         — id of the admin performing the action
 * @param {string} adminName       — admin's username
 * @param {string} action          — one of: 'create' | 'reset_password' | 'delete' |
 *                                   'block' | 'unblock' | 'role_admin' | 'role_user' |
 *                                   'host_on' | 'host_off' | 'rename'
 * @param {object} target          — { id, username }
 * @param {object} [details]       — optional extras (e.g. previous/new value)
 */
export function logAdminAction(adminId, adminName, action, target, details = {}) {
  const entries = load();
  entries.push({
    type: 'admin_action',
    action,
    adminId,
    adminName,
    targetId: target.id,
    targetUsername: target.username,
    details,
    timestamp: new Date().toISOString(),
  });
  save(entries);
}

export function getLog() {
  return load().reverse();
}
