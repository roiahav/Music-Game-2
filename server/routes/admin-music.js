/**
 * Admin Music Library — list, upload, delete files inside the configured
 * local-playlist folders. Admin-only; rejected paths that escape the
 * playlist root.
 */
import { Router } from 'express';
import multer from 'multer';
import NodeID3 from 'node-id3';
import { parseFile } from 'music-metadata';
import { promises as fs, existsSync, statSync } from 'fs';
import { join, basename, normalize, resolve, extname, dirname } from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { getSettings, saveSettings } from '../services/SettingsStore.js';

const sha1 = s => createHash('sha1').update(s).digest('hex');
const __dirname = dirname(fileURLToPath(import.meta.url));

// Where new local playlists are created when the admin uses the "Add new
// playlist" shortcut. We pick the parent dir of an existing local playlist
// (so all music sits next to each other), falling back to `<app>/music/`.
function getMusicRoot() {
  const { playlists = [] } = getSettings();
  const local = playlists.find(p => p.type === 'local' && p.path);
  if (local) return dirname(local.path);
  return resolve(__dirname, '..', '..', 'music');
}

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
    hidden: !!p.hidden,
    ...(await dirStats(p.path)),
  })));
  res.json(out);
});

// ── GET /api/admin/music/artists ─────────────────────────────────────────
// Returns the unique, locale-sorted set of artist tags across every local
// playlist. Used by the metadata editor's autocomplete so the admin can
// pick a name they've already used elsewhere — useful when normalising
// e.g. "Aviv Geffen" / "אביב גפן" across all folders.
router.get('/artists', async (_req, res) => {
  const pls = localPlaylists();
  const set = new Set();
  for (const pl of pls) {
    if (!existsSync(pl.path)) continue;
    let entries = [];
    try { entries = await fs.readdir(pl.path, { withFileTypes: true }); } catch { continue; }
    const files = entries.filter(e => e.isFile() && ALLOWED_EXT.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()));
    const BATCH = 20;
    for (let i = 0; i < files.length; i += BATCH) {
      const slice = files.slice(i, i + BATCH);
      const metas = await Promise.all(slice.map(f => readMetaFor(join(pl.path, f.name))));
      for (const m of metas) {
        const a = (m.artist || '').trim();
        if (a) set.add(a);
      }
    }
  }
  const artists = [...set].sort((a, b) => a.localeCompare(b, 'he'));
  res.json({ artists });
});

