// Small layout primitives, helpers and constants used by every file under
// screens/users/ (UsersTab, modals, ActivityTab). Splitting them out keeps
// each section file focused on its own logic.

// ─── Time-limit helpers ───────────────────────────────────────────────────────
export function formatExpiryDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function formatRemaining(ms) {
  const diff = ms - Date.now();
  if (diff <= 0) return 'פג';
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 1) return `עוד ${day} ימים`;
  if (day === 1) return 'עוד יום';
  if (hr > 1) return `עוד ${hr} שעות`;
  if (hr === 1) return 'עוד שעה';
  if (min > 0) return `עוד ${min} דק׳`;
  return `עוד ${sec} שנ׳`;
}

// ─── Log helpers (shared between ActivityTab + UserLogModal) ─────────────────
export function formatLogDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function formatLogDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Activity-log icon/color/label dictionary ─────────────────────────────────
export const ADMIN_ACTION_META = {
  create:         { icon: '👤', label: 'יצירת משתמש',       color: '#1db954' },
  delete:         { icon: '🗑️', label: 'מחיקת משתמש',       color: '#dc3545' },
  reset_password: { icon: '🔑', label: 'איפוס סיסמה',        color: '#e67e22' },
  block:          { icon: '🚫', label: 'חסימה',              color: '#dc3545' },
  unblock:        { icon: '✅', label: 'ביטול חסימה',         color: '#1db954' },
  role_admin:     { icon: '👑', label: 'הפיכה למנהל',         color: '#007ACC' },
  role_user:     { icon: '👤', label: 'הסרת הרשאת מנהל',     color: '#888'    },
  host_on:        { icon: '🎮', label: 'הענקת הרשאת חדר',     color: '#1db954' },
  host_off:       { icon: '🎮', label: 'שלילת הרשאת חדר',     color: '#888'    },
  rename:         { icon: '✏️', label: 'שינוי שם',            color: '#5bb8ff' },
  set_expiry:     { icon: '🕐', label: 'הגבלת זמן',          color: '#9b59b6' },
  clear_expiry:   { icon: '♾️', label: 'הסרת הגבלת זמן',     color: '#1db954' },
  invite_create:  { icon: '📨', label: 'יצירת הזמנה',         color: '#1db954' },
  approve:        { icon: '✅', label: 'אישור משתמש',         color: '#1db954' },
  backup_export:  { icon: '💾', label: 'ייצוא גיבוי',          color: '#5bb8ff' },
  backup_import:  { icon: '⬆️', label: 'שחזור מגיבוי',         color: '#e67e22' },
};

// ─── Style constants ──────────────────────────────────────────────────────────
export const iconBtnStyle = {
  background: '#3a3a3a', border: 'none', color: '#aaa',
  borderRadius: 8, padding: '5px 10px', fontSize: 13, cursor: 'pointer',
};

// ─── UI primitives ────────────────────────────────────────────────────────────
export function FilterChip({ label, count, active, color, onClick, disabled = false }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 16,
        background: active ? `${color}22` : '#1e1e1e',
        border: `1px solid ${active ? color : '#3a3a3a'}`,
        color: active ? color : (disabled ? '#444' : '#aaa'),
        fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{
        background: active ? color : '#3a3a3a',
        color: active ? '#fff' : '#888',
        borderRadius: 8, padding: '0 6px',
        fontSize: 10, fontWeight: 800, minWidth: 14, textAlign: 'center',
      }}>
        {count}
      </span>
    </button>
  );
}

export function ToggleBtn({ active, busy, activeColor, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: active ? `${activeColor}22` : 'transparent',
        border: `1px solid ${active ? activeColor : '#3a3a3a'}`,
        color: active ? activeColor : '#555',
        borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      {busy ? '...' : label}
    </button>
  );
}

export function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 15, direction: 'rtl', outline: 'none', boxSizing: 'border-box', width: '100%' }}
      />
    </div>
  );
}

export function Stat({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 80,
      background: `${color}15`, border: `1px solid ${color}33`,
      borderRadius: 10, padding: '6px 10px', textAlign: 'center',
    }}>
      <div style={{ color, fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ color: '#aaa', fontSize: 10, marginTop: 4 }}>{label}</div>
    </div>
  );
}

/** Render one log entry (login/logout or admin_action). */
export function LogEntry({ entry }) {
  if (entry.type === 'admin_action') {
    const meta = ADMIN_ACTION_META[entry.action] || { icon: '⚙️', label: entry.action, color: '#888' };
    return (
      <div style={{
        background: '#2d2d30', borderRadius: 12, padding: '10px 14px',
        border: `1px solid ${meta.color}33`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: meta.color }}>{entry.targetUsername}</span>
            {entry.action === 'rename' && entry.details?.from && (
              <span style={{ color: '#888', fontSize: 12, fontWeight: 500 }}>
                ({entry.details.from} → {entry.details.to})
              </span>
            )}
          </div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
            {formatLogDate(entry.timestamp)} · בידי <span style={{ color: '#aaa' }}>{entry.adminName}</span>
          </div>
        </div>
        <div style={{
          flexShrink: 0,
          fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
          background: `${meta.color}22`, color: meta.color,
          border: `1px solid ${meta.color}44`,
        }}>
          {meta.icon} {meta.label}
        </div>
      </div>
    );
  }

  // Login / logout entry
  return (
    <div style={{
      background: '#2d2d30', borderRadius: 12, padding: '10px 14px',
      border: `1px solid ${entry.type === 'login' ? '#007ACC44' : '#3a3a3a'}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
    }}>
      <div>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{entry.username}</div>
        <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{formatLogDate(entry.timestamp)}</div>
      </div>
      <div style={{ textAlign: 'left', flexShrink: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
          background: entry.type === 'login' ? '#007ACC33' : '#2d2d40',
          color: entry.type === 'login' ? '#5bb8ff' : '#aaa',
        }}>
          {entry.type === 'login' ? '🔑 כניסה' : '🚪 יציאה'}
        </div>
        {entry.type === 'logout' && entry.durationMs != null && (
          <div style={{ color: '#888', fontSize: 11, marginTop: 3, textAlign: 'center' }}>
            ⏱ {formatLogDuration(entry.durationMs)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Format a Date object as the value expected by <input type="datetime-local"> */
export function toLocalDateTimeInput(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
