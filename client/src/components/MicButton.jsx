import { useEffect, useRef } from 'react';
import { useSpeechRecognition, uiLangToBcp47 } from '../hooks/useSpeechRecognition.js';
import { useLang } from '../i18n/useLang.js';

/**
 * Microphone button for voice-guessing a single field (artist, song, …).
 *
 * Behaviour on tap:
 *   1. Pauses any audio referenced by `audioRef` (parent passes its <audio>'s ref).
 *   2. Starts speech recognition in the current UI language.
 *   3. Emits the transcript via `onResult` so the parent can match / fill the field.
 *   4. Surfaces failures via `onError(code)` — common codes: 'unsupported',
 *      'service-not-allowed' (HTTPS required), 'not-allowed' (permission denied),
 *      'audio-capture', 'no-speech', 'network'.
 *
 * Tapping again while listening stops the recognizer.
 *
 * Props:
 *   audioRef       — optional ref to an HTMLAudioElement to pause on press
 *   onListenStart  — optional callback fired when recognition begins
 *   onListenEnd    — optional callback fired when recognition ends
 *   onResult       — callback (transcript, alternatives) when speech is recognized
 *   onError        — callback (code) when speech recognition fails
 *   disabled       — disable the button
 *   size           — pixel size (default 36, square)
 *   shape          — 'square' (default) | 'wide' (full-height pill in flex row)
 *   title          — tooltip (defaults to localized "say the artist's name")
 */
export default function MicButton({
  audioRef,
  onListenStart,
  onListenEnd,
  onResult,
  onError,
  disabled,
  size = 36,
  shape = 'square',
  title,
}) {
  const { lang, t } = useLang();
  const sawResultRef = useRef(false);

  const { supported, listening, start, stop } = useSpeechRecognition({
    lang: uiLangToBcp47(lang),
    onResult: (r) => {
      if (!r.isFinal) return;
      sawResultRef.current = true;
      onResult?.(r.transcript || '', r.alternatives || []);
      onListenEnd?.();
    },
    onError: (e) => {
      onError?.(e?.error || 'error');
      onListenEnd?.();
    },
  });

  // If recognition ends without a result (no-speech / aborted), still notify parent
  useEffect(() => {
    if (!listening && sawResultRef.current === false) return;
    if (!listening) sawResultRef.current = false;
  }, [listening]);

  function handleClick(e) {
    e.stopPropagation();
    if (disabled) return;
    if (!supported) {
      // Most common reason on mobile: page is on plain HTTP, so the API isn't
      // exposed. Tell the parent so it can show a friendly message.
      onError?.(typeof window !== 'undefined' && window.isSecureContext ? 'unsupported' : 'service-not-allowed');
      return;
    }
    if (listening) { stop(); return; }
    // Pause music before listening so the recognizer doesn't pick up the song
    try { audioRef?.current?.pause?.(); } catch { /* ignore */ }
    onListenStart?.();
    sawResultRef.current = false;
    try {
      start();
    } catch {
      onError?.('error');
      onListenEnd?.();
    }
  }

  const tooltip = !supported
    ? t('mic_unsupported')
    : (title || (listening ? t('mic_listening') : t('mic_say_artist')));

  const bg     = listening ? '#dc3545' : '#2d2d30';
  const border = listening ? '#dc3545' : '#3a3a3a';
  const color  = listening ? '#fff'    : (supported ? '#ccc' : '#888');

  const isWide = shape === 'wide';
  const widthStyle = isWide
    ? { width: size, alignSelf: 'stretch' }
    : { width: size, height: size };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={disabled}
      title={tooltip}
      aria-label={tooltip}
      style={{
        ...widthStyle, flexShrink: 0,
        background: bg, border: `1px solid ${border}`,
        color, borderRadius: isWide ? 14 : 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0, fontSize: isWide ? 26 : Math.round(size * 0.5),
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        animation: listening ? 'mic-pulse 1.1s ease-in-out infinite' : 'none',
      }}
    >
      <span aria-hidden="true">{listening ? '⏺' : '🎤'}</span>
      <style>{`
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.6); }
          50%      { box-shadow: 0 0 0 8px rgba(220, 53, 69, 0); }
        }
      `}</style>
    </button>
  );
}
