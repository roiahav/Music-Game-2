import { useRef, useEffect, useCallback } from 'react';

// Compact picker so the whole game (cover + inputs + picker + button) fits
// in one phone viewport without scrolling
const ITEM_H = 36;
const VISIBLE = 3;                             // 3 items: prev / selected / next
const PAD = ITEM_H * Math.floor(VISIBLE / 2);  // 1 item padding top/bottom

function buildYears(min = 1950, max = 2025) {
  const arr = [];
  for (let y = min; y <= max; y++) arr.push(y);
  return arr;
}

const YEARS = buildYears();

export default function YearPicker({ value, onChange, disabled }) {
  const ref = useRef(null);
  const suppressRef = useRef(false); // prevent onChange loop when scrolling programmatically

  const scrollToYear = useCallback((year, smooth = false) => {
    const idx = YEARS.indexOf(year);
    if (ref.current && idx >= 0) {
      suppressRef.current = true;
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'instant' });
      setTimeout(() => { suppressRef.current = false; }, 300);
    }
  }, []);

  // Scroll to initial value on mount
  useEffect(() => { scrollToYear(value || 2000); }, []); // eslint-disable-line

  // Snap on scroll end
  const snapTimer = useRef(null);
  function onScroll() {
    if (suppressRef.current) return;
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(YEARS.length - 1, idx));
      scrollToYear(YEARS[clamped], true);
      if (YEARS[clamped] !== value) onChange(YEARS[clamped]);
    }, 120);
  }

  const containerH = ITEM_H * VISIBLE;

  return (
    <div style={{ position: 'relative', height: containerH, borderRadius: 12, background: '#1e1e1e', overflow: 'hidden', opacity: disabled ? 0.5 : 1 }}>
      {/* Fade top */}
      <div style={{ position: 'absolute', top: 0, insetInline: 0, height: PAD, background: 'linear-gradient(to bottom, #1e1e1e 40%, transparent)', zIndex: 2, pointerEvents: 'none' }} />
      {/* Selection highlight */}
      <div style={{ position: 'absolute', top: PAD, insetInline: 12, height: ITEM_H, background: 'rgba(0,122,204,0.25)', border: '1px solid #007ACC', borderRadius: 8, zIndex: 1, pointerEvents: 'none' }} />
      {/* Fade bottom */}
      <div style={{ position: 'absolute', bottom: 0, insetInline: 0, height: PAD, background: 'linear-gradient(to top, #1e1e1e 40%, transparent)', zIndex: 2, pointerEvents: 'none' }} />

      <div
        ref={ref}
        onScroll={onScroll}
        style={{ height: '100%', overflowY: disabled ? 'hidden' : 'scroll', scrollbarWidth: 'none', paddingTop: PAD, paddingBottom: PAD, boxSizing: 'content-box' }}
      >
        {YEARS.map(y => (
          <div
            key={y}
            onClick={() => !disabled && (scrollToYear(y, true), onChange(y))}
            style={{
              height: ITEM_H,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: y === value ? '#fff' : '#666',
              fontSize: y === value ? 17 : 13,
              fontWeight: y === value ? 800 : 400,
              cursor: disabled ? 'default' : 'pointer',
              userSelect: 'none',
            }}
          >
            {y}
          </div>
        ))}
      </div>
    </div>
  );
}
