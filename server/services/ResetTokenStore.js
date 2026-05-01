import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TOKENS_FILE = join(DATA_DIR, 'reset-tokens.json');
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  for (const token of Object.keys(data)) {
    if (data[token].expiresAt < now) { delete data[token]; changed = true; }
  }
  return changed;
}

/** Generate a reset token for the given user and return the token string. */
export function createResetToken(userId, email) {
  const data = load();
  purgeExpired(data);
  // Invalidate any existing token for this user
  for (const [t, v] of Object.entries(data)) {
    if (v.userId === userId) delete data[t];
  }
  const token = randomBytes(32).toString('hex');
  data[token] = { userId, email, expiresAt: Date.now() + TOKEN_TTL_MS };
  save(data);
  return token;
}

/** Returns { userId, email } if token is valid and not expired, else null. */
export function validateResetToken(token) {
  if (!token) return null;
  const data = load();
  const entry = data[token];
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    delete data[token];
    save(data);
    return null;
  }
  return { userId: entry.userId, email: entry.email };
}

/** Consume (delete) a reset token after use. */
export function consumeResetToken(token) {
  const data = load();
  delete data[token];
  save(data);
}
