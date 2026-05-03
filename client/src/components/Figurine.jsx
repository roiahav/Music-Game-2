/**
 * Figurine — generic doll-on-a-wooden-base SVG used as a player avatar in
 * "סולמות ולהיטים". Each variant suggests a music role (mic, guitar, drum, …)
 * with a different silhouette, paired with a colour the player picked.
 *
 * Pure SVG, no external assets. Sized via the `size` prop (default 48 px wide).
 */

const FIGURINE_IDS = ['violin', 'guitar', 'drum', 'piano', 'mic', 'sax', 'trumpet', 'flute', 'dancer', 'singer', 'dj', 'conductor'];
const ICONS = {
  violin: '🎻', guitar: '🎸', drum: '🥁', piano: '🎹',
  mic: '🎤', sax: '🎷', trumpet: '🎺', flute: '🪈',
  dancer: '💃', singer: '🎙', dj: '🎧', conductor: '🪄',
};

export function Figurine({ figurineId = 'mic', color = '#3498db', size = 48, label = null, dimmed = false }) {
  const w = size;
  const h = Math.round(size * 1.35);
  // Body proportions (in SVG userspace, viewBox is 100×135)
  return (
    <div style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
      opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s',
    }}>
      <svg
        width={w} height={h}
        viewBox="0 0 100 135"
        style={{ filter: dimmed ? 'none' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
      >
        {/* Wooden base — oval ellipse */}
        <ellipse cx="50" cy="125" rx="34" ry="6" fill="#3a2a1a" />
        <ellipse cx="50" cy="123" rx="32" ry="5" fill="#6b4a2a" />
        <ellipse cx="50" cy="121" rx="30" ry="4" fill="#8b6a3a" />
        {/* Body — robe in player colour */}
        <path
          d="M 32 118 L 36 70 Q 40 60 50 60 Q 60 60 64 70 L 68 118 Z"
          fill={color}
          stroke="#1a1a1a" strokeWidth="1"
        />
        {/* Arms — same colour, hanging at sides */}
        <path
          d="M 36 70 Q 26 80 28 100 Q 31 105 34 100"
          fill={color}
          stroke="#1a1a1a" strokeWidth="0.8"
        />
        <path
          d="M 64 70 Q 74 80 72 100 Q 69 105 66 100"
          fill={color}
          stroke="#1a1a1a" strokeWidth="0.8"
        />
        {/* Head — neutral skin */}
        <circle cx="50" cy="48" r="14" fill="#f4d4a8" stroke="#1a1a1a" strokeWidth="1" />
        {/* Hair — dark cap */}
        <path d="M 36 46 Q 38 30 50 30 Q 62 30 64 46 Q 60 38 50 38 Q 40 38 36 46 Z" fill="#2a2018" />
        {/* Eyes */}
        <circle cx="44" cy="50" r="1.2" fill="#1a1a1a" />
        <circle cx="56" cy="50" r="1.2" fill="#1a1a1a" />
        {/* Mouth */}
        <path d="M 46 56 Q 50 58 54 56" fill="none" stroke="#1a1a1a" strokeWidth="1" strokeLinecap="round" />
        {/* Music role icon — floats above head */}
        <text x="50" y="22" fontSize="22" textAnchor="middle">
          {ICONS[figurineId] || '🎵'}
        </text>
      </svg>
      {label && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text)',
          marginTop: 2, maxWidth: w + 24, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</div>
      )}
    </div>
  );
}

export const FIGURINE_OPTIONS = FIGURINE_IDS;
export const FIGURINE_ICONS = ICONS;
