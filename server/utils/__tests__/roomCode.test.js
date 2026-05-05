import { describe, it, expect } from 'vitest';
import { generateRoomCode } from '../roomCode.js';

describe('generateRoomCode', () => {
  it('returns a 4-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^\d{4}$/);
      const n = Number(code);
      expect(n).toBeGreaterThanOrEqual(1000);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });

  it('avoids codes that are already in use', () => {
    const used = new Set(['1234', '1235', '1236']);
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      const code = generateRoomCode(c => used.has(c));
      expect(used.has(code)).toBe(false);
      seen.add(code);
    }
    // Sanity — we generated something
    expect(seen.size).toBeGreaterThan(0);
  });

  it('finds a free code even when 9000+ are exhausted', () => {
    // Block every code except 5555 — must converge on it
    const code = generateRoomCode(c => c !== '5555');
    expect(code).toBe('5555');
  });
});
