import { Router } from 'express';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, parse } from 'path';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/browse?path=C:\Music
router.get('/', requireAdmin, (req, res) => {
  let { path: dirPath } = req.query;

  // Default: roots
  if (!dirPath) {
    // On Windows return drive letters, on Linux return /
    const isWin = process.platform === 'win32';
    if (isWin) {
      // Try common drives
      const drives = [];
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        const d = `${letter}:\\`;
        try { statSync(d); drives.push({ name: d, path: d, type: 'dir' }); } catch {}
      }
      return res.json({ path: '', parent: null, entries: drives });
    } else {
      dirPath = '/';
    }
  }

  if (!existsSync(dirPath)) {
    return res.status(404).json({ error: 'נתיב לא קיים' });
  }

  try {
    const showFiles = req.query.files === 'true';
    const AUDIO_EXT = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac']);

    const all = readdirSync(dirPath, { withFileTypes: true });
    const entries = [];
    for (const e of all) {
      if (e.isDirectory()) {
        entries.push({ name: e.name, path: join(dirPath, e.name), type: 'dir' });
      } else if (showFiles && e.isFile()) {
        const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
        if (AUDIO_EXT.has(ext)) entries.push({ name: e.name, path: join(dirPath, e.name), type: 'file' });
      }
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Parent path
    const parsed = parse(dirPath);
    const parent = parsed.dir !== dirPath ? parsed.dir : null;

    res.json({ path: dirPath, parent, entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
