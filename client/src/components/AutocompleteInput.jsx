import { useState, useRef } from 'react';
import { useLang } from '../i18n/useLang.js';
import MicButton from './MicButton.jsx';
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
  // When provided, render a mic that pauses this audio element + accepts on a
  // good voice match (full-name shortcut, bypasses the first-character flow).
  audioRef,
  enableMic = false,
}) {
  const [phase, setPhase] = useState('idle'); // idle | match | wrong | locked | accepted
  const [attempts, setAttempts] = useState(0);
  const [voiceFeedback, setVoiceFeedback] = useState(null); // 'listening' | { miss: text }
  const inputRef = useRef(null);
  const { t, dir } = useLang();

  const ans = (answer || '').trim();

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
    setPhase('idle'); // Let user try again (still counts the char as typed but no penalty)
  }

  function handleVoiceResult(transcript, alternatives) {
    setVoiceFeedback(null);
    if (phase === 'accepted' || phase === 'locked') return;
    const heard = [transcript, ...(alternatives || [])].filter(Boolean);
    if (heard.some(h => isVoiceMatch(h, ans))) {
      // Full-name match — skip first-char ceremony, accept directly
      setPhase('accepted');
      onAccept?.();
      return;
    }
    // Treat as a wrong attempt (same penalty curve as a wrong typed char)
    setVoiceFeedback({ miss: transcript || '' });
    const n = attempts + 1;
    setAttempts(n);
    setPhase('wrong');
    setTimeout(() => {
      setVoiceFeedback(null);
      if (n >= 3) { setPhase('locked'); onPenalty?.(); }
      else setPhase('idle');
    }, 1200);
  }

  const isDisabled = disabled || phase === 'locked' || phase === 'accepted';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: '#2d2d30', border: '1px solid #3a3a3a', direction: dir }}>
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
          voiceFeedback?.miss ? (
            <span style={{ color: '#dc3545', fontSize: 13 }}>
              ❌ {t('mic_heard')}: <span style={{ color: '#ff9999' }}>{voiceFeedback.miss}</span>
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
      {(phase === 'idle' || phase === 'wrong') && attempts > 0 && (
        <span style={{ fontSize: 11, color: '#dc3545', flexShrink: 0 }}>{attempts}/3</span>
      )}

      {phase === 'match' && (
        <>
          <button onClick={accept} style={{ background: '#1db954', color: '#000', borderRadius: 8, padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            ✓
          </button>
          <button onClick={rejectMatch} style={{ background: '#444', color: '#ccc', borderRadius: 8, padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>
            ✗
          </button>
        </>
      )}

      {/* Mic — say the answer instead of typing */}
      {enableMic && (
        <MicButton
          audioRef={audioRef}
          onListenStart={() => setVoiceFeedback({ miss: '' })}
          onListenEnd={() => setVoiceFeedback(v => (v?.miss ? v : null))}
          onResult={handleVoiceResult}
          disabled={isDisabled}
          size={32}
        />
      )}
    </div>
  );
}
