import { Router } from 'express';
import { getCoverBuffer } from '../services/MetadataService.js';

const router = Router();

// GET /api/cover/:encodedPath
router.get('/:encodedPath(*)', async (req, res) => {
  // Express auto-decodes the param, so just use it directly
  const filePath = req.params.encodedPath;

  try {
    const cover = await getCoverBuffer(filePath);
    if (!cover) return res.status(404).json({ error: 'No cover art found' });

    // Normalize MIME type (music-metadata may return "jpeg" or "image/jpeg")
    const mime = cover.format.includes('/') ? cover.format : `image/${cover.format.toLowerCase()}`;

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Ensure we send a proper Buffer
    res.end(Buffer.isBuffer(cover.data) ? cover.data : Buffer.from(cover.data));
  } catch (err) {
    console.error('Cover error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