// ── GET /api/admin/music/duplicates ──────────────────────────────────────
// Scan every local playlist, group files by lower(artist + ' - ' + title),
// and return groups of size > 1 so the admin can resolve them. Files where
// both artist and title are empty fall back to filename matching.
router.get('/duplicates', async (_req, res) => {
  const pls = localPlaylists();
  const all = [];
  for (const pl of pls) {
    if (!existsSync(pl.path)) continue;
    let entries = [];
    try { entries = await fs.readdir(pl.path, { withFileTypes: true }); } catch { continue; }
    const files = entries.filter(e => e.isFile() && ALLOWED_EXT.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()));
    const BATCH = 20;
    for (let i = 0; i < files.length; i += BATCH) {
      const slice = files.slice(i, i + BATCH);
      const metas = await Promise.all(slice.map(async f => {
        const fullPath = join(pl.path, f.name);
        let sizeBytes = 0;
        try { sizeBytes = statSync(fullPath).size; } catch {}
        const meta = await readMetaFor(fullPath);
        return {
          playlistId: pl.id,
          playlistName: pl.name,
          filename: f.name,
          sizeBytes,
          ...meta,
        };
      }));
      all.push(...metas);
    }
  }
  // Group key: prefer artist+title (normalised); fall back to filename.
  const groups = new Map();
  for (const item of all) {
    const a = (item.artist || '').trim().toLowerCase();
    const t = (item.title  || '').trim().toLowerCase();
    const key = (a && t) ? `tag:${a} ​ ${t}` : `name:${item.filename.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { key, kind: key.startsWith('tag:') ? 'tag' : 'filename', items: [] });
    groups.get(key).items.push(item);
  }
  const duplicates = [...groups.values()].filter(g => g.items.length > 1);
  res.json({ duplicates });
});

// Read embedded ID3/Vorbis tags + duration. Lightweight enough to call per
// file in the list endpoint (~3-5ms each on local disk).
async function readMetaFor(filePath) {
  try {
    const m = await parseFile(filePath, { skipCovers: true, duration: true });
    const c = m.common;
    let year = '';
    if (c.year) year = String(c.year);
    else if (c.date) year = String(c.date).substring(0, 4);
    else if (c.originalyear) year = String(c.originalyear);
    return {
      title:    c.title || '',
      artist:   c.artist || (c.artists && c.artists[0]) || '',
      album:    c.album || '',
      year,
      genre:    (c.genre && c.genre[0]) || '',
      track:    c.track?.no || null,
      duration: m.format?.duration ? Math.round(m.format.duration) : null,
      hasCover: !!(c.picture && c.picture.length),
    };
  } catch {
    return { title: '', artist: '', album: '', year: '', genre: '', track: null, duration: null, hasCover: false };
  }
}

// ── GET /api/admin/music/list/:playlistId — list files + embedded metadata ──
router.get('/list/:playlistId', async (req, res) => {
  const pl = findPlaylistById(req.params.playlistId);
  if (!pl) return res.status(404).json({ error: 'פלייליסט לא קיים או לא מקומי' });
  if (!existsSync(pl.path)) return res.json({ playlist: pl, files: [] });
  try {
    const entries = await fs.readdir(pl.path, { withFileTypes: true });
    const candidates = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      const p = join(pl.path, e.name);
      try {
        const s = statSync(p);
        candidates.push({ name: e.name, fullPath: p, sizeBytes: s.size, mtime: s.mtimeMs });
      } catch {}
    }
    // Read metadata in parallel batches so 600 files don't take forever
    const BATCH = 20;
    const files = [];
    for (let i = 0; i < candidates.length; i += BATCH) {
      const slice = candidates.slice(i, i + BATCH);
      const metas = await Promise.all(slice.map(c => readMetaFor(c.fullPath)));
      slice.forEach((c, idx) => files.push({
        name: c.name,
        sizeBytes: c.sizeBytes,
        mtime: c.mtime,
        ...metas[idx],
      }));
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    // Attach the song id (sha1 of the absolute path — same scheme as
    // MetadataService.getSongMetadata) and a `hidden` flag based on the
    // current blacklist, so the music-library UI can show + toggle hide
    // state without needing a second roundtrip.
    const { blacklist = [] } = getSettings();
    const blSet = new Set(blacklist);
    for (const f of files) {
      const fullPath = join(pl.path, f.name);
      f.id = sha1(fullPath);
      f.hidden = blSet.has(f.id);
    }
    res.json({ playlist: { id: pl.id, name: pl.name, path: pl.path }, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/admin/music/metadata?playlistId=&filename=  — write ID3 tags ──
// Body: { title, artist, album, year, genre, track }
// Currently only MP3 supported (ID3v2). Other formats return a 400.
router.put('/metadata', async (req, res) => {
  const pl = findPlaylistById(req.query.playlistId);
  if (!pl) return res.status(404).json({ error: 'פלייליסט לא קיים או לא מקומי' });
  const full = safeJoin(pl.path, req.query.filename || '');
  if (!full) return res.status(400).json({ error: 'שם קובץ לא תקין' });
  const ext = extname(full).toLowerCase();
  if (ext !== '.mp3') return res.status(400).json({ error: 'עריכת תגיות נתמכת ל-MP3 בלבד כרגע' });
  if (!existsSync(full)) return res.status(404).json({ error: 'קובץ לא נמצא' });

  const { title, artist, album, year, genre, track } = req.body || {};
  // Only write fields the user actually provided, leave others untouched
  const tags = {};
  if (title  !== undefined) tags.title    = String(title);
  if (artist !== undefined) tags.artist   = String(artist);
  if (album  !== undefined) tags.album    = String(album);
  if (year   !== undefined) tags.year     = String(year);
  if (genre  !== undefined) tags.genre    = String(genre);
  if (track  !== undefined && track !== null && track !== '') tags.trackNumber = String(track);

  try {
    const ok = NodeID3.update(tags, full);
    if (ok !== true) return res.status(500).json({ error: 'כתיבת התגיות נכשלה' });
    // Re-read so the client sees the canonical post-write state
    const fresh = await readMetaFor(full);
    res.json({ ok: true, ...fresh });
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

// ── POST /api/admin/music/playlist-create — create a new local playlist ──
// Body: { name }. Sanitises the name into a folder, creates it on disk
// under the auto-detected music root, and appends a new local-playlist
// entry to settings.json. Used by the "+ פלייליסט חדש" shortcut in the
// music library so the admin doesn't have to edit settings or pick a path.
router.post('/playlist-create', async (req, res) => {
  const trimmed = String(req.body?.name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'יש להזין שם' });
  // Strip characters that are illegal in Windows / problematic on Linux.
  const folderName = trimmed.replace(/[\\/:*?"<>|]+/g, '').trim();
  if (!folderName || folderName === '.' || folderName === '..') {
    return res.status(400).json({ error: 'שם תיקייה לא תקין' });
  }
  const root = getMusicRoot();
  const folderPath = join(root, folderName);
  // Path-traversal guard — ensure the resolved path stays inside the root
  const resolvedRoot   = resolve(root);
  const resolvedFolder = resolve(folderPath);
  if (!resolvedFolder.startsWith(resolvedRoot)) {
    return res.status(400).json({ error: 'נתיב לא תקין' });
  }
  const settings = getSettings();
  if ((settings.playlists || []).some(p => p.path === folderPath)) {
    return res.status(409).json({ error: 'כבר קיים פלייליסט בנתיב זה' });
  }
  try {
    if (!existsSync(folderPath)) await fs.mkdir(folderPath, { recursive: true });
    const playlist = {
      id: uuidv4(),
      name: trimmed,
      type: 'local',
      path: folderPath,
      spotifyUri: '',
      hidden: false,
    };
    settings.playlists = settings.playlists || [];
    settings.playlists.push(playlist);
    saveSettings(settings);
    res.json({ playlist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/admin/music/move — move a file across local playlists ───────
// Body: { fromPlaylistId, filename, toPlaylistId, overwrite? }
router.post('/move', async (req, res) => {
  const { fromPlaylistId, filename, toPlaylistId, overwrite } = req.body || {};
  if (!fromPlaylistId || !filename || !toPlaylistId) {
    return res.status(400).json({ error: 'חסרים פרטי המקור או היעד' });
  }
  if (fromPlaylistId === toPlaylistId) {
    return res.status(400).json({ error: 'המקור והיעד זהים' });
  }
  const fromPl = findPlaylistById(fromPlaylistId);
  const toPl   = findPlaylistById(toPlaylistId);
  if (!fromPl || !toPl) return res.status(404).json({ error: 'פלייליסט לא קיים או לא מקומי' });
  const fromPath = safeJoin(fromPl.path, filename);
  if (!fromPath) return res.status(400).json({ error: 'שם קובץ לא תקין' });
  if (!existsSync(fromPath)) return res.status(404).json({ error: 'קובץ לא נמצא במקור' });
  if (!existsSync(toPl.path)) await fs.mkdir(toPl.path, { recursive: true });
  const toPath = safeJoin(toPl.path, basename(filename));
  if (!toPath) return res.status(400).json({ error: 'שם קובץ לא תקין ליעד' });
  if (existsSync(toPath) && !overwrite) {
    return res.status(409).json({ error: 'קובץ באותו שם כבר קיים ביעד', conflict: true });
  }
  try {
    // fs.rename is atomic on the same volume; falls back to copy + unlink on
    // EXDEV (cross-volume — rare on a typical home server but possible).
    try {
      await fs.rename(fromPath, toPath);
    } catch (e) {
      if (e.code === 'EXDEV') {
        await fs.copyFile(fromPath, toPath);
        await fs.unlink(fromPath);
      } else {
        throw e;
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
