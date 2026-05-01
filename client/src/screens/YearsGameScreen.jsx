import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { getPlaylistSongs } from '../api/client.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import TimerBar from '../components/TimerBar.jsx';
import { useLang } from '../i18n/useLang.js';

const TIMER_OPTIONS = [0, 15, 30, 45, 60];

const SONGS_PER_ROUND = 4;

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Song Card ─────────────────────────────────────────────────────────────────
function SongCard({ song, isActive, result, onClick }) {
  const bg = result
    ? result.correct ? '#0d2e0d' : '#2e0d0d'
    : isActive ? '#0d2040' : '#2d2d30';
  const border = result
    ? result.correct ? '#1db954' : '#dc3545'
    : isActive ? '#007ACC' : '#3a3a3a';

  return (
    <button
      onClick={() => !result && onClick(song)}
      style={{
        flex: 1, minWidth: 0,
        aspectRatio: '1 / 1',
        borderRadius: 16,
        background: bg,
        border: `2px solid ${border}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, cursor: result ? 'default' : 'pointer',
        transition: 'all 0.2s', padding: 8, position: 'relative',
      }}
    >
      {result ? (
        <>
          <span style={{ fontSize: 32 }}>{result.correct ? '✓' : '✗'}</span>
          <span style={{ color: result.correct ? '#1db954' : '#ff6b6b', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
            {song.year}
          </span>
          <span style={{ color: '#888', fontSize: 10, textAlign: 'center', lineHeight: 1.2 }}>
            {song.title}
          </span>
        </>
      ) : (
        <>
          {/* Album art or placeholder */}
          {song.coverUrl && isActive ? (
            <img
              src={song.coverUrl}
              alt=""
              style={{ width: '60%', aspectRatio: '1/1', borderRadius: 8, objectFit: 'cover', opacity: 0.8 }}
            />
          ) : (
            <span style={{ fontSize: 36, opacity: isActive ? 1 : 0.4 }}>
              {isActive ? '🔊' : '🎵'}
            </span>
          )}
          {isActive && (
            <span style={{ color: '#007ACC', fontSize: 10, fontWeight: 700 }}>מנגן...</span>
          )}
        </>
      )}
    </button>
  );
}

// ── Year Button ───────────────────────────────────────────────────────────────
function YearButton({ year, state, onClick }) {
  // state: 'idle' | 'correct' | 'wrong' | 'used'
  const bg = state === 'correct' ? '#0d2e0d' : state === 'wrong' ? '#2e0d0d' : state === 'used' ? '#1a1a1a' : '#2d2d30';
  const border = state === 'correct' ? '#1db954' : state === 'wrong' ? '#dc3545' : state === 'used' ? '#222' : '#3a3a3a';
  const color = state === 'correct' ? '#1db954' : state === 'wrong' ? '#ff6b6b' : state === 'used' ? '#444' : '#fff';

  return (
    <button
      onClick={() => state === 'idle' && onClick(year)}
      style={{
        flex: 1, padding: '14px 6px', borderRadius: 14,
        background: bg, border: `2px solid ${border}`, color,
        fontSize: 18, fontWeight: 800, cursor: state === 'idle' ? 'pointer' : 'default',
        transition: 'all 0.15s', minWidth: 0,
      }}
    >
      {year}
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function YearsGameScreen({ onExit }) {
  const { t, dir } = useLang();
  const { playlists } = useSettingsStore();
  const audioRef = useRef(null);

  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | playing | done

  // Round state
  const [roundSongs, setRoundSongs] = useState([]);   // 4 songs this round
  const [yearOptions, setYearOptions] = useState([]);  // 4 shuffled years
  const [activeSongId, setActiveSongId] = useState(null);
  const [results, setResults] = useState({});          // { [songId]: { correct, guessedYear } }
  const [yearStates, setYearStates] = useState({});    // { [year]: 'idle'|'correct'|'wrong'|'used' }
  const [roundNum, setRoundNum] = useState(0);

  // Timer
  const [timerSec, setTimerSec] = useState(0);

  // Score
  const [score, setScore] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // ── Load playlists ──────────────────────────────────────────────────────────
  async function loadFromIds(ids) {
    if (ids.size === 0) { setAllSongs([]); return; }
    setLoading(true);
    try {
      const results = await Promise.all([...ids].map(id => getPlaylistSongs(id)));
      const seen = new Set();
      const combined = results.flat().filter(s => {
        if (!s.year) return false; // need year for this game
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      setAllSongs(combined);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleTogglePlaylist(id) {
    const next = new Set(selectedPlaylistIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedPlaylistIds(next);
    await loadFromIds(next);
  }

  useEffect(() => {
    if (selectedPlaylistIds.size > 0) loadFromIds(selectedPlaylistIds);
  }, []); // eslint-disable-line

  // ── Round logic ─────────────────────────────────────────────────────────────
  const startRound = useCallback((songs, rNum) => {
    if (songs.length < SONGS_PER_ROUND) return;
    // Pick 4 songs with unique years if possible
    const shuffled = shuffleArr(songs);
    const picked = [];
    const usedYears = new Set();
    for (const s of shuffled) {
      if (!usedYears.has(s.year)) {
        picked.push(s);
        usedYears.add(s.year);
        if (picked.length === SONGS_PER_ROUND) break;
      }
    }
    // Fallback: allow duplicate years if not enough unique
    if (picked.length < SONGS_PER_ROUND) {
      for (const s of shuffled) {
        if (!picked.includes(s)) picked.push(s);
        if (picked.length === SONGS_PER_ROUND) break;
      }
    }

    const years = shuffleArr(picked.map(s => s.year));
    setRoundSongs(picked);
    setYearOptions(years);
    setActiveSongId(null);
    setResults({});
    setYearStates(Object.fromEntries(years.map(y => [y, 'idle'])));
    setRoundNum(rNum);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
  }, []);

  function startGame() {
    setScore(0);
    setTotalAnswered(0);
    setPhase('playing');
    startRound(allSongs, 1);
  }

  function nextRound() {
    startRound(allSongs, roundNum + 1);
  }

  // ── Card click → play song ──────────────────────────────────────────────────
  function handleCardClick(song) {
    if (results[song.id]) return; // already correctly matched
    setActiveSongId(song.id);
    if (audioRef.current && song.audioUrl) {
      audioRef.current.src = song.audioUrl;
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }

  // ── Year click → check answer ───────────────────────────────────────────────
  const wrongTimers = useRef({});

  function handleYearClick(year) {
    if (!activeSongId) return;
    const song = roundSongs.find(s => s.id === activeSongId);
    if (!song || results[song.id]) return; // already correctly matched

    const correct = String(year) === String(song.year);
    setTotalAnswered(p => p + 1);

    if (correct) {
      // ✅ Lock card green, lock year green
      setResults(prev => ({ ...prev, [song.id]: { correct: true, guessedYear: year } }));
      setScore(p => p + 1);
      setYearStates(prev => ({ ...prev, [year]: 'correct' }));
      setActiveSongId(null);
      if (audioRef.current) audioRef.current.pause();
    } else {
      // ❌ Lock card red permanently — year flashes red then returns to idle
      setResults(prev => ({ ...prev, [song.id]: { correct: false, guessedYear: year } }));
      setActiveSongId(null);
      clearTimeout(wrongTimers.current[year]);
      setYearStates(prev => ({ ...prev, [year]: 'wrong' }));
      wrongTimers.current[year] = setTimeout(() => {
        setYearStates(prev => {
          if (prev[year] === 'wrong') return { ...prev, [year]: 'idle' };
          return prev;
        });
      }, 700);
    }
  }

  // Timer expire → lock all unmatched cards as wrong
  function handleTimerExpire() {
    if (audioRef.current) audioRef.current.pause();
    setActiveSongId(null);
    setResults(prev => {
      const next = { ...prev };
      roundSongs.forEach(s => {
        if (!next[s.id]) {
          next[s.id] = { correct: false, guessedYear: null };
        }
      });
      return next;
    });
    setTotalAnswered(p => p + roundSongs.filter(s => !results[s.id]).length);
  }

  // Round complete when all 4 songs are locked (correct or wrong)
  const roundComplete = roundSongs.length === SONGS_PER_ROUND &&
    Object.keys(results).length === SONGS_PER_ROUND;

  // When round completes, stop audio
  useEffect(() => {
    if (!roundComplete) return;
    if (audioRef.current) audioRef.current.pause();
    // Clear any pending wrong-flash timers
    Object.values(wrongTimers.current).forEach(t => clearTimeout(t));
  }, [roundComplete]);

  // ── Render: idle ─────────────────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div style={{ ...shell, direction: dir }}>
      <audio ref={audioRef} preload="auto" />
      <TopBar onExit={onExit} title={`📅 ${t('years_game')}`} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '20px', overflowY: 'auto' }}>
        <PlaylistSelector
          playlists={playlists}
          selectedIds={selectedPlaylistIds}
          onToggle={handleTogglePlaylist}
          loading={loading}
        />
        {/* Timer selector */}
        <div>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 8, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            {t('timer_lbl')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIMER_OPTIONS.map(sec => (
              <button
                key={sec}
                onClick={() => setTimerSec(sec)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 13, fontWeight: 700,
                  background: timerSec === sec ? '#007ACC' : '#2d2d30',
                  color: timerSec === sec ? '#fff' : '#888',
                  border: `1.5px solid ${timerSec === sec ? '#007ACC' : '#3a3a3a'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {sec === 0 ? t('none') : `${sec}s`}
              </button>
            ))}
          </div>
        </div>

        {/* Rules card */}
        <div style={{
          background: '#252525', border: '1px solid #333',
          borderRadius: 16, padding: '14px 16px',
        }}>
          <div style={{ color: '#aaa', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
            {t('yg_how_to')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: '🎵', key: 'yg_rule1' },
              { icon: '📅', key: 'yg_rule2' },
              { icon: '🔴', key: 'yg_rule3' },
              { icon: '🔒', key: 'yg_rule4' },
            ].map(({ icon, key }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
                <span style={{ color: '#888', fontSize: 12, lineHeight: 1.5 }}>{t(key)}</span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#555', textAlign: 'center' }}>{t('loading_songs')}</p>
        ) : allSongs.length >= SONGS_PER_ROUND ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>
              {t('songs_in_pl', { n: allSongs.length })}
            </p>
            <button onClick={startGame} style={primaryBtn}>{t('start_game')}</button>
          </div>
        ) : allSongs.length > 0 ? (
          <p style={{ color: '#888', textAlign: 'center', fontSize: 13 }}>
            נדרשים לפחות 4 שירים עם שנה
          </p>
        ) : null}
      </div>
    </div>
  );

  // ── Render: done ─────────────────────────────────────────────────────────────
  if (phase === 'done') return (
    <div style={{ ...shell, direction: dir }}>
      <audio ref={audioRef} preload="auto" />
      <TopBar onExit={onExit} title={`📅 ${t('years_game')}`} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        <div style={{ fontSize: 64 }}>🏁</div>
        <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 20, padding: '24px 36px', textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>{t('yg_final_score')}</div>
          <div style={{ color: '#007ACC', fontSize: 48, fontWeight: 900 }}>{score}</div>
          <div style={{ color: '#555', fontSize: 15 }}>{score} / {totalAnswered}</div>
          <div style={{ color: '#1db954', fontSize: 13, marginTop: 8 }}>
            {totalAnswered > 0 ? t('yg_accuracy', { p: Math.round((score / totalAnswered) * 100) }) : ''}
          </div>
        </div>
        <button onClick={startGame} style={primaryBtn}>{t('play_again')}</button>
        <button onClick={onExit} style={secondaryBtn}>{t('back')}</button>
      </div>
    </div>
  );

  // ── Render: playing ───────────────────────────────────────────────────────────
  const activeSong = roundSongs.find(s => s.id === activeSongId);

  return (
    <div style={{ ...shell, direction: dir }}>
      <audio ref={audioRef} preload="auto" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0 }}>
        <button onClick={() => { audioRef.current?.pause(); setPhase('done'); }}
          style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0 }}>
          ⌂
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>📅 {t('years_game')}</div>
          <div style={{ color: '#888', fontSize: 11 }}>{t('yg_round')} {roundNum}</div>
        </div>
        <div style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 20, padding: '4px 12px', color: '#007ACC', fontSize: 14, fontWeight: 700 }}>
          ✓ {score}
        </div>
      </div>

      {/* Timer bar */}
      {timerSec > 0 && !roundComplete && (
        <div style={{ padding: '8px 0 0', flexShrink: 0 }}>
          <TimerBar seconds={timerSec} songId={roundNum} onExpire={handleTimerExpire} />
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px', overflowY: 'auto' }}>

        {/* Instruction */}
        <p style={{ color: '#666', fontSize: 12, textAlign: 'center', margin: 0 }}>
          {activeSongId ? t('yg_pick_year') : t('yg_tap_card')}
        </p>

        {/* Year buttons — 2 × 2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {yearOptions.map(year => (
            <YearButton
              key={year}
              year={year}
              state={activeSongId ? (yearStates[year] || 'idle') : 'used'}
              onClick={handleYearClick}
            />
          ))}
        </div>

        {/* Song cards — 2 × 2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {roundSongs.map(song => (
            <SongCard
              key={song.id}
              song={song}
              isActive={song.id === activeSongId}
              result={results[song.id] || null}
              onClick={handleCardClick}
            />
          ))}
        </div>

        {/* Round complete */}
        {roundComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ textAlign: 'center', padding: '10px', background: '#1a2e1a', border: '1px solid #1db954', borderRadius: 14 }}>
              <span style={{ color: '#1db954', fontWeight: 700, fontSize: 15 }}>
                {Object.values(results).filter(r => r.correct).length} / {SONGS_PER_ROUND} נכון
              </span>
            </div>
            <button onClick={nextRound} style={{ ...primaryBtn, fontSize: 16, padding: '14px' }}>
              {t('yg_next_round')}
            </button>
            <button onClick={() => { audioRef.current?.pause(); setPhase('done'); }} style={secondaryBtn}>
              {t('yg_finish')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function TopBar({ onExit, title }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0 }}>
      <button onClick={onExit} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0 }}>⌂</button>
      <span style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>{title}</span>
      <div style={{ width: 24 }} />
    </div>
  );
}

const shell = { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' };
const primaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: '#ccc', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
