import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSession, getSession, getSessionData, deleteSession, deleteSessionsByUserId } from '../SessionStore.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionStore', () => {
  it('createSession returns a 64-char hex token', () => {
    const token = createSession({ id: 'u1', username: 'alice' });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('getSession resolves the user object', () => {
    const user = { id: 'u2', username: 'bob' };
    const token = createSession(user);
    expect(getSession(token)).toEqual(user);
  });

  it('getSession returns null for unknown token', () => {
    expect(getSession('nosuchtoken')).toBeNull();
    expect(getSession(null)).toBeNull();
    expect(getSession('')).toBeNull();
  });

  it('getSession returns null after the TTL expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = createSession({ id: 'u3', username: 'carol' });
    expect(getSession(token)).not.toBeNull();
    // Default TTL is 7 days — jump 8 days forward
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z'));
    expect(getSession(token)).toBeNull();
  });

  it('getSessionData returns wrapping object with loginAt + expiresAt', () => {
    const token = createSession({ id: 'u4', username: 'dave' });
    const data = getSessionData(token);
    expect(data).toMatchObject({
      user: { id: 'u4' },
      loginAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      expiresAt: expect.any(Number),
    });
  });

  it('deleteSession removes the token', () => {
    const token = createSession({ id: 'u5', username: 'eve' });
    deleteSession(token);
    expect(getSession(token)).toBeNull();
  });

  it('deleteSessionsByUserId revokes every active session for that user', () => {
    const t1 = createSession({ id: 'u6', username: 'frank' });
    const t2 = createSession({ id: 'u6', username: 'frank' });
    const t3 = createSession({ id: 'u7', username: 'gina' });
    deleteSessionsByUserId('u6');
    expect(getSession(t1)).toBeNull();
    expect(getSession(t2)).toBeNull();
    expect(getSession(t3)).not.toBeNull();
  });
});
