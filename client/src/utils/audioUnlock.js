// 44-byte silent WAV — used to "warm" an <audio> element inside a click
// handler so subsequent socket-driven .play() calls aren't blocked by the
// browser's autoplay policy (mostly mobile Chrome and iOS Safari).
const SILENT_WAV = 'data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let unlocked = false;

export function unlockAudio(audioEl) {
  if (unlocked || !audioEl) return;
  unlocked = true;
  const prevSrc = audioEl.src;
  const cleanup = () => {
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
      if (prevSrc) audioEl.src = prevSrc;
      else audioEl.removeAttribute('src');
    } catch {}
  };
  try {
    audioEl.src = SILENT_WAV;
    const p = audioEl.play();
    if (p && typeof p.then === 'function') {
      p.then(cleanup).catch(cleanup);
    } else {
      cleanup();
    }
  } catch {
    cleanup();
  }
}
