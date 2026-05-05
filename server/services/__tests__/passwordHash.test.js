import { describe, it, expect } from 'vitest';
import { hashPassword, createHash, verifyPassword } from '../passwordHash.js';

describe('passwordHash', () => {
  it('createHash returns a fresh salt and hash', () => {
    const a = createHash('hello');
    const b = createHash('hello');
    expect(a.salt).toHaveLength(32); // 16 bytes hex-encoded
    expect(a.hash).toMatch(/^[0-9a-f]+$/);
    // Different salts → different hashes for the same password
    expect(a.salt).not.toEqual(b.salt);
    expect(a.hash).not.toEqual(b.hash);
  });

  it('verifyPassword accepts the right password', () => {
    const { salt, hash } = createHash('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', salt, hash)).toBe(true);
  });

  it('verifyPassword rejects the wrong password', () => {
    const { salt, hash } = createHash('correct horse');
    expect(verifyPassword('wrong horse', salt, hash)).toBe(false);
    expect(verifyPassword('', salt, hash)).toBe(false);
  });

  it('hashPassword is deterministic for the same salt', () => {
    const salt = 'aaaa';
    expect(hashPassword('p', salt)).toEqual(hashPassword('p', salt));
  });

  it('hashPassword distinguishes near-identical inputs', () => {
    const salt = 'aaaa';
    expect(hashPassword('password', salt)).not.toEqual(hashPassword('Password', salt));
    expect(hashPassword('a', salt)).not.toEqual(hashPassword('a ', salt));
  });
});
