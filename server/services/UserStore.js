import { pbkdf2Sync, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');
const AVATAR_DIR = join(DATA_DIR, 'avatars');

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
function publicFields(u) {
  return {
    id: u.id, username: u.username, role: u.role,
    canHostRoom: u.canHostRoom ?? (u.role === 'admin'),
    hasAvatar: u.hasAvatar ?? false,
  };
}
function init() {
  if (!existsSync(USERS_FILE)) {
    const users = ['אורן יהב', 'רותם יהב'].map((username, i) => {
      const { salt, hash } = createHash('!@A22011979a');
      return { id: String(i + 1), username, role: 'admin', canHostRoom: true, hasAvatar: false, salt, hash };
    });
    save(users);
  }
}

export function getAllUsers() { return load().map(publicFields); }

export function authenticate(username, password) {
  const users = load();
  const user = users.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.salt, user.hash)) return null;
  return publicFields(user);
}

export function createUser(username, password, role = 'user') {
  const users = load();
  if (users.find(u => u.username === username)) throw new Error('שם משתמש כבר קיים');
  const { salt, hash } = createHash(password);
  const id = String(Date.now());
  users.push({ id, username, role, canHostRoom: role === 'admin', hasAvatar: false, salt, hash });
  save(users);
  return publicFields(users[users.length - 1]);
}

export function updateUser(userId, fields) {
  const users = load();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) throw new Error('משתמש לא נמצא');
  if (fields.username && fields.username !== users[idx].username) {
    if (users.find(u => u.username === fields.username)) throw new Error('שם משתמש כבר קיים');
  }
  ['canHostRoom', 'role', 'username'].forEach(k => { if (k in fields) users[idx][k] = fields[k]; });
  save(users);
  return publicFields(users[idx]);
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
