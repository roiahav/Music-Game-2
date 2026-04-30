import { Router } from 'express';
import { createReadStream, statSync, existsSync } from 'fs';

const router = Router();

// GET /api/audio/:encodedPath
router.get('/:encodedPath(*)', (req, res) => {
  // Express auto-decodes the param, so use it directly
  const filePath = req.params.encodedPath;

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return res.status(500).json({ error: 'Cannot stat file' });
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mpeg',
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
    });
    createReadStream(filePath).pipe(res);
  }
});

export default router;
