import { pbkdf2Sync, randomBytes } from 'crypto';

const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';
const SALT_BYTES = 16;

/** Hash `password` with `salt` using PBKDF2-SHA512 (100k iterations). */
export function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
}

/** Generate a fresh salt + hash for a new password. */
export function createHash(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  return { salt, hash: hashPassword(password, salt) };
}

/** Constant-time-ish comparison of a candidate password against a stored salt+hash. */
export function verifyPassword(password, salt, storedHash) {
  return hashPassword(password, salt) === storedHash;
}
