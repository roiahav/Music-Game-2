import { useEffect } from 'react';

/**
 * Cast / AirPlay button. Calls the W3C Remote Playback API
 * (audio.remote.prompt) which surfaces the OS-native picker:
 * Chromecast in Chrome/Android, AirPlay in Safari/iOS.
 *
 * Always renders when the browser advertises the API. We don't gate on
 * `watchAvailability` — many browsers report "no devices" until the
 * picker is actually opened, which would cause the button to vanish even
 * when a cast target is reachable. If the user taps and there's nothing
 * around, the OS picker says so itself.
 */
const REMOTE_PLAYBACK_SUPPORTED =
  typeof window !== 'undefined' &&
  typeof window.HTMLMediaElement !== 'undefined' &&
  'remote' in window.HTMLMediaElement.prototype;

export default function CastButton({ audioRef, size = 46 }) {
  // Mark the audio element as AirPlay-eligible (Safari/iOS). Re-runs whenever
  // the ref gets attached so we don't miss elements that mount later.
  useEffect(() => {
    const el = audioRef?.current;
    if (!el) return;
    try { el.setAttribute('x-webkit-airplay', 'allow'); } catch {}
  });

  if (!REMOTE_PLAYBACK_SUPPORTED) return null;

  function onClick() {
    const el = audioRef?.current;
    if (el?.remote?.prompt) {
      el.remote.prompt().catch(() => {});
    }
  }

  return (
    <button
      onClick={onClick}
      title="שדר ל-TV / רמקול"
      style={{
        width: 56, height: size,
        background: 'var(--bg2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 12, fontSize: 20, cursor: 'pointer', flexShrink: 0,
      }}
    >
      📺
    </button>
  );
}
