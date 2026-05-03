import { Router } from 'express';
import { getUserFavorites, addFavorite, removeFavorite, reorderFavorites } from '../services/FavoritesStore.js';
import { getSettings } from '../services/SettingsStore.js';

const router = Router();

// Favorites change frequently and are user-specific. Disable HTTP caching so
// browsers (and any intermediate proxies) never serve a stale list.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/** Derive playlistId/Name from filePath by matching against local playlist paths */
function enrichWithPlaylist(favorites) {
  const { playlists = [] } = getSettings();
  const localPlaylists = playlists.filter(p => p.type === 'local' && p.path);
  return favorites.map(s => {
    let playlistId = null, playlistName = null;
    if (s.filePath) {
      const norm = s.filePath.replace(/\\/g, '/').toLowerCase();
      for (const p of localPlaylists) {
        const pNorm = p.path.replace(/\\/g, '/').toLowerCase();
        if (norm.startsWith(pNorm)) {
          playlistId = p.id;
          playlistName = p.name;
          break;
        }
      }
    }
    return {
      ...s,
      audioUrl: s.filePath ? `/api/audio/${encodeURIComponent(s.filePath)}` : null,
      coverUrl: s.filePath ? `/api/cover/${encodeURIComponent(s.filePath)}` : null,
      playlistId,
      playlistName,
    };
  });
}

// GET /api/favorites — list user's favorites (enriched with playlist info)
router.get('/', (req, res) => {
  const favorites = getUserFavorites(req.user.id);
  res.json(enrichWithPlaylist(favorites));
});

// POST /api/favorites/:songId — add song
router.post('/:songId', (req, res) => {
  const { filePath, title, artist, year } = req.body;
  const song = {
    id: req.params.songId,
    filePath: filePath || '',
    title: title || '',
    artist: artist || '',
    year: year || '',
  };
  const updated = addFavorite(req.user.id, song);
  res.json(enrichWithPlaylist(updated));
});

// DELETE /api/favorites/:songId — remove song
router.delete('/:songId', (req, res) => {
  const updated = removeFavorite(req.user.id, req.params.songId);
  res.json(enrichWithPlaylist(updated));
});

// PATCH /api/favorites/reorder — save new order { ids: [...] }
router.patch('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
  const updated = reorderFavorites(req.user.id, ids);
  res.json(enrichWithPlaylist(updated));
});

export default router;
