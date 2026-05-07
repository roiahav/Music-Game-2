import { useState, useRef } from 'react';
import { useLang } from '../i18n/useLang.js';
import { useSpeechRecognition, uiLangToBcp47 } from '../hooks/useSpeechRecognition.js';
import { useLongPress } from '../hooks/useLongPress.js';
import { isVoiceMatch } from '../utils/textMatch.js';

// Checks whether user's first typed character matches the answer's first character (Hebrew-aware)
function firstCharMatches(typed, answer) {
  if (!typed || !answer) return false;
  return typed[0].toLowerCase() === answer.trim()[0].toLowerCase();
}

export default function AutocompleteInput({
  label,
  answer,
  disabled,
  onAccept,
  onPenalty,
  // When provided, long-press on the row pauses this audio + opens speech
  // recognition to take a full-name voice answer (bypasses the first-char flow).
  audioRef,
  enableMic = false,
}) {
  const [phase, setPhase] = useState('idle'); // idle | match | wrong | locked | accepted
  const [attempts, setAttempts] = useState(0);
  const [voiceState, setVoiceState] = useState(null); // null | 'listening' | { miss: text }
  const inputRef = useRef(null);
  const { t, lang, dir } = useLang();

  const ans = (answer || '').trim();

  // Voice / speech recognition — only created when enabled
  const { supported: voiceSupported, listening, start, stop } = useSpeechRecognition({
    lang: uiLangToBcp47(lang),
    onResult: (r) => {
      if (!r.isFinal) return;
      const heard = [r.transcript, ...(r.alternatives || [])].filter(Boolean);
      if (heard.some(h => isVoiceMatch(h, ans))) {
        setVoiceState(null);
        setPhase('accepted');
        onAccept?.();
        return;
      }
      // Treat as a wrong attempt (same penalty curve as a wrong typed char)
      setVoiceState({ miss: r.transcript || '' });
      const n = attempts + 1;
      setAttempts(n);
      setPhase('wrong');
      setTimeout(() => {
        setVoiceState(null);
        if (n >= 3) { setPhase('locked'); onPenalty?.(); }
        else setPhase('idle');
      }, 1200);
    },
    onError: () => { setVoiceState(null); },
  });

  function startVoice() {
    if (!enableMic || !voiceSupported) return;
    if (phase === 'accepted' || phase === 'locked' || disabled) return;
    try { audioRef?.current?.pause?.(); } catch { /* ignore */ }
    setVoiceState('listening');
    start();
  }

  // Long-press: hold the row → start listening
  const longPress = useLongPress({ onLongPress: startVoice, threshold: 450 });

  function handleChange(e) {
    const val = e.target.value;
    e.target.value = ''; // Always clear — we only care about first char
    if (!val || phase !== 'idle') return;

    if (firstCharMatches(val, ans)) {
      setPhase('match');
    } else {
      const n = attempts + 1;
      setAttempts(n);
      setPhase('wrong');
      setTimeout(() => {
        if (n >= 3) { setPhase('locked'); onPenalty?.(); }
        else setPhase('idle');
      }, 700);
    }
  }

  function accept() {
    setPhase('accepted');
    onAccept?.();
  }

  function rejectMatch() {
    setPhase('idle'); // Let user try again
  }

  const isDisabled = disabled || phase === 'locked' || phase === 'accepted';
  const showMicHint = enableMic && voiceSupported && phase === 'idle' && !listening && voiceState !== 'listening';

  return (
    <div
      {...(enableMic && voiceSupported ? longPress.handlers : {})}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 12,
        background: listening ? '#3a1a1a' : '#2d2d30',
        border: `1px solid ${listening ? '#dc3545' : '#3a3a3a'}`,
        direction: dir,
        userSelect: enableMic ? 'none' : 'auto',
        WebkitUserSelect: enableMic ? 'none' : 'auto',
        WebkitTouchCallout: enableMic ? 'none' : 'default',
        transition: 'background 0.15s, border 0.15s',
        position: 'relative',
      }}
    >
      <span style={{ color: '#888', fontSize: 13, minWidth: 52, flexShrink: 0 }}>{label}:</span>

      <div style={{ flex: 1, direction: dir }}>
        {phase === 'accepted' && (
          <span style={{ color: '#1db954', fontWeight: 700, fontSize: 15 }}>✓ {ans}</span>
        )}
        {phase === 'locked' && (
          <span style={{ color: '#dc3545', fontSize: 13 }}>❌ {ans}</span>
        )}
        {phase === 'match' && (
          <span style={{ fontSize: 15 }}>
            <span style={{ color: '#fff', fontWeight: 700 }}>{ans[0]}</span>
            <span style={{ color: '#444' }}>{ans.slice(1)}</span>
          </span>
        )}
        {(phase === 'idle' || phase === 'wrong') && (
          listening || voiceState === 'listening' ? (
            <span style={{ color: '#ff6b6b', fontSize: 14, fontWeight: 600 }}>
              🎙 {t('mic_listening')}
            </span>
          ) : voiceState?.miss ? (
            <span style={{ color: '#dc3545', fontSize: 13 }}>
              ❌ {t('mic_heard')}: <span style={{ color: '#ff9999' }}>{voiceState.miss}</span>
            </span>
          ) : (
            <input
              ref={inputRef}
              onChange={handleChange}
              disabled={isDisabled}
              // While the row may be in long-press mode, taps on the input
              // itself still focus + type normally
              onPointerDown={(e) => e.stopPropagation()}
              placeholder={phase === 'wrong' ? `❌ ${t('attempt')} ${attempts}/3` : t('type_first')}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: phase === 'wrong' ? '#dc3545' : '#ccc',
                fontSize: 14, width: '100%', direction: dir,
              }}
            />
          )
        )}
      </div>

      {/* Attempts indicator */}
      {(phase === 'idle' || phase === 'wrong') && attempts > 0 && !listening && (
        <span style={{ fontSize: 11, color: '#dc3545', flexShrink: 0 }}>{attempts}/3</span>
      )}

      {phase === 'match' && (
        <>
          <button
            onClick={accept}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: '#1db954', color: '#000', borderRadius: 8, padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
          >
            ✓
          </button>
          <button
            onClick={rejectMatch}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: '#444', color: '#ccc', borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
          >
            ✗
          </button>
        </>
      )}

      {/* Mic hint — shown only while idle, indicating long-press is available */}
      {showMicHint && (
        <span
          aria-hidden="true"
          title={t('mic_long_press_hint')}
          style={{ fontSize: 14, color: '#666', flexShrink: 0, opacity: 0.7 }}
        >
          🎙
        </span>
      )}

      {/* Tap-to-stop while listening (in case user wants to cancel early) */}
      {listening && (
        <button
          onClick={(e) => { e.stopPropagation(); stop(); setVoiceState(null); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ background: '#dc3545', color: '#fff', borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
