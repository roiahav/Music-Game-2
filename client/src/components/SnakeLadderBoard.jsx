/**
 * 10×10 board with serpentine numbering 1→100, piano-keyed ladders going up
 * and saxophone-curved slides going down. Players' figurines are positioned
 * absolutely over their current cell; CSS transitions drive movement.
 *
 * Pure presentational — receives the board map and the players list, draws
 * everything. The parent screen owns the game state.
 */

import { LADDERS, SLIDES, COLS, ROWS, positionToCell } from './laddersHitsMap.js';
import { Figurine } from './Figurine.jsx';

export default function SnakeLadderBoard({ players = [], highlightSocketId = null, size = 360 }) {
  const cellSize = size / COLS;

  // Group players by current position so we can fan them out within a cell
  const byPos = new Map();
  for (const p of players) {
    const pos = Math.max(0, Math.min(100, p.position || 0));
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos).push(p);
  }

  return (
    <div style={{
      position: 'relative',
      width: size, height: size,
      direction: 'ltr',                  // keep grid math LTR even in RTL pages
      background: '#1a1a1a',
      border: '2px solid #2d2d30',
      borderRadius: 12,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Cells — checkerboard, with serpentine numbering */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}>
        {Array.from({ length: ROWS * COLS }).map((_, idx) => {
          const row = Math.floor(idx / COLS);
          const col = idx % COLS;
          const rowFromBottom = ROWS - 1 - row;
          const inRow = rowFromBottom % 2 === 0 ? col : COLS - 1 - col;
          const cellNumber = rowFromBottom * COLS + inRow + 1;
          const isLadderStart = LADDERS.some(([f]) => f === cellNumber);
          const isLadderEnd   = LADDERS.some(([, t]) => t === cellNumber);
          const isSlideStart  = SLIDES.some(([f]) => f === cellNumber);
          const isSlideEnd    = SLIDES.some(([, t]) => t === cellNumber);
          // Alternating background tint
          const tint = (row + col) % 2 === 0 ? '#222' : '#1d1d1d';
          return (
            <div
              key={idx}
              style={{
                background: tint,
                border: '1px solid #2a2a2a',
                fontSize: Math.max(8, cellSize * 0.18),
                color: '#666',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
                padding: 2,
                position: 'relative',
                fontWeight: 700,
              }}
            >
              {cellNumber}
              {isLadderStart && <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 11 }}>🎹</span>}
              {isSlideStart  && <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 11 }}>🎷</span>}
              {cellNumber === 100 && <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 12 }}>🏁</span>}
              {cellNumber === 1   && <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 11 }}>🚀</span>}
            </div>
          );
        })}
      </div>

      {/* SVG overlay for ladder + slide connectors */}
      <svg
        width={size} height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {LADDERS.map(([from, to], i) => (
          <Ladder key={`l${i}`} from={from} to={to} cellSize={cellSize} />
        ))}
        {SLIDES.map(([from, to], i) => (
          <Slide key={`s${i}`} from={from} to={to} cellSize={cellSize} />
        ))}
      </svg>

      {/* Figurines, positioned absolutely over their cells */}
      {[...byPos.entries()].map(([pos, group]) => {
        if (pos === 0) return null; // pos 0 = not started; render off-board below
        const { row, col } = positionToCell(pos);
        const baseLeft = col * cellSize;
        const baseTop  = row * cellSize;
        return group.map((p, i) => {
          // fan out figurines on the same cell so they don't overlap
          const offset = i * (cellSize * 0.12);
          const isHighlight = highlightSocketId === p.socketId;
          return (
            <div
              key={p.socketId}
              style={{
                position: 'absolute',
                left: baseLeft + offset,
                top: baseTop + offset,
                width: cellSize, height: cellSize,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'left 0.6s ease, top 0.6s ease, transform 0.2s',
                transform: isHighlight ? 'scale(1.25)' : 'scale(1)',
                zIndex: isHighlight ? 10 : 5,
                pointerEvents: 'none',
              }}
            >
              <Figurine figurineId={p.avatar?.figurineId} color={p.avatar?.color} size={cellSize * 0.65} />
            </div>
          );
        });
      })}

      {/* Pre-game holding area for players still at position 0 */}
      {byPos.has(0) && (
        <div style={{
          position: 'absolute', left: 4, bottom: 4,
          display: 'flex', gap: 2, padding: 2, borderRadius: 4,
          background: 'rgba(0,0,0,0.4)',
        }}>
          {byPos.get(0).map(p => (
            <Figurine key={p.socketId} figurineId={p.avatar?.figurineId} color={p.avatar?.color} size={Math.max(16, cellSize * 0.45)} />
          ))}
        </div>
      )}
    </div>
  );
}

