/**
 * MusicLibraryPanel — admin dashboard section for managing local music files.
 * Per-playlist cards: drag-and-drop upload, file list with delete, search,
 * and storage stats. Skips Spotify playlists (no local files there).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getMusicStats, listMusicFiles, deleteMusicFile, uploadMusicFiles,
} from '../api/client.js';

export default function MusicLibraryPanel() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  // Shared audio player — one <audio> element across all cards so only ever
  // one song plays at a time. State tracks which file is currently active.
  const audioRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null); // { playlistId, filename, fullPath }
  const [isPlaying, setIsPlaying] = useState(false);

  function playFile(playlistId, playlistPath, filename) {
    const fullPath = playlistPath.endsWith('/') ? `${playlistPath}${filename}` : `${playlistPath}/${filename}`;
    // Toggle pause if same file
    if (nowPlaying?.fullPath === fullPath) {
      const a = audioRef.current;
      if (!a) return;
      if (a.paused) a.play().catch(() => {});
      else a.pause();
      return;
    }
    setNowPlaying({ playlistId, filename, fullPath });
    setTimeout(() => {
      const a = audioRef.current;
      if (!a) return;
      a.src = `/api/audio/${encodeURIComponent(fullPath)}`;
      a.load();
      a.play().catch(() => {});
    }, 30);
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

      {/* Top stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <Stat label="סה״כ פלייליסטים" value={stats.length} />
        <Stat label="סה״כ קבצים"     value={totalFiles} />
        <Stat label="סה״כ נפח"        value={fmtBytes(totalSize)} />
      </div>

      {/* Per-playlist cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {stats.map(p => (
          <PlaylistCard
            key={p.id}
            playlist={p}
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
        onEnded={() => setIsPlaying(false)}
      />
      {nowPlaying && (
        <div style={miniPlayer}>
          <button
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) a.play().catch(() => {});
              else a.pause();
            }}
            style={miniPlayBtn}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nowPlaying.filename}
            </div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>מתנגן עכשיו</div>
          </div>
          <button
            onClick={() => {
              const a = audioRef.current;
              if (a) { a.pause(); a.src = ''; }
              setNowPlaying(null);
              setIsPlaying(false);
            }}
            title="עצור וסגור"
            style={miniCloseBtn}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Per-playlist card with drag-drop, list, delete ──────────────────────────
function PlaylistCard({ playlist, onChange, nowPlaying, isPlaying, onPlay }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [filter, setFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deleting, setDeleting] = useState(null); // filename being deleted
  const inputRef = useRef(null);

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

  async function handleUpload(fileList) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setProgress(0);
    setErrorMsg('');
    try {
      await uploadMusicFiles(playlist.id, Array.from(fileList), pct => setProgress(pct));
      await loadFiles();
      onChange?.();
    } catch (e) {
      setErrorMsg(e.response?.data?.error || e.message);
    } finally {
      setUploading(false);
      setProgress(0);
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

  const visible = files
    ? files.filter(f => !filter.trim() || f.name.toLowerCase().includes(filter.toLowerCase()))
    : null;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={cardHeaderBtn}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>📁</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{playlist.name}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{playlist.path}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <span style={pill}>{playlist.files} קבצים</span>
          <span style={pill}>{fmtBytes(playlist.sizeBytes)}</span>
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

          {/* File list */}
          {!files ? (
            <div style={{ color: '#888', fontSize: 13, padding: 14, textAlign: 'center' }}>טוען…</div>
          ) : files.length === 0 ? (
            <div style={emptyMini}>אין קבצים בפלייליסט הזה</div>
          ) : (
            <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, maxHeight: 380, overflowY: 'auto' }}>
              {visible.map((f, i) => {
                const fullPath = playlist.path.endsWith('/') ? `${playlist.path}${f.name}` : `${playlist.path}/${f.name}`;
                const isThisActive  = nowPlaying?.fullPath === fullPath;
                const isThisPlaying = isThisActive && isPlaying;
                return (
                  <div key={f.name} style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 12, alignItems: 'center',
                    padding: '10px 14px',
                    borderBottom: i < visible.length - 1 ? '1px solid #2a2a2a' : 'none',
                    background: isThisActive ? '#0d2e0d33' : 'transparent',
                  }}>
                    <button
                      onClick={() => onPlay?.(playlist.id, playlist.path, f.name)}
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
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: isThisActive ? '#1db954' : '#fff', fontWeight: isThisActive ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {fmtDate(f.mtime)}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{fmtBytes(f.sizeBytes)}</span>
                    <button
                      onClick={() => handleDelete(f.name)}
                      disabled={deleting === f.name}
                      title="מחיקה"
                      style={delBtn}
                    >
                      {deleting === f.name ? '⏳' : '🗑️'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
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
  borderRadius: 12, padding: '10px 14px',
  display: 'flex', alignItems: 'center', gap: 12,
  width: 'min(420px, calc(100vw - 36px))',
  boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
  zIndex: 50, direction: 'rtl',
};
const miniPlayBtn = {
  background: '#1db954', color: '#000', border: 'none',
  width: 40, height: 40, borderRadius: 20, fontSize: 16,
  cursor: 'pointer', flexShrink: 0,
};
const miniCloseBtn = {
  background: 'transparent', color: '#888', border: '1px solid #444',
  width: 28, height: 28, borderRadius: 14, fontSize: 13, cursor: 'pointer',
  flexShrink: 0,
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
