import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TOKENS_FILE = join(DATA_DIR, 'invite-tokens.json');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function load() {
  if (!existsSync(TOKENS_FILE)) return {};
  try { return JSON.parse(readFileSync(TOKENS_FILE, 'utf8')); } catch { return {}; }
}

function save(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function purgeExpired(data) {
  const now = Date.now();
  let changed = false;
  for (const t of Object.keys(data)) {
    if (data[t].expiresAt < now) { delete data[t]; changed = true; }
  }
  return changed;
}

/**
 * Generate an invite token.
 * @param {object} info — { createdById, createdByName, prefilledEmail, prefilledFirstName, prefilledLastName }
 */
export function createInviteToken(info = {}) {
  const data = load();
  purgeExpired(data);
  // Short token (16 hex chars = 64 bits, plenty for 7-day single-use)
  const token = randomBytes(8).toString('hex');
  data[token] = {
    createdById: info.createdById || '',
    createdByName: info.createdByName || '',
    prefilledEmail: info.prefilledEmail || '',
    prefilledFirstName: info.prefilledFirstName || '',
    prefilledLastName: info.prefilledLastName || '',
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    used: false,
    usedAt: null,
    usedByUserId: null,
  };
  save(data);
  return token;
}

/** Returns the token entry if valid (exists, not expired, not used), else null. */
export function validateInviteToken(token) {
  if (!token) return null;
  const data = load();
  const entry = data[token];
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    delete data[token];
    save(data);
    return null;
  }
  if (entry.used) return null;
  return { token, ...entry };
}

/** Mark a token as used (after the new user is created). */
export function consumeInviteToken(token, newUserId) {
  const data = load();
  if (!data[token]) return;
  data[token].used = true;
  data[token].usedAt = Date.now();
  data[token].usedByUserId = newUserId;
  save(data);
}

/** List all tokens (for admin overview). */
export function listInviteTokens() {
  const data = load();
  purgeExpired(data);
  return Object.entries(data).map(([token, info]) => ({ token, ...info }));
}

/** Delete a token (admin-revoke). */
export function deleteInviteToken(token) {
  const data = load();
  if (data[token]) {
    delete data[token];
    save(data);
    return true;
  }
  return false;
}
