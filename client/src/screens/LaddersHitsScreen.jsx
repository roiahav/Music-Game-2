/**
 * סולמות ולהיטים — Phases 1-2.
 *
 * Phase 1: lobby (create/join, avatar pick, host configures mode + timer +
 * playlists + song count).
 * Phase 2: round mechanics — host clicks "התחל משחק"; everyone hears the
 * audio; players type/pick the artist or year; first correct answer wins
 * the round; host can reveal/skip; final score table at the end.
 *
 * Phase 3 will add the dice + 100-square board (round winner rolls); phase
 * 4 will add the victory screen with photo + winner song.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { Figurine, FIGURINE_OPTIONS } from '../components/Figurine.jsx';
import { useFavorites } from '../hooks/useFavorites.js';
import SnakeLadderBoard from '../components/SnakeLadderBoard.jsx';
import DiceRoller from '../components/DiceRoller.jsx';
import CastButton from '../components/CastButton.jsx';
import { useMultiplayerSocket } from '../hooks/useMultiplayerSocket.js';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#d35400', '#16a085', '#c0392b', '#8e44ad'];

export default function LaddersHitsScreen({ onExit }) {
  const { user } = useAuthStore();
  const { playlists } = useSettingsStore();
  const { favoriteIds, toggle: toggleFavorite } = useFavorites();

  // Mode: choose to host or join from the entry screen
  const [view, setView] = useState('entry');   // 'entry' | 'lobby' | 'playing' | 'done'
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  // Room state — populated from lh:room_update / lh:created / lh:joined
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const { socket, connected, mySocketId } = useMultiplayerSocket();

  // Phase 2 — round state
  const [autocomplete, setAutocomplete] = useState({ artists: [] });
  const [currentSong, setCurrentSong] = useState(null);  // { songId, audioUrl, index, total, timerSec }
  const [roundEnd, setRoundEnd] = useState(null);        // { correct, winnerSocketId, players, coverUrl, isLastRound, songId }
  const [endResult, setEndResult] = useState(null);      // { players, winnerSocketId, victoryAudioUrl }
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wrongShake, setWrongShake] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(null);

  // Phase 3 — dice + board
  const [dicePhase, setDicePhase] = useState(null);     // null | 'spinning' | 'moving' | 'ladder' | 'done'
  const [diceData, setDiceData]   = useState(null);     // payload from lh:dice_rolled

  const audioRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const dicePhaseTimers = useRef([]);

  // The shared multiplayer socket is wired (connect/banner/cleanup) by
  // useMultiplayerSocket above. This effect only attaches lh:* listeners.
  useEffect(() => {
    const s = socket;

    function onCreated({ code, room }) {
      setRoom(room);
      setIsHost(true);
      setView('lobby');
      setError('');
    }
    function onJoined({ room }) {
      setRoom(room);
      setIsHost(false);
      setView('lobby');
      setError('');
    }
    function onRoomUpdate({ room }) {
      setRoom(room);
      // Host status may change if the original host disconnected
      if (room && room.hostSocketId === s.id) {
        setIsHost(true);
      }
    }
    function onError({ message }) {
      setError(message || 'שגיאה');
    }

    function onStarted({ autocomplete: ac }) {
      setAutocomplete(ac || { artists: [] });
      setView('playing');
      setEndResult(null);
      setRoundEnd(null);
      setError('');
    }
    function onSong(song) {
      setCurrentSong(song);
      setRoundEnd(null);
      setAnswer('');
      setSubmitting(false);
      // Clear any leftover dice/animation state from the previous round
      clearDiceTimers();
      setDicePhase(null);
      setDiceData(null);
      // Auto-play
      setTimeout(() => {
        if (audioRef.current && song.audioUrl) {
          audioRef.current.src = song.audioUrl;
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
        }
      }, 50);
      // Start countdown if there's a timer
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      if (song.timerSec > 0) {
        setSecondsLeft(song.timerSec);
        const startedAt = Date.now();
        timerIntervalRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          const left = Math.max(0, song.timerSec - elapsed);
          setSecondsLeft(left);
          if (left <= 0) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
        }, 250);
      } else {
        setSecondsLeft(null);
      }
    }
    function onWrong() {
      setSubmitting(false);
      setWrongShake(n => n + 1);
    }
    function onRoundEnd(payload) {
      setRoundEnd(payload);
      // Update room players (scores changed)
      setRoom(r => r ? { ...r, players: payload.players || r.players } : r);
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      setSecondsLeft(null);
      setSubmitting(false);
      // Pause audio (we'll let host decide when to advance)
      if (audioRef.current) try { audioRef.current.pause(); } catch {}
    }
    function clearDiceTimers() {
      for (const t of dicePhaseTimers.current) clearTimeout(t);
      dicePhaseTimers.current = [];
    }

    function onDiceRolled(payload) {
      // payload = { byPlayerSocketId, value, fromPosition, intermediate, finalPosition, effect, players, gameOver }
      clearDiceTimers();
      setDiceData(payload);
      setDicePhase('spinning');
      // After dice settles (1.4s) → move to intermediate
      dicePhaseTimers.current.push(setTimeout(() => {
        setDicePhase('moving');
      }, 1500));
      // If a ladder/slide hit, schedule the final-position move
      if (payload.effect) {
        dicePhaseTimers.current.push(setTimeout(() => {
          setDicePhase('ladder');
        }, 1500 + 700));
      }
      // After everything settled, sync to server truth (clear override)
      const totalMs = 1500 + 700 + (payload.effect ? 800 : 0);
      dicePhaseTimers.current.push(setTimeout(() => {
        setDicePhase('done');
        // Update room players with the post-move positions from the server
        setRoom(r => r ? { ...r, players: payload.players || r.players } : r);
      }, totalMs));
    }

    function onEnded(payload) {
      setEndResult(payload);
      setView('done');
      setRoundEnd(null);
      setCurrentSong(null);
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
      // Play victory song if provided
      setTimeout(() => {
        if (audioRef.current && payload.victoryAudioUrl) {
          audioRef.current.src = payload.victoryAudioUrl;
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
        }
      }, 100);
    }

    s.on('lh:created', onCreated);
    s.on('lh:joined', onJoined);
    s.on('lh:room_update', onRoomUpdate);
    s.on('lh:error', onError);
    s.on('lh:started', onStarted);
    s.on('lh:song', onSong);
    s.on('lh:wrong', onWrong);
    s.on('lh:round_end', onRoundEnd);
    s.on('lh:dice_rolled', onDiceRolled);
    s.on('lh:ended', onEnded);

    return () => {
      s.off('lh:created', onCreated);
      s.off('lh:joined', onJoined);
      s.off('lh:room_update', onRoomUpdate);
      s.off('lh:error', onError);
      s.off('lh:started', onStarted);
      s.off('lh:song', onSong);
      s.off('lh:wrong', onWrong);
      s.off('lh:round_end', onRoundEnd);
      s.off('lh:dice_rolled', onDiceRolled);
      s.off('lh:ended', onEnded);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      clearDiceTimers();
      // Tell the server we're leaving when the screen unmounts
      try { s.emit('lh:leave'); } catch {}
    };
  }, [socket]); // eslint-disable-line

  function handleCreate() {
    setError('');
    socket.emit('lh:create', { name: user?.name || user?.username || 'אורח', userId: user?.id });
  }

  function handleJoin() {
    setError('');
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('יש להזין קוד חדר'); return; }
    socket.emit('lh:join', { code, name: user?.name || user?.username || 'אורח', userId: user?.id });
  }

  function handleSetAvatar(figurineId, color) {
    socket.emit('lh:set_avatar', { figurineId, color });
  }

  function handleSetConfig(patch) {
    socket.emit('lh:set_config', patch);
  }

  function handleLeaveRoom() {
    try { socket.emit('lh:leave'); } catch {}
    if (audioRef.current) try { audioRef.current.pause(); } catch {}
    setRoom(null);
    setIsHost(false);
    setView('entry');
    setCurrentSong(null);
    setRoundEnd(null);
    setEndResult(null);
  }

  function handleSubmitAnswer() {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    socket.emit('lh:answer', { value: answer.trim() });
  }

  // ── Entry view: create or join ─────────────────────────────────────────
  if (view === 'entry') {
    return (
      <div style={shellStyle}>
        <Header title="🎲 סולמות ולהיטים" onExit={onExit} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 20, alignItems: 'stretch' }}>
          <button onClick={handleCreate} style={primaryBtn}>צור חדר חדש</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#888', fontSize: 13 }}>
            <div style={{ flex: 1, height: 1, background: '#2d2d30' }} />
            <span>או הצטרף לחדר קיים</span>
            <div style={{ flex: 1, height: 1, background: '#2d2d30' }} />
          </div>

          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={4}
            style={{ ...inputStyle, fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: 800 }}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
          />
          <button onClick={handleJoin} disabled={joinCode.trim().length !== 4} style={{ ...secondaryBtn, opacity: joinCode.trim().length !== 4 ? 0.5 : 1 }}>
            הצטרף
          </button>

          {error && <div style={errBox}>{error}</div>}

          <div style={{ marginTop: 'auto', color: '#666', fontSize: 11, lineHeight: 1.6 }}>
            🎮 משחק קבוצתי על לוח בסגנון "סולמות ונחשים". המארח בוחר מצב משחק
            (זיהוי זמר / זיהוי שנה), טיימר ופלייליסט. מהיר ראשון בכל סבב מטיל
            קובייה ומתקדם על הלוח. הראשון לסיים את 100 הצעדים — מנצח.
          </div>
        </div>
      </div>
    );
  }

  // ── Lobby view ─────────────────────────────────────────────────────────
  if (view === 'lobby' && room) {
    const me = room.players.find(p => p.socketId === mySocketId);
    const myAvatar = me?.avatar || { figurineId: 'mic', color: COLORS[0] };

    return (
      <div style={shellStyle}>
        <Header title={`🎲 חדר ${room.code}`} onExit={() => { handleLeaveRoom(); onExit(); }} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Room code + copy */}
          <div style={{ background: '#1e1e1e', border: '1px solid #2d2d30', borderRadius: 12, padding: 14, textAlign: 'center' }}>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>קוד חדר — שתף עם השחקנים</div>
            <button
              onClick={() => navigator.clipboard?.writeText(room.code)}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 32, fontWeight: 900, letterSpacing: 8, cursor: 'pointer' }}
              title="הקלק להעתקה"
            >
              {room.code}
            </button>
          </div>

          {/* Players list */}
          <div>
            <div style={sectionTitle}>שחקנים ({room.players.length})</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-start', padding: '4px 0' }}>
              {room.players.map(p => (
                <div key={p.socketId} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: '#1e1e1e', border: `2px solid ${p.socketId === mySocketId ? 'var(--accent)' : '#2d2d30'}`,
                  borderRadius: 12, padding: '6px 8px', minWidth: 70,
                }}>
                  <Figurine figurineId={p.avatar?.figurineId} color={p.avatar?.color} size={42} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginTop: 2, textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}{p.isHost ? ' 👑' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Avatar picker — only for the current user */}
          <div>
            <div style={sectionTitle}>בחר אווטאר</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {FIGURINE_OPTIONS.map(fid => (
                <button
                  key={fid}
                  onClick={() => handleSetAvatar(fid, myAvatar.color)}
                  style={{
                    flexShrink: 0, background: myAvatar.figurineId === fid ? 'var(--accent-alpha)' : '#1e1e1e',
                    border: `2px solid ${myAvatar.figurineId === fid ? 'var(--accent)' : '#2d2d30'}`,
                    borderRadius: 10, padding: 4, cursor: 'pointer',
                  }}
                >
                  <Figurine figurineId={fid} color={myAvatar.color} size={36} />
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {COLORS.map(c => {
                const taken = room.players.some(p => p.socketId !== mySocketId && p.avatar?.figurineId === myAvatar.figurineId && p.avatar?.color === c);
                return (
                  <button
                    key={c}
                    onClick={() => !taken && handleSetAvatar(myAvatar.figurineId, c)}
                    disabled={taken}
                    title={taken ? 'תפוס' : c}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      border: myAvatar.color === c ? '3px solid #fff' : '2px solid #1a1a1a',
                      cursor: taken ? 'not-allowed' : 'pointer',
                      opacity: taken ? 0.3 : 1,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Host controls — mode, timer, playlist */}
          {isHost && (
            <div style={{ background: '#1e1e1e', border: '1px solid #2d2d30', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={sectionTitle}>הגדרות המארח</div>

              {/* Mode */}
              <div>
                <div style={fieldLabel}>מצב משחק</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ModeButton active={room.mode === 'artist'} onClick={() => handleSetConfig({ mode: 'artist' })}>
                    🎤 זיהוי זמר
                  </ModeButton>
                  <ModeButton active={room.mode === 'year'} onClick={() => handleSetConfig({ mode: 'year' })}>
                    📅 זיהוי שנה
                  </ModeButton>
                </div>
              </div>

              {/* Timer */}
              <div>
                <div style={fieldLabel}>טיימר ({room.timerSec === 0 ? 'ללא' : `${room.timerSec} שניות`})</div>
                <input
                  type="range"
                  min={0} max={120} step={5}
                  value={room.timerSec}
                  onChange={e => handleSetConfig({ timerSec: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Playlists */}
              <div>
                <div style={fieldLabel}>פלייליסטים ({room.playlistIds.length} נבחרו)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {(playlists || []).map(p => {
                    const checked = room.playlistIds.includes(p.id);
                    return (
                      <label key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                        background: checked ? 'var(--accent-alpha)' : '#0f0f12',
                        border: `1px solid ${checked ? 'var(--accent)' : '#2d2d30'}`,
                        borderRadius: 8, cursor: 'pointer', fontSize: 13,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? room.playlistIds.filter(x => x !== p.id) : [...room.playlistIds, p.id];
                            handleSetConfig({ playlistIds: next });
                          }}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <span>{p.type === 'spotify' ? '🎧' : '🎵'} {p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Song count */}
              <div>
                <div style={fieldLabel}>מספר שירים ({room.songCount || 10})</div>
                <input
                  type="range"
                  min={3} max={50} step={1}
                  value={room.songCount || 10}
                  onChange={e => handleSetConfig({ songCount: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </div>

              <button
                disabled={room.playlistIds.length === 0}
                style={{ ...primaryBtn, opacity: (room.playlistIds.length === 0) ? 0.4 : 1 }}
                title={room.playlistIds.length === 0 ? 'בחר לפחות פלייליסט אחד' : 'התחל משחק'}
                onClick={() => socket.emit('lh:start')}
              >
                ▶ התחל משחק
              </button>
            </div>
          )}

          {!isHost && (
            <div style={{ background: '#1e1e1e', border: '1px solid #2d2d30', borderRadius: 12, padding: 12, color: '#888', fontSize: 13, textAlign: 'center' }}>
              ממתינים שהמארח יתחיל את המשחק…
            </div>
          )}

          {error && <div style={errBox}>{error}</div>}
        </div>
      </div>
    );
  }

  // ── Playing view ───────────────────────────────────────────────────────
  if (view === 'playing' && room && currentSong) {
    const me = room.players.find(p => p.socketId === mySocketId);
    const winner = roundEnd ? room.players.find(p => p.socketId === roundEnd.winnerSocketId) : null;
    const songForFav = roundEnd ? {
      id: roundEnd.songId,
      title: roundEnd.correct?.title,
      artist: roundEnd.correct?.artist,
      year: roundEnd.correct?.year,
      audioUrl: currentSong.audioUrl,
    } : {
      id: currentSong.songId,
      audioUrl: currentSong.audioUrl,
    };
    const isFavorited = songForFav.id && favoriteIds.has(songForFav.id);

    return (
      <div style={shellStyle}>
        <Header title={`🎲 סבב ${currentSong.index}/${currentSong.total}`} onExit={() => { handleLeaveRoom(); onExit(); }} />
        <audio ref={audioRef} preload="auto" />

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Score strip */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {[...room.players].sort((a, b) => (b.score || 0) - (a.score || 0)).map(p => (
              <div key={p.socketId} style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: p.socketId === mySocketId ? 'var(--accent-alpha)' : '#1e1e1e',
                border: `1px solid ${p.socketId === mySocketId ? 'var(--accent)' : '#2d2d30'}`,
                borderRadius: 10, padding: '4px 8px', minWidth: 56,
              }}>
                <Figurine figurineId={p.avatar?.figurineId} color={p.avatar?.color} size={32} />
                <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{p.score || 0}</div>
              </div>
            ))}
          </div>

          {/* Board — always visible during play */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SnakeLadderBoard
              size={Math.min(360, typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 360) : 360)}
              players={room.players.map(p => ({
                ...p,
                position: effectivePosition(p, diceData, dicePhase),
              }))}
              highlightSocketId={diceData?.byPlayerSocketId}
            />
          </div>

          {/* Dice spin / cover — dice replaces cover when a roll is in flight */}
          {(dicePhase && dicePhase !== 'done' && diceData) ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <DiceRoller value={diceData.value} size={88} />
              {dicePhase !== 'spinning' && (
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>
                  🎲 הוטל: <span style={{ color: 'var(--accent)' }}>{diceData.value}</span>
                  {diceData.effect === 'ladder' && dicePhase === 'ladder' && <span style={{ color: '#1db954' }}> 🎹 +סולם!</span>}
                  {diceData.effect === 'slide'  && dicePhase === 'ladder' && <span style={{ color: '#dc3545' }}> 🎷 גלישה!</span>}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 'min(140px, 40vw)', aspectRatio: '1 / 1', borderRadius: 16,
                background: 'linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%)',
                border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {roundEnd?.coverUrl ? (
                  <img src={roundEnd.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 48, opacity: 0.5 }}>🎵</span>
                )}
              </div>
            </div>
          )}

          {/* Audio + favourites + timer */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => {
                const a = audioRef.current; if (!a) return;
                if (a.paused) a.play().catch(() => {}); else a.pause();
              }}
              style={{ flex: 1, height: 46, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 22, cursor: 'pointer' }}
            >
              ▶ / ⏸
            </button>
            <button
              onClick={() => { const a = audioRef.current; if (a) a.currentTime = Math.min(a.duration || 0, (a.currentTime || 0) + 30); }}
              style={{ flex: 1, height: 46, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              +30s
            </button>
            <button
              onClick={() => songForFav.id && toggleFavorite(songForFav)}
              disabled={!songForFav.id}
              title={isFavorited ? 'הסרה מהמועדפים' : 'הוספה למועדפים'}
              style={{
                width: 56, height: 46,
                background: isFavorited ? '#dc354522' : 'var(--bg2)',
                color: isFavorited ? '#ff6b6b' : 'var(--text)',
                border: `1px solid ${isFavorited ? '#dc3545' : 'var(--border)'}`,
                borderRadius: 12, fontSize: 22, cursor: songForFav.id ? 'pointer' : 'not-allowed', flexShrink: 0,
              }}
            >
              {isFavorited ? '💔' : '❤️'}
            </button>
            <CastButton audioRef={audioRef} />
          </div>

          {/* Timer bar */}
          {secondsLeft !== null && !roundEnd && (
            <div style={{ background: '#1a1a1a', borderRadius: 6, height: 8, overflow: 'hidden', border: '1px solid #2d2d30' }}>
              <div style={{
                width: `${(secondsLeft / (currentSong.timerSec || 1)) * 100}%`,
                height: '100%',
                background: secondsLeft < 5 ? '#dc3545' : 'var(--accent)',
                transition: 'width 0.25s linear, background 0.2s',
              }} />
            </div>
          )}

          {/* Round-end overlay */}
          {roundEnd ? (
            <div style={{
              background: '#1e1e1e', border: `2px solid ${winner ? '#1db954' : '#3a3a3a'}`,
              borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center',
            }}>
              {winner ? (
                <>
                  <div style={{ fontSize: 11, color: '#888', fontWeight: 700 }}>מנצח/ת הסבב</div>
                  <Figurine figurineId={winner.avatar?.figurineId} color={winner.avatar?.color} size={56} label={winner.name} />
                </>
              ) : (
                <div style={{ color: '#aaa', fontSize: 13 }}>הסבב הסתיים בלי מנצח</div>
              )}
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{roundEnd.correct?.title}</div>
                <div style={{ fontSize: 14, color: '#1db954', fontWeight: 700 }}>{roundEnd.correct?.artist}</div>
                <div style={{ fontSize: 13, color: '#aaa' }}>{roundEnd.correct?.year}</div>
              </div>
              {/* Dice trigger — round winner can roll once */}
              {(() => {
                const iAmRoundWinner = roundEnd.winnerSocketId === mySocketId;
                const diceAlreadyRolled = !!diceData;
                const diceComplete = dicePhase === 'done';
                if (roundEnd.winnerSocketId && !diceAlreadyRolled && iAmRoundWinner) {
                  return (
                    <button
                      onClick={() => socket.emit('lh:roll_dice')}
                      style={{ ...primaryBtn, marginTop: 6, fontSize: 18 }}
                    >
                      🎲 הטל קובייה
                    </button>
                  );
                }
                if (roundEnd.winnerSocketId && !diceAlreadyRolled && !iAmRoundWinner) {
                  return <div style={{ color: '#888', fontSize: 12 }}>ממתינים שהמנצח/ת יטיל/תטיל קובייה…</div>;
                }
                if (diceAlreadyRolled && !diceComplete) {
                  return null; // animation in flight
                }
                // Dice done OR no winner this round → host advances
                if (isHost) {
                  return (
                    <button
                      onClick={() => socket.emit('lh:host_next')}
                      style={{ ...primaryBtn, marginTop: 6 }}
                    >
                      {roundEnd.isLastRound ? '🏁 סיים משחק' : '⏭ הסבב הבא'}
                    </button>
                  );
                }
                return <div style={{ color: '#888', fontSize: 12 }}>מחכים שהמארח יתקדם…</div>;
              })()}
            </div>
          ) : (
            <>
              {/* Answer input — artist or year */}
              {room.mode === 'artist' ? (
                <ArtistAnswer
                  value={answer}
                  onChange={setAnswer}
                  onSubmit={handleSubmitAnswer}
                  suggestions={autocomplete.artists}
                  disabled={submitting}
                  shake={wrongShake}
                />
              ) : (
                <YearAnswer
                  value={answer}
                  onChange={setAnswer}
                  onSubmit={handleSubmitAnswer}
                  disabled={submitting}
                  shake={wrongShake}
                />
              )}
              {isHost && (
                <button
                  onClick={() => socket.emit('lh:host_reveal')}
                  style={{ ...secondaryBtn, padding: '8px', fontSize: 13 }}
                >
                  גלה תשובה (דלג על הסבב)
                </button>
              )}
            </>
          )}

          {error && <div style={errBox}>{error}</div>}
        </div>
      </div>
    );
  }

  // ── Done view (game over) ─────────────────────────────────────────────
  if (view === 'done' && endResult) {
    const sorted = [...endResult.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const winner = sorted[0];
    return (
      <div style={shellStyle}>
        <Header title="🏆 סוף משחק" onExit={() => { handleLeaveRoom(); onExit(); }} />
        <audio ref={audioRef} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          {winner && (
            <>
              <div style={{ fontSize: 64 }}>🏆</div>
              <div style={{ fontSize: 13, color: '#888', fontWeight: 700 }}>הזוכ/ה</div>
              <Figurine figurineId={winner.avatar?.figurineId} color={winner.avatar?.color} size={96} label={winner.name} />
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)' }}>{winner.score} נקודות</div>
            </>
          )}

          <div style={{ width: '100%', background: '#1e1e1e', border: '1px solid #2d2d30', borderRadius: 12, padding: 12, marginTop: 12 }}>
            <div style={sectionTitle}>טבלת תוצאות</div>
            {sorted.map((p, i) => (
              <div key={p.socketId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                borderBottom: i < sorted.length - 1 ? '1px solid #2d2d30' : 'none',
              }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#888', width: 24, textAlign: 'center' }}>{i + 1}</span>
                <Figurine figurineId={p.avatar?.figurineId} color={p.avatar?.color} size={32} />
                <span style={{ flex: 1, fontWeight: 700, color: '#fff' }}>{p.name}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{p.score || 0}</span>
              </div>
            ))}
          </div>

          <button onClick={() => { handleLeaveRoom(); onExit(); }} style={{ ...secondaryBtn, marginTop: 8 }}>
            🏠 חזרה לדף הראשי
          </button>
        </div>
      </div>
    );
  }

  // Loading state between create/join request and the response
  return (
    <div style={shellStyle}>
      <Header title="🎲 סולמות ולהיטים" onExit={onExit} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
        מתחבר…
      </div>
    </div>
  );
}

// ── Position override during dice/move animation ────────────────────────
// While the rolling player's figurine is being animated through the
// dice→intermediate→final sequence, we override their position so the
// board moves them in stages rather than teleporting.
function effectivePosition(player, diceData, dicePhase) {
  if (!diceData || dicePhase === 'done' || dicePhase === null) return player.position || 0;
  if (player.socketId !== diceData.byPlayerSocketId) return player.position || 0;
  if (dicePhase === 'spinning') return diceData.fromPosition;
  if (dicePhase === 'moving')   return diceData.intermediate;
  if (dicePhase === 'ladder')   return diceData.finalPosition;
  return player.position || 0;
}

// ── Answer-input components ─────────────────────────────────────────────

function ArtistAnswer({ value, onChange, onSubmit, suggestions, disabled, shake }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        key={`shake-${shake}`}
        autoFocus
        list="lh-artist-suggestions"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
        placeholder="הזן את שם הזמר/אמן…"
        disabled={disabled}
        autoComplete="off"
        style={{
          ...inputStyle,
          fontSize: 16,
          animation: shake ? 'lh-shake 0.3s' : 'none',
          background: shake ? '#3a1010' : '#1e1e1e',
          border: shake ? '1px solid #dc3545' : '1px solid #2d2d30',
        }}
      />
      <datalist id="lh-artist-suggestions">
        {(suggestions || []).map(a => <option key={a} value={a} />)}
      </datalist>
      <button onClick={onSubmit} disabled={!value.trim() || disabled} style={{
        ...primaryBtn,
        opacity: (!value.trim() || disabled) ? 0.4 : 1,
      }}>
        ➤ שלח תשובה
      </button>
      <style>{`
        @keyframes lh-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}

function YearAnswer({ value, onChange, onSubmit, disabled, shake }) {
  const decades = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {decades.map(d => (
          <button
            key={d}
            onClick={() => { onChange(String(d)); }}
            disabled={disabled}
            style={{
              padding: '10px 4px', borderRadius: 10,
              background: value === String(d) ? 'var(--accent)' : '#1e1e1e',
              color: value === String(d) ? '#fff' : 'var(--text)',
              border: `1px solid ${value === String(d) ? 'var(--accent)' : '#2d2d30'}`,
              fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {d}s
          </button>
        ))}
      </div>
      <input
        key={`shake-${shake}`}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
        placeholder="או הזן שנה מדויקת (למשל 1985)"
        disabled={disabled}
        style={{
          ...inputStyle, fontSize: 16, textAlign: 'center', letterSpacing: 4, fontWeight: 800,
          animation: shake ? 'lh-shake 0.3s' : 'none',
          background: shake ? '#3a1010' : '#1e1e1e',
          border: shake ? '1px solid #dc3545' : '1px solid #2d2d30',
        }}
      />
      <button onClick={onSubmit} disabled={!value.trim() || disabled} style={{
        ...primaryBtn,
        opacity: (!value.trim() || disabled) ? 0.4 : 1,
      }}>
        ➤ שלח תשובה
      </button>
    </div>
  );
}


function Header({ title, onExit }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2d2d30', flexShrink: 0 }}>
      <button onClick={onExit} title="חזרה לדף הראשי" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', padding: 0 }}>🏠</button>
      <span style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>{title}</span>
      <div style={{ width: 24 }} />
    </div>
  );
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 8px', borderRadius: 10,
        background: active ? 'var(--accent)' : '#0f0f12',
        color: active ? '#fff' : 'var(--text)',
        border: `1px solid ${active ? 'var(--accent)' : '#2d2d30'}`,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const shellStyle = { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' };
const primaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: 12, background: '#1e1e1e', color: '#fff', border: '1px solid #2d2d30', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const errBox = { background: '#3a1010', color: '#ff6b6b', padding: 10, borderRadius: 8, fontSize: 13, border: '1px solid #5a1010' };
const sectionTitle = { fontSize: 12, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 };
const fieldLabel = { fontSize: 12, color: '#aaa', fontWeight: 700, marginBottom: 6 };
