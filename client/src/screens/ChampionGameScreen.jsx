import { useState, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { useAuthStore } from '../store/authStore.js';
import { getPlaylistSongs } from '../api/client.js';
import PlaylistSelector from '../components/PlaylistSelector.jsx';
import TimerBar from '../components/TimerBar.jsx';
import { AvatarCircle } from '../App.jsx';
import { useLang } from '../i18n/useLang.js';

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
  const { dir } = useLang();
  const { user } = useAuthStore();
  const { playlists } = useSettingsStore();

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

  // Car mode — voice recognition: player speaks the artist or title and the
  // app announces correct answer + auto-advances. Hands-free for driving.
  const [carMode, setCarMode] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const recognitionRef = useRef(null);
  const carModeRef = useRef(false);
  const currentSongRef = useRef(null);
  const submittedRef = useRef(false);
  // Voice match handlers stored in a ref so the long-lived recognition
  // listener always invokes the LATEST closures (queue/songIdx are fresh).
  const voiceHandlersRef = useRef({ onCorrect: null, onWrong: null });

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

  // Always-fresh ref for handleSubmit so TimerBar's captured onExpire calls
  // the latest version (with current picks) rather than a stale one
  const handleSubmitRef = useRef(null);

  // Keep refs in sync for the long-lived recognition listener
  useEffect(() => { carModeRef.current = carMode; }, [carMode]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);

  // Trigger SpeechSynthesis voice list to populate. Some browsers load voices
  // asynchronously and getVoices() returns [] on the first call.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const fire = () => window.speechSynthesis.getVoices();
    fire();
    window.speechSynthesis.addEventListener?.('voiceschanged', fire);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', fire);
  }, []);

  // Hard teardown on unmount — even if carMode is still true when the user
  // navigates away, this kills the mic + cancels any pending TTS.
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch {}
      try { recognitionRef.current?.abort(); } catch {}
      recognitionRef.current = null;
      try { window.speechSynthesis.cancel(); } catch {}
    };
  }, []);

  // Wrap the home-button handler so we explicitly stop the mic before unmount
  function exitGame() {
    // Sync the ref FIRST so the recognition.onend handler doesn't auto-restart
    carModeRef.current = false;
    setCarMode(false);
    try { recognitionRef.current?.stop(); } catch {}
    try { recognitionRef.current?.abort(); } catch {}
    try { window.speechSynthesis.cancel(); } catch {}
    onExit?.();
  }

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

  // ─── Car mode: speech recognition + TTS ─────────────────────────────────
  // Plays a quick chime via Web Audio (no asset needed)
  function playSuccessChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const notes = [880, 1320]; // simple two-note "ding"
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.3);
      });
      setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch {}
  }

  // Speak a string in Hebrew. Returns a promise that resolves when speech ends.
  // Picking a he-IL voice explicitly is required on most browsers — setting
  // utterance.lang alone often falls back to the default (English) voice.
  function speak(text) {
    return new Promise(resolve => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'he-IL';
        u.rate = 1.0;
        // Find a Hebrew voice from the available list. Voices populate async,
        // so if the list is empty we just rely on lang + the OS picking one.
        const voices = window.speechSynthesis.getVoices();
        const hebrewVoice =
          voices.find(v => v.lang === 'he-IL') ||
          voices.find(v => v.lang?.toLowerCase().startsWith('he')) ||
          null;
        if (hebrewVoice) u.voice = hebrewVoice;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch { resolve(); }
    });
  }

  // Set up the SpeechRecognition listener once when carMode turns on, and
  // tear it down when off. SR manages its own mic pipeline; we deliberately
  // DON'T pre-acquire via getUserMedia — holding an unused mic stream causes
  // mobile Chrome to flip into communication-mode, which lowers media volume
  // and creates the feedback/static the user reported.
  useEffect(() => {
    if (!carMode) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('הדפדפן שלך לא תומך בזיהוי קולי. נסה Chrome.');
      setCarMode(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;

    rec.onresult = (ev) => {
      let transcript = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript + ' ';
      }
      setVoiceTranscript(transcript);

      const song = currentSongRef.current;
      if (!song || submittedRef.current) return;

      const artistOk = looseContains(transcript, song.artist);
      const titleOk  = looseContains(transcript, song.title);

      // Explicit "שלח" voice command — submit whatever was said so far
      if (containsSubmitWord(transcript)) {
        try { rec.stop(); } catch {}
        if (artistOk || titleOk) voiceHandlersRef.current.onCorrect?.(song);
        else                     voiceHandlersRef.current.onWrong?.(song);
        return;
      }

      // Auto-match: artist OR title detected anywhere in the transcript
      if (artistOk || titleOk) {
        try { rec.stop(); } catch {}
        voiceHandlersRef.current.onCorrect?.(song);
      }
    };
    rec.onend = () => {
      setVoiceListening(false);
      if (carModeRef.current && !submittedRef.current) {
        setTimeout(() => { try { rec.start(); setVoiceListening(true); } catch {} }, 200);
      }
    };
    rec.onerror = () => { /* ignore — onend will retry */ };

    try { rec.start(); setVoiceListening(true); } catch {}

    return () => {
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      setVoiceListening(false);
      window.speechSynthesis.cancel();
    };
  }, [carMode]); // eslint-disable-line

  // Wrong handler — used when the player says "שלח" but didn't say the artist
  // or title. Reveals the right answer and advances.
  async function handleVoiceWrong(song) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    audioRef.current?.pause();
    setScore(s => ({
      points:        s.points,
      correctFields: s.correctFields,
      songsPlayed:   s.songsPlayed + 1,
      perfectRounds: s.perfectRounds,
    }));
    await new Promise(r => setTimeout(r, 200));
    await speak(`התשובה הנכונה: השיר ${song.title} של ${song.artist} משנת ${song.year}`);
    setTimeout(() => {
      submittedRef.current = false;
      nextSong();
    }, 300);
  }

  // Always store the latest version of the voice handlers in a ref, so the
  // long-lived recognition listener (set up once when carMode toggles on)
  // dispatches into closures with fresh queue/songIdx state.
  voiceHandlersRef.current = {
    onCorrect: (song) => handleVoiceCorrect(song),
    onWrong:   (song) => handleVoiceWrong(song),
  };

  // Match handler — plays chime, announces details, auto-advances
  async function handleVoiceCorrect(song, _correct) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitted(true);
    audioRef.current?.pause();
    playSuccessChime();
    // Score: count this as a perfect round (artist + title + year all "found")
    setScore(s => ({
      points:        s.points        + 8, // 3 fields + 5 bonus
      correctFields: s.correctFields + 3,
      songsPlayed:   s.songsPlayed   + 1,
      perfectRounds: s.perfectRounds + 1,
    }));
    // Wait a beat for the chime, then announce
    await new Promise(r => setTimeout(r, 400));
    await speak(`כל הכבוד! השיר ${song.title} של ${song.artist} משנת ${song.year}`);
    // Auto-advance
    setTimeout(() => {
      submittedRef.current = false;
      nextSong();
    }, 300);
  }

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
    setVoiceTranscript('');
    // In car mode, restart recognition for the new song so transcripts from the
    // previous round don't leak into the new match check
    if (carModeRef.current && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      // onend will auto-restart it
    }
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
        <TopBar onExit={exitGame} title={`🏆 אלוף הזיהויים`} />

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

          {/* Car mode — voice recognition toggle */}
          <div>
            <button
              onClick={() => setCarMode(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12,
                background: carMode ? 'var(--accent)' : 'var(--bg2)',
                color: carMode ? '#fff' : 'var(--text)',
                border: `1.5px solid ${carMode ? 'var(--accent)' : 'var(--border)'}`,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: carMode ? `0 2px 12px var(--accent-alpha)` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 22 }}>{carMode ? '🎙️' : '🚗'}</span>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontWeight: 800 }}>
                  {carMode ? 'מצב רכב פעיל — דבר את התשובה' : 'מצב רכב (ידיים חופשיות)'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                  {carMode
                    ? 'אומר את שם הזמר או השיר, המערכת תזהה ותכריז את התשובה'
                    : 'הפעל זיהוי קולי במקום לבחור עם האצבעות'}
                </div>
              </div>
            </button>
          </div>

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
        <TopBar onExit={exitGame} title="🏆 סוף המשחק" />
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
            <button onClick={exitGame} style={secondaryBtn}>← חזרה למסך הבית</button>
          </div>
        </div>
      </div>
    );
  }

  // playing phase
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', direction: dir }}>
      <TopBar
        onExit={exitGame}
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

        {/* Car mode listening indicator */}
        {carMode && !submitted && (
          <div style={{
            background: voiceListening ? 'var(--accent-alpha)' : 'var(--bg2)',
            border: `1.5px solid ${voiceListening ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 22, color: voiceListening ? 'var(--accent)' : 'var(--text2)' }}>
              {voiceListening ? '🎙️' : '🔇'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: voiceListening ? 'var(--accent)' : 'var(--text2)', fontSize: 13, fontWeight: 800 }}>
                {voiceListening ? 'מקשיב... דבר עכשיו' : 'מאתחל...'}
              </div>
              {voiceTranscript && (
                <div style={{ color: 'var(--text)', fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  «{voiceTranscript.trim()}»
                </div>
              )}
            </div>
          </div>
        )}

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
            <li>🚗 במצב רכב — אומרים בקול את הזמר/השיר. אמרו "שלח" כדי לבדוק את התשובה</li>
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

// Voice trigger words for explicit submit — handles both Hebrew and a few
// English fallbacks the recognizer may surface. Matched as whole words at
// the END of the transcript so earlier mentions of "שלחתי" don't fire.
const SUBMIT_WORDS = ['שלח', 'שלחי', 'שלחו', 'אישור', 'בדוק', 'submit', 'send'];
function containsSubmitWord(transcript) {
  if (!transcript) return false;
  const norm = String(transcript)
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return false;
  // Only fire if the trigger appears within the LAST 3 spoken words —
  // protects against re-triggering on accumulated transcripts
  const tail = norm.split(' ').slice(-3).join(' ');
  return SUBMIT_WORDS.some(w => new RegExp(`(^|\\s)${w}(\\s|$)`).test(tail));
}

// Fuzzy match for voice recognition — strips punctuation/diacritics and
// checks whether the (longer) transcript contains the (shorter) target,
// or whether all target words appear in the transcript regardless of order.
function looseContains(transcript, target) {
  if (!transcript || !target) return false;
  const norm = s => String(s)
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '')              // strip Hebrew diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')            // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
  const t = norm(transcript);
  const g = norm(target);
  if (!t || !g) return false;
  if (t.includes(g)) return true;
  // Last-resort: every word of the target must show up somewhere in the transcript
  const words = g.split(' ').filter(w => w.length >= 2);
  if (words.length === 0) return false;
  return words.every(w => t.includes(w));
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
