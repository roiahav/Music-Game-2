import { useState, useRef, useEffect } from 'react';
import { io as ioClient } from 'socket.io-client';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import TimerBar from '../components/TimerBar.jsx';
import { AvatarCircle } from '../App.jsx';
import { useLang } from '../i18n/useLang.js';
import { useFavorites } from '../hooks/useFavorites.js';

const SERVER = import.meta.env.VITE_SERVER_URL || '';
const TIMER_OPTIONS = [0, 15, 30, 45, 60];

// In years multiplayer, each round = 4 songs. The picker shows ROUNDS but the
// label tells the user how many songs that translates to.
const ROUND_COUNT_OPTIONS = [
  { value: 3,  label: '3 סיבובים (12 שירים)' },
  { value: 5,  label: '5 סיבובים (20 שירים)' },
  { value: 8,  label: '8 סיבובים (32 שירים)' },
  { value: 10, label: '10 סיבובים (40 שירים)' },
  { value: 15, label: '15 סיבובים (60 שירים)' },
  { value: 20, label: '20 סיבובים (80 שירים)' },
  { value: 25, label: '25 סיבובים (100 שירים)' },
  { value: 30, label: '30 סיבובים (120 שירים)' },
  { value: 40, label: '40 סיבובים (160 שירים)' },
  { value: 50, label: '50 סיבובים (200 שירים)' },
];

// Wheel-picker constants (match MultiplayerScreen for visual consistency)
const ITEM_H = 44;
const VISIBLE = 3;
const PAD_OP = ITEM_H;

