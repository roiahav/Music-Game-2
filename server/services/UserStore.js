import { pbkdf2Sync, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');
const AVATAR_DIR = join(DATA_DIR, 'avatars');

/** Founder accounts that cannot be deleted by anyone (created by init()). */
const PROTECTED_USERNAMES = ['אורן יהב', 'רותם יהב'];
const PROTECTED_IDS = ['1', '2'];

function isProtected(user) {
  return PROTECTED_IDS.includes(user.id) || PROTECTED_USERNAMES.includes(user.username);
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}
function createHash(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}
function verifyPassword(password, salt, storedHash) {
  return hashPassword(password, salt) === storedHash;
}
function load() {
  if (!existsSync(USERS_FILE)) return [];
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}
function save(users) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

/** Fields safe to send to client */
function publicFields(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    canHostRoom: u.canHostRoom ?? (u.role === 'admin'),
    hasAvatar: u.hasAvatar ?? false,
    blocked: u.blocked ?? false,
    profileCompleted: u.profileCompleted ?? false,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    email: u.email || '',
    protected: isProtected(u),
    expiresAt: u.expiresAt || null,    // ms timestamp; null = no time limit
    approved: u.approved !== false,    // default true; false only for invite-registered pending users
  };
}

function init() {
  if (!existsSync(USERS_FILE)) {
    // Initial seed password for the bootstrap admin accounts.
    // PROD: set ADMIN_INITIAL_PASSWORD in the environment so this never lands
    // in the codebase. The fallback only fires when the env var is unset and
    // is intentionally noisy in the logs to make sure we notice in dev.
    const seedPw = process.env.ADMIN_INITIAL_PASSWORD;
    if (!seedPw) {
      console.warn('[UserStore] ADMIN_INITIAL_PASSWORD not set — using insecure dev fallback. Change immediately after first login.');
    }
    const password = seedPw || 'changeme-on-first-login';
    const users = ['אורן יהב', 'רותם יהב'].map((username, i) => {
      const { salt, hash } = createHash(password);
      return {
        id: String(i + 1), username, role: 'admin', canHostRoom: true,
        hasAvatar: false, blocked: false, profileCompleted: true,
        firstName: '', lastName: '', email: '', privacyConsented: true,
        salt, hash,
      };
    });
    save(users);
  }
}

export function getAllUsers() { return load().map(publicFields); }

export function authenticate(username, password) {
  const users = load();
  const idx = users.findIndex(u => u.username === username);
  if (idx === -1) return null;
  const user = users[idx];
  if (!verifyPassword(password, user.salt, user.hash)) return null;

  // Auto-lock expired accounts
  if (user.expiresAt && user.expiresAt < Date.now() && !user.blocked) {
    users[idx].blocked = true;
    save(users);
    return { blocked: true, expired: true };
  }

  // Pending approval (invite-registered but not yet approved)
  if (user.approved === false) return { pending: true };

  if (user.blocked) return { blocked: true, expired: !!user.expiresAt && user.expiresAt < Date.now() };
  return publicFields(user);
}

export function createUser(username, password, role = 'user') {
  const users = load();
  if (users.find(u => u.username === username)) throw new Error('שם משתמש כבר קיים');
  const { salt, hash } = createHash(password);
  const id = String(Date.now());
  users.push({
    id, username, role, canHostRoom: role === 'admin',
    hasAvatar: false, blocked: false, profileCompleted: false,
    firstName: '', lastName: '', email: '', privacyConsented: false,
    salt, hash,
  });
  save(users);
  return publicFields(users[users.length - 1]);
}

/**
 * Self-registration via invite token.
 * Creates a fully-filled user, but with approved=false until an admin approves.
 */
export function registerFromInvite({ username, password, firstName, lastName, email }) {
  const users = load();
  if (users.find(u => u.username === username)) throw new Error('שם משתמש כבר קיים');
  const { salt, hash } = createHash(password);
  const id = String(Date.now());
  users.push({
    id, username, role: 'user', canHostRoom: false,
    hasAvatar: false, blocked: false,
    profileCompleted: true,
    firstName: (firstName || '').trim(),
    lastName: (lastName || '').trim(),
    email: (email || '').trim().toLowerCase(),
    privacyConsented: true,
    approved: false,                  // ← pending admin approval
    salt, hash,
  });
  save(users);
  return publicFields(users[users.length - 1]);
}

/** Mark a user as approved (admin action). */
export function approveUser(userId) {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  users[idx].approved = true;
  save(users);
  return publicFields(users[idx]);
}

/** Complete first-time profile — sets firstName, lastName, email, privacyConsented, profileCompleted */
export function completeProfile(userId, { firstName, lastName, email }) {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  users[idx] = {
    ...users[idx],
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    privacyConsented: true,
    profileCompleted: true,
  };
  save(users);
  return publicFields(users[idx]);
}

export function updateUser(userId, fields) {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  if (fields.username && fields.username !== users[idx].username) {
    if (users.find(u => u.username === fields.username)) throw new Error('שם משתמש כבר קיים');
  }
  const allowed = ['canHostRoom', 'role', 'username', 'blocked', 'expiresAt'];
  allowed.forEach(k => { if (k in fields) users[idx][k] = fields[k]; });
  save(users);
  return publicFields(users[idx]);
}

/**
 * Scan users and auto-block those whose expiresAt has passed.
 * Returns the list of newly-blocked user IDs (so caller can kill their sessions).
 */
export function lockExpiredUsers() {
  const users = load();
  const now = Date.now();
  const newlyLocked = [];
  let changed = false;
  for (const u of users) {
    if (u.expiresAt && u.expiresAt < now && !u.blocked) {
      u.blocked = true;
      newlyLocked.push(u.id);
      changed = true;
    }
  }
  if (changed) save(users);
  return newlyLocked;
}

export function resetPassword(userId, newPassword) {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  const { salt, hash } = createHash(newPassword);
  users[idx] = { ...users[idx], salt, hash };
  save(users);
}

export function deleteUser(userId) {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  if (isProtected(users[idx])) {
    throw new Error('לא ניתן למחוק משתמש זה — חשבון מערכת מוגן');
  }
  users.splice(idx, 1);
  save(users);
}

export function saveAvatar(userId, base64Data) {
  if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });
  const m = base64Data.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!m) throw new Error('פורמט תמונה לא תקין');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw new Error('תמונה גדולה מדי (מקסימום 4MB)');
  for (const e of ['jpg', 'png', 'webp', 'gif']) {
    const old = join(AVATAR_DIR, `${userId}.${e}`);
    if (existsSync(old)) try { unlinkSync(old); } catch {}
  }
  writeFileSync(join(AVATAR_DIR, `${userId}.${ext}`), buf);
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx !== -1) { users[idx].hasAvatar = true; save(users); }
}

export function getAvatarPath(userId) {
  for (const ext of ['jpg', 'png', 'webp', 'gif']) {
    const p = join(AVATAR_DIR, `${userId}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

init();
