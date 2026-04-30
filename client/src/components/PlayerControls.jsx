import { useGameStore } from '../store/gameStore.js';

export default function PlayerControls({ audioRef, isSpotify, onNext, onRevealAll, onSpotifyPause, onSpotifyResume, onSpotifySeek }) {
  const { isPlaying, revealAll } = useGameStore();

  function handlePlayPause() {
    if (isSpotify) {
      isPlaying ? onSpotifyPause?.() : onSpotifyResume?.();
    } else {
      isPlaying ? audioRef.current?.pause() : audioRef.current?.play();
    }
  }

  function handleSeek() {
    if (isSpotify) onSpotifySeek?.();
    else audioRef.current?.seekForward(30);
  }

  function handleRevealAll() {
    revealAll();
    onRevealAll?.();
  }

  const btnBase = 'no-select flex items-center justify-center rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer';

  return (
    <div className="flex gap-2 px-4">
      {/* Play / Pause */}
      <button
        onClick={handlePlayPause}
        className={btnBase}
        style={{ flex: 1, height: 52, background: '#007ACC', color: '#fff', fontSize: 22 }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* +30s */}
      <button
        onClick={handleSeek}
        className={btnBase}
        style={{ flex: 1, height: 52, background: '#2d2d30', color: '#ccc', border: '1px solid #444' }}
      >
        +30s
      </button>

      {/* Next */}
      <button
        onClick={onNext}
        className={btnBase}
        style={{ flex: 1, height: 52, background: '#2d2d30', color: '#ccc', border: '1px solid #444', fontSize: 20 }}
      >
        ⏭
      </button>

      {/* Reveal All */}
      <button
        onClick={handleRevealAll}
        className={btnBase}
        style={{ flex: 1.5, height: 52, background: '#28a745', color: '#fff' }}
      >
        💡 גלה
      </button>
    </div>
  );
}
