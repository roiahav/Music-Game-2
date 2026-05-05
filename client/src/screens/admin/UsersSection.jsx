import { useState, useEffect, useMemo } from 'react';
import {
  getUsers, updateUserApi, resetPasswordApi, deleteUserApi, approveUserApi, createUserApi,
} from '../../api/client.js';
import { downloadCSV, csvDate } from '../../utils/csv.js';
import {
  AvatarCircle,
  SectionHeader, Card, Pill, Th, Tag, ActionBtn, FormField,
  tableStyle, thStyle, tdStyle, inputStyle, btnPrimary,
  todayStr,
} from './shared.jsx';

/**
 * Admin users table — search, filter, sort, CRUD actions, plus an
 * "+ add user" modal. Talks to /api/users and uses the per-user
 * action endpoints for approve/block/reset-password/delete.
 */
export default function UsersSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'username', dir: 'asc' });
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try { setUsers(await getUsers()); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = users.filter(u => {
      if (filter === 'admin'   && u.role !== 'admin') return false;
      if (filter === 'host'    && !u.canHostRoom)     return false;
      if (filter === 'pending' && u.approved !== false) return false;
      if (filter === 'blocked' && !u.blocked)         return false;
      return true;
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'he');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [users, search, filter, sort]);

  function setSortKey(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function exportCSV() {
    const rows = [
      ['שם משתמש','שם פרטי','שם משפחה','מייל','תפקיד','מנהל חדר','סטטוס','תאריך תפוגה'],
      ...filtered.map(u => [
        u.username, u.firstName, u.lastName, u.email,
        u.role === 'admin' ? 'מנהל' : 'משתמש',
        u.canHostRoom ? 'כן' : 'לא',
        u.blocked ? 'חסום' : (u.approved === false ? 'ממתין' : 'פעיל'),
        u.expiresAt ? csvDate(new Date(u.expiresAt).toISOString()) : '',
      ]),
    ];
    downloadCSV(`users-${todayStr()}.csv`, rows);
  }

  async function handleApprove(u) {
    if (!confirm(`לאשר את "${u.username}"?`)) return;
    try { await approveUserApi(u.id); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }
  async function handleBlock(u) {
    const verb = u.blocked ? 'לבטל חסימה של' : 'לחסום את';
    if (!confirm(`${verb} "${u.username}"?`)) return;
    try { await updateUserApi(u.id, { blocked: !u.blocked }); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }
  async function handleDelete(u) {
    if (u.protected) return alert('משתמש מערכת מוגן');
    if (!confirm(`למחוק את "${u.username}"?`)) return;
    try { await deleteUserApi(u.id); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }
  async function handleResetPassword(u) {
    const newPass = prompt(`סיסמה חדשה עבור "${u.username}":`);
    if (!newPass || newPass.length < 4) return;
    try { await resetPasswordApi(u.id, newPass); alert('הסיסמה אופסה'); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }

  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    host: users.filter(u => u.canHostRoom && u.role !== 'admin').length,
    pending: users.filter(u => u.approved === false).length,
    blocked: users.filter(u => u.blocked).length,
  };

  return (
    <>
      <SectionHeader
        title="👥 ניהול משתמשים"
        subtitle={`${filtered.length} מתוך ${users.length} משתמשים`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(true)} style={{ ...btnPrimary, background: '#1db954' }}>
              + משתמש חדש
            </button>
            <button onClick={exportCSV} style={btnPrimary}>📥 ייצוא ל-CSV</button>
          </div>
        }
      />

      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 חיפוש לפי שם / מייל..."
            style={{ ...inputStyle, flex: '0 0 280px' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill label={`הכל ${counts.all}`}        active={filter === 'all'}     onClick={() => setFilter('all')} />
            <Pill label={`👑 ${counts.admin}`}        active={filter === 'admin'}   onClick={() => setFilter('admin')} />
            <Pill label={`🎮 ${counts.host}`}         active={filter === 'host'}    onClick={() => setFilter('host')} />
            <Pill label={`⏳ ${counts.pending}`}      active={filter === 'pending'} onClick={() => setFilter('pending')} disabled={!counts.pending} color="#e67e22" />
            <Pill label={`🚫 ${counts.blocked}`}      active={filter === 'blocked'} onClick={() => setFilter('blocked')} disabled={!counts.blocked} color="#dc3545" />
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>טוען...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th onClick={() => setSortKey('username')}  label="שם משתמש"  sortKey="username"  current={sort} />
                  <Th onClick={() => setSortKey('firstName')} label="שם מלא"     sortKey="firstName" current={sort} />
                  <Th onClick={() => setSortKey('email')}     label="מייל"        sortKey="email"     current={sort} />
                  <Th onClick={() => setSortKey('role')}      label="תפקיד"       sortKey="role"      current={sort} />
                  <th style={thStyle}>סטטוס</th>
                  <th style={thStyle}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} style={{ background: u.blocked ? '#2a1010' : 'transparent', borderBottom: '1px solid #2d2d33' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AvatarCircle userId={u.id} hasAvatar={u.hasAvatar} name={u.username} size={28} />
                        <span style={{ fontWeight: 600 }}>{u.username}</span>
                        {u.protected && <span title="מערכת מוגן" style={{ fontSize: 11 }}>🛡️</span>}
                      </div>
                    </td>
                    <td style={tdStyle}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ ...tdStyle, direction: 'ltr', fontSize: 12, color: '#aaa' }}>{u.email || '—'}</td>
                    <td style={tdStyle}>
                      {u.role === 'admin' ? <span style={{ color: '#5bb8ff' }}>👑 מנהל</span> : <span style={{ color: '#888' }}>👤 משתמש</span>}
                    </td>
                    <td style={tdStyle}>
                      {u.blocked      && <Tag color="#dc3545">🚫 חסום</Tag>}
                      {u.approved === false && <Tag color="#e67e22">⏳ ממתין</Tag>}
                      {!u.blocked && u.approved !== false && <Tag color="#1db954">✓ פעיל</Tag>}
                      {u.canHostRoom && !u.blocked && <Tag color="#1db954">🎮</Tag>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {u.approved === false && <ActionBtn onClick={() => handleApprove(u)} color="#1db954" title="אשר">✅</ActionBtn>}
                        <ActionBtn onClick={() => handleResetPassword(u)} title="איפוס סיסמה">🔑</ActionBtn>
                        <ActionBtn onClick={() => handleBlock(u)} color={u.blocked ? '#1db954' : '#dc3545'} title={u.blocked ? 'בטל חסימה' : 'חסום'}>
                          {u.blocked ? '✓' : '🚫'}
                        </ActionBtn>
                        {!u.protected && <ActionBtn onClick={() => handleDelete(u)} color="#dc3545" title="מחיקה">×</ActionBtn>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#666', padding: 30 }}>לא נמצאו משתמשים</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}
    </>
  );
}

// ─── Add user modal ──
const EXPIRY_PRESETS = [
  { label: '∞ ללא הגבלה', ms: null },
  { label: '⏱ שעה',        ms: 60 * 60 * 1000 },
  { label: '🌙 24 שעות',    ms: 24 * 60 * 60 * 1000 },
  { label: '📅 שבוע',       ms: 7  * 24 * 60 * 60 * 1000 },
  { label: '🗓 חודש',       ms: 30 * 24 * 60 * 60 * 1000 },
];

function AddUserModal({ onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [role, setRole] = useState('user');
  const [expiryPreset, setExpiryPreset] = useState(null);   // ms or null = no limit
  const [customExpiry, setCustomExpiry] = useState('');     // datetime-local string; '' = none
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Compute the actual expiresAt timestamp from the picked preset / custom input
  function computeExpiresAt() {
    if (customExpiry) {
      const ts = new Date(customExpiry).getTime();
      return isNaN(ts) ? null : ts;
    }
    return expiryPreset ? Date.now() + expiryPreset : null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return setError('שם משתמש נדרש');
    if (password.length < 4) return setError('סיסמה חייבת להיות לפחות 4 תווים');
    if (password !== confirmPass) return setError('הסיסמאות אינן תואמות');

    const expiresAt = computeExpiresAt();
    if (expiresAt && expiresAt < Date.now()) {
      return setError('זמן ההגבלה שבחרת כבר עבר');
    }

    setSubmitting(true);
    setError('');
    try {
      const created = await createUserApi(username.trim(), password, role);
      // If a time limit was chosen, apply it via PATCH right after creation
      if (expiresAt && created?.id) {
        try { await updateUserApi(created.id, { expiresAt }); } catch {}
      }
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה ביצירת המשתמש');
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 101,
        background: '#1a1a1f', border: '1px solid #2d2d33',
        borderRadius: 14, padding: 26,
        width: 'min(440px, 90vw)', direction: 'rtl',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>+ הוספת משתמש חדש</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#888', fontSize: 22,
            cursor: 'pointer', padding: 0, lineHeight: 1,
          }}>✕</button>
        </div>
        <p style={{ margin: '0 0 18px', color: '#888', fontSize: 12 }}>
          המשתמש יוכל להיכנס מיד עם פרטי הכניסה. בכניסה הראשונה הוא יתבקש להשלים פרופיל.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="שם משתמש *" value={username} onChange={setUsername} placeholder="לדוג׳ דני כהן" />
          <FormField label="סיסמה *" value={password} onChange={setPassword} type="password" placeholder="לפחות 4 תווים" />
          <FormField label="אימות סיסמה *" value={confirmPass} onChange={setConfirmPass} type="password" placeholder="הקלד שוב" />

          <div>
            <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              תפקיד
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="user">👤 משתמש רגיל</option>
              <option value="admin">👑 מנהל</option>
            </select>
          </div>

          {/* Time limit picker */}
          <div>
            <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6 }}>
              🕐 הגבלת זמן <span style={{ fontWeight: 400, color: '#666' }}>(אופציונלי — לחשבון אורח / ניסיון)</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
              {EXPIRY_PRESETS.map(p => {
                const isSelected = !customExpiry && expiryPreset === p.ms;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setExpiryPreset(p.ms); setCustomExpiry(''); }}
                    style={{
                      padding: '8px', borderRadius: 8,
                      background: isSelected ? '#9b59b622' : 'transparent',
                      border: `1px solid ${isSelected ? '#9b59b6' : '#444'}`,
                      color: isSelected ? '#c39bd3' : '#aaa',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {/* Custom datetime — only shown when user clicks "תאריך מותאם" */}
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="datetime-local"
                value={customExpiry}
                onChange={e => { setCustomExpiry(e.target.value); if (e.target.value) setExpiryPreset(null); }}
                placeholder="תאריך מותאם"
                style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: 12, colorScheme: 'dark', direction: 'ltr' }}
              />
              {customExpiry && (
                <button type="button" onClick={() => setCustomExpiry('')}
                  style={{ background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 8, padding: '7px 10px', fontSize: 11, cursor: 'pointer' }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: '#3a1010', color: '#ff6b6b', borderRadius: 8, fontSize: 13 }}>
              ❌ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '12px', borderRadius: 10, background: 'transparent',
              border: '1px solid #444', color: '#aaa', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              ביטול
            </button>
            <button type="submit" disabled={submitting} style={{
              flex: 2, padding: '12px', borderRadius: 10, background: '#1db954',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}>
              {submitting ? 'יוצר...' : '✅ צור משתמש'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
