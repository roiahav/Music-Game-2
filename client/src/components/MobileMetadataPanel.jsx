/**
 * MobileMetadataPanel — collapsible metadata-editing module for the mobile
 * Settings screen. Admins can browse playlists, see songs, and edit ID3
 * tags without opening the desktop dashboard.
 *
 * Touch-friendly throughout: vertical card list (no horizontal table),
 * generous tap targets, fullscreen-style edit modal that scrolls cleanly
 * on a phone, autocomplete from every playlist's artists.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  getMusicStats, listMusicFiles, updateMusicMetadata, getMusicArtists,
} from '../api/client.js';

export default function MobileMetadataPanel() {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');
  const [globalArtists, setGlobalArtists] = useState([]);

  // Shared mini-player state — one <audio> for the whole panel so only ever
  // one song plays at a time, with a sticky controller at the bottom.
  const audioRef = useRef(null);
  const [nowPlaying, setNowPlaying] = useState(null); // { playlistId, playlistPath, filename, title, artist }
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function playFile(playlistId, playlistPath, file) {
    const fullPath = playlistPath.endsWith('/') ? `${playlistPath}${file.name}` : `${playlistPath}/${file.name}`;
    // Tap a row that's already loaded → toggle play/pause without restarting
    if (nowPlaying && nowPlaying.fullPath === fullPath) {
      const a = audioRef.current; if (!a) return;
      if (a.paused) a.play().catch(() => {}); else a.pause();
      return;
    }
    setNowPlaying({ playlistId, playlistPath, filename: file.name, fullPath, title: file.title || file.name, artist: file.artist || '' });
    setTimeout(() => {
      const a = audioRef.current; if (!a) return;
      a.src = `/api/audio/${encodeURIComponent(fullPath)}`;
      a.load();
      a.play().catch(() => {});
    }, 30);
  }
  function togglePlayPause() {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }
  function skip(deltaSec) {
    const a = audioRef.current; if (!a) return;
    a.currentTime = Math.max(0, Math.min((a.duration || 0), (a.currentTime || 0) + deltaSec));
  }
  function seekTo(ratio) {
    const a = audioRef.current; if (!a || !duration) return;
    a.currentTime = Math.max(0, Math.min(duration, ratio * duration));
  }
  function closePlayer() {
    const a = audioRef.current; if (a) { try { a.pause(); a.src = ''; } catch {} }
    setNowPlaying(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
  }

  useEffect(() => {
    if (!open || playlists !== null) return;
    getMusicStats()
      .then(s => setPlaylists(s || []))
      .catch(e => setError(e.response?.data?.error || e.message));
    getMusicArtists().then(r => setGlobalArtists(r.artists || [])).catch(() => {});
  }, [open]);

  return (
    <div style={card}>
      <button onClick={() => setOpen(o => !o)} style={cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📝 עריכת תגיות שירים</span>
          {playlists && (
            <span style={pill}>{playlists.length} פלייליסטים</span>
          )}
        </div>
        <span style={{ color: '#888', fontSize: 16 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={errBox}>{error}</div>}
          {playlists === null && <div style={{ color: '#888', fontSize: 13, padding: 10, textAlign: 'center' }}>טוען…</div>}
          {playlists && playlists.length === 0 && <div style={{ color: '#888', fontSize: 13, padding: 10, textAlign: 'center' }}>אין פלייליסטים מקומיים</div>}
          {playlists && playlists.map(pl => (
            <PlaylistRow
              key={pl.id}
              playlist={pl}
              expanded={expandedId === pl.id}
              onToggle={() => setExpandedId(id => id === pl.id ? null : pl.id)}
              globalArtists={globalArtists}
              onArtistsChanged={() => getMusicArtists().then(r => setGlobalArtists(r.artists || [])).catch(() => {})}
              onPlay={playFile}
              nowPlaying={nowPlaying}
              isPlaying={isPlaying}
            />
          ))}
        </div>
      )}

      {/* Shared audio + sticky mini-player */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          const a = audioRef.current; if (!a) return;
          const d = a.duration; if (d > 0) setProgress(a.currentTime / d);
        }}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
        onLoadStart={() => { setProgress(0); setDuration(0); }}
      />
      {nowPlaying && (
        <div style={miniPlayer}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nowPlaying.title}</div>
              {nowPlaying.artist && <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nowPlaying.artist}</div>}
            </div>
            <button onClick={closePlayer} title="סגור נגן" style={miniIconBtn}>✕</button>
          </div>
          <div
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (rect.right - e.clientX) / rect.width; // RTL
              seekTo(ratio);
            }}
            style={{ background: '#1a1a1a', borderRadius: 4, height: 6, overflow: 'hidden', border: '1px solid #2d2d33', cursor: 'pointer' }}
          >
            <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.1s linear' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#888', fontVariantNumeric: 'tabular-nums' }}>
            <span>{fmtTime(duration ? duration * progress : 0)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <button onClick={() => skip(-10)} title="‎-10 שניות" style={miniCtrlBtn}>⏪10</button>
            <button onClick={togglePlayPause} title={isPlaying ? 'השהה' : 'נגן'} style={{ ...miniCtrlBtn, background: 'var(--accent)', color: '#fff', minWidth: 56 }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => skip(10)} title="‎+10 שניות" style={miniCtrlBtn}>10⏩</button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── A single playlist row that expands into a song list ─────────────────────
function PlaylistRow({ playlist, expanded, onToggle, globalArtists, onArtistsChanged, onPlay, nowPlaying, isPlaying }) {
  const [files, setFiles] = useState(null);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!expanded || files !== null) return;
    listMusicFiles(playlist.id)
      .then(r => setFiles(r.files || []))
      .catch(() => setFiles([]));
  }, [expanded]);

  async function reload() {
    try {
      const r = await listMusicFiles(playlist.id);
      setFiles(r.files || []);
    } catch {}
  }

  const filtered = useMemo(() => {
    if (!files) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.title || '').toLowerCase().includes(q) ||
      (f.artist || '').toLowerCase().includes(q)
    );
  }, [files, filter]);

  return (
    <div style={{ background: '#1a1a1f', border: '1px solid #2d2d33', borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 18 }}>📁</span>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playlist.name}</span>
          {playlist.hidden && <span style={hiddenPill}>מוסתר</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={pill}>{playlist.files} שירים</span>
          <span style={{ color: '#888' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="🔍 סנן לפי שיר / אמן / שם קובץ"
            style={mobileInput}
          />
          {files === null && <div style={{ color: '#888', fontSize: 13, padding: 10, textAlign: 'center' }}>טוען שירים…</div>}
          {filtered && filtered.length === 0 && <div style={{ color: '#888', fontSize: 13, padding: 10, textAlign: 'center' }}>אין שירים תואמים</div>}
          {filtered && filtered.map(f => {
            const fullPath = playlist.path.endsWith('/') ? `${playlist.path}${f.name}` : `${playlist.path}/${f.name}`;
            const isActive = nowPlaying?.fullPath === fullPath;
            const isThisPlaying = isActive && isPlaying;
            return (
              <div
                key={f.name}
                style={{
                  background: isActive ? '#0d2e0d33' : '#0f0f12',
                  border: `1px solid ${isActive ? '#1db954' : '#2d2d33'}`,
                  borderRadius: 10,
                  padding: '8px 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {/* Play / Pause */}
                <button
                  onClick={() => onPlay?.(playlist.id, playlist.path, f)}
                  title={isThisPlaying ? 'השהה' : 'נגן'}
                  style={{
                    width: 40, height: 40, borderRadius: 20,
                    background: isActive ? '#1db954' : '#2d2d30',
                    color: isActive ? '#000' : '#1db954',
                    border: `1px solid ${isActive ? '#1db954' : '#3a3a3a'}`,
                    fontSize: 16, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {isThisPlaying ? '⏸' : '▶'}
                </button>

                {/* Song title / artist — tap to open editor */}
                <button
                  onClick={() => setEditing(f)}
                  style={{
                    flex: 1, minWidth: 0,
                    background: 'transparent', border: 'none',
                    textAlign: 'right', cursor: 'pointer', color: '#fff',
                    padding: '4px 0',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: isActive ? '#1db954' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.title || f.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.artist || <span style={{ color: '#555' }}>— ללא אמן —</span>}
                    {f.year && <span style={{ color: '#666' }}> · {f.year}</span>}
                  </div>
                </button>

                {/* Edit pencil */}
                <button
                  onClick={() => setEditing(f)}
                  title="עריכת תגיות"
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: 'transparent', border: '1px solid #3a3a3a',
                    color: '#aaa', fontSize: 14, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  ✎
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MobileMetadataEditor
          playlistId={playlist.id}
          file={editing}
          siblings={files || []}
          artistSuggestions={[...new Set([
            ...globalArtists,
            ...((files || []).map(f => f.artist).filter(Boolean)),
          ])].sort((a, b) => a.localeCompare(b, 'he'))}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
            onArtistsChanged?.();
          }}
        />
      )}
    </div>
  );
}

// ── Fullscreen-style mobile editor — same logic as the desktop modal but
// laid out vertically with large fields and bulk-rename support. ────────────
function MobileMetadataEditor({ playlistId, file, siblings = [], artistSuggestions = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    title: file.title || '', artist: file.artist || '', album: file.album || '',
    year: file.year || '', genre: file.genre || '', track: file.track || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingRename, setPendingRename] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(0);

  const originalArtist = (file.artist || '').trim();

  function update(k, v) { setForm(s => ({ ...s, [k]: v })); }
  const selectOnFocus = e => e.target.select();

  async function save() {
    setSaving(true); setError('');
    try {
      await updateMusicMetadata(playlistId, file.name, form);
      const newArtist = (form.artist || '').trim();
      if (originalArtist && newArtist && originalArtist !== newArtist) {
        const others = siblings.filter(s => s.name !== file.name && (s.artist || '').trim() === originalArtist);
        if (others.length > 0) {
          setPendingRename({ oldName: originalArtist, newName: newArtist, siblings: others });
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
    setSaving(true); setError(''); setBulkProgress(0);
    try {
      let done = 0;
      for (const s of pendingRename.siblings) {
        await updateMusicMetadata(playlistId, s.name, {
          title: s.title || '', artist: pendingRename.newName, album: s.album || '',
          year: s.year || '', genre: s.genre || '', track: s.track || '',
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

  return (
    <div style={fullscreen} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#1a1a1f', border: '1px solid #2d2d33', borderRadius: 14,
        width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #2d2d33', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>✎ עריכת תגיות</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>

        {pendingRename ? (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#0f0f12', border: '1px solid #2d2d33', borderRadius: 10, padding: 12, color: '#ddd', fontSize: 13, lineHeight: 1.6 }}>
              שינית את שם האמן מ-
              <span style={{ color: '#ff8a3d', fontWeight: 700 }}> "{pendingRename.oldName}"</span>
              {' '}ל-
              <span style={{ color: '#1db954', fontWeight: 700 }}>"{pendingRename.newName}"</span>.
              <br />
              נמצאו <b>{pendingRename.siblings.length}</b> שירים נוספים בפלייליסט עם השם הישן. לעדכן גם אותם?
            </div>
            <div style={{ background: '#0a0a0c', border: '1px solid #2d2d33', borderRadius: 10, maxHeight: 180, overflowY: 'auto', padding: '4px 10px' }}>
              {pendingRename.siblings.map(s => (
                <div key={s.name} style={{ fontSize: 12, color: '#888', padding: '4px 0', borderBottom: '1px solid #1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || s.name}
                </div>
              ))}
            </div>
            {saving && <div style={{ color: '#888', fontSize: 12 }}>מעדכן {bulkProgress}/{pendingRename.siblings.length}…</div>}
            {error && <div style={errBox}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setPendingRename(null); onSaved?.(); }} disabled={saving} style={btnGhost}>לא, רק את השיר הזה</button>
              <button onClick={applyBulkRename} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? `⏳ ${bulkProgress}/${pendingRename.siblings.length}` : `🔁 עדכן את כל ${pendingRename.siblings.length}`}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: '#888' }}>
              קובץ: <span style={{ color: '#ddd' }}>{file.name}</span>
            </div>

            <MField label="שם השיר">
              <input
                value={form.title}
                onChange={e => update('title', e.target.value)}
                onFocus={selectOnFocus}
                style={mobileInput}
              />
            </MField>

            <MField label="אמן">
              <input
                value={form.artist}
                onChange={e => update('artist', e.target.value)}
                onFocus={selectOnFocus}
                list="mmp-artist-suggestions"
                autoComplete="off"
                style={mobileInput}
              />
              <datalist id="mmp-artist-suggestions">
                {artistSuggestions.map(a => <option key={a} value={a} />)}
              </datalist>
            </MField>

            <MField label="אלבום">
              <input
                value={form.album}
                onChange={e => update('album', e.target.value)}
                onFocus={selectOnFocus}
                style={mobileInput}
              />
            </MField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <MField label="שנה">
                <input
                  inputMode="numeric"
                  value={form.year}
                  onChange={e => update('year', e.target.value)}
                  onFocus={selectOnFocus}
                  style={mobileInput}
                  placeholder="2024"
                />
              </MField>
              <MField label="רצועה">
                <input
                  inputMode="numeric"
                  value={form.track}
                  onChange={e => update('track', e.target.value)}
                  onFocus={selectOnFocus}
                  style={mobileInput}
                  placeholder="1"
                />
              </MField>
              <MField label="ז'אנר">
                <input
                  value={form.genre}
                  onChange={e => update('genre', e.target.value)}
                  onFocus={selectOnFocus}
                  style={mobileInput}
                />
              </MField>
            </div>

            {error && <div style={errBox}>{error}</div>}

            <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6 }}>
              💡 השינויים נכתבים ל-ID3 של הקובץ עצמו. תומך MP3 בלבד כרגע.
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button onClick={onClose} disabled={saving} style={btnGhost}>ביטול</button>
              <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? '⏳ שומר…' : '💾 שמירה'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MField({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

// ── Styles — kept compact and inline so the panel works in any theme ───
const card = { background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' };
const cardHeader = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff' };
const pill = { fontSize: 11, color: '#aaa', background: '#0f0f12', padding: '2px 8px', borderRadius: 10, border: '1px solid #2d2d33', fontWeight: 700 };
const hiddenPill = { fontSize: 10, color: '#ff8a3d', background: '#3a1010', padding: '2px 6px', borderRadius: 4, fontWeight: 700, marginInlineStart: 6 };
const mobileInput = {
  width: '100%', padding: '12px 14px', fontSize: 16, // 16px prevents iOS zoom on focus
  background: '#0a0a0c', border: '1px solid #2d2d33', borderRadius: 10, color: '#fff',
  outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '12px', borderRadius: 10, background: 'var(--accent)',
  color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const btnGhost = {
  flex: 1, padding: '12px', borderRadius: 10, background: '#0f0f12',
  color: '#ccc', border: '1px solid #2d2d33', fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const errBox = { background: '#3a1010', color: '#ff6b6b', padding: 10, borderRadius: 8, fontSize: 13, border: '1px solid #5a1010' };
const fullscreen = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 12,
};
const miniPlayer = {
  position: 'sticky', bottom: 8,
  marginTop: 12,
  background: '#1a1a1f', border: '1px solid #2d2d33',
  borderRadius: 14, padding: 10,
  boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column', gap: 6,
  zIndex: 5,
};
const miniIconBtn = {
  width: 30, height: 30, borderRadius: 15,
  background: 'transparent', border: '1px solid #3a3a3a',
  color: '#aaa', fontSize: 13, cursor: 'pointer', flexShrink: 0,
};
const miniCtrlBtn = {
  background: '#2a2a2a', border: '1px solid #3a3a3a',
  color: '#ddd', borderRadius: 10, padding: '8px 14px',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
  minWidth: 50,
};
