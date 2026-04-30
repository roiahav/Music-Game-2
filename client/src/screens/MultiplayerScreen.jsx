import { useState, useEffect, useRef, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import { getSocket } from '../services/socket.js';
import YearPicker from '../components/YearPicker.jsx';
import AutocompleteInput from '../components/AutocompleteInput.jsx';
import { AvatarCircle } from '../App.jsx';

const DEFAULT_YEAR = 2000;
const MEDALS = ['🥇', '🥈', '🥉'];

const SONG_COUNT_OPTIONS = [
  { value: 10,  label: '10' },
  { value: 50,  label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
  { value: 0,   label: '∞ ללא הגבלה' },
];

const ITEM_H = 44;
const VISIBLE = 3;
const PAD_OP = ITEM_H; // 1 item above/below = center selected

function OptionPicker({ options, value, onChange }) {
  const ref = useRef(null);
  const suppress = useRef(false);
  const snapTimer = useRef(null);

  const idx = options.findIndex(o => o.value === value);

  const scrollTo = (i, smooth = false) => {
    if (!ref.current) return;
    suppress.current = true;
    ref.current.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'instant' });
    setTimeout(() => { suppress.current = false; }, 300);
  };

  useEffect(() => { scrollTo(idx >= 0 ? idx : 0); }, []); // eslint-disable-line

  function onScroll() {
    if (suppress.current) return;
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const i = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(options.length - 1, i));
      scrollTo(clamped, true);
      if (options[clamped].value !== value) onChange(options[clamped].value);
    }, 120);
  }

  return (
    <div style={{ position: 'relative', height: ITEM_H * VISIBLE, borderRadius: 12, background: '#1e1e1e', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, insetInline: 0, height: PAD_OP, background: 'linear-gradient(to bottom, #1e1e1e 40%, transparent)', zIndex: 2, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: PAD_OP, insetInline: 12, height: ITEM_H, background: 'rgba(0,122,204,0.25)', border: '1px solid #007ACC', borderRadius: 8, zIndex: 1, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, insetInline: 0, height: PAD_OP, background: 'linear-gradient(to top, #1e1e1e 40%, transparent)', zIndex: 2, pointerEvents: 'none' }} />
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ height: '100%', overflowY: 'scroll', scrollbarWidth: 'none', paddingTop: PAD_OP, paddingBottom: PAD_OP, boxSizing: 'content-box' }}
      >
        {options.map((o, i) => (
          <div
            key={o.value}
            onClick={() => { scrollTo(i, true); onChange(o.value); }}
            style={{
              height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: o.value === value ? '#fff' : '#555',
              fontSize: o.value === value ? 17 : 14,
              fontWeight: o.value === value ? 700 : 400,
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}

const RULES = [
  'המשחק משמיע שיר — נסו לנחש שם שיר, זמר ושנה.',
  'הקלד את האות הראשונה של התשובה. אם נכונה — המערכת תשלים את השאר.',
  'לחץ ✓ לאישור, או ✗ לנסיון נוסף.',
  'אחרי 3 טעויות על אות ראשונה — ירד ממך נקודה.',
  'שיר + זמר + שנה נכונים = 10 נקודות! תשובה בודדת נכונה = נקודה אחת.',
  'גלגל השנה: גלול וקבע את שנת ההוצאה. היא נשלחת אוטומטית בחשיפה.',
];

// ─── Scoreboard strip ────────────────────────────────────────────────────────
function ScoreStrip({ players, myId }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 16px', scrollbarWidth: 'none' }}>
      {sorted.map((p, i) => (
        <div key={p.id} style={{
          flexShrink: 0, padding: '4px 10px', borderRadius: 20,
          background: p.id === myId ? '#007ACC' : '#2d2d30',
          border: `1px solid ${p.id === myId ? '#007ACC' : '#3a3a3a'}`,
          color: '#fff', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AvatarCircle userId={p.userId} hasAvatar={p.hasAvatar} name={p.name} size={22} />
          {i < 3 ? MEDALS[i] : ''} {p.name}: {p.score}
        </div>
      ))}
    </div>
  );
}

// ─── Round Winner Popup ───────────────────────────────────────────────────────
function RoundWinnerPopup({ winner, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{ fontSize: 18, color: '#ffb347', fontWeight: 700 }}>🏅 מוביל בסבב הזה!</div>
      <AvatarCircle
        userId={winner.userId}
        hasAvatar={winner.hasAvatar}
        name={winner.name}
        size={100}
        style={{ border: '3px solid #ffb347' }}
      />
      <div style={{ color: '#fff', fontSize: 26, fontWeight: 900 }}>{winner.name}</div>
      <div style={{ color: '#ffb347', fontSize: 20, fontWeight: 700 }}>+{winner.delta} נקודות בסבב</div>
    </div>
  );
}

// ─── Timer bar ───────────────────────────────────────────────────────────────
function TimerBar({ total, songId }) {
  const [left, setLeft] = useState(total);
  useEffect(() => {
    setLeft(total);
    if (!total) return;
    const t = setInterval(() => setLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [songId, total]);
  if (!total) return null;
  const pct = (left / total) * 100;
  const color = pct > 50 ? '#1db954' : pct > 25 ? '#ffb347' : '#dc3545';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#2d2d30', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 1s linear, background 0.5s' }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 14, minWidth: 26, textAlign: 'right' }}>{left}</span>
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function MultiplayerScreen({ onExit }) {
  const socket = useMemo(() => getSocket(), []);
  const { playlists } = useSettingsStore();
  const authUser = useAuthStore(s => s.user);
  const canHost = authUser?.role === 'admin' || authUser?.canHostRoom === true;

  // Navigation
  const [view, setView] = useState('entry'); // entry | lobby | game | results

  // Socket connection state
  const [connected, setConnected] = useState(false);

  // Entry form
  const [myName, setMyName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');

  // Room state
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const myIdRef = useRef('');

  // Host config
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(playlists[0]?.id || '');
  const [songCount, setSongCount] = useState(10);
  const [timerSec, setTimerSec] = useState(30);

  // Game
  const [currentSong, setCurrentSong] = useState(null);
  const [songPhase, setSongPhase] = useState('playing'); // playing | reveal
  const [yearValue, setYearValue] = useState(DEFAULT_YEAR);
  const yearRef = useRef(DEFAULT_YEAR);

  // Round winner popup
  const [roundWinner, setRoundWinner] = useState(null);

  // Victory
  const [victoryAudioUrl, setVictoryAudioUrl] = useState('');
  const victoryAudioRef = useRef(null);

  // Per-song answer tracking (refs = no stale closures)
  const titleAccepted = useRef(false);
  const artistAccepted = useRef(false);
  const titlePenalty = useRef(false);
  const artistPenalty = useRef(false);
  const answerSent = useRef(false);

  // Audio
  const audioRef = useRef(null);

  // Rules modal
  const [showRules, setShowRules] = useState(false);

  function resetSongState(defaultYr = DEFAULT_YEAR) {
    titleAccepted.current = false;
    artistAccepted.current = false;
    titlePenalty.current = false;
    artistPenalty.current = false;
    answerSent.current = false;
    yearRef.current = defaultYr;
    setYearValue(defaultYr);
  }

  function sendAnswer() {
    if (answerSent.current) return;
    answerSent.current = true;
    const yearCorrect = currentSong && String(yearRef.current) === String(currentSong.year);
    socket.emit('mp:answer', {
      titleCorrect: titleAccepted.current,
      artistCorrect: artistAccepted.current,
      yearCorrect,
      titlePenalty: titlePenalty.current,
      artistPenalty: artistPenalty.current,
    });
  }

  // ── Socket wiring ──────────────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      myIdRef.current = socket.id;
      setConnected(true);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('mp:created', ({ code, players: ps }) => {
      setRoomCode(code);
      setIsHost(true);
      setPlayers(ps);
      setView('lobby');
      setError('');
    });

    socket.on('mp:joined', ({ code, players: ps }) => {
      setRoomCode(code);
      setIsHost(false);
      setPlayers(ps);
      setView('lobby');
      setError('');
    });

    socket.on('mp:error', ({ message }) => setError(message));

    socket.on('mp:room_update', ({ players: ps }) => setPlayers(ps));

    socket.on('mp:song', (song) => {
      resetSongState();
      setCurrentSong(song);
      setSongPhase('playing');
      setView('game');
      setShowRules(false);
      setRoundWinner(null);
      // Play audio
      if (song.audioUrl && audioRef.current) {
        audioRef.current.src = song.audioUrl;
        audioRef.current.load();
        audioRef.current.play().catch(() => {});
      }
    });

    socket.on('mp:score_update', ({ players: ps, roundWinner: rw }) => {
      setPlayers(ps);
      // Show round winner popup if there is one with positive delta
      if (rw && rw.delta > 0) {
        setRoundWinner(rw);
      }
    });

    socket.on('mp:reveal', () => {
      sendAnswer();
      setSongPhase('reveal');
      if (audioRef.current) audioRef.current.pause();
    });

    socket.on('mp:ended', ({ players: ps, victoryAudioUrl: vUrl }) => {
      setPlayers(ps);
      setView('results');
      if (audioRef.current) audioRef.current.pause();
      if (vUrl) {
        setVictoryAudioUrl(vUrl);
      }
    });

    return () => {
      ['connect','disconnect','connect_error','mp:created','mp:joined','mp:error','mp:room_update','mp:song','mp:score_update','mp:reveal','mp:ended']
        .forEach(e => socket.off(e));
      socket.disconnect();
    };
  }, []); // eslint-disable-line

  // Play victory audio when URL arrives and we're in results
  useEffect(() => {
    if (victoryAudioUrl && victoryAudioRef.current && view === 'results') {
      victoryAudioRef.current.src = victoryAudioUrl;
      victoryAudioRef.current.load();
      victoryAudioRef.current.play().catch(() => {});
    }
  }, [victoryAudioUrl, view]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function createRoom() {
    if (!myName.trim()) { setError('הזן שם'); return; }
    socket.emit('mp:create', { name: myName.trim(), userId: authUser?.id });
  }

  function joinRoom() {
    if (!myName.trim()) { setError('הזן שם'); return; }
    if (!joinCode.trim()) { setError('הזן קוד חדר'); return; }
    socket.emit('mp:join', { code: joinCode.trim(), name: myName.trim(), userId: authUser?.id });
  }

  function startGame() {
    if (!selectedPlaylistId) { setError('בחר פלייליסט'); return; }
    socket.emit('mp:start', { playlistId: selectedPlaylistId, songCount, timerSeconds: timerSec });
  }

  function hostReveal() { socket.emit('mp:host_reveal'); }
  function hostNext() { socket.emit('mp:host_next'); }
  function hostEnd() { if (confirm('לסיים את המשחק?')) socket.emit('mp:end_game'); }

  // ── Entry view ─────────────────────────────────────────────────────────────
  if (view === 'entry') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 24, gap: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onExit} style={backBtn}>← חזור</button>
        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: connected ? '#0d1a0d' : '#1a0d0d', color: connected ? '#1db954' : '#ff6b6b', border: `1px solid ${connected ? '#1db954' : '#dc3545'}` }}>
          {connected ? '● מחובר' : '● מתחבר לשרת...'}
        </span>
      </div>

      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, textAlign: 'center', margin: 0 }}>🎮 משחק קבוצתי</h2>

      {!connected && (
        <div style={{ background: '#1a1a0d', border: '1px solid #ffb347', borderRadius: 10, padding: '10px 14px', color: '#ffb347', fontSize: 13, textAlign: 'center' }}>
          ⚠️ יש לאתחל מחדש את השרת (סגור והפעל start.bat שוב) לאחר עדכון הקוד
        </div>
      )}

      <div style={card}>
        <label style={lbl}>השם שלך</label>
        <input
          value={myName} onChange={e => { setMyName(e.target.value); setError(''); }}
          placeholder="הכנס שם..."
          style={inputStyle}
          autoComplete="off"
        />
      </div>

      {!showJoin ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canHost && (
            <button onClick={createRoom} disabled={!connected} style={{ ...primaryBtn, opacity: connected ? 1 : 0.4 }}>📱 צור חדר (מנהל)</button>
          )}
          <button onClick={() => setShowJoin(true)} disabled={!connected} style={{ ...secondaryBtn, opacity: connected ? 1 : 0.4 }}>🎮 הצטרף לחדר</button>
        </div>
      ) : (
        <div style={card}>
          <label style={lbl}>קוד חדר</label>
          <input
            value={joinCode} onChange={e => { setJoinCode(e.target.value); setError(''); }}
            placeholder="4 ספרות..."
            style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
            maxLength={4} inputMode="numeric"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={joinRoom} disabled={!connected} style={{ ...primaryBtn, flex: 1, opacity: connected ? 1 : 0.4 }}>הצטרף</button>
            <button onClick={() => setShowJoin(false)} style={{ ...secondaryBtn, flex: 1 }}>ביטול</button>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#ff6b6b', textAlign: 'center', margin: 0 }}>{error}</p>}

      <button onClick={() => setShowRules(r => !r)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
        📖 חוקי המשחק
      </button>
      {showRules && <RulesPanel />}
    </div>
  );

  // ── Lobby view ─────────────────────────────────────────────────────────────
  if (view === 'lobby') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: 20, gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: 0 }}>🎮 חדר המתנה</h2>
        <button onClick={onExit} style={backBtn}>יציאה</button>
      </div>

      {/* Room code */}
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 4px' }}>קוד החדר — שתף עם החברים</p>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 12, color: '#007ACC' }}>{roomCode}</div>
      </div>

      {/* Players list */}
      <div style={card}>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 8px' }}>משתתפים ({players.length})</p>
        {players.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #333' }}>
            <AvatarCircle userId={p.userId} hasAvatar={p.hasAvatar} name={p.name} size={28} />
            <span style={{ fontSize: 16 }}>{p.isHost ? '👑' : '🎵'}</span>
            <span style={{ color: '#fff', fontSize: 15 }}>{p.name}</span>
            {p.isHost && <span style={{ color: '#888', fontSize: 12 }}>(מנהל)</span>}
          </div>
        ))}
        {players.length < 2 && <p style={{ color: '#555', fontSize: 13, marginTop: 8 }}>ממתין לשחקנים נוספים...</p>}
      </div>

      {/* Host config */}
      {isHost && (
        <div style={card}>
          <p style={{ color: '#888', fontSize: 12, margin: '0 0 10px' }}>הגדרות משחק</p>

          <label style={lbl}>פלייליסט</label>
          <select value={selectedPlaylistId} onChange={e => setSelectedPlaylistId(e.target.value)} style={selectStyle}>
            {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label style={{ ...lbl, marginTop: 10 }}>מספר שירים</label>
          <OptionPicker options={SONG_COUNT_OPTIONS} value={songCount} onChange={setSongCount} />

          <label style={{ ...lbl, marginTop: 10 }}>טיימר לכל שיר</label>
          <select value={timerSec} onChange={e => setTimerSec(Number(e.target.value))} style={selectStyle}>
            {[0,15,30,45,60].map(n => <option key={n} value={n}>{n === 0 ? 'ללא' : `${n} שנ׳`}</option>)}
          </select>

          <button onClick={startGame} disabled={players.length < 1} style={{ ...primaryBtn, marginTop: 14 }}>
            ▶ התחל משחק
          </button>
        </div>
      )}

      {!isHost && (
        <div style={{ ...card, textAlign: 'center', color: '#888' }}>
          ⏳ ממתין למנהל להתחיל...
        </div>
      )}

      <button onClick={() => setShowRules(r => !r)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
        📖 חוקי המשחק
      </button>
      {showRules && <RulesPanel />}

      {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>{error}</p>}
    </div>
  );

  // ── Game view ──────────────────────────────────────────────────────────────
  if (view === 'game' && currentSong) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />

      {/* Round winner popup */}
      {roundWinner && (
        <RoundWinnerPopup winner={roundWinner} onDone={() => setRoundWinner(null)} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>שיר {currentSong.index} מתוך {currentSong.total}</span>
          <span style={{ color: '#007ACC', fontSize: 12, fontWeight: 700 }}>
            {currentSong.total - currentSong.index === 0 ? 'שיר אחרון!' : `נותרו ${currentSong.total - currentSong.index} שירים`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isHost && songPhase === 'playing' && (
            <button onClick={hostReveal} style={{ ...secondaryBtn, padding: '4px 12px', fontSize: 13 }}>⏩ חשוף</button>
          )}
          {isHost && songPhase === 'reveal' && (
            <button onClick={hostNext} style={{ ...primaryBtn, padding: '4px 12px', fontSize: 13 }}>
              {currentSong.index >= currentSong.total ? '🏁 תוצאות' : '▶ הבא'}
            </button>
          )}
          {isHost && <button onClick={hostEnd} style={{ background: '#3a1010', color: '#ff6b6b', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>⏹</button>}
        </div>
      </div>

      {/* Timer */}
      <div style={{ flexShrink: 0 }}>
        <TimerBar total={songPhase === 'playing' ? timerSec : 0} songId={currentSong.songId} />
      </div>

      {/* Album art */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
        {songPhase === 'reveal' && currentSong.coverUrl ? (
          <img
            src={currentSong.coverUrl}
            alt="cover"
            style={{ width: 110, height: 110, borderRadius: 12, objectFit: 'cover', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
          />
        ) : (
          <div style={{ width: 110, height: 110, borderRadius: 12, background: '#2d2d30', border: '1px solid #3a3a3a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 40, opacity: 0.4 }}>🎵</span>
          </div>
        )}
      </div>

      {/* Reveal banner */}
      {songPhase === 'reveal' && (
        <div style={{ margin: '0 16px', padding: '10px 16px', borderRadius: 12, background: '#1a3a1a', border: '1px solid #1db954', flexShrink: 0 }}>
          <p style={{ color: '#1db954', fontWeight: 700, margin: '0 0 4px', fontSize: 14 }}>✅ תשובה נכונה:</p>
          <p style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>{currentSong.title} — {currentSong.artist} ({currentSong.year})</p>
        </div>
      )}

      {/* Guess fields — use key to remount on new song */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px', flexShrink: 0 }}>
        <AutocompleteInput
          key={currentSong.songId + '-title'}
          label="שם שיר"
          answer={currentSong.title}
          disabled={songPhase === 'reveal'}
          onAccept={() => { titleAccepted.current = true; }}
          onPenalty={() => { titlePenalty.current = true; }}
        />
        <AutocompleteInput
          key={currentSong.songId + '-artist'}
          label="זמר"
          answer={currentSong.artist}
          disabled={songPhase === 'reveal'}
          onAccept={() => { artistAccepted.current = true; }}
          onPenalty={() => { artistPenalty.current = true; }}
        />
      </div>

      {/* Year picker */}
      <div style={{ padding: '0 16px', flexShrink: 0 }}>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 6px', textAlign: 'right' }}>שנה:</p>
        <YearPicker
          key={currentSong.songId + '-year'}
          value={yearValue}
          onChange={y => { setYearValue(y); yearRef.current = y; }}
          disabled={songPhase === 'reveal'}
        />
        {songPhase === 'reveal' && (
          <p style={{ color: String(yearValue) === String(currentSong.year) ? '#1db954' : '#dc3545', fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            {String(yearValue) === String(currentSong.year) ? `✓ נכון! ${currentSong.year}` : `✗ נבחרה: ${yearValue} | נכון: ${currentSong.year}`}
          </p>
        )}
      </div>

      {/* Scoreboard */}
      <div style={{ flexShrink: 0 }}>
        <p style={{ color: '#555', fontSize: 11, textAlign: 'center', margin: '4px 0 2px' }}>ניקוד</p>
        <ScoreStrip players={players} myId={myIdRef.current} />
      </div>

      {/* Play/pause for audio */}
      {currentSong.audioUrl && songPhase === 'playing' && (
        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          <button
            onClick={() => { const a = audioRef.current; a?.paused ? a.play() : a.pause(); }}
            style={{ width: '100%', padding: '10px', borderRadius: 12, background: '#2d2d30', border: '1px solid #3a3a3a', color: '#ccc', fontSize: 13, cursor: 'pointer' }}
          >
            ▶/⏸ נגן/עצור
          </button>
        </div>
      )}
    </div>
  );

  // ── Results view ───────────────────────────────────────────────────────────
  if (view === 'results') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 24, gap: 16, overflowY: 'auto' }}>
        {/* Hidden victory audio */}
        <audio ref={victoryAudioRef} preload="auto" />

        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 900, textAlign: 'center', margin: 0 }}>🏆 תוצאות</h2>

        {/* Winner highlight */}
        {winner && (
          <div style={{ ...card, textAlign: 'center', background: '#1a2a1a', border: '2px solid #1db954' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🥇</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <AvatarCircle
                userId={winner.userId}
                hasAvatar={winner.hasAvatar}
                name={winner.name}
                size={80}
                style={{ border: '3px solid #1db954' }}
              />
            </div>
            <div style={{ color: '#1db954', fontSize: 22, fontWeight: 900 }}>{winner.name}</div>
            <div style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>{winner.score} נקודות</div>
          </div>
        )}

        {/* Full ranking */}
        <div style={card}>
          {sorted.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < sorted.length - 1 ? '1px solid #333' : 'none' }}>
              <span style={{ fontSize: 22, minWidth: 32 }}>{MEDALS[i] || `${i + 1}.`}</span>
              <AvatarCircle userId={p.userId} hasAvatar={p.hasAvatar} name={p.name} size={32} />
              <span style={{ color: '#fff', fontSize: 16, flex: 1 }}>{p.name}</span>
              <span style={{ color: '#007ACC', fontSize: 18, fontWeight: 700 }}>{p.score}</span>
            </div>
          ))}
        </div>

        <button onClick={onExit} style={primaryBtn}>חזור לתפריט הראשי</button>
      </div>
    );
  }

  return null;
}

// ── Rules panel ────────────────────────────────────────────────────────────
function RulesPanel() {
  return (
    <div style={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 12, padding: '12px 16px', direction: 'rtl' }}>
      <p style={{ color: '#ffb347', fontWeight: 700, margin: '0 0 8px', fontSize: 14 }}>📖 חוקי המשחק</p>
      {RULES.map((r, i) => (
        <p key={i} style={{ color: '#ccc', fontSize: 13, margin: '4px 0', lineHeight: 1.5 }}>• {r}</p>
      ))}
      <div style={{ marginTop: 10, padding: '8px 12px', background: '#0d1a0d', borderRadius: 8, border: '1px solid #1db954' }}>
        <p style={{ color: '#1db954', fontSize: 13, margin: 0, fontWeight: 600 }}>
          🎯 שיר + זמר + שנה = <strong>10 נקודות</strong> | כל תשובה בנפרד = נקודה אחת | 3 טעויות = -1 נקודה
        </p>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────
const card = { background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 12, padding: '14px 16px' };
const lbl = { display: 'block', color: '#888', fontSize: 12, marginBottom: 4 };
const inputStyle = { width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: 15, direction: 'rtl', outline: 'none', boxSizing: 'border-box' };
const selectStyle = { width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 14, direction: 'rtl' };
const primaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: '#007ACC', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: '#2d2d30', color: '#ccc', border: '1px solid #3a3a3a', fontSize: 15, cursor: 'pointer' };
const backBtn = { background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer' };
