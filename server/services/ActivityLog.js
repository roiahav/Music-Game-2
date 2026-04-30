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

export function getLog() {
  return load().reverse();
}
