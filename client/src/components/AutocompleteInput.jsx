import { useState, useRef } from 'react';
import { useLang } from '../i18n/useLang.js';

// Checks whether user's first typed character matches the answer's first character (Hebrew-aware)
function firstCharMatches(typed, answer) {
  if (!typed || !answer) return false;
  return typed[0].toLowerCase() === answer.trim()[0].toLowerCase();
}

export default function AutocompleteInput({ label, answer, disabled, onAccept, onPenalty }) {
  const [phase, setPhase] = useState('idle'); // idle | match | wrong | locked | accepted
  const [attempts, setAttempts] = useState(0);
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
    </div>
  );
}
