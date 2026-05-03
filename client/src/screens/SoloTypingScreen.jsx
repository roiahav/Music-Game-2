import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { getPlaylistSongs } from '../api/client.js';
import AutocompleteInput from '../components/AutocompleteInput.jsx';
import YearPicker from '../components/YearPicker.jsx';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import { useLang } from '../i18n/useLang.js';
import { useFavorites } from '../hooks/useFavorites.js';
import { useBlacklist } from '../hooks/useBlacklist.js';

const DEFAULT_YEAR = 2000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ResultRow({ label, correct, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: correct ? '#1db954' : '#dc3545',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 13, fontWeight: 700,
      }}>
        {correct ? '✓' : '✗'}
      </span>
      <span style={{ color: correct ? '#1db954' : '#ff6b6b', fontSize: 14, fontWeight: 600 }}>{label}</span>
      {extra && <span style={{ color: '#888', fontSize: 12, marginRight: 'auto' }}>{extra}</span>}
    </div>
  );
}

export default function SoloTypingScreen({ onExit }) {
  const { t, dir } = useLang();
  const { favoriteIds, toggle: toggleFavorite } = useFavorites();
  const { blacklistIds, toggleBlacklist, isAdmin } = useBlacklist();
  const { playlists } = useSettingsStore();
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [songs, setSongs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | playing | confirmed | done

  // Score
  const [score, setScore] = useState({ earned: 0, total: 0 });

  // Per-song tracking (refs = no stale closures)
  const titleAccepted = useRef(false);
  const artistAccepted = useRef(false);
  const titlePenalty = useRef(false);
  const artistPenalty = useRef(false);
  const [yearValue, setYearValue] = useState(DEFAULT_YEAR);
  const yearRef = useRef(DEFAULT_YEAR);
  const [confirmedResults, setConfirmedResults] = useState(null);

  // Audio + controls
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const currentSong = songs[currentIndex] || null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetSongState() {
    titleAccepted.current = false;
    artistAccepted.current = false;
    titlePenalty.current = false;
    artistPenalty.current = false;
    yearRef.current = DEFAULT_YEAR;
    setYearValue(DEFAULT_YEAR);
    setConfirmedResults(null);
  }

  // ── Load playlists ─────────────────────────────────────────────────────────
  async function loadFromIds(ids) {
    setLoading(true);
    setPhase('idle');
    setSongs([]);
    setCurrentIndex(-1);
    setScore({ earned: 0, total: 0 });
    if (ids.size === 0) { setLoading(false); return; }
    try {
      const results = await Promise.all([...ids].map(id => getPlaylistSongs(id)));
      const seen = new Set();
      const combined = results.flat().filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      setSongs(shuffle(combined));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleTogglePlaylist(id) {
    const next = new Set(selectedPlaylistIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedPlaylistIds(next);
    await loadFromIds(next);
  }

  // Initial load
  useEffect(() => {
    if (selectedPlaylistIds.size > 0) loadFromIds(selectedPlaylistIds);
  }, []); // eslint-disable-line

  // Play audio when song changes; track play/pause state
  useEffect(() => {
    if (!currentSong?.audioUrl || !audioRef.current) return;
    const el = audioRef.current;
    el.src = currentSong.audioUrl;
    el.load();
    el.play().catch(() => {});
    const onPlay  = () => setAudioPlaying(true);
    const onPause = () => setAudioPlaying(false);
    el.addEventListener('play',  onPlay);
    el.addEventListener('pause', onPause);
    return () => { el.removeEventListener('play', onPlay); el.removeEventListener('pause', onPause); };
  }, [currentSong?.id]);

  // ── Game controls ──────────────────────────────────────────────────────────
  function startGame() {
    if (!songs.length) return;
    setCurrentIndex(0);
    setPhase('playing');
    setScore({ earned: 0, total: 0 });
    resetSongState();
  }

  function skip30() {
    if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 30);
  }

  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }

  // Reveal without scoring (host-reveal equivalent — shows answer, gives 0 for untyped fields)
  function handleReveal() {
    if (!currentSong || phase !== 'playing') return;
    const yearCorrect = String(yearRef.current) === String(currentSong.year);
    const results = {
      title: titleAccepted.current,
      artist: artistAccepted.current,
      year: yearCorrect,
    };
    setConfirmedResults(results);
    setPhase('confirmed');
    const earned = (results.title ? 1 : 0) + (results.artist ? 1 : 0) + (results.year ? 1 : 0);
    setScore(s => ({ earned: s.earned + earned, total: s.total + 3 }));
  }

  function handleConfirm() {
    if (!currentSong || phase !== 'playing') return;
    const yearCorrect = String(yearRef.current) === String(currentSong.year);
    const results = {
      title: titleAccepted.current,
      artist: artistAccepted.current,
      year: yearCorrect,
    };
    setConfirmedResults(results);
    setPhase('confirmed');
    const earned = (results.title ? 1 : 0) + (results.artist ? 1 : 0) + (results.year ? 1 : 0);
    setScore(s => ({ earned: s.earned + earned, total: s.total + 3 }));
  }

  function handleNext() {
    const next = currentIndex + 1;
    if (next >= songs.length) {
      setPhase('done');
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    resetSongState();
    setCurrentIndex(next);
    setPhase('playing');
  }

  // ── Render: idle ───────────────────────────────────────────────────────────
  if (phase === 'idle' || songs.length === 0) return (
    <div style={{ ...shellStyle, direction: dir }}>
      <Header onExit={onExit} title={'🎤 ' + t('free_guess')} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 20px', overflowY: 'auto' }}>
        <PlaylistSelector
          playlists={playlists}
          selectedIds={selectedPlaylistIds}
          onToggle={handleTogglePlaylist}
          loading={loading}
        />

        {loading ? (
          <p style={{ color: '#555', textAlign: 'center' }}>{t('loading_songs')}</p>
        ) : songs.length > 0 ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>{t('songs_in_pl', { n: songs.length })}</p>
            <button onClick={startGame} style={primaryBtn}>{t('start_game')}</button>
          </div>
        ) : selectedPlaylistIds.size > 0 ? (
          <p style={{ color: '#555', textAlign: 'center', fontSize: 13 }}>{t('no_songs')}</p>
        ) : null}
      </div>
    </div>
  );

  // ── Render: done ───────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ ...shellStyle, direction: dir }}>
      <Header onExit={onExit} title={'🎤 ' + t('free_guess')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
        <div style={{ fontSize: 60 }}>🏁</div>
        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0 }}>{t('done_title')}</h2>
        <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 16, padding: '20px 32px', textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>{t('final_score')}</div>
          <div style={{ color: '#007ACC', fontSize: 40, fontWeight: 900 }}>{score.earned}</div>
          <div style={{ color: '#555', fontSize: 15 }}>{t('score_out_of', { a: score.earned, b: score.total })}</div>
          <div style={{ color: '#1db954', fontSize: 13, marginTop: 8 }}>
            {score.total > 0 ? t('accuracy', { p: Math.round((score.earned / score.total) * 100) }) : ''}
          </div>
        </div>
        <button onClick={startGame} style={primaryBtn}>{t('play_again')}</button>
        <button onClick={onExit} style={secondaryBtn}>{t('back')}</button>
      </div>
    </div>
  );

  // ── Render: playing / confirmed ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, direction: dir }}>
      <audio ref={audioRef} preload="auto" />

      {/* Header — minimal: song info + mute + stop */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>{t('song_x_of_y', { x: currentIndex + 1, y: songs.length })}</span>
          <span style={{ color: '#007ACC', fontSize: 12, fontWeight: 700 }}>
            {songs.length - (currentIndex + 1) === 0 ? t('last_song') : t('songs_remaining', { n: songs.length - (currentIndex + 1) })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Score chip */}
          <div style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 20, padding: '3px 10px', fontSize: 13, fontWeight: 700, color: '#007ACC' }}>
            {score.earned} / {score.total}
          </div>
          {/* Home — return to main menu */}
          <button onClick={() => { audioRef.current?.pause(); onExit(); }} title="חזרה לדף הראשי"
            style={{ background: '#2d2d30', border: '1px solid #3a3a3a', color: '#ccc', borderRadius: 8, padding: '4px 8px', fontSize: 15, cursor: 'pointer' }}>
            🏠
          </button>
          {/* Mute */}
          <button onClick={toggleMute} title={isMuted ? 'בטל השתקה' : 'השתק'}
            style={{ background: isMuted ? '#5a1010' : '#2d2d30', border: `1px solid ${isMuted ? '#dc3545' : '#3a3a3a'}`, color: isMuted ? '#ff6b6b' : '#ccc', borderRadius: 8, padding: '4px 8px', fontSize: 15, cursor: 'pointer' }}>
            {isMuted ? '🔊' : '🔇'}
          </button>
          {/* Stop */}
          <button onClick={() => { audioRef.current?.pause(); onExit(); }} title="סיים"
            style={{ background: '#3a1010', color: '#ff6b6b', border: 'none', borderRadius: 8, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}>
            ⏹
          </button>
        </div>
      </div>

      {/* ── Scrollable middle content ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '0 0 8px' }}>

        {/* Album art + favorite button */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '0 16px' }}>
          <button
            onClick={() => currentSong && toggleFavorite({
              id: currentSong.id,
              filePath: currentSong.audioUrl ? decodeURIComponent(currentSong.audioUrl.replace('/api/audio/', '')) : '',
              title: currentSong.title || '',
              artist: currentSong.artist || '',
              year: currentSong.year || '',
            })}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              background: currentSong && favoriteIds.has(currentSong.id) ? '#dc354522' : '#2d2d30',
              border: `1px solid ${currentSong && favoriteIds.has(currentSong.id) ? '#dc3545' : '#3a3a3a'}`,
              borderRadius: 10, padding: '7px 10px', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 20 }}>{currentSong && favoriteIds.has(currentSong.id) ? '💔' : '❤️'}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: currentSong && favoriteIds.has(currentSong.id) ? '#ff6b6b' : '#888' }}>
              {currentSong && favoriteIds.has(currentSong.id) ? t('remove_fav') : t('add_fav')}
            </span>
          </button>
          {phase === 'confirmed' && currentSong?.coverUrl ? (
            <img
              src={currentSong.coverUrl}
              alt="cover"
              style={{ width: 110, height: 110, borderRadius: 12, objectFit: 'cover', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 110, height: 110, borderRadius: 12, background: '#2d2d30', border: '1px solid #3a3a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 40, opacity: 0.4 }}>🎵</span>
            </div>
          )}
        </div>

        {/* Blacklist button — admin only */}
        {isAdmin && currentSong && (
          <div style={{ padding: '0 16px' }}>
            <button
              onClick={() => toggleBlacklist(currentSong.id)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                background: '#1e1e1e',
                border: `1px solid ${blacklistIds.has(currentSong.id) ? '#dc3545' : '#3a3a3a'}`,
                color: blacklistIds.has(currentSong.id) ? '#ff6b6b' : '#555',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {blacklistIds.has(currentSong.id) ? `✓ ${t('unblock_song')}` : `🚫 ${t('block_song')}`}
            </button>
          </div>
        )}

        {/* Reveal banner */}
        {phase === 'confirmed' && (
          <div style={{ margin: '0 16px', padding: '10px 16px', borderRadius: 12, background: '#1a3a1a', border: '1px solid #1db954' }}>
            <p style={{ color: '#1db954', fontWeight: 700, margin: '0 0 4px', fontSize: 14 }}>{t('correct_answer')}</p>
            <p style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>
              {currentSong.title} — {currentSong.artist}{currentSong.year ? ` (${currentSong.year})` : ''}
            </p>
          </div>
        )}

        {/* Guess fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
          <AutocompleteInput
            key={`${currentSong?.id}-title`}
            label={t('song_name')}
            answer={currentSong?.title || ''}
            disabled={phase === 'confirmed'}
            onAccept={() => { titleAccepted.current = true; }}
            onPenalty={() => { titlePenalty.current = true; }}
          />
          <AutocompleteInput
            key={`${currentSong?.id}-artist`}
            label={t('artist')}
            answer={currentSong?.artist || ''}
            disabled={phase === 'confirmed'}
            onAccept={() => { artistAccepted.current = true; }}
            onPenalty={() => { artistPenalty.current = true; }}
          />
        </div>

        {/* Year picker */}
        <div style={{ padding: '0 16px' }}>
          <p style={{ color: '#888', fontSize: 12, margin: '0 0 6px', textAlign: dir === 'rtl' ? 'right' : 'left' }}>{t('year_colon')}</p>
          <YearPicker
            key={`${currentSong?.id}-year`}
            value={yearValue}
            onChange={y => { setYearValue(y); yearRef.current = y; }}
            disabled={phase === 'confirmed'}
          />
        </div>

        {/* Personal results */}
        {phase === 'confirmed' && confirmedResults && (
          <div style={{ margin: '0 16px', padding: '12px 16px', borderRadius: 12, background: '#1a1a2e', border: '1px solid #444' }}>
            <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 10px', fontWeight: 600 }}>{t('your_results')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ResultRow label={t('song_name')} correct={confirmedResults.title} />
              <ResultRow label={t('artist')} correct={confirmedResults.artist} />
              <ResultRow
                label={t('year')}
                correct={confirmedResults.year}
                extra={!confirmedResults.year ? t('year_wrong', { a: yearValue, b: currentSong?.year || '?' }) : null}
              />
            </div>
          </div>
        )}

        {/* Year indicator after confirm */}
        {phase === 'confirmed' && (
          <div style={{ padding: '0 16px' }}>
            <p style={{ color: confirmedResults?.year ? '#1db954' : '#dc3545', fontSize: 13, textAlign: 'center', margin: 0 }}>
              {confirmedResults?.year
                ? t('year_correct', { y: currentSong.year })
                : t('year_wrong', { a: yearValue, b: currentSong.year || '?' })}
            </p>
          </div>
        )}

      </div>{/* end scrollable */}

      {/* ── Bottom controls — identical style to PlayerControls in GameScreen ── */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '0 16px 16px' }}>
        {/* Play / Pause */}
        <button
          onClick={() => { const a = audioRef.current; a?.paused ? a.play() : a.pause(); }}
          className="no-select"
          style={{ flex: 1, height: 52, background: '#007ACC', color: '#fff', border: 'none', borderRadius: 12, fontSize: 22, fontWeight: 700, cursor: 'pointer' }}
        >
          {audioPlaying ? '⏸' : '▶'}
        </button>

        {/* +30s */}
        <button
          onClick={skip30}
          className="no-select"
          style={{ flex: 1, height: 52, background: '#2d2d30', color: '#ccc', border: '1px solid #444', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          +30s
        </button>

        {/* Reveal / Next — third slot */}
        {phase === 'playing' ? (
          <button
            onClick={handleReveal}
            className="no-select"
            style={{ flex: 1, height: 52, background: '#2d2d30', color: '#ccc', border: '1px solid #444', borderRadius: 12, fontSize: 20, cursor: 'pointer' }}
          >
            ⏭
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="no-select"
            style={{ flex: 1, height: 52, background: '#2d2d30', color: '#ccc', border: '1px solid #444', borderRadius: 12, fontSize: 20, cursor: 'pointer' }}
          >
            ⏭
          </button>
        )}

        {/* Confirm / Next label — fourth (wider) slot */}
        {phase === 'playing' ? (
          <button
            onClick={handleConfirm}
            className="no-select"
            style={{ flex: 1.5, height: 52, background: '#28a745', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('confirm_submit')}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="no-select"
            style={{ flex: 1.5, height: 52, background: '#007ACC', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {currentIndex + 1 >= songs.length ? t('finish') : t('next')}
          </button>
        )}
      </div>
    </div>
  );
}

function Header({ onExit, title }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0 }}>
      <button onClick={onExit} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0 }}>⌂</button>
      <span style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>{title}</span>
      <div style={{ width: 24 }} />
    </div>
  );
}

const shellStyle = { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' };
const primaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: '#ccc', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
// Matches multiplayer secondaryBtn (compact, for header)
const hostBtn = { background: '#2d2d30', color: '#ccc', border: '1px solid #3a3a3a', borderRadius: 8, padding: '4px 12px', fontSize: 13, cursor: 'pointer' };
