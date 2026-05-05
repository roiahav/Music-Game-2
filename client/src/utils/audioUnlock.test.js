import { describe, it, expect, vi, beforeEach } from 'vitest';

// Each test gets a fresh module so the "unlocked" guard resets.
async function freshUnlock() {
  vi.resetModules();
  return (await import('./audioUnlock.js')).unlockAudio;
}

function fakeAudio({ playOk = true, prevSrc = '' } = {}) {
  const el = {
    src: prevSrc,
    paused: false,
    currentTime: 0,
    pause: vi.fn(),
    removeAttribute: vi.fn(name => { if (name === 'src') el.src = ''; }),
    play: vi.fn(() => playOk
      ? Promise.resolve()
      : Promise.reject(new Error('NotAllowed'))),
  };
  return el;
}

describe('unlockAudio', () => {
  beforeEach(() => vi.resetModules());

  it('is a no-op when audioEl is missing', async () => {
    const unlockAudio = await freshUnlock();
    expect(() => unlockAudio(null)).not.toThrow();
    expect(() => unlockAudio(undefined)).not.toThrow();
  });

  it('plays a tiny silent clip and restores the previous src', async () => {
    const unlockAudio = await freshUnlock();
    const audio = fakeAudio({ prevSrc: 'http://x/song.mp3' });
    unlockAudio(audio);
    // src is set to the data URI synchronously
    expect(audio.src).toMatch(/^data:audio\/wav;base64,/);
    expect(audio.play).toHaveBeenCalledTimes(1);
    // Wait for the play() promise + cleanup
    await new Promise(r => setTimeout(r, 0));
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('http://x/song.mp3');
    expect(audio.currentTime).toBe(0);
  });

  it('removes the src attribute when there was no previous src', async () => {
    const unlockAudio = await freshUnlock();
    const audio = fakeAudio({ prevSrc: '' });
    unlockAudio(audio);
    await new Promise(r => setTimeout(r, 0));
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('cleans up even when play() rejects', async () => {
    const unlockAudio = await freshUnlock();
    const audio = fakeAudio({ playOk: false, prevSrc: 'http://x/song.mp3' });
    unlockAudio(audio);
    await new Promise(r => setTimeout(r, 0));
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('http://x/song.mp3');
  });

  it('only unlocks once per page load', async () => {
    const unlockAudio = await freshUnlock();
    const a = fakeAudio();
    const b = fakeAudio();
    unlockAudio(a);
    unlockAudio(b);
    expect(a.play).toHaveBeenCalledTimes(1);
    expect(b.play).not.toHaveBeenCalled();
  });
});
