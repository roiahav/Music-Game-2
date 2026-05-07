import { useState, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import { getPlaylistSongs } from '../api/client.js';
import { useFavorites } from '../hooks/useFavorites.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import TimerBar from '../components/TimerBar.jsx';
import { AvatarCircle } from '../App.jsx';
import { useLang } from '../i18n/useLang.js';
import CastButton from '../components/CastButton.jsx';
import { bestMatch } from '../utils/textMatch.js';
import { useSpeechRecognition, uiLangToBcp47 } from '../hooks/useSpeechRecognition.js';
import { useLongPress } from '../hooks/useLongPress.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const TIMER_OPTIONS = [0, 15, 30, 45, 60];

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
  const { dir, lang } = useLang();
  const { user } = useAuthStore();
  const { playlists } = useSettingsStore();
  const { favoriteIds, toggle: toggleFavorite } = useFavorites();

  const [phase, setPhase] = useState('idle'); // idle | playing | done
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState(
    playlists[0] ? new Set([playlists[0].id]) : new Set()
  );
  const [timerSec, setTimerSec] = useState(0);
  // Year filter — all decades selected by default (no filter effect).
  // Deselect a decade to exclude it from the song pool.
  const [decadeFilter, setDecadeFilter] = useState(() => new Set(DECADES));
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

  // Rules modal — shown when the user taps the "?" link at the bottom
  const [showRules, setShowRules] = useState(false);

  // Submitted reveal state
  const [submitted, setSubmitted] = useState(false);

  // Score: points = base (1 per correct field) + bonuses (5 for all-three perfect)
  const [score, setScore] = useState({
    points:         0,   // total earned
    correctFields:  0,   // count of individual correct fields (max 3 per song)
    songsPlayed:    0,
    perfectRounds:  0,   // songs where artist+title+year were all correct → +5 bonus
  });

  // Audio
  const audioRef = useRef(null);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Voice — long-press the artist or title box to speak the answer.
  //   voiceTarget — which box is currently listening (routes the transcript)
  //   voiceFeedback — { field, kind, text } for the inline overlay (miss text
  //                   or a friendly error like "HTTPS required")
  const [voiceTarget, setVoiceTarget] = useState(null); // null | 'artist' | 'title'
  const [voiceFeedback, setVoiceFeedback] = useState({ field: null, kind: null, text: '' });
  const voiceTimerRef = useRef(null);
  const voiceTargetRef = useRef(null);
  voiceTargetRef.current = voiceTarget;

  function flashVoiceFeedback(field, kind, text, ms = 2400) {
    setVoiceFeedback({ field, kind, text });
    if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = setTimeout(() => setVoiceFeedback({ field: null, kind: null, text: '' }), ms);
  }

  function speechErrorText(code) {
    switch (code) {
      case 'not-allowed':         return 'הגישה למיקרופון נדחתה';
      case 'service-not-allowed': return 'נדרש HTTPS לזיהוי קולי';
      case 'audio-capture':       return 'לא נמצא מיקרופון';
      case 'no-speech':           return 'לא זוהה דיבור';
      case 'network':             return 'אין חיבור רשת';
      default:                    return 'שגיאת זיהוי קולי';
    }
  }

  const speech = useSpeechRecognition({
    lang: uiLangToBcp47(lang),
    onResult: (r) => {
      if (!r.isFinal) return;
      const target = voiceTargetRef.current;
      const transcript = r.transcript || '';
      if (!target) return;
      const candidates = target === 'artist' ? allArtists : allTitles;
      const m = bestMatch(transcript, candidates);
      if (m?.best) {
        if (target === 'artist') setPickedArtist(m.best);
        else                     setPickedTitle(m.best);
        setVoiceFeedback({ field: null, kind: null, text: '' });
      } else if (transcript) {
        flashVoiceFeedback(target, 'miss', transcript, 1500);
      }
      setVoiceTarget(null);
    },
    onError: (e) => {
      const target = voiceTargetRef.current;
      flashVoiceFeedback(target, 'error', speechErrorText(e?.error));
      setVoiceTarget(null);
    },
  });

  function startVoice(target) {
    if (submitted) return;
    if (!speech.supported) {
      flashVoiceFeedback(target, 'error',
        window.isSecureContext ? 'הדפדפן לא תומך בקלט קולי' : 'נדרש HTTPS לזיהוי קולי');
      return;
    }
    try { audioRef.current?.pause?.(); } catch { /* ignore */ }
    setVoiceTarget(target);
    try { speech.start(); }
    catch { flashVoiceFeedback(target, 'error', 'שגיאת זיהוי קולי'); setVoiceTarget(null); }
  }

  const artistLongPress = useLongPress({ onLongPress: () => startVoice('artist'), threshold: 400 });
  const titleLongPress  = useLongPress({ onLongPress: () => startVoice('title'),  threshold: 400 });

  // Always-fresh ref for handleSubmit so TimerBar's captured onExpire calls
  // the latest version (with current picks) rather than a stale one
  const handleSubmitRef = useRef(null);

  // Songs that match the chosen decade filter. All decades selected by default.
  const filteredSongs = useMemo(() => {
    return allSongs.filter(s => decadeFilter.has(decadeOf(s.year)));
  }, [allSongs, decadeFilter]);

  // Decades that actually have songs in the loaded playlist (so we don't show
  // empty options the user could pick to make the playlist 0-songs)
  const availableDecades = useMemo(() => {
    const set = new Set(allSongs.map(s => decadeOf(s.year)).filter(Boolean));
    return DECADES.filter(d => set.has(d));
  }, [allSongs]);

  // Unique sorted lists for autocomplete — derived from FILTERED songs so the
  // pickers match what's actually playable
  const allArtists = useMemo(() => uniqueSorted(filteredSongs.map(s => (s.artist || '').trim()).filter(Boolean)), [filteredSongs]);
  const allTitles  = useMemo(() => uniqueSorted(filteredSongs.map(s => (s.title  || '').trim()).filter(Boolean)), [filteredSongs]);

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
    if (filteredSongs.length === 0) return;
    const shuffled = shuffle(filteredSongs);
    setQueue(shuffled);
    setSongIdx(0);
    setScore({ points: 0, correctFields: 0, songsPlayed: 0, perfectRounds: 0 });
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
    const allThree = correctCount === 3;
    // 1 point per correct field; +5 BONUS if all three correct → 8 max per song
    const earnedPoints = correctCount + (allThree ? 5 : 0);
    setScore(s => ({
      points:        s.points        + earnedPoints,
      correctFields: s.correctFields + correctCount,
      songsPlayed:   s.songsPlayed   + 1,
      perfectRounds: s.perfectRounds + (allThree ? 1 : 0),
    }));
    setSubmitted(true);
    setPicker(null);
  }
  // Keep the ref in sync so TimerBar's captured onExpire always sees the latest
  handleSubmitRef.current = handleSubmit;

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
          <PlaylistSelector
            playlists={playlists}
            selectedIds={selectedPlaylistIds}
            onToggle={id => {
              const next = new Set(selectedPlaylistIds);
              next.has(id) ? next.delete(id) : next.add(id);
              setSelectedPlaylistIds(next);
            }}
          />

          {/* Timer per song */}
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
          {availableDecades.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>📅 סינון לפי שנים</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setDecadeFilter(new Set(availableDecades))}
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
                {availableDecades.map(d => {
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
                        padding: '8px 14px', borderRadius: 18,
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
          )}

          <button
            onClick={startGame}
            disabled={loading || filteredSongs.length === 0}
            style={{
              ...primaryBtn,
              background: loading || filteredSongs.length === 0 ? 'var(--bg2)' : 'var(--accent)',
              opacity: loading || filteredSongs.length === 0 ? 0.5 : 1,
              fontSize: 16, padding: '14px',
            }}
          >
            {loading
              ? '...'
              : filteredSongs.length === 0
                ? (allSongs.length === 0 ? 'אין שירים מתאימים בפלייליסט' : decadeFilter.size === 0 ? 'בחר לפחות עשור אחד' : 'אין שירים בעשורים הנבחרים')
                : `▶ התחל — ${filteredSongs.length} שירים`}
          </button>

          {/* Rules shortcut — opens the help modal */}
          <button
            onClick={() => setShowRules(true)}
            style={{
              alignSelf: 'center', background: 'none', border: 'none',
              color: 'var(--text2)', fontSize: 13, cursor: 'pointer',
              textDecoration: 'underline', padding: '4px 8px',
            }}
          >
            ❓ איך משחקים?
          </button>
        </div>

        {showRules && <ChampionRulesModal onClose={() => setShowRules(false)} />}
      </div>
    );
  }

  if (phase === 'done') {
    const totalFields = score.songsPlayed * 3;
    const pct = totalFields > 0 ? Math.round((score.correctFields / totalFields) * 100) : 0;
    const maxPoints = score.songsPlayed * 8; // 3 base + 5 bonus per song
    // Medal based on point efficiency (compares actual points to max)
    const efficiency = maxPoints > 0 ? Math.round((score.points / maxPoints) * 100) : 0;
    const medal =
      efficiency >= 90 ? { icon: '🥇', label: 'אלוף הזיהויים!',     color: '#FFD700' } :
      efficiency >= 70 ? { icon: '🥈', label: 'מומחה מוזיקה',        color: '#C0C0C0' } :
      efficiency >= 50 ? { icon: '🥉', label: 'יודע דבר או שניים',   color: '#CD7F32' } :
                          { icon: '🎵', label: 'יש לאן לשפר',         color: '#5bb8ff' };
    const bonusPoints = score.perfectRounds * 5;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir }}>
        <TopBar onExit={onExit} title="🏆 סוף המשחק" />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>

          {/* Winner highlight */}
          <div style={{
            width: '100%', maxWidth: 360, textAlign: 'center',
            background: 'linear-gradient(135deg, var(--bg2) 0%, var(--bg3, #1a1a2e) 100%)',
            border: `3px solid ${medal.color}`,
            borderRadius: 18, padding: '24px 20px',
            boxShadow: `0 6px 24px ${medal.color}33`,
          }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>{medal.icon}</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <AvatarCircle
                userId={user?.id}
                hasAvatar={user?.hasAvatar}
                name={user?.username || 'שחקן'}
                size={84}
                style={{ border: `3px solid ${medal.color}` }}
              />
            </div>
            <div style={{ color: medal.color, fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
              {medal.label}
            </div>
            <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900 }}>
              {user?.username || 'אתה'}
            </div>
            <div style={{ color: medal.color, fontSize: 42, fontWeight: 900, marginTop: 14, lineHeight: 1 }}>
              {score.points}
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>נקודות</div>
            {bonusPoints > 0 && (
              <div style={{
                marginTop: 10, display: 'inline-block',
                background: '#1db95433', border: '1px solid #1db954', color: '#1db954',
                fontSize: 12, fontWeight: 800,
                padding: '4px 12px', borderRadius: 20,
              }}>
                💎 +{bonusPoints} בונוס מ-{score.perfectRounds} סיבובים מושלמים
              </div>
            )}
          </div>

          {/* Stats grid — songs played, accuracy, perfect rounds */}
          <div style={{ width: '100%', maxWidth: 360 }}>
            <div style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
              📊 סטטיסטיקה
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatCell icon="🎵" label="שירים שיחקת"     value={score.songsPlayed}   color="#5bb8ff" />
              <StatCell icon="✅" label="תשובות נכונות"   value={`${score.correctFields}/${totalFields}`} color="#1db954" />
              <StatCell icon="💎" label="סיבובים מושלמים" value={score.perfectRounds} color="#FFD700" />
              <StatCell icon="🎯" label="דיוק"            value={`${pct}%`}           color="#9b59b6" />
            </div>
          </div>

          {/* Scoring rules reminder */}
          <div style={{
            width: '100%', maxWidth: 360,
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px',
            color: 'var(--text2)', fontSize: 11, lineHeight: 1.6,
          }}>
            <span style={{ color: 'var(--text)' }}>חישוב הניקוד:</span> 1 נקודה לכל קובייה נכונה (זמר/שיר/שנה),
            ו-<strong style={{ color: '#1db954' }}>+5 בונוס</strong> אם כל השלוש נכונות יחד (סיבוב מושלם).
          </div>

          <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={startGame} style={{ ...primaryBtn, fontSize: 16, padding: '14px' }}>🔁 שחק שוב</button>
            <button onClick={onExit} style={secondaryBtn}>← חזרה למסך הבית</button>
          </div>
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
        right={`${songIdx + 1}/${queue.length} · ⭐ ${score.points}`}
      />

      {/* Per-song timer (hidden when no timer or already submitted) */}
      {timerSec > 0 && !submitted && (
        <div style={{ flexShrink: 0, marginTop: 8 }}>
          <TimerBar
            seconds={timerSec}
            songId={`champ-${songIdx}`}
            onExpire={() => handleSubmitRef.current?.()}
          />
        </div>
      )}

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
          {/* Favorites toggle — saves the current song to the user's favourites list */}
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
              width: 56, height: 46,
              background: currentSong && favoriteIds.has(currentSong.id) ? '#dc354522' : 'var(--bg2)',
              color: currentSong && favoriteIds.has(currentSong.id) ? '#ff6b6b' : 'var(--text)',
              border: `1px solid ${currentSong && favoriteIds.has(currentSong.id) ? '#dc3545' : 'var(--border)'}`,
              borderRadius: 12, fontSize: 22, cursor: 'pointer', flexShrink: 0,
            }}
          >
            {currentSong && favoriteIds.has(currentSong.id) ? '💔' : '❤️'}
          </button>
          <CastButton audioRef={audioRef} />
        </div>

        {/* Selection boxes — 2x2 grid: artist, title, year, submit.
            Long-press on artist or title opens the mic and pauses audio. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <VoiceBoxWrap
            longPress={artistLongPress}
            listening={voiceTarget === 'artist'}
            feedback={voiceFeedback.field === 'artist' ? voiceFeedback : null}
            dir={dir}
          >
            <SelectBox
              label="🎤 זמר"
              value={pickedArtist}
              placeholder="לחץ לבחירה"
              state={resultStateFor('artist')}
              correctValue={submitted ? currentSong?.artist : null}
              disabled={submitted}
              onClick={artistLongPress.wrapClick(() => setPicker('artist'))}
            />
          </VoiceBoxWrap>
          <VoiceBoxWrap
            longPress={titleLongPress}
            listening={voiceTarget === 'title'}
            feedback={voiceFeedback.field === 'title' ? voiceFeedback : null}
            dir={dir}
          >
            <SelectBox
              label="🎵 שיר"
              value={pickedTitle}
              placeholder="לחץ לבחירה"
              state={resultStateFor('title')}
              correctValue={submitted ? currentSong?.title : null}
              disabled={submitted}
              onClick={titleLongPress.wrapClick(() => setPicker('title'))}
            />
          </VoiceBoxWrap>
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
              style={{
                background: '#1db954', color: '#000', border: 'none', borderRadius: 14,
                fontSize: 16, fontWeight: 900, cursor: 'pointer',
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

// ─── VoiceBoxWrap — wraps a SelectBox with long-press handlers + visual cue ──
// While `listening`, a red ring + "🎙 …" badge appears over the box.
// `feedback` is { kind: 'miss' | 'error', text } and renders briefly under the
// value: red for a missed match, amber for an error like "HTTPS required".
function VoiceBoxWrap({ longPress, listening, feedback, dir, children }) {
  const isError = feedback?.kind === 'error';
  return (
    <div
      {...longPress.handlers}
      style={{
        position: 'relative',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        borderRadius: 14,
        boxShadow: listening
          ? '0 0 0 2px #dc3545'
          : (isError ? '0 0 0 2px #f39c12' : 'none'),
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
      {!listening && feedback?.text && (
        <div style={{
          position: 'absolute', bottom: 4, [dir === 'rtl' ? 'right' : 'left']: 8,
          fontSize: 10, color: isError ? '#f39c12' : '#ff9999', fontWeight: 600,
          pointerEvents: 'none',
          maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {isError ? '⚠' : '❌'} {feedback.text}
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

function decadeOf(year) {
  const n = Number(year);
  if (!n || isNaN(n)) return null;
  return Math.floor(n / 10) * 10;
}

// ─── StatCell — small stat tile used on the end screen ───────────────────────
function StatCell({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`,
      borderRadius: 12, padding: '14px 16px', textAlign: 'right',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: 'var(--text2)', fontSize: 11, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div style={{ color, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ─── Rules modal — bottom sheet shown when the user taps "❓ איך משחקים?" ───
function ChampionRulesModal({ onClose }) {
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
            <li>🎵 השמיע שיר רנדומלי מהפלייליסט שתבחר</li>
            <li>👆 לחץ על קוביית "זמר" / "שיר" / "שנה" כדי לבחור</li>
            <li>📝 בזמר ובשיר — חיפוש עם אוטו-השלמה</li>
            <li>📅 בשנה — בחר עשור ואז שנה</li>
            <li>✅ לחץ "שלח תשובות" — נכון יהפוך לירוק, לא נכון לאדום</li>
            <li>🏆 כל קוביה נכונה = 1 נקודה</li>
            <li>💎 כל הקוביות נכונות = +5 בונוס (סך 8 לסיבוב מושלם)</li>
          </ul>
        </div>
      </div>
    </>
  );
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
