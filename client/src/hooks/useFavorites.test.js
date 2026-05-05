import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// API module is mocked so the hook's optimistic-update + rollback logic can be
// exercised without hitting the network.
vi.mock('../api/client.js', () => ({
  getFavorites: vi.fn(() => Promise.resolve([])),
  addFavorite: vi.fn(() => Promise.resolve()),
  removeFavorite: vi.fn(() => Promise.resolve()),
}));

import * as api from '../api/client.js';
import { useFavorites } from './useFavorites.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useFavorites', () => {
  it('starts empty and seeds favourites from getFavorites()', async () => {
    api.getFavorites.mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]);
    const { result } = renderHook(() => useFavorites());
    expect(result.current.favoriteIds.size).toBe(0); // before effect
    await waitFor(() => expect(result.current.favoriteIds.size).toBe(2));
    expect(result.current.favoriteIds.has('s1')).toBe(true);
    expect(result.current.favoriteIds.has('s2')).toBe(true);
  });

  it('toggling a non-favourite calls addFavorite and updates state optimistically', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(api.getFavorites).toHaveBeenCalled());
    await act(async () => {
      await result.current.toggle({ id: 's1', title: 'Hey', artist: 'X', year: '2020' });
    });
    expect(api.addFavorite).toHaveBeenCalledTimes(1);
    expect(api.addFavorite.mock.calls[0][0]).toBe('s1');
    expect(api.addFavorite.mock.calls[0][1]).toMatchObject({ title: 'Hey', artist: 'X', year: '2020' });
    expect(result.current.favoriteIds.has('s1')).toBe(true);
  });

  it('toggling an existing favourite calls removeFavorite and updates state', async () => {
    api.getFavorites.mockResolvedValueOnce([{ id: 's1' }]);
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.favoriteIds.has('s1')).toBe(true));
    await act(async () => { await result.current.toggle({ id: 's1' }); });
    expect(api.removeFavorite).toHaveBeenCalledWith('s1');
    expect(result.current.favoriteIds.has('s1')).toBe(false);
  });

  it('rolls back when addFavorite rejects', async () => {
    api.addFavorite.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(api.getFavorites).toHaveBeenCalled());
    await act(async () => { await result.current.toggle({ id: 's1' }); });
    // After the rejection has been processed, the optimistic add is reverted
    await waitFor(() => expect(result.current.favoriteIds.has('s1')).toBe(false));
  });

  it('rolls back when removeFavorite rejects', async () => {
    api.getFavorites.mockResolvedValueOnce([{ id: 's1' }]);
    api.removeFavorite.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.favoriteIds.has('s1')).toBe(true));
    await act(async () => { await result.current.toggle({ id: 's1' }); });
    await waitFor(() => expect(result.current.favoriteIds.has('s1')).toBe(true));
  });

  it('ignores toggles when the song has no id', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(api.getFavorites).toHaveBeenCalled());
    await act(async () => {
      await result.current.toggle({});
      await result.current.toggle(null);
    });
    expect(api.addFavorite).not.toHaveBeenCalled();
    expect(api.removeFavorite).not.toHaveBeenCalled();
  });

  it('passes audioUrl as filePath fallback when filePath is missing', async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(api.getFavorites).toHaveBeenCalled());
    await act(async () => {
      await result.current.toggle({ id: 'sX', audioUrl: '/api/audio/abc' });
    });
    expect(api.addFavorite.mock.calls[0][1].filePath).toBe('/api/audio/abc');
  });
});
