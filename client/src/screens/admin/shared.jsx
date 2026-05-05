// Shared style constants, helpers and small layout primitives used by every
// admin-dashboard section. Splitting them out lets each section live in its
// own file without re-declaring these.

import { csvDate } from '../../utils/csv.js';
import { AvatarCircle } from '../../App.jsx';

// ─── Style constants ──────────────────────────────────────────────────────────
export const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
export const thStyle    = { textAlign: 'right', padding: '10px 12px', color: '#888', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #2d2d33' };
export const tdStyle    = { padding: '10px 12px', verticalAlign: 'middle' };
export const inputStyle = { background: '#0f0f12', border: '1px solid #2d2d33', borderRadius: 8, color: '#fff', padding: '8px 12px', fontSize: 13, outline: 'none' };
export const dateStyle  = { ...inputStyle, padding: '6px 8px', fontSize: 12, colorScheme: 'dark' };
export const btnPrimary = { background: '#007ACC', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
export const btnLink    = { background: 'none', border: 'none', color: '#5bb8ff', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' };
export const iconButton = { background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 8, padding: '4px 10px', fontSize: 14, cursor: 'pointer' };

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Tiny layout primitives ───────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children }) {
  return (
    <div style={{
      background: '#1a1a1f', border: '1px solid #2d2d33', borderRadius: 12,
      padding: 18, marginBottom: 20,
    }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Pill({ label, active, onClick, disabled, color = '#5bb8ff' }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      padding: '5px 12px', borderRadius: 16,
      background: active ? `${color}22` : '#1e1e22',
      border: `1px solid ${active ? color : '#2d2d33'}`,
      color: active ? color : (disabled ? '#444' : '#aaa'),
      fontSize: 12, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

export function Th({ label, sortKey, onClick, current }) {
  const active = current.key === sortKey;
  return (
    <th onClick={onClick} style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}>
      {label} {active && (current.dir === 'asc' ? '▲' : '▼')}
    </th>
  );
}

export function Tag({ color, children }) {
  return (
    <span style={{
      display: 'inline-block', marginInlineEnd: 4,
      padding: '2px 8px', borderRadius: 6,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export function ActionBtn({ children, onClick, color = '#888', title }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: `${color}22`, border: `1px solid ${color}55`, color,
      borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer',
      lineHeight: 1, minWidth: 28,
    }}>{children}</button>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
export function FormField({ label, value, onChange, type = 'text', placeholder, ltr }) {
  return (
    <div>
      <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%', direction: ltr ? 'ltr' : 'rtl' }}
      />
    </div>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────
// Reused by both ActivitySection (full list) and OverviewSection (recent feed).
export function ActivityRow({ entry, compact = false }) {
  const isAdmin = entry.type === 'admin_action';
  const color   = isAdmin ? '#9b59b6' : (entry.type === 'login' ? '#5bb8ff' : '#aaa');
  const icon    = isAdmin ? '⚙️' : (entry.type === 'login' ? '🔑' : '🚪');
  const label   = isAdmin ? entry.action : (entry.type === 'login' ? 'כניסה' : 'יציאה');

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: 12,
      padding: compact ? '8px 12px' : '10px 14px',
      background: '#161618', borderRadius: 8,
      border: `1px solid ${color}22`,
    }}>
      <span style={{ fontSize: compact ? 16 : 18 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {entry.username || entry.targetUsername || '—'}
          {isAdmin && entry.adminName && (
            <span style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>
              {' '}· בידי {entry.adminName}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#888' }}>{csvDate(entry.timestamp)}{entry.ip && ` · ${entry.ip}`}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, padding: '3px 10px', background: `${color}22`, borderRadius: 6 }}>
        {label}
      </span>
      {entry.durationMs && (
        <span style={{ fontSize: 10, color: '#666' }}>⏱ {Math.round(entry.durationMs / 1000)}s</span>
      )}
    </div>
  );
}

// Re-export AvatarCircle so admin sections don't all need to reach back into App.jsx.
export { AvatarCircle };
