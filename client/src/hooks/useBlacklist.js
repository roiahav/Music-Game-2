import { useState, useCallback, useEffect } from 'react';
import { getBlacklist, addToBlacklist, removeFromBlacklist } from '../api/client.js';
import { useAuthStore } from '../store/authStore.js';

export function useBlacklist() {
  const [blacklistIds, setBlacklistIds] = useState(new Set());
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    getBlacklist().then(ids => setBlacklistIds(new Set(ids))).catch(() => {});
  }, [isAdmin]);

  const toggleBlacklist = useCallback(async (songId) => {
    if (!songId) return;
    if (blacklistIds.has(songId)) {
      setBlacklistIds(prev => { const n = new Set(prev); n.delete(songId); return n; });
      await removeFromBlacklist(songId).catch(() => {});
    } else {
      setBlacklistIds(prev => new Set([...prev, songId]));
      await addToBlacklist(songId).catch(() => {});
    }
  }, [blacklistIds]);

  return { blacklistIds, toggleBlacklist, isAdmin };
}
