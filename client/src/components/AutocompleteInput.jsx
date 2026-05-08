import { useState, useRef } from 'react';
import { useLang } from '../i18n/useLang.js';
import MicButton from './MicButton.jsx';
import { isVoiceMatch } from '../utils/textMatch.js';

// Checks whether user's first typed character matches the answer's first character (Hebrew-aware)
function firstCharMatches(typed, answer) {
  if (!typed || !answer) return false;
  return typed[0].toLowerCase() === answer.trim()[0].toLowerCase();
}

/** SpeechRecognition error code → i18n key. */
function speechErrorKey(code) {
  switch (code) {
    case 'not-allowed':         return 'mic_perm_denied';
    case 'service-not-allowed': return 'mic_https_required';
    case 'audio-capture':       return 'mic_no_capture';
    case 'no-speech':           return 'mic_no_speech';
    case 'network':             return 'mic_network';
    case 'unsupported':         return 'mic_unsupported';
    default:                    return 'mic_error';
  }
}

export default function AutocompleteInput({
  label,
  answer,
  disabled,
  onAccept,
  onPenalty,
  // When provided, a small mic button at the end of the row pauses this audio
  // and runs speech recognition. A confident voice match accepts directly,
  // bypassing the first-character flow.
  audioRef,
  enableMic = false,
}) {
  const [phase, setPhase] = useState('idle'); // idle | match | wrong | locked | accepted
  const [attempts, setAttempts] = useState(0);
  // null | 'listening' | { miss: text } | { error: text }
  const [voiceState, setVoiceState] = useState(null);
  const inputRef = useRef(null);
  const errorTimerRef = useRef(null);
  const { t, dir } = useLang();

  const ans = (answer || '').trim();

  function flashError(messageKey) {
    setVoiceState({ error: t(messageKey) });
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setVoiceState(null), 2400);
  }

  function handleVoiceResult(transcript, alternatives) {
    const heard = [transcript, ...(alternatives || [])].filter(Boolean);
    if (heard.some(h => isVoiceMatch(h, ans))) {
      setVoiceState(null);
      setPhase('accepted');
      onAccept?.();
      return;
    }
    // Treat as a wrong attempt (same penalty curve as a wrong typed char)
    setVoiceState({ miss: transcript || '' });
    const n = attempts + 1;
    setAttempts(n);
    setPhase('wrong');
    setTimeout(() => {
      setVoiceState(null);
      if (n >= 3) { setPhase('locked'); onPenalty?.(); }
      else setPhase('idle');
    }, 1200);
  }

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
  const errorMsg = voiceState && typeof voiceState === 'object' && 'error' in voiceState ? voiceState.error : null;
  const listening = voiceState === 'listening';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 12,
        background: listening ? '#3a1a1a' : (errorMsg ? '#3a2010' : '#2d2d30'),
        border: `1px solid ${listening ? '#dc3545' : (errorMsg ? '#f39c12' : '#3a3a3a')}`,
        direction: dir,
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
          listening ? (
            <span style={{ color: '#ff6b6b', fontSize: 14, fontWeight: 600 }}>
              🎙 {t('mic_listening')}
            </span>
          ) : errorMsg ? (
            <span style={{ color: '#f39c12', fontSize: 13, fontWeight: 600 }}>
              ⚠ {errorMsg}
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
      {(phase === 'idle' || phase === 'wrong') && attempts > 0 && !listening && !errorMsg && (
        <span style={{ fontSize: 11, color: '#dc3545', flexShrink: 0 }}>{attempts}/3</span>
      )}

      {phase === 'match' && (
        <>
          <button
            onClick={accept}
            style={{ background: '#1db954', color: '#000', borderRadius: 8, padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
          >
            ✓
          </button>
          <button
            onClick={rejectMatch}
            style={{ background: '#444', color: '#ccc', borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
          >
            ✗
          </button>
        </>
      )}

      {/* Mic button — visible, tap to record */}
      {enableMic && (
        <MicButton
          audioRef={audioRef}
          onListenStart={() => setVoiceState('listening')}
          onListenEnd={() => setVoiceState((prev) => prev === 'listening' ? null : prev)}
          onResult={handleVoiceResult}
          onError={(code) => flashError(speechErrorKey(code))}
          disabled={isDisabled}
          size={36}
        />
      )}
    </div>
  );
}