function cellCenter(pos, cellSize) {
  const { row, col } = positionToCell(pos);
  return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

function Ladder({ from, to, cellSize }) {
  // Piano-keyed vertical strip between the two cell centres
  const a = cellCenter(from, cellSize);
  const b = cellCenter(to, cellSize);
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const width = cellSize * 0.5;
  // Render a small piano-key strip; rotate it to point from `from` to `to`.
  return (
    <g
      transform={`translate(${a.x} ${a.y}) rotate(${angle}) translate(0 ${-width / 2})`}
    >
      {/* Outer frame */}
      <rect x="0" y="0" width={length} height={width} rx="4" fill="#fff" stroke="#222" strokeWidth="1" />
      {/* White keys (vertical bars across the length) */}
      {Array.from({ length: Math.floor(length / 8) }).map((_, i) => (
        <line key={i} x1={i * 8} y1="0" x2={i * 8} y2={width} stroke="#222" strokeWidth="0.6" />
      ))}
      {/* Black keys (every other space, top half) */}
      {Array.from({ length: Math.max(0, Math.floor(length / 12)) }).map((_, i) => (
        <rect key={i} x={i * 12 + 4} y="0" width="5" height={width * 0.55} fill="#1a1a1a" />
      ))}
      {/* Direction indicator at the top */}
      <text x={length - 14} y={width / 2 + 4} fontSize="12" fill="#1db954">▲</text>
    </g>
  );
}

function Slide({ from, to, cellSize }) {
  // Saxophone-shaped curve. Sax body at the BOTTOM (where you land), curve up
  // to a small mouthpiece at the TOP (where you slipped in).
  const a = cellCenter(from, cellSize);
  const b = cellCenter(to, cellSize);
  // Control point bulges to the side for an S-curve feel
  const mx = (a.x + b.x) / 2 + (b.y > a.y ? 30 : -30);
  const my = (a.y + b.y) / 2;
  const path = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  return (
    <g>
      {/* Curve path, gold-coloured like a brass sax */}
      <path d={path} stroke="#d4a017" strokeWidth={cellSize * 0.18} strokeLinecap="round" fill="none" opacity="0.85" />
      <path d={path} stroke="#fff5cc" strokeWidth={cellSize * 0.06} strokeLinecap="round" fill="none" opacity="0.6" />
      {/* Sax bell at the bottom (landing) */}
      <circle cx={b.x} cy={b.y} r={cellSize * 0.18} fill="#d4a017" stroke="#5a4505" strokeWidth="1" />
      <circle cx={b.x} cy={b.y} r={cellSize * 0.10} fill="#5a4505" />
      {/* Mouthpiece at the top (entry) */}
      <rect
        x={a.x - cellSize * 0.08} y={a.y - cellSize * 0.08}
        width={cellSize * 0.16} height={cellSize * 0.16}
        rx="3" fill="#1a1a1a" stroke="#d4a017" strokeWidth="1.5"
      />
      {/* Direction indicator at the top */}
      <text x={a.x - 5} y={a.y - cellSize * 0.16} fontSize="12" fill="#dc3545" textAnchor="middle">▼</text>
    </g>
  );
}
