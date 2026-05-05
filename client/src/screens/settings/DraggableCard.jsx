import { SECTION_META } from './sections.js';

/**
 * Wraps a single settings card with a drag handle and CSS `order` so the
 * flex-column parent renders cards in the user's chosen sequence. The dragged
 * card becomes a faded "ghost slot"; the actual visual that follows the
 * finger is rendered separately by SettingsDragGhost.
 */
export function DraggableCard({ idx, order, locked, handlers, isDragging, isDragOver, isDragMovingDown, children }) {
  return (
    <div
      data-section-idx={idx}
      style={{
        order,
        opacity: isDragging ? 0.25 : 1,
        background: isDragging
          ? `repeating-linear-gradient(45deg, var(--bg2), var(--bg2) 8px, var(--bg) 8px, var(--bg) 16px)`
          : 'transparent',
        borderRadius: isDragging ? 14 : 0,
        transition: isDragging ? 'none' : 'opacity 0.15s',
        position: 'relative',
        // Drop-target indicator: thick line on the edge where the dragged item will land
        ...(isDragOver && isDragMovingDown  ? { boxShadow: 'inset 0 -3px 0 var(--accent), 0 0 0 2px var(--accent-alpha)' } : {}),
        ...(isDragOver && !isDragMovingDown ? { boxShadow: 'inset 0  3px 0 var(--accent), 0 0 0 2px var(--accent-alpha)' } : {}),
      }}
    >
      {/* Drag handle — only rendered when sections are unlocked. When locked,
          we collapse the spacer entirely so cards sit flush with no orphan grip. */}
      {!locked && (
        <div
          {...handlers}
          style={{
            height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#555', fontSize: 16, letterSpacing: 4,
            cursor: 'grab',
            touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
            marginBottom: 4, marginTop: -2,
            background: 'transparent',
            borderRadius: 8,
            transition: 'background 0.12s, color 0.12s',
          }}
          onPointerEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = '#888'; }}
          onPointerLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555'; }}
          title="גרור לשינוי סדר"
        >
          ⠿⠿⠿
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Floating ghost rendered at fixed position following the finger so the user
 * always sees what they're moving — same UX as FavoritesScreen.
 */
export function SettingsDragGhost({ id, dragY, accent }) {
  const meta = SECTION_META[id];
  if (!meta || dragY == null) return null;
  return (
    <div style={{
      position: 'fixed',
      top: dragY - 30,
      left: '50%',
      transform: 'translateX(-50%) rotate(-1.5deg) scale(1.03)',
      width: 'calc(100% - 32px)', maxWidth: 440,
      zIndex: 1000, pointerEvents: 'none',
      background: 'var(--bg2)',
      border: `2px solid ${accent}`,
      borderRadius: 14,
      boxShadow: '0 10px 30px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      direction: 'rtl',
    }}>
      <span style={{ color: accent, fontSize: 22, opacity: 0.9 }}>⠿</span>
      <span style={{ fontSize: 22 }}>{meta.icon}</span>
      <span style={{ color: 'var(--text, #fff)', fontWeight: 800, fontSize: 16, flex: 1 }}>
        {meta.label}
      </span>
    </div>
  );
}
