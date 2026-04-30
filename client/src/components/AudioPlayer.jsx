import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useGameStore } from '../store/gameStore.js';

const AudioPlayer = forwardRef(function AudioPlayer({ src, onEnded }, ref) {
  const audioRef = useRef(null);
  const setPlaying = useGameStore(s => s.setPlaying);

  useImperativeHandle(ref, () => ({
    play() { audioRef.current?.play(); },
    pause() { audioRef.current?.pause(); },
    seekForward(secs) {
      if (audioRef.current) audioRef.current.currentTime += secs;
    },
    setVolume(v) {
      if (audioRef.current) audioRef.current.volume = v / 100;
    },
    getCurrentTime() { return audioRef.current?.currentTime || 0; },
  }));

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    el.src = src;
    el.load();
    el.play().catch(() => {});
  }, [src]);

  return (
    <audio
      ref={audioRef}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => { setPlaying(false); onEnded?.(); }}
      preload="auto"
    />
  );
});

export default AudioPlayer;
