import { useState, useEffect, useRef, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import { getSocket } from '../services/socket.js';
import { getPlaylistSongs } from '../api/client.js';
import { useFavorites } from '../hooks/useFavorites.js';
import { useBlacklist } from '../hooks/useBlacklist.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import YearPicker from '../components/YearPicker.jsx';
import AutocompleteInput from '../components/AutocompleteInput.jsx';
import { AvatarCircle } from '../App.jsx';
import { useLang } from '../i18n/useLang.js';
import { unlockAudio } from '../utils/audioUnlock.js';
import CastButton from '../components/CastButton.jsx';

const DEFAULT_YEAR = 2000;
const MEDALS = ['🥇', '🥈', '🥉'];

function getSongDecade(year) {
  if (!year) return null;
  const y = Number(year);
  if (!y) return null;
  return String(Math.floor(y / 10) * 10);
}
function decadeLabel(d) {
  const n = Number(d);
  return n < 2000 ? `שנות ה-${String(n).slice(2)}` : `שנות ה-${n}`;
}

const SONG_COUNT_OPTIONS = [
  { value: 5,   label: '5' },
  { value: 10,  label: '10' },
  { value: 15,  label: '15' },
  { value: 20,  label: '20' },
  { value: 25,  label: '25' },
  { value: 30,  label: '30' },
  { value: 40,  label: '40' },
  { value: 50,  label: '50' },
  { value: 75,  label: '75' },
  { value: 100, label: '100' },
  { value: 150, label: '150' },
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
        style={{ height: '100%', overflowY: 'scroll', scrollbarWidth: 'none', paddingTop: PAD_OP, paddingBottom: PAD_OP, boxSizing: 'border-box' }}
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
  const { t } = useLang();
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{ fontSize: 18, color: '#ffb347', fontWeight: 700 }}>{t('round_winner_title')}</div>
      <AvatarCircle
        userId={winner.userId}
        hasAvatar={winner.hasAvatar}
        name={winner.name}
        size={100}
        style={{ border: '3px solid #ffb347' }}
      />
      <div style={{ color: '#fff', fontSize: 26, fontWeight: 900 }}>{winner.name}</div>
      <div style={{ color: '#ffb347', fontSize: 20, fontWeight: 700 }}>{t('round_points', { n: winner.delta })}</div>
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

// ─── Personal result row ─────────────────────────────────────────────────────
function ResultRow({ label, correct, detail }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: correct ? '#1db954' : '#dc3545',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 14, fontWeight: 700,
      }}>
        {correct ? '✓' : '✗'}
      </span>
      <span style={{ color: correct ? '#1db954' : '#ff6b6b', fontSize: 14, fontWeight: 600 }}>{label}</span>
      {detail && <span style={{ color: '#888', fontSize: 12, marginRight: 'auto' }}>{detail}</span>}
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function MultiplayerScreen({ onExit }) {
  const { t, dir } = useLang();
  const { favoriteIds, toggle: toggleFavorite } = useFavorites();
  const { blacklistIds, toggleBlacklist } = useBlacklist();
  const socket = useMemo(() => getSocket(), []);
  const { playlists } = useSettingsStore();
  const authUser = useAuthStore(s => s.user);
  const canHost = authUser?.role === 'admin' || authUser?.canHostRoom === true;

  // Navigation
  const [view, setView] = useState('entry'); // entry | lobby | game | results

  // Socket connection state
  const [connected, setConnected] = useState(false);

  // Entry form — pre-fill with logged-in username
  const [myName, setMyName] = useState(authUser?.username || '');
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [error, setError] = useState('');

  // Room state
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const myIdRef = useRef('');

  // Host config
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [songCount, setSongCount] = useState(10);
  const [timerSec, setTimerSec] = useState(30);

  // Lobby decade filter
  const [lobbySongs, setLobbySongs] = useState([]);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [excludedDecades, setExcludedDecades] = useState(new Set());
  const lobbyDecades = useMemo(() => {
    const s = new Set();
    lobbySongs.forEach(song => { const d = getSongDecade(song.year); if (d) s.add(d); });
    return [...s].sort();
  }, [lobbySongs]);

  // Game
  const [currentSong, setCurrentSong] = useState(null);
  const [songPhase, setSongPhase] = useState('playing'); // playing | reveal
  const [yearValue, setYearValue] = useState(DEFAULT_YEAR);
  const yearRef = useRef(DEFAULT_YEAR);

  // Round winner popup
  const [roundWinner, setRoundWinner] = useState(null);

  // Victory
  const [victoryAudioUrl, setVictoryAudioUrl] = useState('');
  const [victoryStartSeconds, setVictoryStartSeconds] = useState(0);
  const victoryAudioRef = useRef(null);

  // Mute state (host broadcasts to non-host players)
  const [allMuted, setAllMuted] = useState(false);
  const allMutedRef = useRef(false);
  useEffect(() => { allMutedRef.current = allMuted; }, [allMuted]);

  // Load songs for lobby decade filter whenever playlists change (host only)
  useEffect(() => {
    if (selectedPlaylistIds.size === 0 || view !== 'lobby' || !isHost) return;
    setLobbyLoading(true);
    setExcludedDecades(new Set());
    Promise.all([...selectedPlaylistIds].map(id => getPlaylistSongs(id)))
      .then(results => {
        const seen = new Set();
        const combined = results.flat().filter(s => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
        setLobbySongs(combined);
      })
      .catch(() => setLobbySongs([]))
      .finally(() => setLobbyLoading(false));
  }, [selectedPlaylistIds, view, isHost]); // eslint-disable-line

  // Per-song answer tracking (refs = no stale closures)
  const titleAccepted = useRef(false);
  const artistAccepted = useRef(false);
  const titlePenalty = useRef(false);
  const artistPenalty = useRef(false);
  const answerSent = useRef(false);

  // Player confirmed their answer (clicked אישור)
  const [playerConfirmed, setPlayerConfirmed] = useState(false);
  const [confirmedResults, setConfirmedResults] = useState(null); // { title, artist, year }

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
    setPlayerConfirmed(false);
    setConfirmedResults(null);
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
      // Play audio (respect current mute state)
      if (song.audioUrl && audioRef.current) {
        audioRef.current.src = song.audioUrl;
        audioRef.current.load();
        // Use a ref snapshot so closure has current muted value
        if (!allMutedRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    });

    socket.on('mp:seek', ({ seconds }) => {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.min(
          (audioRef.current.duration || 0),
          (audioRef.current.currentTime || 0) + seconds
        );
      }
    });

    socket.on('mp:muted', ({ muted }) => {
      setAllMuted(muted);
      if (audioRef.current) {
        if (muted) {
          audioRef.current.pause();
        } else {
          audioRef.current.play().catch(() => {});
        }
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
      // Audio keeps playing — do not pause here
    });

    socket.on('mp:ended', ({ players: ps, victoryAudioUrl: vUrl, victoryStartSeconds: vStart }) => {
      setPlayers(ps);
      setView('results');
      if (audioRef.current) audioRef.current.pause();
      if (vUrl) {
        setVictoryAudioUrl(vUrl);
        setVictoryStartSeconds(Number(vStart) || 0);
      }
    });

    return () => {
      ['connect','disconnect','connect_error','mp:created','mp:joined','mp:error','mp:room_update','mp:song','mp:score_update','mp:reveal','mp:ended','mp:muted','mp:seek']
        .forEach(e => socket.off(e));
      socket.disconnect();
    };
  }, []); // eslint-disable-line

  // Play victory audio when URL arrives and we're in results
  useEffect(() => {
    if (victoryAudioUrl && victoryAudioRef.current && view === 'results') {
      const el = victoryAudioRef.current;
      el.src = victoryAudioUrl;
      el.load();
      // Seek to chorus once metadata is ready, then play
      const startAt = Number(victoryStartSeconds) || 0;
      const onReady = () => {
        if (startAt > 0) try { el.currentTime = startAt; } catch {}
        el.play().catch(() => {});
        el.removeEventListener('loadedmetadata', onReady);
      };
      el.addEventListener('loadedmetadata', onReady);
    }
  }, [victoryAudioUrl, view, victoryStartSeconds]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function createRoom() {
    if (!myName.trim()) { setError('הזן שם'); return; }
    unlockAudio(audioRef.current);
    socket.emit('mp:create', { name: myName.trim(), userId: authUser?.id });
  }

  function joinRoom() {
    if (!myName.trim()) { setError('הזן שם'); return; }
    if (!joinCode.trim()) { setError('הזן קוד חדר'); return; }
    unlockAudio(audioRef.current);
    socket.emit('mp:join', { code: joinCode.trim(), name: myName.trim(), userId: authUser?.id });
  }

  function startGame() {
    if (selectedPlaylistIds.size === 0) { setError('בחר פלייליסט'); return; }
    socket.emit('mp:start', {
      playlistIds: [...selectedPlaylistIds],
      songCount,
      timerSeconds: timerSec,
      excludedDecades: [...excludedDecades],
    });
  }

  function handleConfirm() {
    if (playerConfirmed || songPhase === 'reveal') return;
    const yearCorrect = currentSong && String(yearRef.current) === String(currentSong.year);
    setConfirmedResults({
      title: titleAccepted.current,
      artist: artistAccepted.current,
      year: yearCorrect,
    });
    setPlayerConfirmed(true);
    sendAnswer();
  }

  function hostReveal() { socket.emit('mp:host_reveal'); }
  function hostNext() { socket.emit('mp:host_next'); }
  function hostEnd() { if (confirm(t('end_game_confirm'))) socket.emit('mp:end_game'); }
  function handleSeek() {
    if (isHost) {
      socket.emit('mp:host_seek', { seconds: 30 });
    } else if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.duration || 0,
        (audioRef.current.currentTime || 0) + 30
      );
    }
  }
  function hostMuteToggle() {
    if (allMuted) {
      setAllMuted(false);
      socket.emit('mp:unmute_all');
    } else {
      setAllMuted(true);
      socket.emit('mp:mute_all');
    }
  }

  // ── Entry view ─────────────────────────────────────────────────────────────
  if (view === 'entry') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 24, gap: 16, overflowY: 'auto', direction: dir }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onExit} style={backBtn}>{t('back')}</button>
        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: connected ? '#0d1a0d' : '#1a0d0d', color: connected ? '#1db954' : '#ff6b6b', border: `1px solid ${connected ? '#1db954' : '#dc3545'}` }}>
          {connected ? t('connected') : t('connecting')}
        </span>
      </div>

      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, textAlign: 'center', margin: 0 }}>{t('group_title')}</h2>

      {!connected && (
        <div style={{ background: '#1a1a0d', border: '1px solid #ffb347', borderRadius: 10, padding: '10px 14px', color: '#ffb347', fontSize: 13, textAlign: 'center' }}>
          ⚠️ יש לאתחל מחדש את השרת (סגור והפעל start.bat שוב) לאחר עדכון הקוד
        </div>
      )}

      <div style={card}>
        <label style={lbl}>{t('your_name')}</label>
        <input
          value={myName} onChange={e => { setMyName(e.target.value); setError(''); }}
          placeholder={t('enter_name')}
          style={inputStyle}
          autoComplete="off"
        />
      </div>

      {!showJoin ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canHost && (
            <button onClick={createRoom} disabled={!connected} style={{ ...primaryBtn, opacity: connected ? 1 : 0.4 }}>{t('create_room')}</button>
          )}
          <button onClick={() => setShowJoin(true)} disabled={!connected} style={{ ...secondaryBtn, opacity: connected ? 1 : 0.4 }}>{t('join_room')}</button>
        </div>
      ) : (
        <div style={card}>
          <label style={lbl}>{t('room_code_lbl')}</label>
          <input
            value={joinCode} onChange={e => { setJoinCode(e.target.value); setError(''); }}
            placeholder={t('code_placeholder')}
            style={{ ...inputStyle, letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
            maxLength={4} inputMode="numeric"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={joinRoom} disabled={!connected} style={{ ...primaryBtn, flex: 1, opacity: connected ? 1 : 0.4 }}>{t('join')}</button>
            <button onClick={() => setShowJoin(false)} style={{ ...secondaryBtn, flex: 1 }}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#ff6b6b', textAlign: 'center', margin: 0 }}>{error}</p>}

      <button onClick={() => setShowRules(r => !r)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
        {t('game_rules')}
      </button>
      {showRules && <RulesPanel />}
    </div>
  );

  // ── Lobby view ─────────────────────────────────────────────────────────────
  if (view === 'lobby') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: 20, gap: 14, direction: dir }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: 0 }}>{t('lobby_title')}</h2>
        <button onClick={onExit} style={backBtn}>{t('exit')}</button>
      </div>

      {/* Room code */}
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 4px' }}>{t('room_code_hint')}</p>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 12, color: '#007ACC' }}>{roomCode}</div>
      </div>

      {/* Players list */}
      <div style={card}>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 8px' }}>{t('participants')} ({players.length})</p>
        {players.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #333' }}>
            <AvatarCircle userId={p.userId} hasAvatar={p.hasAvatar} name={p.name} size={28} />
            <span style={{ fontSize: 16 }}>{p.isHost ? '👑' : '🎵'}</span>
            <span style={{ color: '#fff', fontSize: 15 }}>{p.name}</span>
            {p.isHost && <span style={{ color: '#888', fontSize: 12 }}>({t('host_lbl')})</span>}
          </div>
        ))}
        {players.length < 2 && <p style={{ color: '#555', fontSize: 13, marginTop: 8 }}>{t('waiting_players')}</p>}
      </div>

      {/* Host config */}
      {isHost && (
        <div style={card}>
          <p style={{ color: '#888', fontSize: 12, margin: '0 0 10px' }}>{t('game_settings')}</p>

          <label style={lbl}>{t('playlist_lbl')}</label>
          <div style={{ margin: '0 -16px' }}>
            <PlaylistSelector
              playlists={playlists}
              selectedIds={selectedPlaylistIds}
              onToggle={id => setSelectedPlaylistIds(prev => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })}
            />
          </div>

          {/* Decade filter */}
          <label style={{ ...lbl, marginTop: 10 }}>
            {t('decade_filter')}
            {excludedDecades.size > 0 && <span style={{ color: '#007ACC', marginRight: 6 }}>({excludedDecades.size} מוסתר)</span>}
          </label>
          {lobbyLoading ? (
            <p style={{ color: '#555', fontSize: 12, margin: '4px 0' }}>טוען שנים...</p>
          ) : lobbyDecades.length === 0 ? (
            <p style={{ color: '#555', fontSize: 12, margin: '4px 0' }}>אין מידע על שנים בפלייליסט זה</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {lobbyDecades.map(d => {
                const active = !excludedDecades.has(d);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      const next = new Set(excludedDecades);
                      next.has(d) ? next.delete(d) : next.add(d);
                      setExcludedDecades(next);
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                      border: `1.5px solid ${active ? '#007ACC' : '#3a3a3a'}`,
                      background: active ? '#007ACC' : '#1e1e1e',
                      color: active ? '#fff' : '#555',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {active ? '✓ ' : ''}{decadeLabel(d)}
                  </button>
                );
              })}
            </div>
          )}
          {excludedDecades.size > 0 && (
            <button
              onClick={() => setExcludedDecades(new Set())}
              style={{ marginTop: 6, background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              אפס סינון עשורים
            </button>
          )}

          <label style={{ ...lbl, marginTop: 10 }}>{t('song_count_lbl')}</label>
          <OptionPicker options={SONG_COUNT_OPTIONS} value={songCount} onChange={setSongCount} />

          <label style={{ ...lbl, marginTop: 10 }}>{t('timer_lbl')}</label>
          <select value={timerSec} onChange={e => setTimerSec(Number(e.target.value))} style={selectStyle}>
            {[0,15,30,45,60].map(n => <option key={n} value={n}>{n === 0 ? t('none') : `${n} ${t('sec_suffix')}`}</option>)}
          </select>

          <button onClick={startGame} disabled={players.length < 1} style={{ ...primaryBtn, marginTop: 14 }}>
            {t('start_game')}
          </button>
        </div>
      )}

      {!isHost && (
        <div style={{ ...card, textAlign: 'center', color: '#888' }}>
          {t('waiting_host')}
        </div>
      )}

      <button onClick={() => setShowRules(r => !r)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
        {t('game_rules')}
      </button>
      {showRules && <RulesPanel />}

      {error && <p style={{ color: '#ff6b6b', textAlign: 'center' }}>{error}</p>}
    </div>
  );

  // ── Game view ──────────────────────────────────────────────────────────────
  if (view === 'game' && currentSong) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', direction: dir, background: 'var(--bg)' }}>
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />

      {/* Round winner popup */}
      {roundWinner && (
        <RoundWinnerPopup winner={roundWinner} onDone={() => setRoundWinner(null)} />
      )}

      {/* ── PINNED: Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>{t('song_x_of_y', { x: currentSong.index, y: currentSong.total })}</span>
          <span style={{ color: '#007ACC', fontSize: 12, fontWeight: 700 }}>
            {currentSong.total - currentSong.index === 0 ? t('last_song') : t('songs_remaining', { n: currentSong.total - currentSong.index })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isHost && (
            <button
              onClick={hostMuteToggle}
              style={{
                background: allMuted ? '#5a1010' : '#2d2d30',
                border: `1px solid ${allMuted ? '#dc3545' : '#3a3a3a'}`,
                color: allMuted ? '#ff6b6b' : '#ccc',
                borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {allMuted ? '🔊' : '🔇'}
              <span style={{ fontSize: 12 }}>{allMuted ? 'בטל השתקה' : 'השתקת משתמשים'}</span>
            </button>
          )}
          {isHost && songPhase === 'playing' && (
            <button onClick={hostReveal} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 13 }}>{t('reveal_btn')}</button>
          )}
          {isHost && songPhase === 'reveal' && (
            <button onClick={hostNext} style={{ ...primaryBtn, padding: '4px 10px', fontSize: 13 }}>
              {currentSong.index >= currentSong.total ? t('results_finish') : t('next')}
            </button>
          )}
          {isHost && <button onClick={hostEnd} style={{ background: '#3a1010', color: '#ff6b6b', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>⏹</button>}
        </div>
      </div>

      {/* ── PINNED: Muted indicator ── */}
      {!isHost && allMuted && (
        <div style={{ margin: '6px 16px 0', padding: '6px 12px', borderRadius: 8, background: '#3a1010', border: '1px solid #dc3545', color: '#ff6b6b', fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
          🔇 המנהל השתיק את השמע
        </div>
      )}

      {/* ── PINNED: Timer ── */}
      <div style={{ flexShrink: 0, marginTop: 8 }}>
        <TimerBar total={songPhase === 'playing' ? timerSec : 0} songId={currentSong.songId} />
      </div>

      {/* ── SCROLLABLE: all game content ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 24px' }}>

      {/* Album art + favorite button */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '0 16px' }}>
        {/* Favorite button — right of cover, always visible */}
        <button
          onClick={() => {
            const filePath = currentSong.audioUrl
              ? decodeURIComponent(currentSong.audioUrl.replace('/api/audio/', ''))
              : '';
            toggleFavorite({
              id: currentSong.songId,
              filePath,
              title: currentSong.title || '',
              artist: currentSong.artist || '',
              year: currentSong.year || '',
            });
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            background: favoriteIds.has(currentSong.songId) ? '#dc354522' : '#2d2d30',
            border: `1px solid ${favoriteIds.has(currentSong.songId) ? '#dc3545' : '#3a3a3a'}`,
            borderRadius: 10, padding: '7px 10px', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20 }}>{favoriteIds.has(currentSong.songId) ? '💔' : '❤️'}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: favoriteIds.has(currentSong.songId) ? '#ff6b6b' : '#888' }}>
            {favoriteIds.has(currentSong.songId) ? t('remove_fav') : t('add_fav')}
          </span>
        </button>
        {songPhase === 'reveal' && currentSong.coverUrl ? (
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

      {/* Reveal banner */}
      {songPhase === 'reveal' && (
        <div style={{ margin: '0 16px', padding: '10px 16px', borderRadius: 12, background: '#1a3a1a', border: '1px solid #1db954' }}>
          <p style={{ color: '#1db954', fontWeight: 700, margin: '0 0 4px', fontSize: 14 }}>{t('correct_answer')}</p>
          <p style={{ color: '#fff', margin: 0, fontSize: 15, fontWeight: 600 }}>{currentSong.title} — {currentSong.artist} ({currentSong.year})</p>
        </div>
      )}

      {/* Guess fields — use key to remount on new song */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
        <AutocompleteInput
          key={currentSong.songId + '-title'}
          label={t('song_name')}
          answer={currentSong.title}
          disabled={playerConfirmed || songPhase === 'reveal'}
          onAccept={() => { titleAccepted.current = true; }}
          onPenalty={() => { titlePenalty.current = true; }}
        />
        <AutocompleteInput
          key={currentSong.songId + '-artist'}
          label={t('artist')}
          answer={currentSong.artist}
          disabled={playerConfirmed || songPhase === 'reveal'}
          onAccept={() => { artistAccepted.current = true; }}
          onPenalty={() => { artistPenalty.current = true; }}
        />
      </div>

      {/* Year picker */}
      <div style={{ padding: '0 16px', flexShrink: 0 }}>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 6px', textAlign: dir === 'rtl' ? 'right' : 'left' }}>{t('year_colon')}</p>
        <YearPicker
          key={currentSong.songId + '-year'}
          value={yearValue}
          onChange={y => { setYearValue(y); yearRef.current = y; }}
          disabled={playerConfirmed || songPhase === 'reveal'}
        />
      </div>

      {/* Confirm button — sticky to the bottom of the scroll area so it's always visible
          even on narrow phones where the year picker + inputs fill the viewport */}
      {songPhase === 'playing' && !playerConfirmed && (
        <div style={{
          position: 'sticky', bottom: 0,
          padding: '12px 16px 8px',
          background: 'linear-gradient(to top, var(--bg) 0%, var(--bg) 70%, transparent 100%)',
          flexShrink: 0, zIndex: 5,
        }}>
          <button
            onClick={handleConfirm}
            style={{
              ...primaryBtn,
              background: '#1db954', color: '#000',
              boxShadow: '0 4px 16px rgba(29, 185, 84, 0.4)',
              fontWeight: 800,
            }}
          >
            {t('confirm_submit')}
          </button>
        </div>
      )}

      {/* Personal results (shown after confirmation, before full reveal) */}
      {playerConfirmed && songPhase === 'playing' && confirmedResults && (
        <div style={{ margin: '0 16px', padding: '12px 16px', borderRadius: 12, background: '#1a1a2e', border: '1px solid #444', flexShrink: 0 }}>
          <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 10px', fontWeight: 600 }}>{t('your_results')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ResultRow label={t('song_name')} correct={confirmedResults.title} />
            <ResultRow label={t('artist')} correct={confirmedResults.artist} />
            <ResultRow
              label={t('year')}
              correct={confirmedResults.year}
              detail={confirmedResults.year ? null : `בחרת: ${yearValue}`}
            />
          </div>
          <p style={{ color: '#555', fontSize: 12, textAlign: 'center', margin: '10px 0 0' }}>{t('waiting_reveal')}</p>
        </div>
      )}

      {/* Year result after full reveal */}
      {songPhase === 'reveal' && (
        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          <p style={{ color: String(yearValue) === String(currentSong.year) ? '#1db954' : '#dc3545', fontSize: 13, textAlign: 'center', margin: 0 }}>
            {String(yearValue) === String(currentSong.year) ? t('year_correct', { y: currentSong.year }) : t('year_wrong', { a: yearValue, b: currentSong.year })}
          </p>
        </div>
      )}

      {/* Scoreboard */}
      <div style={{ flexShrink: 0 }}>
        <p style={{ color: '#555', fontSize: 11, textAlign: 'center', margin: '4px 0 2px' }}>{t('score_lbl')}</p>
        <ScoreStrip players={players} myId={myIdRef.current} />
      </div>

      {/* Blacklist button — host or admin */}
      {(isHost || authUser?.role === 'admin') && (
        <div style={{ padding: '0 16px' }}>
          <button
            onClick={() => toggleBlacklist(currentSong.songId)}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              background: '#1e1e1e',
              border: `1px solid ${blacklistIds.has(currentSong.songId) ? '#dc3545' : '#3a3a3a'}`,
              color: blacklistIds.has(currentSong.songId) ? '#ff6b6b' : '#555',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {blacklistIds.has(currentSong.songId) ? `✓ ${t('unblock_song')}` : `🚫 ${t('block_song')}`}
          </button>
        </div>
      )}

      {/* Play/pause + +30s row */}
      {currentSong.audioUrl && songPhase === 'playing' && (
        <div style={{ padding: '0 16px', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => { const a = audioRef.current; a?.paused ? a.play() : a.pause(); }}
            style={{ flex: 2, padding: '10px', borderRadius: 12, background: '#2d2d30', border: '1px solid #3a3a3a', color: '#ccc', fontSize: 20, cursor: 'pointer' }}
          >
            ⏸
          </button>
          {(isHost || authUser?.role === 'admin') && (
            <button
              onClick={handleSeek}
              style={{ flex: 1, padding: '10px', borderRadius: 12, background: '#2d2d30', border: '1px solid #3a3a3a', color: '#ccc', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              +30s
            </button>
          )}
          <CastButton audioRef={audioRef} size={44} />
        </div>
      )}
    </div>
    </div>
  );

  // ── Results view ───────────────────────────────────────────────────────────
  if (view === 'results') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 24, gap: 16, overflowY: 'auto', direction: dir }}>
        {/* Hidden victory audio */}
        <audio ref={victoryAudioRef} preload="auto" />

        <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 900, textAlign: 'center', margin: 0 }}>{t('results_title')}</h2>

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
            <div style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>{winner.score} {t('points')}</div>
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

        <button onClick={onExit} style={primaryBtn}>{t('back_to_menu')}</button>
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
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' };
const lbl = { display: 'block', color: 'var(--text2)', fontSize: 12, marginBottom: 4 };
const inputStyle = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: 15, direction: 'rtl', outline: 'none', boxSizing: 'border-box' };
const selectStyle = { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 14, direction: 'rtl' };
const primaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: '#ccc', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
const backBtn = { background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer' };
