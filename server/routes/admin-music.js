/**
 * Admin Music Library — list, upload, delete files inside the configured
 * local-playlist folders. Admin-only; rejected paths that escape the
 * playlist root.
 */
import { Router } from 'express';
import multer from 'multer';
import { promises as fs, existsSync, statSync } from 'fs';
import { join, basename, normalize, resolve } from 'path';
import { getSettings } from '../services/SettingsStore.js';

const router = Router();

const ALLOWED_EXT = new Set(['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg']);
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB per file

// ── Helpers ───────────────────────────────────────────────────────────────
function localPlaylists() {
  const { playlists = [] } = getSettings();
  return playlists.filter(p => p.type === 'local' && p.path);
}

function findPlaylistById(id) {
  return localPlaylists().find(p => p.id === id);
}

/** Reject anything that resolves outside the playlist root (path-traversal
 *  protection). Returns the absolute, resolved file path or null if invalid. */
function safeJoin(playlistPath, filename) {
  const safeName = basename(filename);                 // strip any /\..
  if (!safeName || safeName.startsWith('.')) return null;
  const ext = safeName.slice(safeName.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  const full = resolve(join(playlistPath, safeName));
  const root = resolve(playlistPath);
  if (!full.startsWith(root + '/') && full !== root) return null;
  return full;
}

async function dirStats(dir) {
  if (!existsSync(dir)) return { files: 0, sizeBytes: 0, exists: false };
  let files = 0, sizeBytes = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const p = join(dir, e.name);
      try { const s = statSync(p); sizeBytes += s.size; files++; } catch {}
    }
  } catch {}
  return { files, sizeBytes, exists: true };
}

// ── Multer storage — each request defines target playlist via ?playlistId ──
const upload = multer({
  limits: { fileSize: MAX_FILE_BYTES },
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      const pl = findPlaylistById(req.query.playlistId);
      if (!pl) return cb(new Error('פלייליסט לא קיים או לא מקומי'), '');
      try {
        if (!existsSync(pl.path)) await fs.mkdir(pl.path, { recursive: true });
        cb(null, pl.path);
      } catch (e) { cb(e, ''); }
    },
    filename: (_req, file, cb) => {
      const safeName = basename(file.originalname);
      const ext = safeName.slice(safeName.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) return cb(new Error('סוג קובץ לא נתמך'), '');
      cb(null, safeName);
    },
  }),
});

// ── GET /api/admin/music/stats — overview per playlist ────────────────────
router.get('/stats', async (_req, res) => {
  const pls = localPlaylists();
  const out = await Promise.all(pls.map(async p => ({
    id: p.id,
    name: p.name,
    path: p.path,
    ...(await dirStats(p.path)),
  })));
  res.json(out);
});

// ── GET /api/admin/music/list/:playlistId — list files in a playlist ──────
router.get('/list/:playlistId', async (req, res) => {
  const pl = findPlaylistById(req.params.playlistId);
  if (!pl) return res.status(404).json({ error: 'פלייליסט לא קיים או לא מקומי' });
  if (!existsSync(pl.path)) return res.json({ playlist: pl, files: [] });
  try {
    const entries = await fs.readdir(pl.path, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const p = join(pl.path, e.name);
      try {
        const s = statSync(p);
        files.push({ name: e.name, sizeBytes: s.size, mtime: s.mtimeMs });
      } catch {}
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    res.json({ playlist: { id: pl.id, name: pl.name, path: pl.path }, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/music/upload?playlistId=... — upload one or more files ─
router.post('/upload', upload.array('files', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'לא נשלחו קבצים' });
  }
  const uploaded = req.files.map(f => ({
    name: f.filename,
    sizeBytes: f.size,
    path: f.path,
  }));
  res.json({ uploaded });
});

// Surface multer errors as friendly JSON
router.use((err, _req, res, _next) => {
  if (err) return res.status(400).json({ error: err.message });
});

// ── DELETE /api/admin/music/file?playlistId=...&filename=... ──────────────
router.delete('/file', async (req, res) => {
  const pl = findPlaylistById(req.query.playlistId);
  if (!pl) return res.status(404).json({ error: 'פלייליסט לא קיים או לא מקומי' });
  const full = safeJoin(pl.path, req.query.filename || '');
  if (!full) return res.status(400).json({ error: 'שם קובץ לא תקין' });
  try {
    await fs.unlink(full);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'קובץ לא נמצא' });
    res.status(500).json({ error: e.message });
  }
});

export default router;
