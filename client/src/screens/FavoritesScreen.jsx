import { useState, useEffect, useRef, useCallback } from 'react';
import { getFavorites, removeFavorite, reorderFavorites } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';
import { getJSON, setJSON } from '../utils/safeStorage.js';

// localStorage key for resume-on-reopen
const RESUME_KEY = 'mg_fav_resume';

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
  // Playback queue — separate from the displayed list so shuffle doesn't
  // disturb the visual order. Defaults to displayedSongs when not shuffled.
  const [playQueue, setPlayQueue] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(null);  // index in playQueue
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);          // 0–1
  const [duration, setDuration] = useState(0);
  const [shuffleMode, setShuffleMode] = useState(false);
  // Full-screen "now playing" view — opened by tapping the mini-player cover/title
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
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

  // ── load + resume last-played song ──
  useEffect(() => {
    getFavorites()
      .then(data => {
        setSongs(data);
        // Restore last-played song if we have one. The audio is loaded and
        // seeked but NOT auto-played — browsers block autoplay on fresh
        // navigation, and showing the user a paused row at the right spot
        // lets them tap ▶ to continue exactly where they left off.
        try {
          const saved = getJSON(RESUME_KEY, null);
          if (saved && saved.songId && Array.isArray(data)) {
            const song = data.find(s => s.id === saved.songId);
            if (song) {
              setPlayQueue(data);
              const idxInData = data.indexOf(song);
              setCurrentIdx(idxInData >= 0 ? idxInData : 0);
              if (audioRef.current && song.audioUrl) {
                audioRef.current.src = song.audioUrl;
                audioRef.current.load();
                const t = Number(saved.currentTime) || 0;
                if (t > 0) {
                  const onMeta = () => {
                    try { audioRef.current.currentTime = t; } catch {}
                    audioRef.current.removeEventListener('loadedmetadata', onMeta);
                  };
                  audioRef.current.addEventListener('loadedmetadata', onMeta);
                }
              }
            }
          }
        } catch {}
      })
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
  // Always plays from playQueue. Pass `queueOverride` to swap the queue and
  // start a fresh playback session (used by Play All / Shuffle / row click).
  const playSong = useCallback((idxInQueue, queueOverride) => {
    const list = queueOverride || playQueue;
    const song = list[idxInQueue];
    if (!song || !audioRef.current) return;
    if (queueOverride) setPlayQueue(queueOverride);
    audioRef.current.src = song.audioUrl || '';
    audioRef.current.load();
    audioRef.current.play().catch(() => {});
    setCurrentIdx(idxInQueue);
    setIsPlaying(true);
  }, [playQueue]);

  // Play the displayed list in its current visual order
  const playAll = () => {
    setShuffleMode(false);
    playSong(0, displayedSongs);
  };

  // Toggle shuffle mode.
  // - OFF → ON:  reshuffle and start playing a random song. If something is
  //              already playing, jump to a different song so the action is
  //              visibly random (previously we tried not to interrupt audio,
  //              which made shuffle look like it did nothing).
  // - ON  → OFF: rebuild the queue in the displayed order, keeping the
  //              current song aligned so 'next' continues from there.
  const toggleShuffle = () => {
    if (shuffleMode) {
      // Turn shuffle off — switch back to natural order without interrupting
      setShuffleMode(false);
      const playingId = current?.id;
      if (playingId) {
        const newIdx = displayedSongs.findIndex(s => s.id === playingId);
        if (newIdx >= 0) {
          setPlayQueue(displayedSongs);
          setCurrentIdx(newIdx);
          return;
        }
      }
      setPlayQueue(displayedSongs);
      return;
    }
    // Turn shuffle ON — always start playing a fresh random song so the user
    // sees that shuffle took effect. Avoid picking the same song that's
    // currently playing when there's more than one option.
    setShuffleMode(true);
    let shuffled = shuffleArr(displayedSongs);
    if (current && shuffled.length > 1 && shuffled[0].id === current.id) {
      // Swap [0] with [1] so we don't replay the song that was just playing
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    playSong(0, shuffled);
  };

  const handlePlayNext = useCallback(() => {
    if (currentIdx === null || playQueue.length === 0) return;
    const next = (currentIdx + 1) % playQueue.length;
    playSong(next);
  }, [currentIdx, playQueue, playSong]);

  const handlePlayPrev = useCallback(() => {
    if (currentIdx === null || playQueue.length === 0) return;
    // if >3 sec in, restart; else go to previous
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const prev = (currentIdx - 1 + playQueue.length) % playQueue.length;
    playSong(prev);
  }, [currentIdx, playQueue, playSong]);

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
      if (current?.id === song.id) {
        setCurrentIdx(null);
        setIsPlaying(false);
      }
      setPlayQueue(prev => prev.filter(s => s.id !== song.id));
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
      // dragIdx/dragOverIdx are indices in the *filtered* list — map back to the full list
      const fromSong = displayedSongs[dragIdx];
      const toSong   = displayedSongs[dragOverIdx];
      if (fromSong && toSong) {
        setSongs(prev => {
          const fromFull = prev.findIndex(s => s.id === fromSong.id);
          const toFull   = prev.findIndex(s => s.id === toSong.id);
          if (fromFull < 0 || toFull < 0 || fromFull === toFull) return prev;

          const next = [...prev];
          const [removed] = next.splice(fromFull, 1);
          // Account for the shift after removing the item before the target
          const insertAt = fromFull < toFull ? toFull - 1 : toFull;
          // If we're moving DOWN past the target, drop just after it; otherwise drop before
          const finalIdx = (dragOverIdx > dragIdx) ? insertAt + 1 : insertAt;
          next.splice(Math.max(0, Math.min(next.length, finalIdx)), 0, removed);

          clearTimeout(reorderTimer.current);
          reorderTimer.current = setTimeout(() => {
            reorderFavorites(next.map(s => s.id)).catch(() => {});
          }, 600);
          return next;
        });
        if (currentIdx !== null) setCurrentIdx(null);  // re-sync via effect
      }
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

  // ── derived values ── (must be defined BEFORE the useEffects that depend on them)
  const current = currentIdx !== null ? playQueue[currentIdx] : null;
  const accentColor = 'var(--accent)';
  // Drag works in any view (filtered or not). The reorder logic maps display
  // indices back to full-list indices so the saved order is always correct.
  const canDrag = displayedSongs.length > 1;

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

  // Persist last-played song + position so the user resumes here on re-entry.
  // Only saves while audio has actually started — prevents the restore-on-mount
  // path from overwriting the saved position with 0 before the user hits play.
  useEffect(() => {
    if (!current) return;
    const save = () => {
      const t = audioRef.current?.currentTime || 0;
      // Skip writes for fresh-loaded songs (t≈0) unless audio is actively
      // playing — protects the seek-target during cold-restore on mount
      if (t === 0 && !isPlaying) return;
      setJSON(RESUME_KEY, { songId: current.id, currentTime: t });
    };
    if (isPlaying) save();
    if (!isPlaying) return;
    const id = setInterval(save, 3000);
    return () => { clearInterval(id); save(); };
  }, [current, isPlaying]);

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
      const newIdx = playQueue.findIndex(s => s.audioUrl && src.endsWith(encodeURIComponent(s.filePath || '')));
      if (newIdx >= 0) setCurrentIdx(newIdx);
    }
  }, [songs]); // eslint-disable-line

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
            <button onClick={toggleShuffle} style={{
              flex: 1,
              background: shuffleMode ? accentColor : 'var(--bg2)',
              color:      shuffleMode ? '#fff'        : 'var(--text)',
              border: `1px solid ${shuffleMode ? accentColor : 'var(--border)'}`,
              borderRadius: 22, padding: '10px 0',
              fontWeight: shuffleMode ? 800 : 700, fontSize: 14,
              cursor: 'pointer',
              boxShadow: shuffleMode ? `0 2px 12px ${accentColor}55` : 'none',
              transition: 'all 0.15s',
            }} title={shuffleMode ? 'בטל סדר אקראי' : 'הפעל סדר אקראי'}>
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
          // Highlight by song id so the active row stays correct even when
          // playing from a shuffled queue (where idx doesn't match position)
          const isActive = current?.id === s.id;
          const isDragging = dragIdx === idx && dragActive;
          const isDragTarget = dragOverIdx === idx && dragIdx !== idx && dragActive;

          return (
            <div
              key={s.id}
              data-row-idx={idx}
              onClick={() => {
                if (dragActive) return;
                if (shuffleMode) {
                  // Shuffle on — play the tapped song now, then the rest
                  // of the list reshuffled after it. Keeps shuffle active.
                  const others = displayedSongs.filter(x => x.id !== s.id);
                  playSong(0, [s, ...shuffleArr(others)]);
                } else {
                  // Natural order — play from this point through the list
                  playSong(idx, displayedSongs);
                }
              }}
              style={{
                /* Grid handles min-content overflow far more reliably than flexbox.
                   The 1fr column shrinks to whatever's left after the auto columns,
                   and child overflow:hidden clips any oversized text without pushing siblings. */
                display: 'grid',
                gridTemplateColumns: canDrag ? 'auto auto 1fr auto' : 'auto 1fr auto',
                alignItems: 'center', gap: 10,
                padding: '10px 14px',
                width: '100%', boxSizing: 'border-box',
                /* Thick accent bar where the song will land */
                borderTop:    isDragTarget && dragOverIdx < dragIdx ? `3px solid ${accentColor}` : '3px solid transparent',
                borderBottom: isDragTarget && dragOverIdx > dragIdx ? `3px solid ${accentColor}` : '1px solid var(--bg2)',
                background: isActive
                  ? `${accentColor}18`
                  : isDragging
                    ? `repeating-linear-gradient(45deg, var(--bg2), var(--bg2) 8px, var(--bg) 8px, var(--bg) 16px)`
                    : 'transparent',
                cursor: 'pointer',
                opacity: isDragging ? 0.2 : 1,
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

              {/* Info — grid cell that takes 1fr; overflow:hidden + minWidth:0 ensure long Hebrew titles truncate */}
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{
                  color: isActive ? accentColor : 'var(--text)',
                  fontWeight: 700, fontSize: 14,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  transition: 'color 0.15s',
                  maxWidth: '100%',
                }}>
                  {s.title || s.filePath?.split(/[\\/]/).pop() || '—'}
                </div>
                <div style={{
                  color: 'var(--text2)', fontSize: 12, marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}>
                  {s.artist}{s.year ? ` · ${s.year}` : ''}
                </div>
                {s.playlistName && activeFilter === 'all' && (
                  <div style={{
                    display: 'inline-block', marginTop: 3,
                    background: `${accentColor}28`, color: accentColor,
                    fontSize: 10, fontWeight: 700, borderRadius: 4,
                    padding: '1px 6px',
                    maxWidth: '100%',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {s.playlistName}
                  </div>
                )}
              </div>

              {/* Playing indicator + Remove (always visible) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {isActive && (
                  <span style={{ color: accentColor, fontSize: 14 }}>
                    {isPlaying ? '▶' : '⏸'}
                  </span>
                )}
                <button
                  onClick={e => handleRemove(e, s)}
                  title={t('remove_fav')}
                  style={{
                    background: '#dc354522',
                    border: '1px solid #dc354544',
                    borderRadius: 10,
                    fontSize: 20, cursor: 'pointer',
                    width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    lineHeight: 1, padding: 0,
                  }}
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
            {/* Cover — tap to open full-screen "now playing" */}
            <div
              onClick={() => setNowPlayingOpen(true)}
              style={{
                width: 42, height: 42, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                background: 'var(--bg3, #333)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {current.coverUrl ? (
                <img src={current.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 20 }}>🎵</span>
              )}
            </div>

            {/* Title / time — tap to open full-screen "now playing" */}
            <div
              onClick={() => setNowPlayingOpen(true)}
              style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
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

            {/* Buttons — forced LTR so transport controls stay in standard music-player order
                (⏮ on the left, ⏭ on the right) regardless of page direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, direction: 'ltr', flexShrink: 0 }}>
              <button onClick={handlePlayPrev} style={iconBtn}>⏮</button>
              <button onClick={togglePlayPause} style={{ ...iconBtn, background: accentColor, color: '#fff', width: 40, height: 40, borderRadius: 20 }}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={handlePlayNext} style={iconBtn}>⏭</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FULL-SCREEN NOW PLAYING ── */}
      {nowPlayingOpen && current && (
        <NowPlayingView
          song={current}
          isPlaying={isPlaying}
          progress={progress}
          duration={duration}
          shuffleMode={shuffleMode}
          accentColor={accentColor}
          dir={dir}
          onClose={() => setNowPlayingOpen(false)}
          onPlayPause={togglePlayPause}
          onPrev={handlePlayPrev}
          onNext={handlePlayNext}
          onSeek={seekTo}
          onToggleShuffle={toggleShuffle}
        />
      )}

      {/* ── FLOATING GHOST during drag — visual feedback that follows finger ── */}
      {dragActive && dragIdx !== null && dragY !== null && displayedSongs[dragIdx] && (
        <div style={{
          position: 'fixed',
          top: dragY - 34,                          // center row on finger
          left: '50%',
          transform: 'translateX(-50%) rotate(-1.5deg) scale(1.04)',
          width: 'calc(100% - 24px)', maxWidth: 456,
          zIndex: 1000, pointerEvents: 'none',
          background: 'var(--bg2)',
          border: `2px solid ${accentColor}`,
          borderRadius: 14,
          boxShadow: '0 10px 30px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          direction: dir,
        }}>
          <span style={{ fontSize: 22, color: accentColor, opacity: 0.9 }}>⠿</span>

          <div style={{
            width: 46, height: 46, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
            background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {displayedSongs[dragIdx].coverUrl ? (
              <img src={displayedSongs[dragIdx].coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 22 }}>🎵</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: 'var(--text)', fontWeight: 700, fontSize: 14,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {displayedSongs[dragIdx].title || displayedSongs[dragIdx].filePath?.split(/[\\/]/).pop() || '—'}
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>
              {displayedSongs[dragIdx].artist}
              {displayedSongs[dragIdx].year ? ` · ${displayedSongs[dragIdx].year}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIO ELEMENT ── */}
      <audio
        ref={audioRef}
        onEnded={() => {
          // playQueue is already shuffled when shuffleMode is on, so following
          // it sequentially via handlePlayNext gives a random play order.
          handlePlayNext();
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

// ─── Now-playing full-screen overlay — opens from the mini-player ──────────
function NowPlayingView({
  song, isPlaying, progress, duration,
  shuffleMode, accentColor, dir,
  onClose, onPlayPause, onPrev, onNext, onSeek, onToggleShuffle,
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'var(--bg)',
      direction: dir,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Header — close button */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', flexShrink: 0 }}>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 26, cursor: 'pointer', padding: 0, lineHeight: 1 }}
          title="סגור"
        >
          ⌄
        </button>
        <div style={{ flex: 1, textAlign: 'center', color: 'var(--text2)', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
          מתנגן עכשיו
        </div>
        <div style={{ width: 26 }} />
      </div>

      {/* Content — cover, info, progress, controls */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '8px 24px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
      }}>
        {/* Big cover */}
        <div style={{
          width: 'min(320px, 75vw)', aspectRatio: '1 / 1',
          borderRadius: 18, overflow: 'hidden',
          background: 'var(--bg3, #2a2a2a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
          marginTop: 8,
        }}>
          {song.coverUrl ? (
            <img src={song.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 96, opacity: 0.4 }}>🎵</span>
          )}
        </div>

        {/* Song details */}
        <div style={{ width: '100%', textAlign: 'center' }}>
          <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, lineHeight: 1.25, wordBreak: 'break-word' }}>
            {song.title || '—'}
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 15, marginTop: 6, fontWeight: 600, wordBreak: 'break-word' }}>
            {song.artist || '—'}
          </div>
          {song.year && (
            <div style={{
              display: 'inline-block', marginTop: 10,
              background: `${accentColor}22`, color: accentColor,
              fontSize: 12, fontWeight: 700,
              padding: '4px 12px', borderRadius: 14,
              border: `1px solid ${accentColor}55`,
            }}>
              📅 {song.year}
            </div>
          )}
          {song.playlistName && (
            <div style={{
              display: 'inline-block', marginTop: 10, marginRight: 6,
              background: 'var(--bg2)', color: 'var(--text2)',
              fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              {song.playlistName}
            </div>
          )}
        </div>

        {/* Progress + time */}
        <div style={{ width: '100%' }}>
          <div
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = dir === 'rtl' ? rect.right - e.clientX : e.clientX - rect.left;
              onSeek(Math.max(0, Math.min(1, x / rect.width)));
            }}
            style={{
              height: 6, background: 'var(--bg2)', cursor: 'pointer', position: 'relative',
              borderRadius: 3, overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              [dir === 'rtl' ? 'right' : 'left']: 0,
              width: `${progress * 100}%`,
              background: accentColor,
              transition: 'width 0.25s linear',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: 'var(--text2)', fontSize: 11, fontVariantNumeric: 'tabular-nums', direction: 'ltr' }}>
            <span>{fmtTime(progress * duration)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Transport controls — locked LTR for music-player conventions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, direction: 'ltr', width: '100%' }}>
          <button onClick={onToggleShuffle} title={shuffleMode ? 'בטל סדר אקראי' : 'הפעל סדר אקראי'} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: shuffleMode ? accentColor : 'var(--text2)',
            fontSize: 22, padding: 8,
          }}>🔀</button>
          <button onClick={onPrev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 36, padding: 4 }}>⏮</button>
          <button onClick={onPlayPause} style={{
            background: accentColor, color: '#fff', border: 'none', cursor: 'pointer',
            width: 76, height: 76, borderRadius: 38,
            fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 6px 24px ${accentColor}66`,
          }}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={onNext} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 36, padding: 4 }}>⏭</button>
          <div style={{ width: 38 }} /> {/* visual balance for the shuffle button on the other side */}
        </div>
      </div>
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
