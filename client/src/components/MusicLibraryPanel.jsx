/**
 * MusicLibraryPanel — admin dashboard section for managing local music files.
 * Per-playlist cards: drag-and-drop upload, file list with delete, search,
 * and storage stats. Skips Spotify playlists (no local files there).
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  getMusicStats, getMusicDuplicates, listMusicFiles, deleteMusicFile, uploadMusicFiles, updateMusicMetadata,
  moveMusicFile, setPlaylistHidden, createMusicPlaylist, addToBlacklist, removeFromBlacklist,
} from '../api/client.js';

export default function MusicLibraryPanel() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  // Duplicate scanner: null when not run, [] for "no duplicates", array of
  // groups otherwise. `dupLoading` is true while the scan is in flight.
  const [dupResult, setDupResult] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);
  // "+ פלייליסט חדש" modal state
  const [createOpen, setCreateOpen] = useState(false);

  async function runDuplicateScan() {
    setDupOpen(true);
    setDupLoading(true);
    try {
      const r = await getMusicDuplicates();
      setDupResult(r.duplicates || []);
    } catch (e) {
      setDupResult([]);
      setError(e.response?.data?.error || e.message);
    } finally {
      setDupLoading(false);
    }
  }

  async function handleDeleteDuplicate(playlistId, filename) {
    if (!window.confirm(`למחוק את "${filename}"? פעולה לא ניתנת לביטול.`)) return;
    try {
      await deleteMusicFile(playlistId, filename);
      // Refresh duplicates list and overall stats
      await Promise.all([runDuplicateScan(), refresh()]);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  // Shared audio player — one <audio> element across all cards so only ever
  // one song plays at a time. State tracks which file is currently active +
  // its containing list for prev/next navigation.
  const audioRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null); // { playlistId, filename, fullPath, files: [...] }
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);   // 0–1
  const [duration, setDuration] = useState(0);   // seconds

  function playFile(playlistId, playlistPath, filename, fileList = []) {
    const fullPath = playlistPath.endsWith('/') ? `${playlistPath}${filename}` : `${playlistPath}/${filename}`;
    // Toggle pause if tapping the same file
    if (nowPlaying?.fullPath === fullPath) {
      const a = audioRef.current;
      if (!a) return;
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    setNowPlaying({ playlistId, playlistPath, filename, fullPath, files: fileList });
    setTimeout(() => {
      const a = audioRef.current;
      if (!a) return;
      a.src = `/api/audio/${encodeURIComponent(fullPath)}`;
      a.load();
      a.play().catch(() => {});
    }, 30);
  }

  function skip(deltaSec) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min((a.duration || 0), (a.currentTime || 0) + deltaSec));
  }

  function seekTo(ratio) {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = Math.max(0, Math.min(duration, ratio * duration));
  }

  function jumpInList(direction) {
    if (!nowPlaying?.files?.length) return;
    const idx = nowPlaying.files.findIndex(f => f.name === nowPlaying.filename);
    if (idx < 0) return;
    const nextIdx = (idx + direction + nowPlaying.files.length) % nowPlaying.files.length;
    const next = nowPlaying.files[nextIdx];
    playFile(nowPlaying.playlistId, nowPlaying.playlistPath, next.name, nowPlaying.files);
  }

  async function refresh() {
    try {
      const s = await getMusicStats();
      setStats(s);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => { refresh(); }, []);

  if (error) {
    return <div style={errBox}>שגיאה בטעינת ספריית המוזיקה: {error}</div>;
  }
  if (!stats) {
    return <div style={{ padding: 24, color: 'var(--text2, #888)' }}>טוען…</div>;
  }
  if (stats.length === 0) {
    return (
      <div style={emptyBox}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>🎵</div>
        <div style={{ fontSize: 15, color: '#fff', marginBottom: 6 }}>אין פלייליסטים מקומיים</div>
        <div style={{ fontSize: 12, color: '#888' }}>הוסף פלייליסט מקומי בהגדרות כדי לנהל קבצים מכאן</div>
      </div>
    );
  }

  // Top-level summary
  const totalFiles = stats.reduce((a, p) => a + (p.files || 0), 0);
  const totalSize  = stats.reduce((a, p) => a + (p.sizeBytes || 0), 0);

  return (
    <div style={{ padding: 24, color: '#fff' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>🎶 ניהול ספריית מוזיקה</h2>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 18px' }}>
        העלה, מחק ועיין בקבצי MP3 לכל פלייליסט מקומי. הקבצים נשמרים ישירות בתיקיית הפלייליסט בשרת.
      </p>

      {/* Top stats + actions */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <Stat label="סה״כ פלייליסטים" value={stats.length} />
        <Stat label="סה״כ קבצים"     value={totalFiles} />
        <Stat label="סה״כ נפח"        value={fmtBytes(totalSize)} />
        <button
          onClick={() => setCreateOpen(true)}
          title="צור פלייליסט מקומי חדש (תיקייה תיווצר אוטומטית בשרת)"
          style={{
            background: '#1db95433', border: '1px solid #1db954', color: '#1db954',
            borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', marginInlineStart: 'auto',
          }}
        >
          + פלייליסט חדש
        </button>
        <button
          onClick={runDuplicateScan}
          disabled={dupLoading}
          title="חיפוש שירים כפולים על פני כל הפלייליסטים"
          style={{
            background: '#2a2a2a', border: '1px solid #3a3a3a', color: '#ddd',
            borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700,
            cursor: dupLoading ? 'progress' : 'pointer',
          }}
        >
          {dupLoading ? '⏳ סורק…' : '🔍 בדיקת כפילויות'}
        </button>
      </div>

      {/* Per-playlist cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {stats.map(p => (
          <PlaylistCard
            key={p.id}
            playlist={p}
            allPlaylists={stats}
            onChange={refresh}
            nowPlaying={nowPlaying}
            isPlaying={isPlaying}
            onPlay={playFile}
          />
        ))}
      </div>

      {/* Shared audio element + sticky mini-player when a song is loaded */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { setIsPlaying(false); jumpInList(1); }}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.duration > 0) setProgress(a.currentTime / a.duration);
        }}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
        onLoadStart={() => { setProgress(0); setDuration(0); }}
      />
      {nowPlaying && (
        <div style={miniPlayer}>
          {/* Progress bar — click to seek */}
          <div
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              // RTL: x measured from right edge for natural feel
              const x = r.right - e.clientX;
              seekTo(Math.max(0, Math.min(1, x / r.width)));
            }}
            style={progressBar}
          >
            <div style={{
              position: 'absolute', top: 0, bottom: 0, right: 0,
              width: `${progress * 100}%`,
              background: '#1db954', transition: 'width 0.2s linear',
            }} />
          </div>

          {/* Title + times */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px 4px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nowPlaying.filename}
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtTime(progress * duration)} / {fmtTime(duration)}
              </div>
            </div>
            <button onClick={() => { const a = audioRef.current; if (a) { a.pause(); a.src = ''; } setNowPlaying(null); setIsPlaying(false); }}
                    title="עצור וסגור" style={miniCloseBtn}>✕</button>
          </div>

          {/* Transport controls — locked LTR for music-player conventions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, direction: 'ltr', padding: '4px 8px 10px' }}>
            <button onClick={() => jumpInList(-1)} title="הקודם" style={ctrlBtn}>⏮</button>
            <button onClick={() => skip(-10)}     title="-10 שניות" style={ctrlBtn}>⏪10</button>
            <button onClick={() => { const a = audioRef.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); }}
                    style={miniPlayBtn}>{isPlaying ? '⏸' : '▶'}</button>
            <button onClick={() => skip(10)}      title="+10 שניות" style={ctrlBtn}>10⏩</button>
            <button onClick={() => jumpInList(1)} title="הבא" style={ctrlBtn}>⏭</button>
          </div>
        </div>
      )}

      {/* Duplicates modal */}
      {dupOpen && (
        <DuplicatesModal
          loading={dupLoading}
          duplicates={dupResult || []}
          onClose={() => setDupOpen(false)}
          onDelete={handleDeleteDuplicate}
          onPlay={(playlistId, playlistPath, filename) => {
            playFile(playlistId, playlistPath, filename, []);
          }}
          stats={stats}
        />
      )}

      {/* Create-playlist modal */}
      {createOpen && (
        <CreatePlaylistModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Duplicates modal ────────────────────────────────────────────────────────
function DuplicatesModal({ loading, duplicates, onClose, onDelete, onPlay, stats }) {
  // Filter scope: 'all' shows every duplicate group; a playlist id shows
  // only groups whose items include that playlist (useful for cleanup work
  // focused on one folder at a time).
  const [scope, setScope] = useState('all');
  const filtered = scope === 'all'
    ? duplicates
    : duplicates.filter(g => g.items.some(it => it.playlistId === scope));
  const total = filtered.reduce((a, g) => a + g.items.length, 0);
  const pathsById = Object.fromEntries((stats || []).map(p => [p.id, p.path]));

  return (
    <>
      <div onClick={onClose} style={modalBackdrop} />
      <div style={{ ...modalBox, maxWidth: 720 }}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>🔍 בדיקת כפילויות</span>
          <button onClick={onClose} style={modalCloseBtn}>✕</button>
        </div>
        <div style={{ padding: 14, color: '#aaa', fontSize: 13, borderBottom: '1px solid #2a2a2a', lineHeight: 1.6 }}>
          {loading ? (
            'סורק את כל הפלייליסטים…'
          ) : duplicates.length === 0 ? (
            '✅ לא נמצאו כפילויות. הספרייה נקייה.'
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                {scope === 'all'
                  ? `נמצאו ${duplicates.length} קבוצות של שירים כפולים (${total} קבצים). חפש לפי תגיות זמר+שם השיר; אם אין תגיות, לפי שם הקובץ.`
                  : `${filtered.length} קבוצות (${total} קבצים) שכוללות את הפלייליסט הנבחר.`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>סנן:</span>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                  style={{
                    flex: 1, background: '#1a1a1a', color: '#fff',
                    border: '1px solid #2a2a2a', borderRadius: 6,
                    padding: '6px 8px', fontSize: 12,
                  }}
                >
                  <option value="all">כל הפלייליסטים</option>
                  {(stats || []).map(p => (
                    <option key={p.id} value={p.id}>📁 {p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        {filtered.length > 0 && (
          <div style={{ padding: 8, maxHeight: 480, overflowY: 'auto' }}>
            {filtered.map((g, gi) => (
              <div key={gi} style={{
                background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
                padding: 10, marginBottom: 10,
              }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 700 }}>
                  {g.kind === 'tag'
                    ? `${g.items[0].artist || '—'} · ${g.items[0].title || '—'}`
                    : `שם קובץ: ${g.items[0].filename}`}
                </div>
                {g.items.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 0', borderBottom: i < g.items.length - 1 ? '1px solid #232323' : 'none',
                    fontSize: 12,
                  }}>
                    <button
                      onClick={() => {
                        const path = pathsById[item.playlistId];
                        if (path) onPlay(item.playlistId, path, item.filename);
                      }}
                      title="נגן"
                      style={{ ...playBtn, width: 28, height: 28, fontSize: 12, flexShrink: 0 }}
                    >▶</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.filename}>
                        {item.filename}
                      </div>
                      <div style={{ color: '#666', fontSize: 11 }}>
                        📁 {item.playlistName} · {fmtBytes(item.sizeBytes)}
                      </div>
                    </div>
                    <button
                      onClick={() => onDelete(item.playlistId, item.filename)}
                      title="מחק עותק זה"
                      style={{ ...delBtn, padding: '4px 8px' }}
                    >🗑️</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={modalFooter}>
          <button onClick={onClose} style={btnSave}>סגור</button>
        </div>
      </div>
    </>
  );
}

// ─── New-playlist modal — name only; server creates the folder ───────────────
function CreatePlaylistModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await createMusicPlaylist(name.trim());
      onCreated?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={modalBackdrop} />
      <div style={{ ...modalBox, maxWidth: 460 }}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>+ פלייליסט חדש</span>
          <button onClick={onClose} style={modalCloseBtn}>✕</button>
        </div>
        <div style={modalBody}>
          <div style={{ color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>
            הזן שם לפלייליסט. השרת ייצור תיקייה חדשה באותו שם תחת תיקיית המוזיקה הראשית, ותוכל מיד להעלות אליה שירים.
          </div>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="למשל: שירים בעברית, פופ 90s"
            style={fldInput}
            disabled={busy}
          />
          {error && <div style={errBox}>{error}</div>}
          <div style={{ color: '#666', fontSize: 11, lineHeight: 1.6 }}>
            💡 התיקייה תיווצר ליד שאר הפלייליסטים הקיימים. אם אין עדיין כלום, היא תיווצר תחת תיקיית `music/` של האפליקציה בשרת.
          </div>
        </div>
        <div style={modalFooter}>
          <button onClick={onClose} disabled={busy} style={btnCancel}>ביטול</button>
          <button onClick={submit} disabled={busy || !name.trim()} style={{ ...btnSave, opacity: (busy || !name.trim()) ? 0.5 : 1 }}>
            {busy ? '⏳ יוצר…' : '✓ צור פלייליסט'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Per-playlist card with drag-drop, list, delete ──────────────────────────
function PlaylistCard({ playlist, allPlaylists = [], onChange, nowPlaying, isPlaying, onPlay }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [filter, setFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deleting, setDeleting] = useState(null); // filename being deleted
  const [editingFile, setEditingFile] = useState(null); // the file object being edited
  const [movingFile, setMovingFile]   = useState(null); // the file object being moved
  const [moving, setMoving] = useState(false);
  const [sortKey, setSortKey] = useState('name'); // name | title | artist | year | duration | sizeBytes
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const inputRef = useRef(null);
  const theadRef = useRef(null);
  const [headerH, setHeaderH] = useState(33);

  const loadFiles = useCallback(async () => {
    try {
      const r = await listMusicFiles(playlist.id);
      setFiles(r.files || []);
    } catch (e) {
      setErrorMsg(e.response?.data?.error || e.message);
    }
  }, [playlist.id]);

  useEffect(() => {
    if (open && files === null) loadFiles();
  }, [open, files, loadFiles]);

  // Pending-upload state for the conflict-resolver modal. While `pending`
  // is set, the user is being asked which existing files to overwrite.
  // Shape: { files: File[], conflictNames: Set<string> } | null
  const [pendingUpload, setPendingUpload] = useState(null);

  async function handleUpload(fileList) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    // If the file list hasn't loaded yet (e.g. the user dragged in
    // immediately after expanding the card), fetch it now so the duplicate
    // check runs against actual data and not an empty placeholder.
    let currentFiles = files;
    if (currentFiles === null) {
      try {
        const r = await listMusicFiles(playlist.id);
        currentFiles = r.files || [];
        setFiles(currentFiles);
      } catch {
        currentFiles = [];
      }
    }
    // Compare against the currently-loaded files in this playlist (case-
    // insensitive — server filenames keep their original case but Windows
    // file systems treat them as the same file).
    const existingLower = new Set(currentFiles.map(f => f.name.toLowerCase()));
    const conflictNames = new Set(
      incoming
        .map(f => f.name)
        .filter(name => existingLower.has(name.toLowerCase()))
    );
    if (conflictNames.size === 0) {
      return doUpload(incoming);
    }
    // There are duplicates — let the user decide
    setPendingUpload({ files: incoming, conflictNames });
  }

  async function doUpload(fileArray) {
    if (!fileArray || fileArray.length === 0) {
      setPendingUpload(null);
      return;
    }
    setUploading(true);
    setProgress(0);
    setErrorMsg('');
    setPendingUpload(null);
    try {
      await uploadMusicFiles(playlist.id, fileArray, pct => setProgress(pct));
      await loadFiles();
      onChange?.();
    } catch (e) {
      setErrorMsg(e.response?.data?.error || e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  // User finished resolving conflicts in the modal.
  // skipNames is a Set of conflict filenames the user chose to skip
  // (everything not in the set should be uploaded; multer overwrites).
  function handleResolveConflicts(skipNames) {
    if (!pendingUpload) return;
    const filtered = pendingUpload.files.filter(f => !skipNames.has(f.name));
    doUpload(filtered);
  }

  async function handleMoveFile(targetPlaylistId, overwrite = false) {
    if (!movingFile) return;
    setMoving(true);
    setErrorMsg('');
    try {
      await moveMusicFile(playlist.id, movingFile.name, targetPlaylistId, overwrite);
      setMovingFile(null);
      await loadFiles();
      onChange?.();
    } catch (e) {
      const r = e.response;
      if (r?.status === 409 && r?.data?.conflict) {
        // Conflict — confirm overwrite
        if (window.confirm(`כבר קיים קובץ בשם "${movingFile.name}" בפלייליסט היעד. להחליף?`)) {
          setMoving(false);
          return handleMoveFile(targetPlaylistId, true);
        }
      } else {
        setErrorMsg(r?.data?.error || e.message);
      }
    } finally {
      setMoving(false);
    }
  }

  async function handleDelete(filename) {
    if (!window.confirm(`למחוק את "${filename}"? פעולה לא ניתנת לביטול.`)) return;
    setDeleting(filename);
    try {
      await deleteMusicFile(playlist.id, filename);
      await loadFiles();
      onChange?.();
    } catch (e) {
      setErrorMsg(e.response?.data?.error || e.message);
    } finally {
      setDeleting(null);
    }
  }

  // Toggle a song's hidden state by adding/removing it from the blacklist.
  // Hidden songs stay in the music-library list (so admin can unhide them)
  // but are excluded from /api/playlists/:id/songs that the games consume.
  async function handleToggleHidden(f) {
    if (!f.id) return;
    const wasHidden = !!f.hidden;
    // Optimistic update
    setFiles(prev => prev?.map(x => x.name === f.name ? { ...x, hidden: !wasHidden } : x));
    try {
      if (wasHidden) await removeFromBlacklist(f.id);
      else           await addToBlacklist(f.id);
    } catch (e) {
      // Revert on failure
      setFiles(prev => prev?.map(x => x.name === f.name ? { ...x, hidden: wasHidden } : x));
      setErrorMsg(e.response?.data?.error || e.message);
    }
  }

  // Filter by name OR any metadata field
  const filtered = files
    ? files.filter(f => {
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return f.name.toLowerCase().includes(q)
            || (f.title || '').toLowerCase().includes(q)
            || (f.artist || '').toLowerCase().includes(q)
            || (f.album || '').toLowerCase().includes(q)
            || String(f.year || '').includes(q);
      })
    : null;

  // Sort the filtered set
  const visible = filtered ? [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    let c = 0;
    if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
    else c = String(av).localeCompare(String(bv), 'he', { numeric: true });
    return sortDir === 'asc' ? c : -c;
  }) : null;

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  useLayoutEffect(() => {
    if (theadRef.current) setHeaderH(theadRef.current.offsetHeight);
  }, [files, visible?.length, open]);
  function arrow(key) {
    return sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  }

  async function toggleHidden(e) {
    e.stopPropagation();
    try {
      await setPlaylistHidden(playlist.id, !playlist.hidden);
      onChange?.();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message);
    }
  }

  return (
    <div style={{ ...cardStyle, opacity: playlist.hidden ? 0.6 : 1 }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={cardHeaderBtn}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>📁</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {playlist.name}
              {playlist.hidden && <span style={{ marginInlineStart: 8, fontSize: 10, padding: '2px 6px', background: '#3a1010', color: '#ff8a3d', borderRadius: 4, fontWeight: 700 }}>מוסתר</span>}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{playlist.path}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={pill}>{playlist.files} קבצים</span>
          <span style={pill}>{fmtBytes(playlist.sizeBytes)}</span>
          <button
            onClick={toggleHidden}
            title={playlist.hidden ? 'הצג את הפלייליסט במשחקים' : 'הסתר את הפלייליסט מהמשחקים'}
            style={{
              background: 'transparent', border: '1px solid #3a3a3a',
              color: playlist.hidden ? '#ff8a3d' : '#888',
              borderRadius: 8, padding: '4px 10px', fontSize: 16, cursor: 'pointer',
            }}
          >
            {playlist.hidden ? '🙈' : '👁'}
          </button>
          <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Body — visible when expanded */}
      {open && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Drag-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false);
              handleUpload(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1db954' : '#444'}`,
              background: dragOver ? '#0d2e0d' : 'transparent',
              borderRadius: 12, padding: 22, textAlign: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <input
              ref={inputRef} type="file" accept=".mp3,.m4a,.flac,.wav,.aac,.ogg" multiple
              style={{ display: 'none' }}
              onChange={e => handleUpload(e.target.files)}
            />
            {uploading ? (
              <>
                <div style={{ fontSize: 18, color: '#1db954', fontWeight: 800 }}>
                  ⏳ מעלה… {progress}%
                </div>
                <div style={{ height: 6, background: '#222', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: '#1db954', transition: 'width 0.2s' }} />
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>⬆️</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  גרור קבצי MP3 לכאן או <span style={{ color: '#1db954' }}>לחץ לבחירה</span>
                </div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                  עד 200MB לקובץ · mp3 / m4a / flac / wav / aac / ogg
                </div>
              </>
            )}
          </div>

          {/* Search + count */}
          {files && files.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="🔍 סנן לפי שם…"
                style={searchInput}
              />
              <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>
                {visible.length} מתוך {files.length}
              </span>
            </div>
          )}

          {errorMsg && <div style={errBox}>{errorMsg}</div>}

          {/* File table */}
          {!files ? (
            <div style={{ color: '#888', fontSize: 13, padding: 14, textAlign: 'center' }}>טוען…</div>
          ) : files.length === 0 ? (
            <div style={emptyMini}>אין קבצים בפלייליסט הזה</div>
          ) : (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead ref={theadRef} style={{ position: 'sticky', top: 0, background: '#222', zIndex: 2 }}>
                  <tr style={{ color: '#888', fontWeight: 700, textAlign: 'right' }}>
                    <Th width={48}></Th>
                    <Th onClick={() => toggleSort('title')}    label={`שם השיר${arrow('title')}`} />
                    <Th onClick={() => toggleSort('artist')}   label={`אמן${arrow('artist')}`} />
                    <Th onClick={() => toggleSort('album')}    label={`אלבום${arrow('album')}`} width={140} />
                    <Th onClick={() => toggleSort('year')}     label={`שנה${arrow('year')}`} width={70} />
                    <Th onClick={() => toggleSort('duration')} label={`אורך${arrow('duration')}`} width={70} />
                    <Th onClick={() => toggleSort('sizeBytes')} label={`גודל${arrow('sizeBytes')}`} width={80} />
                    <Th width={88}></Th>
                  </tr>
                </thead>
                <tbody>
              {visible.map((f, i) => {
                const fullPath = playlist.path.endsWith('/') ? `${playlist.path}${f.name}` : `${playlist.path}/${f.name}`;
                const isThisActive  = nowPlaying?.fullPath === fullPath;
                const isThisPlaying = isThisActive && isPlaying;
                const stickyCell = isThisActive
                  ? { position: 'sticky', top: headerH, background: '#142a14', zIndex: 1 }
                  : null;
                return (
                  <tr key={f.name} style={{
                    borderBottom: i < visible.length - 1 ? '1px solid #2a2a2a' : 'none',
                    opacity: f.hidden ? 0.45 : 1,
                  }}>
                    <td style={{ padding: '8px 8px 8px 12px', ...stickyCell }}>
                      <button
                        onClick={() => onPlay?.(playlist.id, playlist.path, f.name, files)}
                        title={isThisPlaying ? 'השהה' : 'נגן'}
                        style={{
                          ...playBtn,
                          background: isThisActive ? '#1db954' : '#2a2a2a',
                          color: isThisActive ? '#000' : '#1db954',
                          borderColor: isThisActive ? '#1db954' : '#2a2a2a',
                        }}
                      >
                        {isThisPlaying ? '⏸' : '▶'}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, ...stickyCell }} title={f.name}>
                      <div style={{ color: isThisActive ? '#1db954' : '#fff', fontWeight: isThisActive ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>
                        {f.title || f.name}
                      </div>
                      {!f.title && (
                        <div style={{ fontSize: 10, color: '#666' }}>שם הקובץ — אין תגיות</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: '#ccc', ...stickyCell }}>{f.artist || <span style={muted}>—</span>}</td>
                    <td style={{ ...tdStyle, color: '#aaa', ...stickyCell }}>{f.album || <span style={muted}>—</span>}</td>
                    <td style={{ ...tdStyle, color: '#aaa', ...stickyCell }}>{f.year || <span style={muted}>—</span>}</td>
                    <td style={{ ...tdStyle, color: '#aaa', fontVariantNumeric: 'tabular-nums', ...stickyCell }}>
                      {f.duration ? fmtTime(f.duration) : <span style={muted}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, color: '#888', fontVariantNumeric: 'tabular-nums', ...stickyCell }}>{fmtBytes(f.sizeBytes)}</td>
                    <td style={{ padding: '8px 12px 8px 8px', whiteSpace: 'nowrap', ...stickyCell }}>
                      <button
                        onClick={() => handleToggleHidden(f)}
                        title={f.hidden ? 'הצג שיר במשחקים' : 'הסתר שיר ממשחקים'}
                        style={{ ...editBtn, marginRight: 4, color: f.hidden ? '#ff8a3d' : '#888' }}
                      >
                        {f.hidden ? '🙈' : '👁'}
                      </button>
                      <button onClick={() => setMovingFile(f)} title="העבר לפלייליסט אחר" style={{ ...editBtn, marginRight: 4 }}>↗</button>
                      <button onClick={() => setEditingFile(f)} title="עריכת תגיות" style={editBtn}>✎</button>
                      <button onClick={() => handleDelete(f.name)} disabled={deleting === f.name} title="מחיקה" style={{ ...delBtn, marginRight: 4 }}>
                        {deleting === f.name ? '⏳' : '🗑️'}
                      </button>
                    </td>
                  </tr>
                );
              })}
                </tbody>
              </table>
            </div>
          )}

          {/* Edit metadata modal */}
          {editingFile && (
            <MetadataEditor
              playlistId={playlist.id}
              file={editingFile}
              siblingFiles={files || []}
              artistSuggestions={[...new Set((files || []).map(f => f.artist).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'))}
              onClose={() => setEditingFile(null)}
              onSaved={async () => { setEditingFile(null); await loadFiles(); onChange?.(); }}
            />
          )}

          {/* Upload conflict resolver modal */}
          {pendingUpload && (
            <UploadConflictModal
              files={pendingUpload.files}
              conflictNames={pendingUpload.conflictNames}
              onResolve={handleResolveConflicts}
              onCancel={() => setPendingUpload(null)}
            />
          )}

          {/* Move file modal */}
          {movingFile && (
            <MovePlaylistModal
              file={movingFile}
              currentPlaylistId={playlist.id}
              targets={allPlaylists}
              moving={moving}
              onSelect={pid => handleMoveFile(pid)}
              onCancel={() => setMovingFile(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Upload conflict resolver ────────────────────────────────────────────────
// Shown when one or more files being uploaded already exist in the playlist.
// User picks per-file (skip / replace) with bulk shortcuts; replace = upload
// (multer overwrites in place); skip = exclude from the upload list.
function UploadConflictModal({ files, conflictNames, onResolve, onCancel }) {
  // decisions: filename → 'skip' | 'replace'. Default to undecided ('').
  const [decisions, setDecisions] = useState(() => {
    const init = {};
    for (const name of conflictNames) init[name] = '';
    return init;
  });

  function setOne(name, value)   { setDecisions(d => ({ ...d, [name]: value })); }
  function setAll(value)         {
    const next = {};
    for (const name of conflictNames) next[name] = value;
    setDecisions(next);
  }

  const undecidedCount = [...conflictNames].filter(n => !decisions[n]).length;
  const conflictArr = [...conflictNames];

  function confirm() {
    const skip = new Set();
    for (const name of conflictNames) {
      if (decisions[name] === 'skip') skip.add(name);
    }
    onResolve(skip);
  }

  return (
    <>
      <div onClick={onCancel} style={modalBackdrop} />
      <div style={{ ...modalBox, maxWidth: 520 }}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>📁 קבצים כפולים</span>
          <button onClick={onCancel} style={modalCloseBtn}>✕</button>
        </div>
        <div style={{ padding: 14, color: '#aaa', fontSize: 13, borderBottom: '1px solid #2a2a2a', lineHeight: 1.6 }}>
          {conflictNames.size === 1 ? (
            <>הקובץ הבא כבר קיים בפלייליסט. מה לעשות?</>
          ) : (
            <>{conflictNames.size} קבצים כבר קיימים בפלייליסט. תוכל להחליט לכל קובץ בנפרד או להחיל פעולה על כולם.</>
          )}
        </div>

        {/* Bulk actions */}
        {conflictNames.size > 1 && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid #2a2a2a' }}>
            <button onClick={() => setAll('skip')}    style={bulkBtn}>⏭ דלג על כולם</button>
            <button onClick={() => setAll('replace')} style={bulkBtn}>🔁 החלף את כולם</button>
          </div>
        )}

        {/* Per-file decisions */}
        <div style={{ padding: '8px 14px', maxHeight: 360, overflowY: 'auto' }}>
          {conflictArr.map(name => {
            const dec = decisions[name];
            return (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', borderBottom: '1px solid #232323',
              }}>
                <div style={{ flex: 1, minWidth: 0, color: '#ddd', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                  {name}
                </div>
                <button
                  onClick={() => setOne(name, 'skip')}
                  title="דלג על קובץ זה — הקובץ הקיים יישאר ללא שינוי"
                  style={{ ...rowBtn, background: dec === 'skip' ? '#dc354533' : '#2a2a2a', borderColor: dec === 'skip' ? '#dc3545' : '#3a3a3a', color: dec === 'skip' ? '#ff6b6b' : '#aaa' }}
                >
                  דלג
                </button>
                <button
                  onClick={() => setOne(name, 'replace')}
                  title="החלף את הקובץ הקיים בקובץ החדש"
                  style={{ ...rowBtn, background: dec === 'replace' ? '#1db95433' : '#2a2a2a', borderColor: dec === 'replace' ? '#1db954' : '#3a3a3a', color: dec === 'replace' ? '#1db954' : '#aaa' }}
                >
                  החלף
                </button>
              </div>
            );
          })}
        </div>

        <div style={modalFooter}>
          <button onClick={onCancel} style={btnCancel}>בטל העלאה</button>
          <button
            onClick={confirm}
            disabled={undecidedCount > 0}
            style={{ ...btnSave, opacity: undecidedCount > 0 ? 0.4 : 1 }}
            title={undecidedCount > 0 ? `יש להחליט עבור ${undecidedCount} קבצים` : 'בצע העלאה'}
          >
            {undecidedCount > 0 ? `החלט על ${undecidedCount} קבצים` : 'אישור והעלאה'}
          </button>
        </div>
      </div>
    </>
  );
}

const bulkBtn = {
  flex: 1, padding: '8px', borderRadius: 8, background: '#1a1a1a',
  border: '1px solid #3a3a3a', color: '#ddd', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const rowBtn = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid #3a3a3a',
  background: '#2a2a2a', color: '#aaa', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

// ─── Move file to a different playlist ───────────────────────────────────────
function MovePlaylistModal({ file, currentPlaylistId, targets, moving, onSelect, onCancel }) {
  const others = (targets || []).filter(p => p.id !== currentPlaylistId);
  return (
    <>
      <div onClick={onCancel} style={modalBackdrop} />
      <div style={{ ...modalBox, maxWidth: 480 }}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>↗ העברת קובץ</span>
          <button onClick={onCancel} style={modalCloseBtn}>✕</button>
        </div>
        <div style={{ padding: 14, color: '#aaa', fontSize: 13, borderBottom: '1px solid #2a2a2a', lineHeight: 1.6 }}>
          העבר את <span style={{ color: '#fff', fontWeight: 700 }}>{file.title || file.name}</span> לפלייליסט אחר. הקובץ יעבור פיזית בין התיקיות.
        </div>
        <div style={{ padding: '8px 14px', maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {others.length === 0 ? (
            <div style={{ color: '#888', fontSize: 13, padding: 8 }}>אין פלייליסטים אחרים זמינים.</div>
          ) : others.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              disabled={moving}
              style={{
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                borderRadius: 8, padding: '10px 12px', textAlign: 'right',
                color: '#fff', cursor: moving ? 'progress' : 'pointer',
                opacity: moving ? 0.6 : 1,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700 }}>📁 {p.name}{p.hidden ? ' 🙈' : ''}</span>
              <span style={{ fontSize: 11, color: '#888' }}>{p.files} קבצים</span>
            </button>
          ))}
        </div>
        <div style={modalFooter}>
          <button onClick={onCancel} disabled={moving} style={btnCancel}>ביטול</button>
        </div>
      </div>
    </>
  );
}

// ─── Metadata edit modal ─────────────────────────────────────────────────────
function MetadataEditor({ playlistId, file, siblingFiles = [], artistSuggestions = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    title:  file.title || '',
    artist: file.artist || '',
    album:  file.album || '',
    year:   file.year || '',
    genre:  file.genre || '',
    track:  file.track || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  // Bulk artist rename — set after the user changes the artist field. While
  // this is non-null, the modal shows a confirmation step instead of closing.
  // Shape: { oldName, newName, siblings: [filename, ...] } | null
  const [pendingRename, setPendingRename] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(0);

  const originalArtist = (file.artist || '').trim();

  function update(k, v) { setForm(s => ({ ...s, [k]: v })); }
  // Select existing text on focus so typing replaces it instead of appending
  const selectOnFocus = e => e.target.select();
  // Enter saves & closes the modal (Shift+Enter is reserved for future multi-line use)
  const submitOnEnter = e => {
    if (e.key === 'Enter' && !e.shiftKey && !saving) {
      e.preventDefault();
      handleSave();
    }
  };

  async function handleSave() {
    setSaving(true); setError('');
    try {
      await updateMusicMetadata(playlistId, file.name, form);
      const newArtist = (form.artist || '').trim();
      // If the artist was renamed AND there are other files in this playlist
      // by the OLD artist name, ask the user whether to rename them too.
      if (originalArtist && newArtist && originalArtist !== newArtist) {
        const sameOld = siblingFiles.filter(f =>
          f.name !== file.name && (f.artist || '').trim() === originalArtist
        );
        if (sameOld.length > 0) {
          setPendingRename({ oldName: originalArtist, newName: newArtist, siblings: sameOld });
          setSaving(false);
          return;
        }
      }
      onSaved?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setSaving(false);
    }
  }

  async function applyBulkRename() {
    if (!pendingRename) return;
    setSaving(true); setError('');
    setBulkProgress(0);
    try {
      let done = 0;
      for (const sibling of pendingRename.siblings) {
        await updateMusicMetadata(playlistId, sibling.name, {
          title:  sibling.title || '',
          artist: pendingRename.newName,
          album:  sibling.album || '',
          year:   sibling.year || '',
          genre:  sibling.genre || '',
          track:  sibling.track || '',
        });
        done++;
        setBulkProgress(done);
      }
      onSaved?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setSaving(false);
    }
  }

  function skipBulkRename() {
    setPendingRename(null);
    onSaved?.();
  }

  return (
    <>
      <div onClick={onClose} style={modalBackdrop} />
      <div style={modalBox}>
        <div style={modalHeader}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>✎ עריכת תגיות</span>
          <button onClick={onClose} style={modalCloseBtn}>✕</button>
        </div>
        <div style={{ padding: 18, color: '#888', fontSize: 11, borderBottom: '1px solid #2a2a2a' }}>
          קובץ: <span style={{ color: '#fff' }}>{file.name}</span>
        </div>

        {pendingRename
          ? <RenameConfirmBody pendingRename={pendingRename} saving={saving} bulkProgress={bulkProgress} error={error} />
          : (
            <div style={modalBody}>
              <Field label="שם השיר">
                <input value={form.title}  onChange={e => update('title',  e.target.value)} onFocus={selectOnFocus} onKeyDown={submitOnEnter} style={fldInput} />
              </Field>
              <Field label="אמן">
                <input
                  value={form.artist}
                  onChange={e => update('artist', e.target.value)}
                  onFocus={selectOnFocus} onKeyDown={submitOnEnter}
                  style={fldInput}
                  list="mlp-artist-suggestions"
                  autoComplete="off"
                />
                <datalist id="mlp-artist-suggestions">
                  {artistSuggestions.map(a => <option key={a} value={a} />)}
                </datalist>
              </Field>
              <Field label="אלבום">
                <input value={form.album}  onChange={e => update('album',  e.target.value)} onFocus={selectOnFocus} onKeyDown={submitOnEnter} style={fldInput} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="שנה">
                  <input value={form.year}  onChange={e => update('year',  e.target.value)} onFocus={selectOnFocus} onKeyDown={submitOnEnter} style={fldInput} placeholder="2024" />
                </Field>
                <Field label="מס׳ רצועה">
                  <input value={form.track} onChange={e => update('track', e.target.value)} onFocus={selectOnFocus} onKeyDown={submitOnEnter} style={fldInput} placeholder="1" />
                </Field>
                <Field label="ז׳אנר">
                  <input value={form.genre} onChange={e => update('genre', e.target.value)} onFocus={selectOnFocus} onKeyDown={submitOnEnter} style={fldInput} />
                </Field>
              </div>

              {error && <div style={errBox}>{error}</div>}

              <div style={{ color: '#666', fontSize: 11, lineHeight: 1.6 }}>
                💡 השינויים נכתבים ל-ID3 תגי המטא-דאטה של הקובץ עצמו (לא רק במסד הנתונים). חל על MP3 בלבד כרגע.
              </div>
            </div>
          )
        }
        <div style={modalFooter}>
          {pendingRename ? (
            <>
              <button onClick={skipBulkRename} disabled={saving} style={btnCancel}>לא, רק את השיר הזה</button>
              <button onClick={applyBulkRename} disabled={saving} style={{ ...btnSave, opacity: saving ? 0.6 : 1 }}>
                {saving ? `⏳ ${bulkProgress}/${pendingRename.siblings.length}` : `🔁 עדכן את כל ${pendingRename.siblings.length}`}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} style={btnCancel}>ביטול</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnSave, opacity: saving ? 0.6 : 1 }}>
                {saving ? '⏳ שומר…' : '💾 שמירה'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 4, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}

// Body shown in MetadataEditor when the user just renamed an artist and we
// detected other songs by the old artist name. Asks them to confirm the
// bulk rename or skip it.
function RenameConfirmBody({ pendingRename, saving, bulkProgress, error }) {
  const oldQuoted = '"' + pendingRename.oldName + '"';
  const newQuoted = '"' + pendingRename.newName + '"';
  return (
    <div style={modalBody}>
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 14, lineHeight: 1.6, color: '#ddd', fontSize: 13 }}>
        שינית את שם האמן מ-
        <span style={{ color: '#ff8a3d', fontWeight: 700 }}> {oldQuoted}</span>
        {' '}ל-
        <span style={{ color: '#1db954', fontWeight: 700 }}>{newQuoted}</span>.
        <br />
        נמצאו <span style={{ color: '#fff', fontWeight: 800 }}>{pendingRename.siblings.length}</span> שירים נוספים בפלייליסט עם שם האמן הישן. לעדכן גם אותם?
      </div>
      <div style={{ background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 10, maxHeight: 200, overflowY: 'auto', padding: '6px 10px' }}>
        {pendingRename.siblings.map(s => (
          <div key={s.name} style={{ fontSize: 12, color: '#888', padding: '4px 0', borderBottom: '1px solid #1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
            {s.title || s.name}
          </div>
        ))}
      </div>
      {saving && (
        <div style={{ color: '#888', fontSize: 12 }}>מעדכן {bulkProgress}/{pendingRename.siblings.length}…</div>
      )}
      {error && <div style={errBox}>{error}</div>}
    </div>
  );
}
function Th({ label, onClick, width }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700,
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
        width: width ? width : 'auto',
        borderBottom: '1px solid #333',
      }}
    >
      {label || ''}
    </th>
  );
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────
function Stat({ label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
      padding: '14px 18px',
    }}>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>{value}</div>
    </div>
  );
}

function fmtBytes(b) {
  if (!b || b <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function fmtDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const cardStyle = {
  background: '#252525', border: '1px solid #333', borderRadius: 12, overflow: 'hidden',
};
const cardHeaderBtn = {
  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
};
const pill = {
  fontSize: 11, color: '#aaa', background: '#1a1a1a', border: '1px solid #2a2a2a',
  borderRadius: 12, padding: '3px 10px', fontWeight: 700,
};
const searchInput = {
  flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff',
  borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none',
};
const delBtn = {
  background: '#3a1010', color: '#ff6b6b', border: '1px solid #5a1010',
  width: 36, height: 36, borderRadius: 8, fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const playBtn = {
  border: '1px solid #2a2a2a',
  width: 36, height: 36, borderRadius: 18, fontSize: 14, fontWeight: 800, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
};
const miniPlayer = {
  position: 'fixed', bottom: 18, left: 18,
  background: '#1a1a1a', border: '1px solid #1db954',
  borderRadius: 12, overflow: 'hidden',
  width: 'min(440px, calc(100vw - 36px))',
  boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
  zIndex: 50, direction: 'rtl',
};
const progressBar = {
  height: 5, background: '#0d0d0d', cursor: 'pointer',
  position: 'relative', borderBottom: '1px solid #2a2a2a',
};
const miniPlayBtn = {
  background: '#1db954', color: '#000', border: 'none',
  width: 44, height: 44, borderRadius: 22, fontSize: 18,
  cursor: 'pointer', flexShrink: 0, fontWeight: 800,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const miniCloseBtn = {
  background: 'transparent', color: '#888', border: '1px solid #444',
  width: 28, height: 28, borderRadius: 14, fontSize: 13, cursor: 'pointer',
  flexShrink: 0,
};
const ctrlBtn = {
  background: '#252525', color: '#ccc', border: '1px solid #333',
  height: 36, minWidth: 44, padding: '0 10px',
  borderRadius: 10, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', flexShrink: 0,
};
const tdStyle = {
  padding: '10px 12px',
  fontSize: 12,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  maxWidth: 200,
};
const muted = { color: '#444' };
const editBtn = {
  background: '#1a2a3a', color: '#5bb8ff', border: '1px solid #2a3a4a',
  width: 36, height: 36, borderRadius: 8, fontSize: 14, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  marginLeft: 4,
};
const modalBackdrop = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99,
};
const modalBox = {
  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 14,
  width: 'min(520px, calc(100vw - 32px))', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
  zIndex: 100, direction: 'rtl', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
};
const modalHeader = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '14px 18px', borderBottom: '1px solid #2a2a2a', color: '#fff',
};
const modalCloseBtn = {
  background: 'transparent', color: '#888', border: 'none',
  fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1,
};
const modalBody = {
  padding: '16px 18px', overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 12,
};
const modalFooter = {
  padding: '12px 18px', borderTop: '1px solid #2a2a2a',
  display: 'flex', justifyContent: 'flex-start', gap: 10,
};
const fldInput = {
  width: '100%', boxSizing: 'border-box',
  background: '#0d0d0d', border: '1px solid #2a2a2a', color: '#fff',
  borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none',
};
const btnSave = {
  background: '#1db954', color: '#000', border: 'none',
  borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
};
const btnCancel = {
  background: 'transparent', color: '#aaa', border: '1px solid #333',
  borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const errBox = {
  background: '#3a1010', color: '#ff6b6b', border: '1px solid #dc3545',
  padding: '10px 14px', borderRadius: 8, fontSize: 13,
};
const emptyBox = {
  textAlign: 'center', padding: 60,
  background: '#1a1a1a', border: '1px dashed #333', borderRadius: 12, margin: 24,
};
const emptyMini = {
  textAlign: 'center', padding: 16, color: '#666', fontSize: 12,
  background: '#1a1a1a', border: '1px dashed #2a2a2a', borderRadius: 10,
};