// ── Song Card ─────────────────────────────────────────────────────────────────
function SongCard({ song, isActive, claimed, isWrong, isMine, roundEndInfo, onClick }) {
  // roundEndInfo = { year, title, artist } (only after round ends)
  const bg = claimed
    ? isMine ? '#0d2e1a' : '#1a1a2e'
    : isWrong ? '#2e0d0d'
    : isActive ? '#0d2040' : '#2d2d30';
  const border = claimed
    ? isMine ? '#1db954' : '#7b68ee'
    : isWrong ? '#dc3545'
    : isActive ? '#007ACC' : '#3a3a3a';

  return (
    <button
      onClick={() => !claimed && !isWrong && onClick(song)}
      style={{
        flex: 1, aspectRatio: '1 / 1',
        borderRadius: 16, background: bg,
        border: `2px solid ${border}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 5, cursor: (claimed || isWrong) ? 'default' : 'pointer',
        transition: 'all 0.2s', padding: 8, minWidth: 0,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {roundEndInfo ? (
        // After round: show correct year + song info
        <>
          <span style={{ fontSize: 20, fontWeight: 900, color: claimed ? (isMine ? '#1db954' : '#7b68ee') : '#dc3545' }}>
            {roundEndInfo.year}
          </span>
          <span style={{ color: '#ccc', fontSize: 10, textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {roundEndInfo.title}
          </span>
          <span style={{ color: '#666', fontSize: 9, textAlign: 'center' }}>{roundEndInfo.artist}</span>
          {claimed && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: isMine ? '#1db954' : '#7b68ee',
              textAlign: 'center', marginTop: 2,
            }}>
              {isMine ? '★ ' : ''}{claimed.name}
            </span>
          )}
        </>
      ) : claimed ? (
        // Claimed during play
        <>
          <span style={{ fontSize: 26 }}>{isMine ? '✓' : '🔒'}</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: isMine ? '#1db954' : '#7b68ee',
            textAlign: 'center',
          }}>
            {claimed.name}
          </span>
          <span style={{ fontSize: 11, color: isMine ? '#a8f5c4' : '#b0a8f5', fontWeight: 800 }}>
            +{claimed.points}
          </span>
        </>
      ) : isWrong ? (
        <>
          <span style={{ fontSize: 32, opacity: 0.7 }}>✗</span>
        </>
      ) : (
        <>
          {song.coverUrl && isActive ? (
            <img
              src={song.coverUrl}
              alt=""
              style={{ width: '60%', aspectRatio: '1/1', borderRadius: 8, objectFit: 'cover', opacity: 0.85 }}
            />
          ) : (
            <span style={{ fontSize: 36, opacity: isActive ? 1 : 0.35 }}>
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

// ── OptionPicker ──────────────────────────────────────────────────────────────
// Vertical wheel-style picker — same component pattern as MultiplayerScreen
// so the UX is identical between the two multiplayer modes.
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
    <div style={{ position: 'relative', height: ITEM_H * VISIBLE, borderRadius: 12, background: 'var(--bg2)', overflow: 'hidden' }}>
      {/* fade top */}
      <div style={{ position: 'absolute', top: 0, insetInline: 0, height: PAD_OP, background: 'linear-gradient(to bottom, var(--bg2) 40%, transparent)', zIndex: 2, pointerEvents: 'none' }} />
      {/* selection highlight */}
      <div style={{ position: 'absolute', top: PAD_OP, insetInline: 12, height: ITEM_H, background: 'var(--accent-alpha)', border: '1px solid var(--accent)', borderRadius: 8, zIndex: 1, pointerEvents: 'none' }} />
      {/* fade bottom */}
      <div style={{ position: 'absolute', bottom: 0, insetInline: 0, height: PAD_OP, background: 'linear-gradient(to top, var(--bg2) 40%, transparent)', zIndex: 2, pointerEvents: 'none' }} />

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
              color: o.value === value ? '#fff' : '#666',
              fontSize: o.value === value ? 15 : 13,
              fontWeight: o.value === value ? 700 : 400,
              cursor: 'pointer', userSelect: 'none',
              direction: 'rtl',
            }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Year Button ───────────────────────────────────────────────────────────────
function YearButton({ year, state, onClick }) {
  // state: 'idle' | 'correct' | 'wrong' | 'disabled'
  const bg =
    state === 'correct' ? '#0d2e0d' :
    state === 'wrong'   ? '#2e0d0d' :
    state === 'disabled'? '#1a1a1a' : '#2d2d30';
  const border =
    state === 'correct' ? '#1db954' :
    state === 'wrong'   ? '#dc3545' :
    state === 'disabled'? '#222'    : '#3a3a3a';
  const color =
    state === 'correct' ? '#1db954' :
    state === 'wrong'   ? '#ff6b6b' :
    state === 'disabled'? '#3a3a3a' : '#fff';

  return (
    <button
      onClick={() => state === 'idle' && onClick(year)}
      style={{
        flex: 1, padding: '14px 6px', borderRadius: 14,
        background: bg, border: `2px solid ${border}`, color,
        fontSize: 18, fontWeight: 800,
        cursor: state === 'idle' ? 'pointer' : 'default',
        transition: 'all 0.15s', minWidth: 0,
      }}
    >
      {year}
    </button>
  );
}

// ── Scoreboard strip ──────────────────────────────────────────────────────────
function ScoreStrip({ players, mySocketId }) {
  return (
    <div style={{
      display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 16px',
      flexShrink: 0, scrollbarWidth: 'none',
    }}>
      {players.map((p, i) => (
        <div key={p.socketId} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2, minWidth: 52, flexShrink: 0,
        }}>
          <div style={{ position: 'relative' }}>
            <AvatarCircle userId={p.userId} hasAvatar={p.userId ? undefined : false} name={p.name} size={32} />
            {i === 0 && <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 12 }}>👑</span>}
          </div>
          <span style={{ color: p.socketId === mySocketId ? '#007ACC' : '#ccc', fontSize: 10, fontWeight: 700, textAlign: 'center', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </span>
          <span style={{ color: '#1db954', fontSize: 12, fontWeight: 900 }}>{p.score}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function YearsMultiplayerScreen({ onExit }) {
  const { t, dir } = useLang();
  const { playlists } = useSettingsStore();
  const { user } = useAuthStore();

  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const victoryAudioRef = useRef(null);

  // ── UI phases ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('init'); // init | lobby | playing | round_end | game_end
  const [playerName, setPlayerName] = useState(user?.username || '');
  const [codeInput, setCodeInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [mySocketId, setMySocketId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Lobby (host) ───────────────────────────────────────────────────────────
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [songCount, setSongCount] = useState(10);
  const [timerSec, setTimerSec] = useState(0);

  // ── Round state ────────────────────────────────────────────────────────────
  const [roundNum, setRoundNum] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [roundSongs, setRoundSongs] = useState([]);   // {id, audioUrl, coverUrl}
  const [yearOptions, setYearOptions] = useState([]);
  const [roundTimerSec, setRoundTimerSec] = useState(0);
  const [claims, setClaims] = useState({});            // songId → {socketId, name, year, points}
  const [wrongSongs, setWrongSongs] = useState(new Set()); // cards I guessed wrong (flashing)
  const [activeSongId, setActiveSongId] = useState(null);
  const { favoriteIds, toggle: toggleFavorite } = useFavorites();

  // ── Round-end ──────────────────────────────────────────────────────────────
  const [roundEndSongs, setRoundEndSongs] = useState([]); // {id, year, title, artist}
  const [roundEndPlayers, setRoundEndPlayers] = useState([]);

  // ── Victory ────────────────────────────────────────────────────────────────
  const [victoryAudioUrl, setVictoryAudioUrl] = useState('');
  const [victoryStartSeconds, setVictoryStartSeconds] = useState(0);

  // ── Socket setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = ioClient(SERVER, { transports: ['websocket'] });
    socketRef.current = socket;
    setMySocketId(socket.id || '');
    socket.on('connect', () => setMySocketId(socket.id));

    socket.on('ygm:created', ({ code, players }) => {
      setRoomCode(code);
      setPlayers(players);
      setIsHost(true);
      setPhase('lobby');
      setError('');
    });

    socket.on('ygm:joined', ({ code, players }) => {
      setRoomCode(code);
      setPlayers(players);
      setIsHost(false);
      setPhase('lobby');
      setError('');
    });

    socket.on('ygm:room_update', ({ players }) => setPlayers(players));

    socket.on('ygm:host_changed', ({ newHostSocketId }) => {
      if (newHostSocketId === socket.id) setIsHost(true);
    });

    socket.on('ygm:started', ({ total }) => {
      setTotalRounds(total);
    });

    socket.on('ygm:round', ({ roundNum, total, songs, yearOptions, timerSeconds }) => {
      setRoundNum(roundNum);
      setTotalRounds(total);
      setRoundSongs(songs);
      setYearOptions(yearOptions);
      setClaims({});
      setWrongSongs(new Set());
      setActiveSongId(null);
      setRoundTimerSec(timerSeconds || 0);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
      setPhase('playing');
    });

    socket.on('ygm:claim', ({ songId, socketId, playerName, year, points, players }) => {
      setClaims(prev => ({ ...prev, [songId]: { socketId, name: playerName, year, points } }));
      setPlayers(players);
      // If I was playing this song, deactivate it
      setActiveSongId(prev => prev === songId ? null : prev);
    });

    socket.on('ygm:wrong', ({ songId }) => {
      // Lock card red permanently — cannot retry this song
      setWrongSongs(prev => new Set([...prev, songId]));
      setActiveSongId(null);
      if (audioRef.current) audioRef.current.pause();
    });

    socket.on('ygm:round_end', ({ claims, roundSongs, players }) => {
      setClaims(claims);
      setRoundEndSongs(roundSongs);
      setRoundEndPlayers(players);
      setActiveSongId(null);
      if (audioRef.current) audioRef.current.pause();
      setPhase('round_end');
    });

    socket.on('ygm:ended', ({ players, victoryAudioUrl: vUrl, victoryStartSeconds: vStart }) => {
      setPlayers(players);
      if (vUrl) {
        setVictoryAudioUrl(vUrl);
        setVictoryStartSeconds(Number(vStart) || 0);
      }
      if (audioRef.current) audioRef.current.pause();
      setPhase('game_end');
    });

    socket.on('ygm:seek', ({ seconds }) => {
      if (audioRef.current && audioRef.current.src) {
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration || 0,
          (audioRef.current.currentTime || 0) + seconds
        );
      }
    });

    socket.on('ygm:error', ({ message }) => {
      setError(message);
      setLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Play victory audio when game ends
  useEffect(() => {
    if (victoryAudioUrl && victoryAudioRef.current && phase === 'game_end') {
      const el = victoryAudioRef.current;
      el.src = victoryAudioUrl;
      el.load();
      const startAt = Number(victoryStartSeconds) || 0;
      const onReady = () => {
        if (startAt > 0) try { el.currentTime = startAt; } catch {}
        el.play().catch(() => {});
        el.removeEventListener('loadedmetadata', onReady);
      };
      el.addEventListener('loadedmetadata', onReady);
    }
  }, [victoryAudioUrl, phase, victoryStartSeconds]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleCreate() {
    if (!playerName.trim()) return;
    setError('');
    socketRef.current?.emit('ygm:create', { name: playerName.trim(), userId: user?.id });
  }

  function handleJoin() {
    if (!playerName.trim() || !codeInput.trim()) return;
    setError('');
    socketRef.current?.emit('ygm:join', {
      code: codeInput.trim().toUpperCase(),
      name: playerName.trim(),
      userId: user?.id,
    });
  }

  function handleStart() {
    if (selectedPlaylistIds.size === 0) return;
    setError('');
    setLoading(true);
    socketRef.current?.emit('ygm:start', {
      playlistIds: [...selectedPlaylistIds],
      songCount,
      timerSeconds: timerSec,
    });
    setLoading(false);
  }

  function handleCardClick(song) {
    if (claims[song.id]) return;
    if (wrongSongs.has(song.id)) return;
    setActiveSongId(song.id);
    if (audioRef.current && song.audioUrl) {
      audioRef.current.src = song.audioUrl;
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }

  function handleYearClick(year) {
    if (!activeSongId) return;
    if (claims[activeSongId]) return;
    setActiveSongId(null);
    if (audioRef.current) audioRef.current.pause();
    socketRef.current?.emit('ygm:guess', { songId: activeSongId, year });
  }

  function handleSeek() {
    if (audioRef.current && audioRef.current.src) {
      audioRef.current.currentTime = Math.min(
        audioRef.current.duration || 0,
        (audioRef.current.currentTime || 0) + 30
      );
    }
  }

  function handleTimerExpire() {
    setActiveSongId(null);
    if (audioRef.current) audioRef.current.pause();
    // Server-side timer is authoritative; client just does local cleanup
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  // Year button state: correct if a song was claimed with that year; disabled if no active song
  function yearButtonState(year) {
    const isClaimed = Object.values(claims).some(c => String(c.year) === String(year));
    if (isClaimed) return 'correct';
    if (!activeSongId) return 'disabled';
    return 'idle';
  }

  // ── Phase: init ────────────────────────────────────────────────────────────
  if (phase === 'init') return (
    <div style={{ ...shell, direction: dir }}>
      <audio ref={audioRef} preload="auto" />
      <TopBar onExit={onExit} title={`📅 ${t('ygm_game')}`} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>

        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#555', fontSize: 13, margin: 0 }}>{t('ygm_desc')}</p>
        </div>

        {/* Form */}
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder={t('enter_name')}
            style={inputStyle}
          />

          <button onClick={handleCreate} style={{ ...primaryBtn, background: '#007ACC' }}>
            {t('create_room')}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: '#2d2d30' }} />
            <span style={{ color: '#555', fontSize: 12 }}>או</span>
            <div style={{ flex: 1, height: 1, background: '#2d2d30' }} />
          </div>

          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            placeholder={t('room_code_lbl')}
            maxLength={4}
            style={{ ...inputStyle, textAlign: 'center', fontSize: 22, fontWeight: 900, letterSpacing: 6 }}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={handleJoin} style={{ ...primaryBtn, background: '#1db954' }}>
            {t('join_room')}
          </button>

          {error && <p style={{ color: '#ff6b6b', textAlign: 'center', fontSize: 13, margin: 0 }}>{error}</p>}
        </div>

        {/* Rules card */}
        <div style={{
          width: '100%', maxWidth: 340,
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
              { icon: '⚡', key: 'ygm_rule_speed' },
            ].map(({ icon, key }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.5 }}>{icon}</span>
                <span style={{ color: '#888', fontSize: 12, lineHeight: 1.5 }}>{t(key)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );

  // ── Phase: lobby ───────────────────────────────────────────────────────────
  if (phase === 'lobby') return (
    <div style={{ ...shell, direction: dir }}>
      <audio ref={audioRef} preload="auto" />
      <TopBar onExit={onExit} title={`📅 ${t('ygm_game')}`} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Room code */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 12, marginBottom: 4 }}>{t('room_code_hint')}</div>
          <button
            onClick={() => { try { navigator.clipboard?.writeText(roomCode); } catch {} }}
            title="העתק קוד"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 36, fontWeight: 900, letterSpacing: 10, color: '#007ACC' }}
          >
            {roomCode} 📋
          </button>
        </div>

        {/* Players */}
        <div style={{ background: '#2d2d30', borderRadius: 14, padding: 12 }}>
          <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>{t('waiting_players')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {players.map(p => (
              <div key={p.socketId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AvatarCircle userId={p.userId} hasAvatar={p.userId ? undefined : false} name={p.name} size={28} />
                <span style={{ color: p.socketId === mySocketId ? '#007ACC' : '#ccc', fontSize: 14, fontWeight: p.isHost ? 700 : 400 }}>
                  {p.name} {p.isHost && `(${t('host_lbl')})`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Host controls */}
        {isHost && (
          <>
            <PlaylistSelector
              playlists={playlists}
              selectedIds={selectedPlaylistIds}
              onToggle={id => {
                const next = new Set(selectedPlaylistIds);
                next.has(id) ? next.delete(id) : next.add(id);
                setSelectedPlaylistIds(next);
              }}
            />

            {/* Song count — wheel picker matches the regular multiplayer UX */}
            <div>
              <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
                כמות השירים במשחק
              </div>
              <OptionPicker options={ROUND_COUNT_OPTIONS} value={songCount} onChange={setSongCount} />
            </div>

            {/* Timer */}
            <div>
              <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>{t('timer_lbl')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {TIMER_OPTIONS.map(sec => (
                  <button key={sec} onClick={() => setTimerSec(sec)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 13, fontWeight: 700,
                    background: timerSec === sec ? '#007ACC' : '#2d2d30',
                    color: timerSec === sec ? '#fff' : '#888',
                    border: `1.5px solid ${timerSec === sec ? '#007ACC' : '#3a3a3a'}`,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>{sec === 0 ? t('none') : `${sec}s`}</button>
                ))}
              </div>
            </div>

            {error && <p style={{ color: '#ff6b6b', textAlign: 'center', fontSize: 13, margin: 0 }}>{error}</p>}

            <button
              onClick={handleStart}
              disabled={loading || selectedPlaylistIds.size === 0}
              style={{ ...primaryBtn, opacity: selectedPlaylistIds.size === 0 ? 0.5 : 1 }}
            >
              {loading ? t('loading_songs') : t('start_game')}
            </button>
          </>
        )}

        {!isHost && (
          <p style={{ textAlign: 'center', color: '#666', fontSize: 14 }}>{t('waiting_host')}</p>
        )}
      </div>
    </div>
  );

  // ── Phase: playing ─────────────────────────────────────────────────────────
  if (phase === 'playing') {
    // Year button state: correct if that year was matched, disabled if no active card
    const claimedYears = new Set(Object.values(claims).map(c => String(c.year)));

    return (
      <div style={{ ...shell, direction: dir }}>
        <audio ref={audioRef} preload="auto" />

        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0,
        }}>
          <button onClick={() => { audioRef.current?.pause(); setPhase('round_end'); }}
            style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', padding: 0 }}>
            ⌂
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>📅 {t('ygm_game')}</div>
            <div style={{ color: '#888', fontSize: 11 }}>{t('yg_round')} {roundNum}/{totalRounds}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(isHost || user?.role === 'admin') && (
              <button onClick={() => socketRef.current?.emit('ygm:host_reveal')}
                style={{ background: '#2d2d30', border: '1px solid #3a3a3a', color: '#ff9933', borderRadius: 8, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
                {t('ygm_end_round')}
              </button>
            )}
          </div>
        </div>

        {/* Scoreboard strip */}
        <ScoreStrip players={players} mySocketId={mySocketId} />

        {/* Timer bar */}
        {roundTimerSec > 0 && (
          <div style={{ padding: '4px 0', flexShrink: 0 }}>
            <TimerBar seconds={roundTimerSec} songId={roundNum} onExpire={handleTimerExpire} />
          </div>
        )}

        {/* Game area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 14px 28px', overflowY: 'auto' }}>

          {/* Instruction + favorite button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <p style={{ color: '#555', fontSize: 11, margin: 0 }}>
              {activeSongId ? t('yg_pick_year') : t('yg_tap_card')}
            </p>
            {activeSongId && (() => {
              const s = roundSongs.find(rs => rs.id === activeSongId);
              if (!s) return null;
              const fav = favoriteIds.has(s.id);
              return (
                <button
                  onClick={() => toggleFavorite({
                    id: s.id,
                    filePath: s.filePath || s.audioUrl || '',
                    title: s.title || '',
                    artist: s.artist || '',
                    year: s.year || '',
                  })}
                  title={fav ? 'הסרה מהמועדפים' : 'הוספה למועדפים'}
                  style={{
                    background: fav ? '#dc354522' : 'transparent',
                    color: fav ? '#ff6b6b' : '#888',
                    border: `1px solid ${fav ? '#dc3545' : '#444'}`,
                    borderRadius: 8, padding: '2px 8px', fontSize: 12, cursor: 'pointer',
                  }}
                >{fav ? '💔' : '❤️'}</button>
              );
            })()}
          </div>

          {/* Year buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {yearOptions.map(year => (
              <YearButton
                key={year}
                year={year}
                state={claimedYears.has(String(year)) ? 'correct' : (!activeSongId ? 'disabled' : 'idle')}
                onClick={handleYearClick}
              />
            ))}
          </div>

          {/* Song cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {roundSongs.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isActive={song.id === activeSongId}
                claimed={claims[song.id] || null}
                isWrong={wrongSongs.has(song.id)}
                isMine={claims[song.id]?.socketId === mySocketId}
                roundEndInfo={null}
                onClick={handleCardClick}
              />
            ))}
          </div>

          {/* Host +30s / End game */}
          {(isHost || user?.role === 'admin') && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={handleSeek} style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#2d2d30', color: '#ccc', border: '1px solid #3a3a3a', fontSize: 13, cursor: 'pointer' }}>
                +30s
              </button>
              {isHost && (
                <button onClick={() => socketRef.current?.emit('ygm:end_game')}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#2d2d30', color: '#888', border: '1px solid #3a3a3a', fontSize: 13, cursor: 'pointer' }}>
                  {t('yg_finish')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: round_end ───────────────────────────────────────────────────────
  if (phase === 'round_end') {
    const displayPlayers = roundEndPlayers.length ? roundEndPlayers : players;

    return (
      <div style={{ ...shell, direction: dir }}>
        <audio ref={audioRef} preload="auto" />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>📋 {t('ygm_round_end')}</div>
          <div style={{ color: '#888', fontSize: 11 }}>{t('yg_round')} {roundNum}/{totalRounds}</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Round song results */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {roundEndSongs.map(info => {
              const claim = claims[info.id];
              const isMine = claim?.socketId === mySocketId;
              return (
                <SongCard
                  key={info.id}
                  song={info}
                  isActive={false}
                  claimed={claim || null}
                  isWrong={false}
                  isMine={isMine}
                  roundEndInfo={info}
                  onClick={() => {}}
                />
              );
            })}
          </div>

          {/* Score deltas */}
          <div style={{ background: '#2d2d30', borderRadius: 14, padding: 12 }}>
            <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>{t('ygm_leaderboard')}</div>
            {displayPlayers.map((p, i) => (
              <div key={p.socketId} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 0', borderBottom: i < displayPlayers.length - 1 ? '1px solid #3a3a3a' : 'none',
              }}>
                <span style={{ color: '#555', fontSize: 13, width: 20, textAlign: 'center', flexShrink: 0 }}>
                  {i === 0 ? '👑' : `${i + 1}.`}
                </span>
                <AvatarCircle userId={p.userId} hasAvatar={p.userId ? undefined : false} name={p.name} size={26} />
                <span style={{ flex: 1, color: p.socketId === mySocketId ? '#007ACC' : '#ccc', fontSize: 13, fontWeight: 600 }}>
                  {p.name}
                </span>
                <span style={{ color: '#1db954', fontSize: 15, fontWeight: 900 }}>{p.score}</span>
              </div>
            ))}
          </div>

          {/* Controls */}
          {isHost ? (
            <button
              onClick={() => socketRef.current?.emit('ygm:host_next')}
              style={{ ...primaryBtn, fontSize: 16 }}
            >
              {roundNum >= totalRounds ? t('yg_finish') : t('yg_next_round')}
            </button>
          ) : (
            <p style={{ textAlign: 'center', color: '#666', fontSize: 14 }}>{t('waiting_host')}</p>
          )}

          {isHost && (
            <button
              onClick={() => socketRef.current?.emit('ygm:end_game')}
              style={secondaryBtn}
            >
              {t('yg_finish')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: game_end ────────────────────────────────────────────────────────
  if (phase === 'game_end') {
    const winner = players[0];
    return (
      <div style={{ ...shell, direction: dir }}>
        {/* Hidden victory audio */}
        <audio ref={victoryAudioRef} preload="auto" />

        <TopBar onExit={onExit} title={`📅 ${t('ygm_game')}`} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Winner card */}
          {winner && (
            <div style={{
              background: 'linear-gradient(135deg, #1a2e1a 0%, #0d1f0d 100%)',
              border: '2px solid #1db954', borderRadius: 20,
              padding: '24px 16px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontSize: 40 }}>🏆</div>
              <AvatarCircle
                userId={winner.userId}
                hasAvatar={winner.userId ? undefined : false}
                name={winner.name}
                size={90}
                style={{ border: '3px solid #1db954' }}
              />
              <div style={{ color: '#1db954', fontSize: 22, fontWeight: 900 }}>{winner.name}</div>
              <div style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>
                {winner.score} <span style={{ color: '#555', fontSize: 16, fontWeight: 400 }}>{t('points')}</span>
              </div>
            </div>
          )}

          {/* Full leaderboard */}
          <div style={{ background: '#2d2d30', borderRadius: 16, padding: 16 }}>
            <div style={{ color: '#888', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{t('ygm_leaderboard')}</div>
            {players.map((p, i) => (
              <div key={p.socketId} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: i < players.length - 1 ? '1px solid #3a3a3a' : 'none',
              }}>
                <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                </span>
                <AvatarCircle userId={p.userId} hasAvatar={p.userId ? undefined : false} name={p.name} size={32} />
                <span style={{ flex: 1, color: p.socketId === mySocketId ? '#007ACC' : '#fff', fontSize: 15, fontWeight: p.socketId === mySocketId ? 700 : 400 }}>
                  {p.name} {p.socketId === mySocketId && `(${t('ygm_you')})`}
                </span>
                <span style={{ color: '#1db954', fontSize: 18, fontWeight: 900 }}>{p.score}</span>
                <span style={{ color: '#555', fontSize: 12 }}>{t('points')}</span>
              </div>
            ))}
          </div>

          {isHost && (
            <button onClick={() => {
              victoryAudioRef.current?.pause();
              setVictoryAudioUrl('');
              setPhase('lobby');
              setPlayers(prev => prev.map(p => ({ ...p, score: 0 })));
            }} style={primaryBtn}>
              {t('play_again')}
            </button>
          )}
          <button onClick={() => { victoryAudioRef.current?.pause(); onExit(); }} style={secondaryBtn}>{t('back')}</button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function TopBar({ onExit, title }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0,
    }}>
      <button onClick={onExit} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0 }}>⌂</button>
      <span style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>{title}</span>
      <div style={{ width: 24 }} />
    </div>
  );
}

const shell = { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' };
const primaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: '#ccc', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
