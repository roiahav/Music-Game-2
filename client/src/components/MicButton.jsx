import { useEffect, useRef } from 'react';
import { useSpeechRecognition, uiLangToBcp47 } from '../hooks/useSpeechRecognition.js';
import { useLang } from '../i18n/useLang.js';

/**
 * Microphone button for voice-guessing the artist (or any other field).
 *
 * Behaviour on tap:
 *   1. Pauses any audio referenced by `audioRef` (caller passes its <audio>'s ref)
 *      OR calls `onListenStart` so the parent can pause its own player.
 *   2. Starts speech recognition in the current UI language.
 *   3. Emits the transcript via `onResult` so the parent can match / fill the field.
 *
 * Tapping again while listening stops the recognizer.
 *
 * Props:
 *   audioRef       — optional ref to an HTMLAudioElement to pause on press
 *   onListenStart  — optional callback to pause something other than audioRef
 *   onListenEnd    — optional callback fired when recognition ends
 *   onResult       — callback (transcript, alternatives) when speech is recognized
 *   disabled       — disable the button
 *   size           — pixel size (default 36)
 *   title          — tooltip (defaults to localized "say the artist's name")
 */
export default function MicButton({
  audioRef,
  onListenStart,
  onListenEnd,
  onResult,
  disabled,
  size = 36,
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
    onError: () => { onListenEnd?.(); },
  });

  // If recognition ends without a result (no-speech / aborted), still notify parent
  useEffect(() => {
    if (!listening && sawResultRef.current === false) return;
    if (!listening) sawResultRef.current = false;
  }, [listening]);

  function handleClick() {
    if (disabled || !supported) return;
    if (listening) { stop(); return; }
    // Pause music before listening so the recognizer doesn't pick up the song
    try { audioRef?.current?.pause?.(); } catch { /* ignore */ }
    onListenStart?.();
    sawResultRef.current = false;
    start();
  }

  const tooltip = !supported
    ? t('mic_unsupported')
    : (title || (listening ? t('mic_listening') : t('mic_say_artist')));

  const bg     = listening ? '#dc3545' : '#2d2d30';
  const border = listening ? '#dc3545' : '#3a3a3a';
  const color  = listening ? '#fff'    : (supported ? '#ccc' : '#555');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !supported}
      title={tooltip}
      aria-label={tooltip}
      style={{
        width: size, height: size, flexShrink: 0,
        background: bg, border: `1px solid ${border}`,
        color, borderRadius: 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: (disabled || !supported) ? 'not-allowed' : 'pointer',
        padding: 0, fontSize: Math.round(size * 0.5),
        opacity: !supported ? 0.5 : 1,
        transition: 'all 0.15s',
        animation: listening ? 'mic-pulse 1.1s ease-in-out infinite' : 'none',
      }}
    >
      <span aria-hidden="true">{listening ? '⏺' : '🎙'}</span>
      <style>{`
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.6); }
          50%      { box-shadow: 0 0 0 8px rgba(220, 53, 69, 0); }
        }
      `}</style>
    </button>
  );
}
