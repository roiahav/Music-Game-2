import { useState, useRef, useEffect, useMemo } from 'react';
import { io as ioClient } from 'socket.io-client';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import { AvatarCircle } from '../App.jsx';
import { useLang } from '../i18n/useLang.js';

const SERVER = import.meta.env.VITE_SERVER_URL || '';
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const SONG_COUNT_OPTIONS = [
  { value: 5,  label: '5 שירים' },
  { value: 10, label: '10 שירים' },
  { value: 15, label: '15 שירים' },
  { value: 20, label: '20 שירים' },
  { value: 30, label: '30 שירים' },
  { value: 50, label: '50 שירים' },
];

// ─── Main component ─────────────────────────────────────────────────────────
export default function ChampionMultiplayerScreen({ onExit }) {
  const { dir } = useLang();
  const { user } = useAuthStore();
  const { playlists } = useSettingsStore();

  const [phase, setPhase] = useState('init'); // init | lobby | playing | reveal | done
  const [mode, setMode] = useState(null);     // 'create' | 'join'
  const [playerName, setPlayerName] = useState(user?.username || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // Lobby
  const [players, setPlayers] = useState([]);
  const [mySocketId, setMySocketId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [songCount, setSongCount] = useState(10);

  // Game
  const [autocomplete, setAutocomplete] = useState({ artists: [], titles: [] });
  const [currentSong, setCurrentSong] = useState(null);
  const [pickedArtist, setPickedArtist] = useState('');
  const [pickedTitle, setPickedTitle]   = useState('');
  const [pickedYear, setPickedYear]     = useState(null);
  const [picker, setPicker] = useState(null); // 'artist' | 'title' | 'year'
  const [submitted, setSubmitted] = useState(false);
  const [revealData, setRevealData] = useState(null); // { song, results }

  // Victory
  const [victoryAudioUrl, setVictoryAudioUrl] = useState('');
  const [victoryStartSeconds, setVictoryStartSeconds] = useState(0);

  const socketRef = useRef(null);
  const audioRef = useRef(null);
  const victoryRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const me = useMemo(() => players.find(p => p.socketId === mySocketId) || null, [players, mySocketId]);
  const isHost = me?.isHost;

  // Socket setup
  useEffect(() => {
    const socket = ioClient(SERVER, { transports: ['websocket'] });
    socketRef.current = socket;
    setMySocketId(socket.id || '');
    socket.on('connect', () => setMySocketId(socket.id));

    socket.on('champ:created', ({ code, players }) => {
      setRoomCode(code); setPlayers(players); setPhase('lobby');
    });
    socket.on('champ:joined', ({ code, players }) => {
      setRoomCode(code); setPlayers(players); setPhase('lobby');
    });
    socket.on('champ:room_update', ({ players, code }) => {
      setPlayers(players); if (code) setRoomCode(code);
    });
    socket.on('champ:started', ({ autocomplete }) => {
      setAutocomplete(autocomplete || { artists: [], titles: [] });
    });
    socket.on('champ:song', ({ songId, audioUrl, index, total }) => {
      setCurrentSong({ id: songId, audioUrl, index, total });
      setPickedArtist(''); setPickedTitle(''); setPickedYear(null);
      setSubmitted(false); setRevealData(null); setPicker(null);
      setPhase('playing');
      // Auto-play
      setTimeout(() => {
        const a = audioRef.current;
        if (!a || !audioUrl) return;
        a.src = audioUrl; a.load();
        a.play().catch(() => {});
      }, 50);
    });
    socket.on('champ:reveal', (data) => {
      audioRef.current?.pause();
      setRevealData(data);
      setPhase('reveal');
    });
    socket.on('champ:ended', ({ players, victoryAudioUrl: vUrl, victoryStartSeconds: vStart }) => {
      audioRef.current?.pause();
      setPlayers(players);
      if (vUrl) {
        setVictoryAudioUrl(vUrl);
        setVictoryStartSeconds(Number(vStart) || 0);
      }
      setPhase('done');
    });
    socket.on('champ:error', ({ message }) => setError(message));

    return () => socket.disconnect();
  }, []);

  // Victory audio playback
  useEffect(() => {
    if (victoryAudioUrl && victoryRef.current && phase === 'done') {
      const el = victoryRef.current;
      el.src = victoryAudioUrl; el.load();
      const onReady = () => {
        if (victoryStartSeconds > 0) try { el.currentTime = victoryStartSeconds; } catch {}
        el.play().catch(() => {});
        el.removeEventListener('loadedmetadata', onReady);
      };
      el.addEventListener('loadedmetadata', onReady);
    }
  }, [victoryAudioUrl, phase, victoryStartSeconds]);

  // Actions
  function handleCreate() {
    if (!playerName.trim()) return;
    socketRef.current?.emit('champ:create', { name: playerName.trim(), userId: user?.id });
  }
  function handleJoin() {
    if (!playerName.trim() || !code.trim()) return;
    socketRef.current?.emit('champ:join', { code: code.trim().toUpperCase(), name: playerName.trim(), userId: user?.id });
  }
  function startGame() {
    if (selectedPlaylistIds.size === 0) return setError('בחר פלייליסט');
    setError('');
    socketRef.current?.emit('champ:start', {
      playlistIds: [...selectedPlaylistIds],
      songCount,
    });
  }
  function handleSubmit() {
    if (submitted || !currentSong) return;
    socketRef.current?.emit('champ:submit', {
      artist: pickedArtist,
      title: pickedTitle,
      year: pickedYear,
    });
    setSubmitted(true);
    audioRef.current?.pause();
  }
  function nextSong() { socketRef.current?.emit('champ:next'); }
  function endNow()   { socketRef.current?.emit('champ:end'); }
  function togglePlayPause() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  // ─── INIT — pick create or join ───
  if (phase === 'init') {
    return (
      <div style={shell(dir)}>
        <TopBar onExit={onExit} title="🥇 אלוף הזיהויים — קבוצתי" />
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Rules */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: 15, fontWeight: 800 }}>איך משחקים?</h3>
            <ul style={{ margin: 0, padding: '0 18px 0 0', color: 'var(--text2)', fontSize: 13, lineHeight: 1.8 }}>
              <li>🎵 המנהל פותח חדר ובוחר פלייליסט וכמות שירים</li>
              <li>👥 שחקנים מצטרפים בקוד החדר</li>
              <li>🎧 כולם שומעים את אותו שיר באותו זמן</li>
              <li>✏️ כל שחקן בוחר זמר, שיר ושנה מהקוביות</li>
              <li>✅ נקודה לכל קובייה נכונה (3 לסיבוב מושלם)</li>
              <li>🏆 מי שצובר הכי הרבה נקודות — מנצח!</li>
            </ul>
          </div>

          <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="שמך" style={inputStyle} />

          {!mode ? (
            <>
              <button onClick={() => setMode('create')} style={primaryBtn}>🎮 פתח חדר חדש (מנהל)</button>
              <button onClick={() => setMode('join')} style={secondaryBtn}>🚪 הצטרף לחדר קיים</button>
            </>
          ) : mode === 'create' ? (
            <>
              <button onClick={handleCreate} disabled={!playerName.trim()} style={{ ...primaryBtn, opacity: !playerName.trim() ? 0.5 : 1 }}>
                🆕 צור חדר
              </button>
              <button onClick={() => setMode(null)} style={backBtn}>← חזור</button>
            </>
          ) : (
            <>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="קוד חדר" maxLength={4}
                style={{ ...inputStyle, fontSize: 24, letterSpacing: 6, textAlign: 'center', textTransform: 'uppercase' }} />
              <button onClick={handleJoin} disabled={!playerName.trim() || code.length < 4} style={{ ...primaryBtn, opacity: (!playerName.trim() || code.length < 4) ? 0.5 : 1 }}>
                🚪 הצטרף
              </button>
              <button onClick={() => setMode(null)} style={backBtn}>← חזור</button>
            </>
          )}

          {error && <div style={errorBox}>{error}</div>}
        </div>
      </div>
    );
  }

  // ─── LOBBY ───
  if (phase === 'lobby') {
    return (
      <div style={shell(dir)}>
        <TopBar onExit={onExit} title="🥇 אלוף הזיהויים — קבוצתי" right={`חדר: ${roomCode}`} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ textAlign: 'center', background: 'var(--accent-alpha)', border: '2px solid var(--accent)', borderRadius: 14, padding: '14px 12px' }}>
            <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700 }}>קוד החדר — שתף עם השחקנים</div>
            <div style={{ color: 'var(--accent)', fontSize: 36, fontWeight: 900, letterSpacing: 8, marginTop: 4 }}>{roomCode}</div>
          </div>

          {/* Players */}
          <div>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
              שחקנים ({players.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {players.map(p => (
                <div key={p.socketId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 10, border: p.isHost ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
                  <AvatarCircle userId={p.userId} name={p.name} size={32} />
                  <span style={{ color: 'var(--text)', fontWeight: 700, flex: 1 }}>{p.name}</span>
                  {p.isHost && <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 800 }}>👑 מנהל</span>}
                </div>
              ))}
            </div>
          </div>

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

              <div>
                <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 8, fontWeight: 700 }}>כמות שירים במשחק</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {SONG_COUNT_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setSongCount(o.value)} style={{
                      padding: '10px 0', borderRadius: 10,
                      background: songCount === o.value ? 'var(--accent)' : 'var(--bg2)',
                      color: songCount === o.value ? '#fff' : 'var(--text2)',
                      border: `1.5px solid ${songCount === o.value ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>{o.label}</button>
                  ))}
                </div>
              </div>

              <button onClick={startGame} disabled={players.length < 1} style={{ ...primaryBtn, fontSize: 16, padding: '14px' }}>
                ▶ התחל משחק
              </button>
            </>
          )}
          {!isHost && (
            <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 20, background: 'var(--bg2)', borderRadius: 12 }}>
              ⏳ ממתין שהמנהל יתחיל...
            </div>
          )}
          {error && <div style={errorBox}>{error}</div>}
        </div>
      </div>
    );
  }

  // ─── PLAYING ───
  if (phase === 'playing' && currentSong) {
    return (
      <div style={shell(dir)}>
        <TopBar onExit={onExit} title="🥇 אלוף הזיהויים" right={`${currentSong.index}/${currentSong.total} · ⭐ ${me?.score || 0}`} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Hidden cover during play */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 'min(120px, 30vw)', aspectRatio: '1 / 1', borderRadius: 16, background: 'linear-gradient(135deg, #3a3a3a, #2a2a2a)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 42, opacity: 0.5 }}>🎵</span>
            </div>
          </div>

          {/* Audio controls — host only (so all players hear together via host) */}
          {!isHost && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={togglePlayPause} style={{ flex: 1, height: 44, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 22, cursor: 'pointer' }}>
                {audioPlaying ? '⏸' : '▶'}
              </button>
            </div>
          )}

          {submitted ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 12, padding: 14, textAlign: 'center', color: 'var(--text)' }}>
              ✅ תשובתך נשלחה! ממתין לשחקנים אחרים...
              <div style={{ marginTop: 8, color: 'var(--text2)', fontSize: 12 }}>
                {players.filter(p => p.submitted && !p.isHost).length}/{players.filter(p => !p.isHost).length} סיימו
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SelectBox label="🎤 זמר"  value={pickedArtist} onClick={() => setPicker('artist')} />
              <SelectBox label="🎵 שיר"  value={pickedTitle}  onClick={() => setPicker('title')} />
              <SelectBox label="📅 שנה"  value={pickedYear || ''} onClick={() => setPicker('year')} />
              <button
                onClick={handleSubmit}
                style={{
                  background: '#1db954', color: '#000', border: 'none', borderRadius: 14,
                  fontSize: 15, fontWeight: 900, cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(29, 185, 84, 0.4)',
                  padding: '16px 12px',
                }}
              >
                ✓ שלח<br/>תשובות
              </button>
            </div>
          )}

          {/* Score strip */}
          <div style={{ marginTop: 4 }}>
            <div style={{ color: 'var(--text2)', fontSize: 11, textAlign: 'center', marginBottom: 4 }}>טבלה</div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              {players.map(p => (
                <div key={p.socketId} style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, background: p.socketId === mySocketId ? 'var(--accent-alpha)' : 'var(--bg2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>
                  {p.submitted && '✓ '}{p.name}: <strong>{p.score}</strong>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <button onClick={() => socketRef.current?.emit('champ:reveal')} style={secondaryBtn}>
              💡 חשוף תשובה (עוקף ממתינים)
            </button>
          )}
        </div>

        {/* Pickers */}
        {picker === 'artist' && <AutocompletePicker title="בחר זמר" options={autocomplete.artists} onSelect={v => { setPickedArtist(v); setPicker(null); }} onClose={() => setPicker(null)} />}
        {picker === 'title'  && <AutocompletePicker title="בחר שיר" options={autocomplete.titles}  onSelect={v => { setPickedTitle(v);  setPicker(null); }} onClose={() => setPicker(null)} />}
        {picker === 'year'   && <YearPickerModal onSelect={y => { setPickedYear(y); setPicker(null); }} onClose={() => setPicker(null)} />}

        <audio ref={audioRef} onPlay={() => setAudioPlaying(true)} onPause={() => setAudioPlaying(false)} onEnded={() => setAudioPlaying(false)} />
      </div>
    );
  }

  // ─── REVEAL ───
  if (phase === 'reveal' && revealData) {
    const myResult = revealData.results.find(r => r.socketId === mySocketId);
    const song = revealData.song;
    return (
      <div style={shell(dir)}>
        <TopBar onExit={onExit} title="🥇 תוצאת הסיבוב" />

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 'min(160px, 40vw)', aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden', background: 'var(--bg2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {song.coverUrl ? <img src={song.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 56 }}>🎵</span>}
            </div>
          </div>

          <div style={{ textAlign: 'center', background: 'var(--bg2)', borderRadius: 12, padding: 14 }}>
            <div style={{ color: 'var(--text)', fontSize: 18, fontWeight: 800 }}>{song.title}</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{song.artist} · {song.year}</div>
          </div>

          {myResult && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <ResultBox label="זמר" correct={myResult.correct.artist} myAnswer={myResult.submission.artist} truth={song.artist} />
              <ResultBox label="שיר" correct={myResult.correct.title}  myAnswer={myResult.submission.title}  truth={song.title} />
              <ResultBox label="שנה" correct={myResult.correct.year}   myAnswer={myResult.submission.year || '—'} truth={song.year} />
            </div>
          )}

          {myResult && (
            <div style={{ textAlign: 'center', color: 'var(--accent)', fontSize: 22, fontWeight: 800 }}>
              +{myResult.earned} נקודות
            </div>
          )}

          {/* Leaderboard */}
          <div>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 8, fontWeight: 700, textAlign: 'center' }}>טבלת מובילים</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
                <div key={p.socketId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: p.socketId === mySocketId ? 'var(--accent-alpha)' : 'var(--bg2)', borderRadius: 10 }}>
                  <span style={{ width: 24, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                  <span style={{ flex: 1, color: 'var(--text)', fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <button onClick={nextSong} style={{ ...primaryBtn, fontSize: 16, padding: '14px' }}>
              {currentSong?.index >= currentSong?.total ? '🏁 סיום' : '▶ סיבוב הבא'}
            </button>
          )}
          {!isHost && (
            <div style={{ color: 'var(--text2)', textAlign: 'center' }}>ממתין למנהל...</div>
          )}
        </div>
      </div>
    );
  }

  // ─── DONE ───
  if (phase === 'done') {
    const winner = [...players].sort((a, b) => b.score - a.score)[0];
    return (
      <div style={shell(dir)}>
        <TopBar onExit={onExit} title="🏁 סוף המשחק" />
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 28px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <div style={{ fontSize: 64 }}>🏆</div>
          <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, #1db954, #0a8c3a)', borderRadius: 16, padding: '20px 28px', minWidth: 240 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, opacity: 0.8 }}>המנצח</div>
            <AvatarCircle userId={winner?.userId} name={winner?.name} size={90} />
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, marginTop: 8 }}>{winner?.name}</div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, opacity: 0.9 }}>{winner?.score} נקודות</div>
          </div>
          <div style={{ width: '100%', maxWidth: 380 }}>
            {[...players].sort((a, b) => b.score - a.score).map((p, i) => (
              <div key={p.socketId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 10, marginBottom: 6 }}>
                <span style={{ width: 28, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                <AvatarCircle userId={p.userId} name={p.name} size={28} />
                <span style={{ flex: 1, color: 'var(--text)', fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{p.score}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { victoryRef.current?.pause(); onExit(); }} style={secondaryBtn}>← חזרה למסך הבית</button>
        </div>
        <audio ref={victoryRef} preload="auto" />
      </div>
    );
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function TopBar({ onExit, title, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <button onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>⌂</button>
      <span style={{ color: 'var(--text)', fontSize: 16, fontWeight: 800 }}>{title}</span>
      <span style={{ color: 'var(--text2)', fontSize: 12, minWidth: 60, textAlign: 'left' }}>{right || ''}</span>
    </div>
  );
}

function SelectBox({ label, value, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--bg2)', border: '2px solid var(--border)', borderRadius: 14,
      padding: '14px 12px', textAlign: 'right', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80,
    }}>
      <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div style={{
        color: value ? 'var(--text)' : 'var(--text3, #555)',
        fontSize: 14, fontWeight: 700,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value || 'לחץ לבחירה'}</div>
    </button>
  );
}

function ResultBox({ label, correct, myAnswer, truth }) {
  const bg     = correct ? '#0d2e0d' : '#2e0d0d';
  const border = correct ? '#1db954' : '#dc3545';
  const text   = correct ? '#1db954' : '#ff6b6b';
  return (
    <div style={{ background: bg, border: `2px solid ${border}`, borderRadius: 12, padding: 10, textAlign: 'center' }}>
      <div style={{ color: 'var(--text2)', fontSize: 10, fontWeight: 700 }}>{label}</div>
      <div style={{ color: text, fontSize: 13, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {correct ? '✓' : '✕'} {myAnswer || '—'}
      </div>
      {!correct && (
        <div style={{ color: '#1db954', fontSize: 10, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ✓ {truth}
        </div>
      )}
    </div>
  );
}

function AutocompletePicker({ title, options, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter(o => {
      const lower = o.toLowerCase();
      if (lower.startsWith(q)) return true;
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
        height: '85dvh', display: 'flex', flexDirection: 'column', direction: 'rtl',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16 }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="הקלד אות ראשונה..."
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 16, padding: '12px 14px', outline: 'none', direction: 'rtl' }} />
          <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 6, textAlign: 'center' }}>{filtered.length} תוצאות</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
          {filtered.map(o => (
            <button key={o} onClick={() => onSelect(o)}
              style={{ width: '100%', textAlign: 'right', padding: '12px 14px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 6 }}>
              {o}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function YearPickerModal({ onSelect, onClose }) {
  const [decade, setDecade] = useState(null);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto', maxHeight: '85dvh',
        display: 'flex', flexDirection: 'column', direction: 'rtl',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16 }}>{decade === null ? 'בחר עשור' : `שנים ב${decadeLabel(decade)}`}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {decade !== null && <button onClick={() => setDecade(null)} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>↩ עשור</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
          {decade === null
            ? DECADES.map(d => (
                <button key={d} onClick={() => setDecade(d)} style={{ aspectRatio: '1 / 1', background: 'var(--bg2)', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>
                  {decadeLabel(d)}
                </button>
              ))
            : Array.from({ length: 10 }, (_, i) => decade + i).map(y => (
                <button key={y} onClick={() => onSelect(y)} style={{ aspectRatio: '1 / 1', background: 'var(--bg2)', border: '2px solid var(--accent)', color: 'var(--accent)', borderRadius: 14, fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>
                  {y}
                </button>
              ))}
        </div>
      </div>
    </>
  );
}

function decadeLabel(d) { return d < 2000 ? `שנות ה-${String(d).slice(2)}` : `שנות ה-${d}`; }

// ─── Styles ───────────────────────────────────────────────────────────────────
const shell = (dir) => ({ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir });
const inputStyle  = { width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 12, padding: '12px 14px', fontSize: 16, outline: 'none', direction: 'rtl' };
const primaryBtn  = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn= { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
const backBtn     = { width: '100%', padding: '10px', borderRadius: 12, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' };
const errorBox    = { background: '#3a1010', color: '#ff6b6b', padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 13 };
