import { useState } from 'react';
import { formatExpiryDate, formatRemaining, toLocalDateTimeInput } from './shared.jsx';

/**
 * Modal for setting (or removing) a single user's account expiration.
 * Offers a few preset durations and a custom datetime-local input.
 * Calls `onSave(timestamp | null)` — `null` clears the limit.
 */
export default function ExpiryModal({ user, onClose, onSave }) {
  // Pick a default datetime — current expiry, or tomorrow if none
  const defaultDate = user.expiresAt
    ? new Date(user.expiresAt)
    : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [customValue, setCustomValue] = useState(toLocalDateTimeInput(defaultDate));

  const presets = [
    { label: '⏱ שעה',    ms: 60 * 60 * 1000 },
    { label: '🌙 24 שעות', ms: 24 * 60 * 60 * 1000 },
    { label: '📅 שבוע',   ms: 7 * 24 * 60 * 60 * 1000 },
    { label: '🗓 חודש',   ms: 30 * 24 * 60 * 60 * 1000 },
  ];

  function applyPreset(ms) {
    onSave(Date.now() + ms);
  }

  function applyCustom() {
    const ts = new Date(customValue).getTime();
    if (isNaN(ts)) return alert('תאריך לא תקין');
    if (ts < Date.now()) {
      if (!confirm('התאריך שבחרת בעבר — המשתמש ינעל מיד. להמשיך?')) return;
    }
    onSave(ts);
  }

  function clearLimit() {
    onSave(null);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: '#2d2d30', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        padding: '20px 20px 30px', direction: 'rtl',
      }}>
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '0 auto 14px' }} />
        <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>
          🕐 הגבלת זמן — {user.username}
        </h3>
        <p style={{ color: '#888', fontSize: 12, margin: '0 0 16px' }}>
          לאחר תום הזמן, המשתמש ינעל אוטומטית ולא יוכל להיכנס.
        </p>

        {/* Current state */}
        {user.expiresAt && (
          <div style={{
            background: '#9b59b622', border: '1px solid #9b59b6',
            borderRadius: 10, padding: '10px 12px', marginBottom: 14,
            fontSize: 13, color: '#c39bd3',
          }}>
            🕐 פג בעוד <strong>{formatRemaining(user.expiresAt)}</strong>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              {formatExpiryDate(user.expiresAt)}
            </div>
          </div>
        )}

        {/* Quick presets */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.ms)}
              style={{
                padding: '11px', borderRadius: 10, border: '1px solid #444',
                background: '#1e1e1e', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom datetime */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#aaa', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
            או בחר תאריך מותאם:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="datetime-local"
              value={customValue}
              onChange={e => setCustomValue(e.target.value)}
              style={{
                flex: 1, background: '#1e1e1e', border: '1px solid #444',
                color: '#fff', borderRadius: 10, padding: '10px 12px',
                fontSize: 14, direction: 'ltr',
              }}
            />
            <button
              onClick={applyCustom}
              style={{
                background: '#9b59b6', border: 'none', color: '#fff',
                borderRadius: 10, padding: '0 18px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              שמור
            </button>
          </div>
        </div>

        {/* Bottom actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px', borderRadius: 12,
              background: '#3a3a3a', border: 'none', color: '#aaa',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ביטול
          </button>
          {user.expiresAt && (
            <button
              onClick={clearLimit}
              style={{
                flex: 1, padding: '12px', borderRadius: 12,
                background: '#1db95422', border: '1px solid #1db954', color: '#1db954',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ♾️ הסר הגבלה
            </button>
          )}
        </div>
      </div>
    </>
  );
}
