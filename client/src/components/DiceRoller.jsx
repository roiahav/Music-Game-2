/**
 * Animated 3D-CSS die. Spin for ~1.4s then settle on the given `value` (1-6).
 * Pure visual — the parent decides when to mount it and what value to show.
 *
 * Usage:
 *   <DiceRoller value={4} size={96} onSettled={() => ...} />
 */

import { useEffect, useState } from 'react';

const FACE_ROTATIONS = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(180deg) rotateY(0deg)',
};

export default function DiceRoller({ value, size = 96, onSettled }) {
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    setSpinning(true);
    const t = setTimeout(() => {
      setSpinning(false);
      if (onSettled) onSettled();
    }, 1400);
    return () => clearTimeout(t);
  }, [value]);

  const finalRotation = FACE_ROTATIONS[Math.max(1, Math.min(6, value || 1))];
  const transform = spinning
    ? 'rotateX(720deg) rotateY(720deg)'  // spin 2 full turns each axis
    : finalRotation;

  return (
    <>
      <div style={{
        width: size, height: size,
        perspective: size * 4,
        display: 'inline-block',
      }}>
        <div style={{
          width: size, height: size,
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform,
          transition: spinning ? 'transform 1.4s cubic-bezier(0.5, 0, 0.5, 1)' : 'transform 0.3s ease',
        }}>
          <Face transform={`rotateY(0deg) translateZ(${size / 2}px)`}    pips={1} size={size} />
          <Face transform={`rotateY(180deg) translateZ(${size / 2}px)`}  pips={6} size={size} />
          <Face transform={`rotateY(90deg) translateZ(${size / 2}px)`}   pips={4} size={size} />
          <Face transform={`rotateY(-90deg) translateZ(${size / 2}px)`}  pips={3} size={size} />
          <Face transform={`rotateX(90deg) translateZ(${size / 2}px)`}   pips={2} size={size} />
          <Face transform={`rotateX(-90deg) translateZ(${size / 2}px)`}  pips={5} size={size} />
        </div>
      </div>
    </>
  );
}

const PIP_LAYOUTS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

function Face({ transform, pips, size }) {
  const positions = PIP_LAYOUTS[pips] || [];
  const pipSize = size * 0.13;
  return (
    <div style={{
      position: 'absolute', inset: 0,
      width: size, height: size,
      background: 'linear-gradient(135deg, #fff 0%, #ddd 100%)',
      border: '2px solid #2a2a2a',
      borderRadius: size * 0.12,
      boxShadow: 'inset 0 0 12px rgba(0,0,0,0.15)',
      transform,
      backfaceVisibility: 'hidden',
    }}>
      {positions.map(([x, y], i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${x}%`, top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          width: pipSize, height: pipSize, borderRadius: '50%',
          background: '#1a1a1a',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2)',
        }} />
      ))}
    </div>
  );
}
