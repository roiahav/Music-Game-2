import { useState } from 'react';
import { createUserApi, resetPasswordApi, updateUserApi } from '../../api/client.js';
import { Field } from './shared.jsx';

const ADD_USER_EXPIRY_PRESETS = [
  { label: '∞ ללא הגבלה', ms: null },
  { label: '⏱ שעה',        ms: 60 * 60 * 1000 },
  { label: '🌙 24 שעות',    ms: 24 * 60 * 60 * 1000 },
  { label: '📅 שבוע',       ms: 7  * 24 * 60 * 60 * 1000 },
  { label: '🗓 חודש',       ms: 30 * 24 * 60 * 60 * 1000 },
];

/**
 * Reusable modal for the three "user write" actions: add, rename, reset
 * password. The `modal` prop carries the discriminator (`type`) plus any
 * userId/username needed by the active action.
 */
export default function UserModal({ modal, onClose, onDone }) {
  const isAdd = modal.type === 'add';
  const isEdit = modal.type === 'edit';
  const isReset = modal.type === 'reset';

  const [username, setUsername] = useState(isEdit ? modal.username : '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [expiryPreset, setExpiryPreset] = useState(null);   // ms duration or null
  const [customExpiry, setCustomExpiry] = useState('');     // datetime-local string
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function computeExpiresAt() {
    if (customExpiry) {
      const ts = new Date(customExpiry).getTime();
      return isNaN(ts) ? null : ts;
    }
    return expiryPreset ? Date.now() + expiryPreset : null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isAdd) {
        if (!username.trim() || !password) return setError('נדרשים שם וסיסמה');
        const expiresAt = computeExpiresAt();
        if (expiresAt && expiresAt < Date.now()) return setError('זמן ההגבלה שבחרת כבר עבר');
        const created = await createUserApi(username.trim(), password, role);
        // If a time limit was chosen, apply it via PATCH right after creation
        if (expiresAt && created?.id) {
          try { await updateUserApi(created.id, { expiresAt }); } catch {}
        }
      } else if (isEdit) {
        if (!username.trim()) return setError('שם משתמש נדרש');
        await updateUserApi(modal.userId, { username: username.trim() });
      } else {
        if (!password) return setError('סיסמה נדרשת');
        await resetPasswordApi(modal.userId, password);
      }
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally {
      setLoading(false);
    }
  }

  const title = isAdd ? 'הוסף משתמש חדש' : isEdit ? `עריכת שם — ${modal.username}` : `אפס סיסמה — ${modal.username}`;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: '#2d2d30', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        padding: '20px 20px 40px', direction: 'rtl',
      }}>
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '0 auto 16px' }} />
        <h3 style={{ color: '#fff', margin: '0 0 18px', fontSize: 16, fontWeight: 800 }}>{title}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(isAdd || isEdit) && (
            <Field label="שם משתמש" value={username} onChange={setUsername} placeholder="שם מלא" />
          )}
          {isAdd && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>תפקיד</label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 15, direction: 'rtl' }}
              >
                <option value="user">משתמש</option>
                <option value="admin">מנהל</option>
              </select>
            </div>
          )}
          {(isAdd || isReset) && (
            <Field label="סיסמה" value={password} onChange={setPassword} type="password" placeholder="הכנס סיסמה" />
          )}

          {/* Time limit (only when adding) */}
          {isAdd && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>
                🕐 הגבלת זמן <span style={{ fontWeight: 400, color: '#666' }}>(אופציונלי)</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: 6 }}>
                {ADD_USER_EXPIRY_PRESETS.map(p => {
                  const isSelected = !customExpiry && expiryPreset === p.ms;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { setExpiryPreset(p.ms); setCustomExpiry(''); }}
                      style={{
                        padding: '8px', borderRadius: 8,
                        background: isSelected ? '#9b59b622' : '#1e1e1e',
                        border: `1px solid ${isSelected ? '#9b59b6' : '#3a3a3a'}`,
                        color: isSelected ? '#c39bd3' : '#aaa',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <input
                  type="datetime-local"
                  value={customExpiry}
                  onChange={e => { setCustomExpiry(e.target.value); if (e.target.value) setExpiryPreset(null); }}
                  style={{ flex: 1, background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 10, color: '#fff', padding: '8px 10px', fontSize: 12, direction: 'ltr', colorScheme: 'dark' }}
                />
                {customExpiry && (
                  <button type="button" onClick={() => setCustomExpiry('')}
                    style={{ background: 'transparent', border: '1px solid #3a3a3a', color: '#888', borderRadius: 8, padding: '8px 10px', fontSize: 11, cursor: 'pointer' }}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {error && <div style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 12, background: '#3a3a3a', border: 'none', color: '#aaa', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>ביטול</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: '12px', borderRadius: 12, background: '#007ACC', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '...' : isAdd ? 'הוסף' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
