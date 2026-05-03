/**
 * סולמות ולהיטים — Phase 1: lobby only.
 *
 * Players create or join a room, pick an avatar (figurine + colour), and
 * the host configures the game (mode, timer, playlist). The "התחל משחק"
 * button is wired but does not yet emit lh:start — that lands in Phase 2.
 */

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useSettingsStore } from '../store/settingsStore.js';
import { getSocket } from '../services/socket.js';
import { Figurine, FIGURINE_OPTIONS } from '../components/Figurine.jsx';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#d35400', '#16a085', '#c0392b', '#8e44ad'];

export default function LaddersHitsScreen({ onExit }) {
  const { user } = useAuthStore();
  const { playlists } = useSettingsStore();

  // Mode: choose to host or join from the entry screen
  const [view, setView] = useState('entry');   // 'entry' | 'lobby'
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  // Room state — populated from lh:room_update / lh:created / lh:joined
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [mySocketId, setMySocketId] = useState(null);

  const socketRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;
    if (!s.connected) s.connect();
    setMySocketId(s.id);

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
      if (room && socketRef.current && room.hostSocketId === socketRef.current.id) {
        setIsHost(true);
      }
    }
    function onError({ message }) {
      setError(message || 'שגיאה');
    }
    function onConnect() { setMySocketId(s.id); }

    s.on('connect', onConnect);
    s.on('lh:created', onCreated);
    s.on('lh:joined', onJoined);
    s.on('lh:room_update', onRoomUpdate);
    s.on('lh:error', onError);

    return () => {
      s.off('connect', onConnect);
      s.off('lh:created', onCreated);
      s.off('lh:joined', onJoined);
      s.off('lh:room_update', onRoomUpdate);
      s.off('lh:error', onError);
      // Tell the server we're leaving when the screen unmounts
      try { s.emit('lh:leave'); } catch {}
    };
  }, []);

  function handleCreate() {
    setError('');
    socketRef.current?.emit('lh:create', { name: user?.name || user?.username || 'אורח', userId: user?.id });
  }

  function handleJoin() {
    setError('');
    const code = joinCode.trim().toUpperCase();
    if (!code) { setError('יש להזין קוד חדר'); return; }
    socketRef.current?.emit('lh:join', { code, name: user?.name || user?.username || 'אורח', userId: user?.id });
  }

  function handleSetAvatar(figurineId, color) {
    socketRef.current?.emit('lh:set_avatar', { figurineId, color });
  }

  function handleSetConfig(patch) {
    socketRef.current?.emit('lh:set_config', patch);
  }

  function handleLeaveRoom() {
    try { socketRef.current?.emit('lh:leave'); } catch {}
    setRoom(null);
    setIsHost(false);
    setView('entry');
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

              <button
                disabled={room.playlistIds.length === 0 || room.players.length < 1}
                style={{ ...primaryBtn, opacity: (room.playlistIds.length === 0) ? 0.4 : 1 }}
                title={room.playlistIds.length === 0 ? 'בחר לפחות פלייליסט אחד' : 'התחל משחק (יוטמע בשלב הבא)'}
                onClick={() => setError('שלב 1: לובי בלבד. תחילת המשחק תיושם בעדכון הבא.')}
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
