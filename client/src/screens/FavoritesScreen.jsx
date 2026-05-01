import { useState, useEffect, useRef, useCallback } from 'react';
import { getFavorites, removeFavorite, reorderFavorites } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function FavoritesScreen({ onExit }) {
  const { t, dir } = useLang();

  // ── data ──
  const [songs, setSongs] = useState([]);       // full ordered list
  const [loading, setLoading] = useState(true);

  // ── filter ──
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | playlistId | 'none'

  // ── player ──
  const [currentIdx, setCurrentIdx] = useState(null);  // index in *filtered* list
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);          // 0–1
  const [duration, setDuration] = useState(0);
  const [shuffleMode, setShuffleMode] = useState(false);
  const audioRef = useRef(null);

  // ── drag-to-reorder (touch + mouse via Pointer Events) ──
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dragY, setDragY] = useState(null);     // finger Y for visual feedback
  const dragStartY = useRef(0);
  const DRAG_THRESHOLD = 5;                      // px before drag activates
  const [dragActive, setDragActive] = useState(false);

  // ── debounce timer for reorder API call ──
  const reorderTimer = useRef(null);

  // ── load ──
  useEffect(() => {
    getFavorites()
      .then(data => setSongs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── derived: playlists found in favorites ──
  const playlistFilters = (() => {
    const seen = new Map(); // id → name
    for (const s of songs) {
      if (s.playlistId && !seen.has(s.playlistId)) {
        seen.set(s.playlistId, s.playlistName || s.playlistId);
      }
    }
    // songs with no playlist match
    const hasNone = songs.some(s => !s.playlistId);
    return { filters: [...seen.entries()], hasNone };
  })();

  // ── displayed songs per active filter ──
  const displayedSongs = activeFilter === 'all'
    ? songs
    : activeFilter === 'none'
      ? songs.filter(s => !s.playlistId)
      : songs.filter(s => s.playlistId === activeFilter);

  // ── player helpers ──
  const playSong = useCallback((idxInDisplay, displayList) => {
    const list = displayList || displayedSongs;
    const song = list[idxInDisplay];
    if (!song || !audioRef.current) return;
    audioRef.current.src = song.audioUrl || '';
    audioRef.current.load();
    audioRef.current.play().catch(() => {});
    setCurrentIdx(idxInDisplay);
    setIsPlaying(true);
  }, [displayedSongs]);  // eslint-disable-line

  const playAll = () => playSong(0, displayedSongs);

  const playShuffled = () => {
    const shuffled = shuffleArr(displayedSongs);
    setSongs(prev => {
      // Keep full list order but bubble shuffled to top when 'all'
      if (activeFilter === 'all') return shuffled;
      return prev;
    });
    setShuffleMode(true);
    playSong(0, shuffled);
  };

  const handlePlayNext = useCallback(() => {
    if (currentIdx === null) return;
    const next = (currentIdx + 1) % displayedSongs.length;
    playSong(next);
  }, [currentIdx, displayedSongs, playSong]);

  const handlePlayPrev = useCallback(() => {
    if (currentIdx === null) return;
    // if >3 sec in, restart; else go to previous
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const prev = (currentIdx - 1 + displayedSongs.length) % displayedSongs.length;
    playSong(prev);
  }, [currentIdx, displayedSongs, playSong]);

  function togglePlayPause() {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setIsPlaying(true); }
  }

  function seekTo(ratio) {
    if (!audioRef.current || !duration) return;
    audioRef.current.currentTime = ratio * duration;
    setProgress(ratio);
  }

  // ── remove ──
  async function handleRemove(e, song) {
    e.stopPropagation();
    try {
      await removeFavorite(song.id);
      setSongs(prev => prev.filter(s => s.id !== song.id));
      if (displayedSongs[currentIdx]?.id === song.id) {
        setCurrentIdx(null);
        setIsPlaying(false);
      }
    } catch {}
  }

  // ── drag-to-reorder (Pointer Events — works on touch + mouse) ──
  function handlePointerDown(e, idx) {
    if (!canDrag) return;
    // capture pointer so we keep getting move/up events even outside the handle
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDragIdx(idx);
    setDragOverIdx(idx);
    setDragY(e.clientY);
    setDragActive(false);            // not active until threshold passed
    dragStartY.current = e.clientY;
  }

  function handlePointerMove(e) {
    if (dragIdx === null) return;
    // activate drag once the user moved beyond the threshold (prevents accidental drags)
    if (!dragActive && Math.abs(e.clientY - dragStartY.current) > DRAG_THRESHOLD) {
      setDragActive(true);
    }
    if (!dragActive && Math.abs(e.clientY - dragStartY.current) <= DRAG_THRESHOLD) return;

    setDragY(e.clientY);
    // Find the row under the pointer (since pointer capture means events
    // don't fire on other elements, we use elementFromPoint instead)
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-row-idx]');
    if (row) {
      const overIdx = parseInt(row.dataset.rowIdx, 10);
      if (!isNaN(overIdx) && overIdx !== dragOverIdx) {
        setDragOverIdx(overIdx);
      }
    }

    // Auto-scroll near top/bottom of viewport
    const margin = 60;
    if (e.clientY < margin) window.scrollBy(0, -8);
    else if (e.clientY > window.innerHeight - margin) window.scrollBy(0, 8);
  }

  function commitDragReorder() {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx && dragActive) {
      const from = dragIdx;
      const to = dragOverIdx;
      setSongs(prev => {
        const next = [...prev];
        const [removed] = next.splice(from, 1);
        next.splice(to, 0, removed);
        clearTimeout(reorderTimer.current);
        reorderTimer.current = setTimeout(() => {
          reorderFavorites(next.map(s => s.id)).catch(() => {});
        }, 600);
        return next;
      });
      if (currentIdx !== null) setCurrentIdx(null);  // re-sync via effect
    }
    setDragIdx(null);
    setDragOverIdx(null);
    setDragY(null);
    setDragActive(false);
  }

  function handlePointerUp() { commitDragReorder(); }
  function handlePointerCancel() {
    setDragIdx(null);
    setDragOverIdx(null);
    setDragY(null);
    setDragActive(false);
  }

  // ── Media Session API: lock-screen artwork + transport controls ──
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;

    // Build an absolute URL — lock-screen art needs a fully-qualified URL
    const cover = current.coverUrl
      ? new URL(current.coverUrl, window.location.origin).href
      : null;

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: current.title || (current.filePath?.split(/[\\/]/).pop() || ''),
      artist: current.artist || '',
      album: current.year ? String(current.year) : 'Music Game',
      artwork: cover ? [
        { src: cover, sizes: '96x96',  type: 'image/jpeg' },
        { src: cover, sizes: '256x256', type: 'image/jpeg' },
        { src: cover, sizes: '512x512', type: 'image/jpeg' },
      ] : [],
    });

    navigator.mediaSession.setActionHandler('play',  () => audioRef.current?.play().catch(() => {}));
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('previoustrack', handlePlayPrev);
    navigator.mediaSession.setActionHandler('nexttrack',     handlePlayNext);
    try {
      navigator.mediaSession.setActionHandler('seekto', d => {
        if (audioRef.current && d.seekTime != null) audioRef.current.currentTime = d.seekTime;
      });
    } catch {}
  }, [current, handlePlayNext, handlePlayPrev]);

  // Update playback state for lock screen play/pause icon
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  // Update position on lock screen progress bar
  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(progress * duration, duration),
      });
    } catch {}
  }, [progress, duration]);

  // ── recover currentIdx after reorder ──
  useEffect(() => {
    if (currentIdx === null && isPlaying && audioRef.current?.src) {
      // try to find the song that was playing
      const src = audioRef.current.src;
      const newIdx = displayedSongs.findIndex(s => s.audioUrl && src.endsWith(encodeURIComponent(s.filePath || '')));
      if (newIdx >= 0) setCurrentIdx(newIdx);
    }
  }, [songs]); // eslint-disable-line

  const current = currentIdx !== null ? displayedSongs[currentIdx] : null;
  const accentColor = 'var(--accent)';
  const canDrag = activeFilter === 'all';

  // ── chip counts ──
  function countForFilter(fId) {
    if (fId === 'all') return songs.length;
    if (fId === 'none') return songs.filter(s => !s.playlistId).length;
    return songs.filter(s => s.playlistId === fId).length;
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: 'var(--bg)', maxWidth: 480, margin: '0 auto', direction: dir,
    }}>

      {/* ── HEADER ── */}
      <div style={{
        background: `linear-gradient(180deg, ${accentColor}44 0%, var(--bg) 100%)`,
        padding: '18px 16px 12px', flexShrink: 0,
      }}>
        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={onExit} style={{
            background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22,
            cursor: 'pointer', padding: 0, lineHeight: 1,
          }}>⌂</button>
          <span style={{ color: 'var(--text)', fontWeight: 900, fontSize: 20, flex: 1 }}>
            {t('my_favorites')}
          </span>
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>
            {t('songs_count').replace('{n}', songs.length)}
          </span>
        </div>

        {/* Play All + Shuffle */}
        {songs.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button onClick={playAll} style={{
              flex: 1, background: accentColor, color: '#fff', border: 'none',
              borderRadius: 22, padding: '10px 0', fontWeight: 800, fontSize: 14,
              cursor: 'pointer', letterSpacing: 0.3,
            }}>
              {t('fav_play_all')}
            </button>
            <button onClick={playShuffled} style={{
              flex: 1, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)',
              borderRadius: 22, padding: '10px 0', fontWeight: 700, fontSize: 14,
              cursor: 'pointer',
            }}>
              {t('fav_shuffle')}
            </button>
          </div>
        )}

        {/* Filter chips */}
        {(playlistFilters.filters.length > 0 || playlistFilters.hasNone) && (
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
            scrollbarWidth: 'none',
          }}>
            {/* "הכל" chip */}
            <Chip
              label={`${t('fav_all')} · ${countForFilter('all')}`}
              active={activeFilter === 'all'}
              accent={accentColor}
              onClick={() => setActiveFilter('all')}
            />
            {/* per-playlist chips */}
            {playlistFilters.filters.map(([id, name]) => (
              <Chip
                key={id}
                label={`${name} · ${countForFilter(id)}`}
                active={activeFilter === id}
                accent={accentColor}
                onClick={() => setActiveFilter(id)}
              />
            ))}
            {/* songs with no playlist match */}
            {playlistFilters.hasNone && (
              <Chip
                label={`אחר · ${countForFilter('none')}`}
                active={activeFilter === 'none'}
                accent={accentColor}
                onClick={() => setActiveFilter('none')}
              />
            )}
          </div>
        )}
      </div>

      {/* ── SONG LIST ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: current ? 108 : 20 }}>
        {loading && (
          <div style={{ color: 'var(--text2)', textAlign: 'center', paddingTop: 40 }}>...</div>
        )}

        {!loading && displayedSongs.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--text2)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💔</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>{t('no_favorites')}</div>
            <div style={{ fontSize: 12, color: 'var(--border)' }}>{t('favorites_hint')}</div>
          </div>
        )}

        {/* drag tip */}
        {canDrag && displayedSongs.length > 1 && (
          <div style={{
            textAlign: 'center', fontSize: 11, color: 'var(--text2)',
            padding: '6px 0 2px', opacity: 0.7,
          }}>
            {t('fav_drag_tip')}
          </div>
        )}

        {displayedSongs.map((s, idx) => {
          const isActive = currentIdx === idx;
          const isDragging = dragIdx === idx && dragActive;
          const isDragTarget = dragOverIdx === idx && dragIdx !== idx && dragActive;

          return (
            <div
              key={s.id}
              data-row-idx={idx}
              onClick={() => { if (!dragActive) playSong(idx); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                borderTop: isDragTarget && dragOverIdx < dragIdx ? `2px solid ${accentColor}` : '2px solid transparent',
                borderBottom: isDragTarget && dragOverIdx > dragIdx ? `2px solid ${accentColor}` : '1px solid var(--bg2)',
                background: isActive
                  ? `${accentColor}18`
                  : isDragging
                    ? 'var(--bg3, #333)'
                    : 'transparent',
                cursor: 'pointer',
                opacity: isDragging ? 0.4 : 1,
                transition: dragActive ? 'none' : 'background 0.12s',
                userSelect: 'none',
              }}
            >
              {/* Drag handle — pointer events live HERE so the rest of the row stays clickable */}
              {canDrag && (
                <span
                  onPointerDown={e => handlePointerDown(e, idx)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onClick={e => e.stopPropagation()}    /* don't play song when tapping handle */
                  style={{
                    fontSize: 22, color: 'var(--text2)', flexShrink: 0,
                    cursor: isDragging ? 'grabbing' : 'grab', opacity: 0.6, lineHeight: 1,
                    touchAction: 'none',                 // critical: stops the page scrolling on touch
                    padding: '8px 6px', margin: '-8px -6px', // bigger touch target
                    userSelect: 'none', WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                  }}
                >
                  ⠿
                </span>
              )}

              {/* Cover */}
              <div style={{
                width: 46, height: 46, borderRadius: 8, flexShrink: 0,
                overflow: 'hidden', background: 'var(--bg2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: isActive ? `2px solid ${accentColor}` : '2px solid transparent',
                transition: 'border 0.15s',
              }}>
                {s.coverUrl ? (
                  <img src={s.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <span style={{ fontSize: 22 }}>🎵</span>
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: isActive ? accentColor : 'var(--text)',
                  fontWeight: 700, fontSize: 14,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  transition: 'color 0.15s',
                }}>
                  {s.title || s.filePath?.split(/[\\/]/).pop() || '—'}
                </div>
                <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>
                  {s.artist}{s.year ? ` · ${s.year}` : ''}
                </div>
                {s.playlistName && activeFilter === 'all' && (
                  <div style={{
                    display: 'inline-block', marginTop: 3,
                    background: `${accentColor}28`, color: accentColor,
                    fontSize: 10, fontWeight: 700, borderRadius: 4,
                    padding: '1px 6px',
                  }}>
                    {s.playlistName}
                  </div>
                )}
              </div>

              {/* Playing indicator + Remove */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {isActive && (
                  <span style={{ color: accentColor, fontSize: 14 }}>
                    {isPlaying ? '▶' : '⏸'}
                  </span>
                )}
                <button
                  onClick={e => handleRemove(e, s)}
                  style={{
                    background: 'none', border: 'none', color: '#dc3545',
                    fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1,
                  }}
                  title={t('remove_fav')}
                >
                  💔
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MINI PLAYER ── */}
      {current && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto',
          background: 'var(--bg2)', borderTop: '1px solid var(--border)',
          direction: dir, zIndex: 10,
        }}>
          {/* Progress bar */}
          <div
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
            style={{
              height: 4, background: 'var(--bg)', cursor: 'pointer', position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${progress * 100}%`,
              background: accentColor,
              transition: 'width 0.25s linear',
              borderRadius: 2,
            }} />
          </div>

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 10px' }}>
            {/* Cover */}
            <div style={{
              width: 42, height: 42, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
              background: 'var(--bg3, #333)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {current.coverUrl ? (
                <img src={current.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 20 }}>🎵</span>
              )}
            </div>

            {/* Title / time */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                color: 'var(--text)', fontWeight: 700, fontSize: 13,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {current.title || '—'}
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 1 }}>
                {current.artist}&nbsp;·&nbsp;
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTime(progress * duration)} / {fmtTime(duration)}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <button onClick={handlePlayPrev} style={iconBtn}>⏮</button>
            <button onClick={togglePlayPause} style={{ ...iconBtn, background: accentColor, color: '#fff', width: 40, height: 40, borderRadius: 20 }}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={handlePlayNext} style={iconBtn}>⏭</button>
            <button
              onClick={() => setShuffleMode(v => !v)}
              style={{ ...iconBtn, color: shuffleMode ? accentColor : 'var(--text2)' }}
              title="Shuffle"
            >
              🔀
            </button>
          </div>
        </div>
      )}

      {/* ── AUDIO ELEMENT ── */}
      <audio
        ref={audioRef}
        onEnded={() => {
          if (shuffleMode) {
            const rand = Math.floor(Math.random() * displayedSongs.length);
            playSong(rand);
          } else {
            handlePlayNext();
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          const d = audioRef.current.duration;
          if (d > 0) setProgress(audioRef.current.currentTime / d);
        }}
        onDurationChange={() => {
          setDuration(audioRef.current?.duration || 0);
        }}
        onLoadStart={() => { setProgress(0); setDuration(0); }}
      />
    </div>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────────
function Chip({ label, active, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, whiteSpace: 'nowrap',
        padding: '6px 14px', borderRadius: 20,
        background: active ? accent : 'var(--bg2)',
        color: active ? '#fff' : 'var(--text2)',
        border: active ? `1px solid ${accent}` : '1px solid var(--border)',
        fontWeight: active ? 700 : 500, fontSize: 13,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

const iconBtn = {
  background: 'transparent', border: 'none',
  color: 'var(--text)', fontSize: 18, cursor: 'pointer',
  padding: '4px 6px', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
