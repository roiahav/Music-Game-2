import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// All side-effecting modules used by routes/auth.js are mocked so the route
// logic can be exercised in isolation. Each test gets a fresh app instance,
// which also resets the in-memory rate-limit counters.

vi.mock('../../services/UserStore.js', () => ({
  authenticate: vi.fn(),
  completeProfile: vi.fn(),
  getAllUsers: vi.fn(() => []),
  resetPassword: vi.fn(),
}));
vi.mock('../../services/SessionStore.js', () => ({
  createSession: vi.fn(() => 'tok-fake'),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  getSessionData: vi.fn(),
}));
vi.mock('../../services/ActivityLog.js', () => ({
  logLogin: vi.fn(),
  logLogout: vi.fn(),
}));
vi.mock('../../services/ResetTokenStore.js', () => ({
  createResetToken: vi.fn(() => 'reset-tok'),
  validateResetToken: vi.fn(),
  consumeResetToken: vi.fn(),
}));
vi.mock('../../services/EmailService.js', () => ({
  sendResetEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
}));

import { authenticate, getAllUsers, resetPassword } from '../../services/UserStore.js';
import { getSession } from '../../services/SessionStore.js';
import { validateResetToken, consumeResetToken } from '../../services/ResetTokenStore.js';

// `app.set('trust proxy', true)` plus a unique X-Forwarded-For per-test gives
// each test its own rate-limit bucket without re-importing the auth module.
let _ip = 0;
function nextIp() { return `10.0.0.${++_ip % 250 + 1}`; }

async function makeApp() {
  const { default: authRouter } = await import('../auth.js');
  const app = express();
  // Trust exactly one proxy hop — same setting as production (server/index.js)
  // and avoids the "permissive trust proxy" warning that `true` triggers in
  // express-rate-limit's validation.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

// Helper: each request comes from a fresh fake IP so the per-IP limiter starts
// at zero. Tests that explicitly want to test the limiter pin a single IP.
function send(app, method, path) {
  return request(app)[method](path).set('X-Forwarded-For', nextIp());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/auth/login', () => {
  it('returns 400 when username or password is missing', async () => {
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/נדרשים/);
  });

  it('returns 401 on wrong credentials', async () => {
    authenticate.mockReturnValueOnce(null);
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/login').send({ username: 'a', password: 'b' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/שגויים/);
  });

  it('returns 403 with `pending` for unapproved accounts', async () => {
    authenticate.mockReturnValueOnce({ pending: true });
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/login').send({ username: 'a', password: 'b' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('pending');
  });

  it('returns 403 with `blocked` for blocked accounts', async () => {
    authenticate.mockReturnValueOnce({ blocked: true });
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/login').send({ username: 'a', password: 'b' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('blocked');
  });

  it('returns 200 + token + user on success', async () => {
    authenticate.mockReturnValueOnce({ id: 'u1', username: 'alice', role: 'user' });
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/login').send({ username: 'alice', password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ token: 'tok-fake', user: { id: 'u1', username: 'alice' } });
  });

  it('rate-limits after 10 attempts within the window', async () => {
    const app = await makeApp();
    authenticate.mockReturnValue(null);
    // Pin a single IP so the limiter sees the same client every time
    const ip = '10.99.0.1';
    const attempt = () => request(app).post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ username: 'x', password: 'y' });
    for (let i = 0; i < 10; i++) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/יותר מדי ניסיונות/);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('returns 400 when email is missing', async () => {
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 even when no account matches (no enumeration)', async () => {
    getAllUsers.mockReturnValueOnce([]);
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sends a reset email when account is found (case-insensitive match)', async () => {
    getAllUsers.mockReturnValueOnce([{ id: 'u9', email: 'alice@example.com', firstName: 'Alice' }]);
    const { sendResetEmail } = await import('../../services/EmailService.js');
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/forgot-password').send({ email: 'ALICE@example.com' });
    expect(res.status).toBe(200);
    expect(sendResetEmail).toHaveBeenCalledTimes(1);
    expect(sendResetEmail.mock.calls[0][0]).toBe('alice@example.com');
  });

  it('rate-limits after 5 attempts within the window', async () => {
    const app = await makeApp();
    getAllUsers.mockReturnValue([]);
    const ip = '10.99.0.2';
    const attempt = () => request(app).post('/api/auth/forgot-password')
      .set('X-Forwarded-For', ip)
      .send({ email: 'a@b.c' });
    for (let i = 0; i < 5; i++) {
      const res = await attempt();
      expect(res.status).toBe(200);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('returns 400 when token is missing', async () => {
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/reset-password').send({ newPassword: 'newer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/טוקן/);
  });

  it('returns 400 for short passwords', async () => {
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/reset-password').send({ token: 't', newPassword: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/4 תווים/);
  });

  it('returns 400 when the token is invalid or expired', async () => {
    validateResetToken.mockReturnValueOnce(null);
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/reset-password').send({ token: 'bad', newPassword: 'newer' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/תוקף/);
  });

  it('resets the password and consumes the token on success', async () => {
    validateResetToken.mockReturnValueOnce({ userId: 'u1' });
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/reset-password').send({ token: 'ok', newPassword: 'newer' });
    expect(res.status).toBe(200);
    expect(resetPassword).toHaveBeenCalledWith('u1', 'newer');
    expect(consumeResetToken).toHaveBeenCalledWith('ok');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session', async () => {
    getSession.mockReturnValueOnce(null);
    const app = await makeApp();
    const res = await send(app, 'get', '/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the user when the session is valid', async () => {
    getSession.mockReturnValueOnce({ id: 'u1', username: 'alice' });
    const app = await makeApp();
    const res = await send(app, 'get', '/api/auth/me').set('Authorization', 'Bearer tok-x');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', username: 'alice' });
  });
});

describe('POST /api/auth/logout', () => {
  it('always returns ok, even without a token', async () => {
    const app = await makeApp();
    const res = await send(app, 'post', '/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
