import { useState, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { getPlaylistSongs } from '../api/client.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import { useLang } from '../i18n/useLang.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Solo Champion Game ───────────────────────────────────────────────────────
export default function ChampionGameScreen({ onExit }) {
  const { dir } = useLang();
  const { playlists } = useSettingsStore();

  const [phase, setPhase] = useState('idle'); // idle | playing | done
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [allSongs, setAllSongs] = useState([]);
  const [queue, setQueue] = useState([]);          // remaining songs in order
  const [currentSong, setCurrentSong] = useState(null);
  const [songIdx, setSongIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Player selections for the current song
  const [pickedArtist, setPickedArtist] = useState('');
  const [pickedTitle, setPickedTitle]   = useState('');
  const [pickedYear, setPickedYear]     = useState(null);

  // Picker modal: null | 'artist' | 'title' | 'year'
  const [picker, setPicker] = useState(null);

  // Submitted reveal state
  const [submitted, setSubmitted] = useState(false);

  // Score
  const [score, setScore] = useState({ correct: 0, total: 0 });

  // Audio
  const audioRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Unique sorted lists for autocomplete (computed once per loaded playlist)
  const allArtists = useMemo(() => uniqueSorted(allSongs.map(s => (s.artist || '').trim()).filter(Boolean)), [allSongs]);
  const allTitles  = useMemo(() => uniqueSorted(allSongs.map(s => (s.title  || '').trim()).filter(Boolean)), [allSongs]);

  // Load songs when playlists change
  useEffect(() => {
    if (selectedPlaylistIds.size === 0) { setAllSongs([]); return; }
    setLoading(true);
    Promise.all([...selectedPlaylistIds].map(id => getPlaylistSongs(id)))
      .then(lists => {
        // Only keep songs with all 3 fields
        const merged = lists.flat().filter(s => s.title && s.artist && s.year);
        // Deduplicate by id
        const seen = new Set();
        const unique = merged.filter(s => seen.has(s.id) ? false : (seen.add(s.id), true));
        setAllSongs(unique);
      })
      .catch(() => setAllSongs([]))
      .finally(() => setLoading(false));
  }, [selectedPlaylistIds]);

  // Start a new game
  function startGame() {
    if (allSongs.length === 0) return;
    const shuffled = shuffle(allSongs);
    setQueue(shuffled);
    setSongIdx(0);
    setScore({ correct: 0, total: 0 });
    loadSong(shuffled[0]);
    setPhase('playing');
  }

  function loadSong(song) {
    setCurrentSong(song);
    setPickedArtist(''); setPickedTitle(''); setPickedYear(null);
    setSubmitted(false);
    setPicker(null);
    // Auto-play after a tick so the audio element is ready
    setTimeout(() => {
      const a = audioRef.current;
      if (!a || !song?.audioUrl) return;
      a.src = song.audioUrl; a.load();
      a.play().catch(() => {});
    }, 50);
  }

  function nextSong() {
    const nextIdx = songIdx + 1;
    if (nextIdx >= queue.length) {
      audioRef.current?.pause();
      setPhase('done');
      return;
    }
    setSongIdx(nextIdx);
    loadSong(queue[nextIdx]);
  }

  function handleSubmit() {
    if (!currentSong || submitted) return;
    audioRef.current?.pause();
    const artistOk = isMatch(pickedArtist, currentSong.artist);
    const titleOk  = isMatch(pickedTitle,  currentSong.title);
    const yearOk   = String(pickedYear || '') === String(currentSong.year);
    const correctCount = (artistOk ? 1 : 0) + (titleOk ? 1 : 0) + (yearOk ? 1 : 0);
    setScore(s => ({ correct: s.correct + correctCount, total: s.total + 3 }));
    setSubmitted(true);
  }

  function togglePlayPause() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function skip30() {
    const a = audioRef.current;
    if (a) a.currentTime = Math.min((a.currentTime || 0) + 30, a.duration || 9999);
  }

  // Result state for each box (for color)
  function resultStateFor(field) {
    if (!submitted || !currentSong) return null;
    if (field === 'artist') return isMatch(pickedArtist, currentSong.artist) ? 'correct' : 'wrong';
    if (field === 'title')  return isMatch(pickedTitle,  currentSong.title)  ? 'correct' : 'wrong';
    if (field === 'year')   return String(pickedYear || '') === String(currentSong.year) ? 'correct' : 'wrong';
    return null;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir }}>
        <TopBar onExit={onExit} title={`🏆 אלוף הזיהויים`} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Rules card */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: 15, fontWeight: 800 }}>איך משחקים?</h3>
            <ul style={{ margin: 0, padding: '0 18px 0 0', color: 'var(--text2)', fontSize: 13, lineHeight: 1.8 }}>
              <li>🎵 השמיע שיר רנדומלי מהפלייליסט שתבחר</li>
              <li>👆 לחץ על קוביית "זמר" / "שיר" / "שנה" כדי לבחור</li>
              <li>📝 בזמר ובשיר — חיפוש עם אוטו-השלמה</li>
              <li>📅 בשנה — בחר עשור ואז שנה</li>
              <li>✅ לחץ "שלח תשובות" — נכון יהפוך לירוק, לא נכון לאדום</li>
              <li>🏆 כל קוביה נכונה = נקודה</li>
            </ul>
          </div>

          <PlaylistSelector
            playlists={playlists}
            selectedIds={selectedPlaylistIds}
            onToggle={id => {
              const next = new Set(selectedPlaylistIds);
              next.has(id) ? next.delete(id) : next.add(id);
              setSelectedPlaylistIds(next);
            }}
          />

          <button
            onClick={startGame}
            disabled={loading || allSongs.length === 0}
            style={{
              ...primaryBtn,
              background: loading || allSongs.length === 0 ? 'var(--bg2)' : 'var(--accent)',
              opacity: loading || allSongs.length === 0 ? 0.5 : 1,
              fontSize: 16, padding: '14px',
            }}
          >
            {loading
              ? '...'
              : allSongs.length === 0
                ? 'אין שירים מתאימים בפלייליסט'
                : `▶ התחל — ${allSongs.length} שירים`}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir }}>
        <TopBar onExit={onExit} title="🏆 אלוף הזיהויים" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <div style={{ fontSize: 64 }}>🏆</div>
          <h2 style={{ color: 'var(--text)', margin: 0, fontSize: 22, fontWeight: 800 }}>סוף המשחק!</h2>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 28px', textAlign: 'center', minWidth: 220 }}>
            <div style={{ color: 'var(--accent)', fontSize: 42, fontWeight: 900, lineHeight: 1 }}>{score.correct}</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>מתוך {score.total}</div>
            <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, marginTop: 12 }}>{pct}% דיוק</div>
          </div>
          <button onClick={startGame} style={{ ...primaryBtn, fontSize: 16 }}>🔁 שחק שוב</button>
          <button onClick={onExit} style={secondaryBtn}>← חזרה</button>
        </div>
      </div>
    );
  }

  // playing phase
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir }}>
      <TopBar
        onExit={onExit}
        title="🏆 אלוף הזיהויים"
        right={`${songIdx + 1}/${queue.length} · ⭐ ${score.correct}`}
      />

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Cover (always hidden — this is "guess the song" not "see the song") */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 'min(140px, 35vw)', aspectRatio: '1 / 1', borderRadius: 16,
            background: submitted && currentSong?.coverUrl ? 'transparent' : 'linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%)',
            border: '2px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {submitted && currentSong?.coverUrl ? (
              <img src={currentSong.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 48, opacity: 0.5 }}>🎵</span>
            )}
          </div>
        </div>

        {/* Audio controls */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={togglePlayPause} style={{ flex: 1, height: 46, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 22, cursor: 'pointer' }}>
            {audioPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={skip30} style={{ flex: 1, height: 46, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            +30s
          </button>
        </div>

        {/* Selection boxes — 2x2 grid: artist, title, year, submit */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <SelectBox
            label="🎤 זמר"
            value={pickedArtist}
            placeholder="לחץ לבחירה"
            state={resultStateFor('artist')}
            correctValue={submitted ? currentSong?.artist : null}
            disabled={submitted}
            onClick={() => setPicker('artist')}
          />
          <SelectBox
            label="🎵 שיר"
            value={pickedTitle}
            placeholder="לחץ לבחירה"
            state={resultStateFor('title')}
            correctValue={submitted ? currentSong?.title : null}
            disabled={submitted}
            onClick={() => setPicker('title')}
          />
          <SelectBox
            label="📅 שנה"
            value={pickedYear || ''}
            placeholder="לחץ לבחירה"
            state={resultStateFor('year')}
            correctValue={submitted ? currentSong?.year : null}
            disabled={submitted}
            onClick={() => setPicker('year')}
          />
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={!pickedArtist && !pickedTitle && !pickedYear}
              style={{
                background: '#1db954', color: '#000', border: 'none', borderRadius: 14,
                fontSize: 16, fontWeight: 900, cursor: 'pointer',
                opacity: (!pickedArtist && !pickedTitle && !pickedYear) ? 0.4 : 1,
                boxShadow: '0 4px 16px rgba(29, 185, 84, 0.4)',
                padding: '16px 12px',
              }}
            >
              ✓ שלח<br/>תשובות
            </button>
          ) : (
            <button
              onClick={nextSong}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 14,
                fontSize: 16, fontWeight: 900, cursor: 'pointer',
                padding: '16px 12px',
              }}
            >
              {songIdx + 1 >= queue.length ? '🏁 סיום' : '▶ הבא'}
            </button>
          )}
        </div>
      </div>

      {/* Pickers */}
      {picker === 'artist' && (
        <AutocompletePicker
          title="בחר זמר"
          options={allArtists}
          onSelect={v => { setPickedArtist(v); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'title' && (
        <AutocompletePicker
          title="בחר שיר"
          options={allTitles}
          onSelect={v => { setPickedTitle(v); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'year' && (
        <YearPickerModal
          onSelect={y => { setPickedYear(y); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Hidden audio */}
      <audio
        ref={audioRef}
        onPlay={() => setAudioPlaying(true)}
        onPause={() => setAudioPlaying(false)}
        onEnded={() => setAudioPlaying(false)}
      />
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar({ onExit, title, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>⌂</button>
      <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 800 }}>{title}</span>
      <span style={{ color: 'var(--text2)', fontSize: 12, minWidth: 24, textAlign: 'left' }}>{right || ''}</span>
    </div>
  );
}

// ─── SelectBox ────────────────────────────────────────────────────────────────
function SelectBox({ label, value, placeholder, state, correctValue, disabled, onClick }) {
  // state: null | 'correct' | 'wrong'
  const colors = {
    correct: { bg: '#0d2e0d', border: '#1db954', text: '#1db954' },
    wrong:   { bg: '#2e0d0d', border: '#dc3545', text: '#ff6b6b' },
    neutral: { bg: 'var(--bg2)', border: 'var(--border)', text: 'var(--text)' },
  };
  const c = colors[state] || colors.neutral;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        background: c.bg, border: `2px solid ${c.border}`, borderRadius: 14,
        padding: '14px 12px', textAlign: 'right', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80,
        transition: 'all 0.2s',
      }}
    >
      <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div style={{
        color: value ? c.text : 'var(--text3, #555)',
        fontSize: 14, fontWeight: 700,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {value || placeholder}
      </div>
      {state === 'wrong' && correctValue && (
        <div style={{ color: '#1db954', fontSize: 11, marginTop: 'auto' }}>
          ✓ {correctValue}
        </div>
      )}
    </button>
  );
}

// ─── AutocompletePicker (modal) ──────────────────────────────────────────────
function AutocompletePicker({ title, options, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    // Match prefix on any token in the option (so "אביב" matches "אביב גפן")
    return options.filter(o => {
      const lower = o.toLowerCase();
      if (lower.startsWith(q)) return true;
      // Also match start of any whitespace-separated word
      return lower.split(/\s+/).some(w => w.startsWith(q));
    }).slice(0, 100);
  }, [query, options]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        height: '85dvh', display: 'flex', flexDirection: 'column',
        direction: 'rtl',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="הקלד אות ראשונה..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 12, color: 'var(--text)', fontSize: 16, padding: '12px 14px',
              outline: 'none', direction: 'rtl',
            }}
          />
          <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 6, textAlign: 'center' }}>
            {filtered.length} תוצאות
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 30, fontSize: 13 }}>
              לא נמצאו תוצאות
            </div>
          ) : filtered.map(o => (
            <button
              key={o}
              onClick={() => onSelect(o)}
              style={{
                width: '100%', textAlign: 'right',
                padding: '12px 14px', borderRadius: 10,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: 15, fontWeight: 600,
                cursor: 'pointer', marginBottom: 6,
              }}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── YearPickerModal — decade then year ──────────────────────────────────────
function YearPickerModal({ onSelect, onClose }) {
  const [decade, setDecade] = useState(null);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        direction: 'rtl',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16 }}>
            {decade === null ? 'בחר עשור' : `שנים ב${decadeLabel(decade)}`}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {decade !== null && (
              <button onClick={() => setDecade(null)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                ↩ עשור
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
          {decade === null
            ? DECADES.map(d => (
                <button
                  key={d}
                  onClick={() => setDecade(d)}
                  style={{
                    aspectRatio: '1 / 1',
                    background: 'var(--bg2)', border: '2px solid var(--border)',
                    color: 'var(--text)', borderRadius: 14,
                    fontSize: 18, fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {decadeLabel(d)}
                </button>
              ))
            : Array.from({ length: 10 }, (_, i) => decade + i).map(y => (
                <button
                  key={y}
                  onClick={() => onSelect(y)}
                  style={{
                    aspectRatio: '1 / 1',
                    background: 'var(--bg2)', border: '2px solid var(--accent)',
                    color: 'var(--accent)', borderRadius: 14,
                    fontSize: 18, fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {y}
                </button>
              ))}
        </div>
      </div>
    </>
  );
}

function decadeLabel(d) {
  if (d < 2000) return `שנות ה-${String(d).slice(2)}`;
  return `שנות ה-${d}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'he'));
}

function isMatch(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const primaryBtn = {
  width: '100%', padding: '12px', borderRadius: 12,
  background: 'var(--accent)', color: '#fff',
  border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
};
const secondaryBtn = {
  width: '100%', padding: '12px', borderRadius: 12,
  background: 'var(--bg2)', color: 'var(--text)',
  border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer',
};
