import { Router } from 'express';
import { getSettings } from '../services/SettingsStore.js';
import { scanFolder } from '../services/FileScanner.js';
import { getSongMetadata } from '../services/MetadataService.js';
import { getPlaylistTracks } from '../services/SpotifyService.js';

const router = Router();

// GET /api/playlists
router.get('/', (req, res) => {
  const { playlists } = getSettings();
  res.json(playlists.map(p => ({ id: p.id, name: p.name, type: p.type, path: p.path || '', spotifyUri: p.spotifyUri || '' })));
});

// GET /api/playlists/:id/songs
router.get('/:id/songs', async (req, res) => {
  const { playlists } = getSettings();
  const playlist = playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

  try {
    if (playlist.type === 'local') {
      const files = scanFolder(playlist.path);
      const songs = await Promise.all(files.map(f => getSongMetadata(f)));
      // Attach streaming URLs
      const result = songs.map(s => ({
        ...s,
        audioUrl: `/api/audio/${encodeURIComponent(s.filePath)}`,
        coverUrl: s.hasCover ? `/api/cover/${encodeURIComponent(s.filePath)}` : null,
      }));
      res.json(result);
    } else if (playlist.type === 'spotify') {
      const playlistId = playlist.spotifyUri.split(':').pop();
      const songs = await getPlaylistTracks(playlistId);
      res.json(songs);
    } else {
      res.status(400).json({ error: 'Unknown playlist type' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
