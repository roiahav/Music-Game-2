import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../api/client.js', () => ({
  getBlacklist: vi.fn(() => Promise.resolve([])),
  addToBlacklist: vi.fn(() => Promise.resolve()),
  removeFromBlacklist: vi.fn(() => Promise.resolve()),
}));

vi.mock('../store/authStore.js', () => ({
  useAuthStore: (selector) => selector({ user: { role: 'admin' } }),
}));

import * as api from '../api/client.js';
import { useBlacklist } from './useBlacklist.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useBlacklist (admin)', () => {
  it('seeds the set from getBlacklist on mount', async () => {
    api.getBlacklist.mockResolvedValueOnce(['s1', 's2', 's3']);
    const { result } = renderHook(() => useBlacklist());
    await waitFor(() => expect(result.current.blacklistIds.size).toBe(3));
    expect(result.current.isAdmin).toBe(true);
  });

  it('toggleBlacklist adds a missing id and calls addToBlacklist', async () => {
    const { result } = renderHook(() => useBlacklist());
    await waitFor(() => expect(api.getBlacklist).toHaveBeenCalled());
    await act(async () => { await result.current.toggleBlacklist('sNew'); });
    expect(api.addToBlacklist).toHaveBeenCalledWith('sNew');
    expect(result.current.blacklistIds.has('sNew')).toBe(true);
  });

  it('toggleBlacklist removes an existing id and calls removeFromBlacklist', async () => {
    api.getBlacklist.mockResolvedValueOnce(['s1']);
    const { result } = renderHook(() => useBlacklist());
    await waitFor(() => expect(result.current.blacklistIds.has('s1')).toBe(true));
    await act(async () => { await result.current.toggleBlacklist('s1'); });
    expect(api.removeFromBlacklist).toHaveBeenCalledWith('s1');
    expect(result.current.blacklistIds.has('s1')).toBe(false);
  });

  it('ignores empty / falsy songId', async () => {
    const { result } = renderHook(() => useBlacklist());
    await waitFor(() => expect(api.getBlacklist).toHaveBeenCalled());
    await act(async () => {
      await result.current.toggleBlacklist('');
      await result.current.toggleBlacklist(null);
      await result.current.toggleBlacklist(undefined);
    });
    expect(api.addToBlacklist).not.toHaveBeenCalled();
    expect(api.removeFromBlacklist).not.toHaveBeenCalled();
  });
});

describe('useBlacklist (non-admin)', () => {
  it('does not call getBlacklist for regular users', async () => {
    // Re-mock the store to return a non-admin user
    vi.resetModules();
    vi.doMock('../store/authStore.js', () => ({
      useAuthStore: (selector) => selector({ user: { role: 'user' } }),
    }));
    const apiMod = await import('../api/client.js');
    apiMod.getBlacklist.mockClear();
    const { useBlacklist: useBlacklistFresh } = await import('./useBlacklist.js');
    const { result } = renderHook(() => useBlacklistFresh());
    // Give the effect a chance to run
    await new Promise(r => setTimeout(r, 10));
    expect(apiMod.getBlacklist).not.toHaveBeenCalled();
    expect(result.current.isAdmin).toBe(false);
  });
});
