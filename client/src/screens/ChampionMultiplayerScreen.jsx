import { useState, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import TimerBar from '../components/TimerBar.jsx';
import { AvatarCircle } from '../App.jsx';
import { useLang } from '../i18n/useLang.js';
import { unlockAudio } from '../utils/audioUnlock.js';
import { useFavorites } from '../hooks/useFavorites.js';
import CastButton from '../components/CastButton.jsx';
import { bestMatch } from '../utils/textMatch.js';
import { useSpeechRecognition, uiLangToBcp47 } from '../hooks/useSpeechRecognition.js';
import { useLongPress } from '../hooks/useLongPress.js';
import { useMultiplayerSocket } from '../hooks/useMultiplayerSocket.js';

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const TIMER_OPTIONS = [0, 15, 30, 45, 60];
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
  const { dir, lang } = useLang();
  const { user } = useAuthStore();
  const { playlists } = useSettingsStore();

  const [phase, setPhase] = useState('init'); // init | lobby | playing | reveal | done
  const [mode, setMode] = useState(null);     // 'create' | 'join'
  const [playerName, setPlayerName] = useState(user?.username || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // Lobby
  const [players, setPlayers] = useState([]);
  const { socket, connected, mySocketId } = useMultiplayerSocket();
  const [roomCode, setRoomCode] = useState('');
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [songCount, setSongCount] = useState(10);
  const [timerSec, setTimerSec] = useState(0);
  // Year filter — all decades selected by default (no filter effect).
  // Host deselects decades to exclude them from the pool.
  const [decadeFilter, setDecadeFilter] = useState(() => new Set(DECADES));

  const { favoriteIds, toggle: toggleFavorite } = useFavorites();

  // Game
  const [autocomplete, setAutocomplete] = useState({ artists: [], titles: [] });
  const [currentSong, setCurrentSong] = useState(null);
  const [gameTimerSec, setGameTimerSec] = useState(0);
  const [pickedArtist, setPickedArtist] = useState('');
  const [pickedTitle, setPickedTitle]   = useState('');
  const [pickedYear, setPickedYear]     = useState(null);
  const [picker, setPicker] = useState(null); // 'artist' | 'title' | 'year'
  const [submitted, setSubmitted] = useState(false);
  const [revealData, setRevealData] = useState(null); // { song, results }
  const submitRef = useRef(null);
  const [showRules, setShowRules] = useState(false);
  // Host-controlled mute state. Affects only OTHER players' audio.
  const [allMuted, setAllMuted] = useState(false);
  // Ref mirrors so stale-closure socket listeners (set up in mount-time
  // useEffect) can read the latest values when a new song loads
  const allMutedRef = useRef(false);
  const isHostRef = useRef(false);
  useEffect(() => { allMutedRef.current = allMuted; }, [allMuted]);

  // Victory + game stats for end screen
  const [victoryAudioUrl, setVictoryAudioUrl] = useState('');
  const [victoryStartSeconds, setVictoryStartSeconds] = useState(0);
  const [endedTotalSongs, setEndedTotalSongs] = useState(0);

  const audioRef = useRef(null);
  const victoryRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Voice — long-press the artist or title box to speak the answer.
  const [voiceTarget, setVoiceTarget] = useState(null); // null | 'artist' | 'title'
  const [voiceMiss, setVoiceMiss] = useState({ field: null, text: '' });
  const voiceTimerRef = useRef(null);
  const voiceTargetRef = useRef(null);
  voiceTargetRef.current = voiceTarget;

  function flashVoiceMiss(field, text) {
    setVoiceMiss({ field, text });
    if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = setTimeout(() => setVoiceMiss({ field: null, text: '' }), 1500);
  }

  const speech = useSpeechRecognition({
    lang: uiLangToBcp47(lang),
    onResult: (r) => {
      if (!r.isFinal) return;
      const target = voiceTargetRef.current;
      const transcript = r.transcript || '';
      if (!target) return;
      const candidates = target === 'artist' ? (autocomplete.artists || []) : (autocomplete.titles || []);
      const m = bestMatch(transcript, candidates);
      if (m?.best) {
        if (target === 'artist') setPickedArtist(m.best);
        else                     setPickedTitle(m.best);
        setVoiceMiss({ field: null, text: '' });
      } else if (transcript) {
        flashVoiceMiss(target, transcript);
      }
      setVoiceTarget(null);
    },
    onError: () => { setVoiceTarget(null); },
  });

  function startVoice(target) {
    if (!speech.supported || submitted) return;
    try { audioRef.current?.pause?.(); } catch { /* ignore */ }
    setVoiceTarget(target);
    speech.start();
  }

  const artistLongPress = useLongPress({ onLongPress: () => startVoice('artist'), threshold: 450 });
  const titleLongPress  = useLongPress({ onLongPress: () => startVoice('title'),  threshold: 450 });

  const me = useMemo(() => players.find(p => p.socketId === mySocketId) || null, [players, mySocketId]);
  const isHost = me?.isHost;
  useEffect(() => { isHostRef.current = !!isHost; }, [isHost]);

  // Champion-specific socket events. Connection state + cleanup are handled
  // by useMultiplayerSocket. Each event listener is removed in the cleanup
  // below so unmounting / remounting doesn't pile up duplicates on the shared
  // singleton socket.
  useEffect(() => {
    socket.on('champ:created', ({ code, players }) => {
      setRoomCode(code); setPlayers(players); setPhase('lobby');
    });
    socket.on('champ:joined', ({ code, players }) => {
      setRoomCode(code); setPlayers(players); setPhase('lobby');
    });
    socket.on('champ:room_update', ({ players, code }) => {
      setPlayers(players); if (code) setRoomCode(code);
    });
    socket.on('champ:started', ({ autocomplete, timerSec: t }) => {
      setAutocomplete(autocomplete || { artists: [], titles: [] });
      setGameTimerSec(Number(t) || 0);
    });
    socket.on('champ:song', ({ songId, audioUrl, index, total, timerSec: t }) => {
      setCurrentSong({ id: songId, audioUrl, index, total });
      if (t != null) setGameTimerSec(Number(t) || 0);
      setPickedArtist(''); setPickedTitle(''); setPickedYear(null);
      setSubmitted(false); setRevealData(null); setPicker(null);
      setPhase('playing');
      // Auto-play. The host's audio always plays — the mute toggle only
      // affects players via the champ:muted event, never the host themselves.
      setTimeout(() => {
        const a = audioRef.current;
        if (!a || !audioUrl) return;
        a.src = audioUrl; a.load();
        const shouldPlay = isHostRef.current || !allMutedRef.current;
        if (shouldPlay) a.play().catch(() => {});
      }, 50);
    });
    socket.on('champ:reveal', (data) => {
      audioRef.current?.pause();
      setRevealData(data);
      setPhase('reveal');
    });
    socket.on('champ:muted', ({ muted }) => {
      // Only non-host players receive this (server uses socket.to(room) which
      // excludes the sender). Pause/resume our own audio element.
      setAllMuted(muted);
      const a = audioRef.current;
      if (!a) return;
      if (muted) a.pause();
      else a.play().catch(() => {});
    });
    socket.on('champ:ended', ({ players, totalSongs, victoryAudioUrl: vUrl, victoryStartSeconds: vStart }) => {
      audioRef.current?.pause();
      setPlayers(players);
      if (typeof totalSongs === 'number') setEndedTotalSongs(totalSongs);
      if (vUrl) {
        setVictoryAudioUrl(vUrl);
        setVictoryStartSeconds(Number(vStart) || 0);
      }
      setPhase('done');
    });
    socket.on('champ:error', ({ message }) => setError(message));

    return () => {
      ['champ:created','champ:joined','champ:room_update','champ:started',
       'champ:song','champ:reveal','champ:muted','champ:ended','champ:error']
        .forEach(e => socket.off(e));
    };
  }, [socket]);

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
    unlockAudio(audioRef.current);
    socket.emit('champ:create', { name: playerName.trim(), userId: user?.id });
  }
  function handleJoin() {
    if (!playerName.trim() || !code.trim()) return;
    unlockAudio(audioRef.current);
    socket.emit('champ:join', { code: code.trim().toUpperCase(), name: playerName.trim(), userId: user?.id });
  }
  function startGame() {
    if (selectedPlaylistIds.size === 0) return setError('בחר פלייליסט');
    setError('');
    socket.emit('champ:start', {
      playlistIds: [...selectedPlaylistIds],
      songCount,
      timerSec,
      decades: [...decadeFilter],
    });
  }
  function handleSubmit() {
    if (submitted || !currentSong) return;
    socket.emit('champ:submit', {
      artist: pickedArtist,
      title: pickedTitle,
      year: pickedYear,
    });
    setSubmitted(true);
    setPicker(null);
    audioRef.current?.pause();
  }
  // Always-fresh ref for the timer's onExpire callback
  submitRef.current = handleSubmit;
  function nextSong() { socket.emit('champ:next'); }
  function endNow()   { socket.emit('champ:end'); }
  function hostMuteToggle() {
    if (allMuted) {
      setAllMuted(false);
      socket.emit('champ:unmute_all');
    } else {
      setAllMuted(true);
      socket.emit('champ:mute_all');
    }
  }
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

          <button
            onClick={() => setShowRules(true)}
            style={{
              alignSelf: 'center', background: 'none', border: 'none',
              color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
              textDecoration: 'underline', padding: '4px 8px', marginTop: 4,
            }}
          >
            ❓ איך משחקים?
          </button>
        </div>
        {showRules && <ChampionMpRulesModal onClose={() => setShowRules(false)} />}
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
            <button
              onClick={() => { try { navigator.clipboard?.writeText(roomCode); } catch {} }}
              title="העתק קוד"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4, color: 'var(--accent)', fontSize: 36, fontWeight: 900, letterSpacing: 8 }}
            >
              {roomCode} 📋
            </button>
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
              <div>
                <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 8, fontWeight: 700 }}>
                  🎵 בחר פלייליסט {selectedPlaylistIds.size > 0 && (
                    <span style={{ color: 'var(--accent)', fontWeight: 800 }}>· {selectedPlaylistIds.size} נבחרו</span>
                  )}
                </div>
                {playlists.length === 0 ? (
                  <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: '12px', background: 'var(--bg2)', borderRadius: 10, border: '1px dashed var(--border)' }}>
                    אין פלייליסטים — הוסף בהגדרות
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {playlists.map(p => {
                      const sel = selectedPlaylistIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            const next = new Set(selectedPlaylistIds);
                            next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                            setSelectedPlaylistIds(next);
                          }}
                          style={{
                            padding: '8px 14px', borderRadius: 18,
                            background: sel ? 'var(--accent)' : 'var(--bg2)',
                            color: sel ? '#fff' : 'var(--text2)',
                            border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          {p.type === 'spotify' ? '🟢 ' : ''}{p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

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

              <div>
                <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 8, fontWeight: 700 }}>⏱ טיימר לכל שיר</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {TIMER_OPTIONS.map(sec => (
                    <button key={sec} onClick={() => setTimerSec(sec)} style={{
                      flex: 1, padding: '10px 0', borderRadius: 12,
                      background: timerSec === sec ? 'var(--accent)' : 'var(--bg2)',
                      color: timerSec === sec ? '#fff' : 'var(--text2)',
                      border: `1.5px solid ${timerSec === sec ? 'var(--accent)' : 'var(--border)'}`,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                      {sec === 0 ? 'ללא' : `${sec}s`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year filter — all decades pre-selected; tap to exclude one */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>📅 סינון לפי שנים</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setDecadeFilter(new Set(DECADES))}
                      style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      הכל
                    </button>
                    <button
                      onClick={() => setDecadeFilter(new Set())}
                      style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      אף אחד
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DECADES.map(d => {
                    const active = decadeFilter.has(d);
                    return (
                      <button
                        key={d}
                        onClick={() => {
                          const next = new Set(decadeFilter);
                          next.has(d) ? next.delete(d) : next.add(d);
                          setDecadeFilter(next);
                        }}
                        style={{
                          padding: '8px 12px', borderRadius: 18,
                          background: active ? 'var(--accent)' : 'var(--bg2)',
                          color: active ? '#fff' : 'var(--text2)',
                          border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {decadeLabel(d)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={startGame} disabled={players.length < 1 || decadeFilter.size === 0} style={{ ...primaryBtn, fontSize: 16, padding: '14px', opacity: decadeFilter.size === 0 ? 0.5 : 1 }}>
                {decadeFilter.size === 0 ? 'בחר לפחות עשור אחד' : '▶ התחל משחק'}
              </button>
            </>
          )}
          {!isHost && (
            <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 20, background: 'var(--bg2)', borderRadius: 12 }}>
              ⏳ ממתין שהמנהל יתחיל...
            </div>
          )}
          {error && <div style={errorBox}>{error}</div>}

          <button
            onClick={() => setShowRules(true)}
            style={{
              alignSelf: 'center', background: 'none', border: 'none',
              color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
              textDecoration: 'underline', padding: '4px 8px', marginTop: 4,
            }}
          >
            ❓ איך משחקים?
          </button>
        </div>
        {showRules && <ChampionMpRulesModal onClose={() => setShowRules(false)} />}
      </div>
    );
  }

  // ─── PLAYING ───
  if (phase === 'playing' && currentSong) {
    return (
      <div style={shell(dir)}>
        <TopBar onExit={onExit} title="🥇 אלוף הזיהויים" right={`${currentSong.index}/${currentSong.total} · ⭐ ${me?.score || 0}`} />

        {/* Host action bar — mute toggle, matches MultiplayerScreen styling */}
        {isHost && (
          <div style={{ flexShrink: 0, padding: '6px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
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
          </div>
        )}

        {/* Muted indicator — pinned, only shown to non-host players */}
        {!isHost && allMuted && (
          <div style={{ margin: '6px 16px 0', padding: '6px 12px', borderRadius: 8, background: '#3a1010', border: '1px solid #dc3545', color: '#ff6b6b', fontSize: 13, textAlign: 'center', flexShrink: 0 }}>
            🔇 המנהל השתיק את השמע
          </div>
        )}

        {/* Per-song timer (auto-submits on expiry) */}
      {gameTimerSec > 0 && !submitted && (
        <div style={{ flexShrink: 0, marginTop: 8 }}>
          <TimerBar
            seconds={gameTimerSec}
            songId={`champ-mp-${currentSong.index}`}
            onExpire={() => submitRef.current?.()}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Hidden cover during play */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 'min(120px, 30vw)', aspectRatio: '1 / 1', borderRadius: 16, background: 'linear-gradient(135deg, #3a3a3a, #2a2a2a)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 42, opacity: 0.5 }}>🎵</span>
            </div>
          </div>

          {/* Audio controls — non-host gets play/pause; host only sees the favorite toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!isHost && (
              <button onClick={togglePlayPause} style={{ flex: 1, height: 44, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 22, cursor: 'pointer' }}>
                {audioPlaying ? '⏸' : '▶'}
              </button>
            )}
            <button
              onClick={() => currentSong && toggleFavorite({
                id: currentSong.id,
                filePath: currentSong.audioUrl ? decodeURIComponent(currentSong.audioUrl.replace('/api/audio/', '')) : '',
                title: currentSong.title || '',
                artist: currentSong.artist || '',
                year: currentSong.year || '',
              })}
              title={currentSong && favoriteIds.has(currentSong.id) ? 'הסרה מהמועדפים' : 'הוספה למועדפים'}
              style={{
                flex: '0 0 56px', height: 44,
                background: currentSong && favoriteIds.has(currentSong.id) ? '#dc354522' : 'var(--bg2)',
                color: currentSong && favoriteIds.has(currentSong.id) ? '#ff6b6b' : 'var(--text)',
                border: `1px solid ${currentSong && favoriteIds.has(currentSong.id) ? '#dc3545' : 'var(--border)'}`,
                borderRadius: 12, fontSize: 22, cursor: 'pointer',
              }}
            >
              {currentSong && favoriteIds.has(currentSong.id) ? '💔' : '❤️'}
            </button>
            <CastButton audioRef={audioRef} size={44} />
          </div>

          {submitted ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 12, padding: 14, textAlign: 'center', color: 'var(--text)' }}>
              ✅ תשובתך נשלחה! ממתין לשחקנים אחרים...
              <div style={{ marginTop: 8, color: 'var(--text2)', fontSize: 12 }}>
                {players.filter(p => p.submitted && !p.isHost).length}/{players.filter(p => !p.isHost).length} סיימו
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <VoiceBoxWrap
                longPress={artistLongPress}
                listening={voiceTarget === 'artist'}
                miss={voiceMiss.field === 'artist' ? voiceMiss.text : ''}
                dir={dir}
              >
                <SelectBox label="🎤 זמר"  value={pickedArtist} onClick={artistLongPress.wrapClick(() => setPicker('artist'))} />
              </VoiceBoxWrap>
              <VoiceBoxWrap
                longPress={titleLongPress}
                listening={voiceTarget === 'title'}
                miss={voiceMiss.field === 'title' ? voiceMiss.text : ''}
                dir={dir}
              >
                <SelectBox label="🎵 שיר"  value={pickedTitle}  onClick={titleLongPress.wrapClick(() => setPicker('title'))} />
              </VoiceBoxWrap>
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
            <button onClick={() => socket.emit('champ:reveal')} style={secondaryBtn}>
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
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--accent)', fontSize: 24, fontWeight: 900 }}>
                +{myResult.earned} נקודות
              </div>
              {myResult.bonus > 0 && (
                <div style={{
                  display: 'inline-block', marginTop: 8,
                  background: '#1db95433', border: '1px solid #1db954', color: '#1db954',
                  padding: '5px 14px', borderRadius: 20,
                  fontSize: 13, fontWeight: 800,
                }}>
                  💎 סיבוב מושלם! +{myResult.bonus} בונוס
                </div>
              )}
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

  // ─── DONE — winner display matches the regular multiplayer results screen ───
  if (phase === 'done') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    return (
      <div style={shell(dir)}>
        <audio ref={victoryRef} preload="auto" />
        <TopBar onExit={onExit} title="🏁 תוצאות" />
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Winner highlight — same pattern as the regular multiplayer */}
          {winner && (
            <div style={{
              textAlign: 'center',
              background: '#1a2a1a',
              border: '2px solid #1db954',
              borderRadius: 14,
              padding: '20px 16px',
            }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>🥇</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <AvatarCircle
                  userId={winner.userId}
                  name={winner.name}
                  size={90}
                  style={{ border: '3px solid #1db954' }}
                />
              </div>
              <div style={{ color: '#1db954', fontSize: 22, fontWeight: 900 }}>{winner.name}</div>
              <div style={{ color: '#fff', fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                {winner.score} נקודות
              </div>
            </div>
          )}

          {/* My stats card */}
          {me && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
                📊 הסטטיסטיקה שלך
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <MiniStat icon="🎵" label="שירים" value={endedTotalSongs || me.songsAnswered} color="#5bb8ff" />
                <MiniStat icon="✅" label="תשובות נכונות" value={`${me.correctFields || 0}/${(endedTotalSongs || me.songsAnswered || 0) * 3}`} color="#1db954" />
                <MiniStat icon="💎" label="סיבובים מושלמים" value={me.perfectRounds || 0} color="#FFD700" />
                <MiniStat icon="⭐" label="נקודות" value={me.score} color="var(--accent)" />
              </div>
            </div>
          )}

          {/* Full ranking */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 14px' }}>
            {sorted.map((p, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
              return (
                <div key={p.socketId} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: 22, minWidth: 32, textAlign: 'center' }}>{medal}</span>
                  <AvatarCircle userId={p.userId} name={p.name} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                    {p.perfectRounds > 0 && (
                      <div style={{ color: '#FFD700', fontSize: 10, marginTop: 2 }}>
                        💎 {p.perfectRounds} מושלמים
                      </div>
                    )}
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: 18, fontWeight: 800 }}>{p.score}</span>
                </div>
              );
            })}
          </div>

          {/* Scoring rules reminder */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 12px',
            color: 'var(--text2)', fontSize: 11, lineHeight: 1.6, textAlign: 'center',
          }}>
            1 נקודה לכל קובייה נכונה · <strong style={{ color: '#1db954' }}>+5 בונוס</strong> על סיבוב מושלם
          </div>

          <button onClick={() => { victoryRef.current?.pause(); onExit(); }} style={primaryBtn}>
            ← חזרה למסך הבית
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Wrap a SelectBox with long-press handlers + visual cue. While `listening`, a
// red ring + "🎙 …" badge appears over the box; after a missed match, the
// heard transcript flashes briefly under the value.
function VoiceBoxWrap({ longPress, listening, miss, dir, children }) {
  return (
    <div
      {...longPress.handlers}
      style={{
        position: 'relative',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        borderRadius: 14,
        boxShadow: listening ? '0 0 0 2px #dc3545' : 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      {children}
      {listening && (
        <div style={{
          position: 'absolute', top: 6, [dir === 'rtl' ? 'left' : 'right']: 6,
          background: '#dc3545', color: '#fff',
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 8,
          pointerEvents: 'none',
          animation: 'mic-pulse-badge 1.1s ease-in-out infinite',
        }}>
          🎙 …
        </div>
      )}
      {!listening && miss && (
        <div style={{
          position: 'absolute', bottom: 4, [dir === 'rtl' ? 'right' : 'left']: 8,
          fontSize: 10, color: '#ff9999', fontWeight: 600, pointerEvents: 'none',
          maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          ❌ {miss}
        </div>
      )}
      <style>{`
        @keyframes mic-pulse-badge {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

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

// ─── Rules modal — bottom sheet shown when the user taps "❓ איך משחקים?" ───
function ChampionMpRulesModal({ onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
        direction: 'rtl',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16 }}>❓ איך משחקים?</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', padding: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          <ul style={{ margin: 0, padding: '0 18px 0 0', color: 'var(--text2)', fontSize: 14, lineHeight: 1.9 }}>
            <li>🎵 המנהל פותח חדר ובוחר פלייליסט וכמות שירים</li>
            <li>👥 שחקנים מצטרפים בקוד החדר</li>
            <li>🎧 כולם שומעים את אותו שיר באותו זמן</li>
            <li>✏️ כל שחקן בוחר זמר, שיר ושנה מהקוביות</li>
            <li>✅ נקודה לכל קובייה נכונה</li>
            <li>💎 כל הקוביות נכונות בסיבוב = +5 בונוס (סך 8)</li>
            <li>🏆 מי שצובר הכי הרבה נקודות — מנצח!</li>
          </ul>
        </div>
      </div>
    </>
  );
}

function MiniStat({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg)', border: `1px solid ${color}33`, borderRight: `3px solid ${color}`,
      borderRadius: 10, padding: '10px 12px', textAlign: 'right',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: 'var(--text2)', fontSize: 10, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div style={{ color, fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const shell = (dir) => ({ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir });
const inputStyle  = { width: '100%', boxSizing: 'border-box', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 12, padding: '12px 14px', fontSize: 16, outline: 'none', direction: 'rtl' };
const primaryBtn  = { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' };
const secondaryBtn= { width: '100%', padding: '12px', borderRadius: 12, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15, cursor: 'pointer' };
const backBtn     = { width: '100%', padding: '10px', borderRadius: 12, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' };
const errorBox    = { background: '#3a1010', color: '#ff6b6b', padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 13 };
