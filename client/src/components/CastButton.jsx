import { useEffect, useState } from 'react';

/**
 * Cast / AirPlay button. Calls the W3C Remote Playback API
 * (audio.remote.prompt) which surfaces the OS-native picker:
 * Chromecast in Chrome/Android, AirPlay in Safari/iOS.
 *
 * Hidden automatically if the browser has no remote-playback support
 * or the audio element isn't ready yet.
 */
export default function CastButton({ audioRef, size = 46 }) {
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState(true); // optimistic — many browsers don't fire watchAvailability

  useEffect(() => {
    const el = audioRef?.current;
    if (!el) return;
    try { el.setAttribute('x-webkit-airplay', 'allow'); } catch {}
    if (!('remote' in el) || !el.remote) {
      setSupported(false);
      return;
    }
    setSupported(true);
    let cb;
    try {
      cb = el.remote.watchAvailability(a => setAvailable(!!a));
    } catch {}
    return () => {
      try { if (cb && el.remote) el.remote.cancelWatchAvailability(cb); } catch {}
    };
  }, [audioRef]);

  if (!supported || !available) return null;

  function onClick() {
    const el = audioRef?.current;
    if (!el?.remote) return;
    el.remote.prompt().catch(() => {});
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
