import { useState, useEffect, useCallback } from 'react';
import { getFavorites, addFavorite, removeFavorite } from '../api/client.js';

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState(new Set());

  useEffect(() => {
    getFavorites()
      .then(songs => setFavoriteIds(new Set(songs.map(s => s.id))))
      .catch(() => {});
  }, []);

  const toggle = useCallback(async (song) => {
    if (!song?.id) return;
    if (favoriteIds.has(song.id)) {
      setFavoriteIds(prev => { const n = new Set(prev); n.delete(song.id); return n; });
      removeFavorite(song.id).catch(() => {
        setFavoriteIds(prev => new Set([...prev, song.id])); // revert on error
      });
    } else {
      setFavoriteIds(prev => new Set([...prev, song.id]));
      addFavorite(song.id, {
        filePath: song.filePath || song.audioUrl || '',
        title: song.title || '',
        artist: song.artist || '',
        year: song.year || '',
      }).catch(() => {
        setFavoriteIds(prev => { const n = new Set(prev); n.delete(song.id); return n; }); // revert on error
      });
    }
  }, [favoriteIds]);

  return { favoriteIds, toggle };
}
