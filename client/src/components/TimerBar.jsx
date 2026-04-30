import { useEffect, useRef, useState } from 'react';

export default function TimerBar({ seconds, onExpire, songId }) {
  const [remaining, setRemaining] = useState(seconds);
  const intervalRef = useRef(null);

  // Reset and restart whenever song changes or seconds changes
  useEffect(() => {
    setRemaining(seconds);
  }, [songId, seconds]);

  useEffect(() => {
    if (!seconds) return;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [songId, seconds]);

  if (!seconds) return null;

  const pct = (remaining / seconds) * 100;
  const color = pct > 50 ? '#1db954' : pct > 25 ? '#ffb347' : '#dc3545';

  return (
    <div className="px-4 flex items-center gap-3">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: '#2d2d30' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            transition: 'width 1s linear, background 0.5s',
          }}
        />
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color, minWidth: 28, textAlign: 'right' }}>
        {remaining}
      </span>
    </div>
  );
}
