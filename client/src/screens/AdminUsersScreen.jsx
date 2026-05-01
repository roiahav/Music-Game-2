import { useState, useEffect } from 'react';
import { getUsers, createUserApi, resetPasswordApi, updateUserApi, deleteUserApi, getActivityLog } from '../api/client.js';

export default function AdminUsersScreen() {
  const [subTab, setSubTab] = useState('users'); // users | log

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', direction: 'rtl' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '12px 20px 0', flexShrink: 0 }}>
        {[{ id: 'users', label: 'משתמשים' }, { id: 'log', label: 'לוג פעילות' }].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '7px 18px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
              background: subTab === t.id ? '#007ACC' : '#2d2d30',
              color: subTab === t.id ? '#fff' : '#888',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 80px' }}>
        {subTab === 'users' ? <UsersTab /> : <ActivityTab />}
      </div>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState(new Set()); // IDs being updated

  async function load() {
    setLoading(true);
    try { setUsers(await getUsers()); } catch { setError('שגיאה בטעינת משתמשים'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(u, field, value) {
    const key = `${u.id}_${field}`;
    if (toggling.has(key)) return;
    setToggling(prev => new Set([...prev, key]));
    try { await updateUserApi(u.id, { [field]: value }); load(); }
    catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    finally { setToggling(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  }

  async function handleToggleRole(u) {
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`להפוך את "${u.username}" ל${newRole === 'admin' ? 'מנהל' : 'משתמש רגיל'}?`)) return;
    handleToggle(u, 'role', newRole);
  }

  async function handleToggleBlock(u) {
    const willBlock = !u.blocked;
    const msg = willBlock
      ? `לחסום את "${u.username}"? המשתמש יתנתק מיד ולא יוכל להיכנס.`
      : `לבטל חסימה של "${u.username}"?`;
    if (!confirm(msg)) return;
    handleToggle(u, 'blocked', willBlock);
  }

  async function handleDelete(id, name) {
    if (!confirm(`למחוק את המשתמש "${name}"?`)) return;
    try { await deleteUserApi(id); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }

  const filtered = users.filter(u =>
    !search.trim() || u.username.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>ניהול משתמשים</span>
        <button
          onClick={() => setModal({ type: 'add' })}
          style={{ background: '#007ACC', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          + הוסף
        </button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 חיפוש משתמש..."
        style={{
          width: '100%', marginBottom: 14, background: '#1e1e1e',
          border: '1px solid #3a3a3a', borderRadius: 10, color: '#fff',
          padding: '9px 12px', fontSize: 14, direction: 'rtl',
          boxSizing: 'border-box', outline: 'none',
        }}
      />

      {error && <div style={{ color: '#ff6b6b', marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', paddingTop: 20 }}>טוען...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', paddingTop: 20 }}>לא נמצאו משתמשים</div>
          )}
          {filtered.map(u => {
            const isAdmin = u.role === 'admin';
            const isBlocked = u.blocked;
            const busyRole = toggling.has(u.id + '_role');
            const busyHost = toggling.has(u.id + '_canHostRoom');
            const busyBlock = toggling.has(u.id + '_blocked');

            return (
              <div key={u.id} style={{
                background: isBlocked ? '#2a1010' : '#2d2d30',
                borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${isBlocked ? '#dc354544' : '#3a3a3a'}`,
                opacity: isBlocked ? 0.85 : 1,
                transition: 'all 0.15s',
              }}>
                {/* Row 1: name + status badges + action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: isBlocked ? '#ff6b6b' : '#fff', fontWeight: 700, fontSize: 15 }}>
                        {u.username}
                      </span>
                      {isBlocked && (
                        <span style={{
                          background: '#dc354533', color: '#ff6b6b',
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                        }}>
                          🚫 חסום
                        </span>
                      )}
                      {!u.profileCompleted && (
                        <span style={{
                          background: '#e67e2233', color: '#e67e22',
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                        }}>
                          ⏳ טרם מילא פרופיל
                        </span>
                      )}
                    </div>

                    {/* Role badge */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{
                        background: isAdmin ? '#007ACC33' : '#1db95433',
                        color: isAdmin ? '#5bb8ff' : '#1db954',
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                      }}>
                        {isAdmin ? '👑 מנהל' : '👤 משתמש'}
                      </span>
                      {/* Profile info */}
                      {u.profileCompleted && (u.firstName || u.email) && (
                        <span style={{ color: '#666', fontSize: 11 }}>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                          {u.email ? ` · ${u.email}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action icons */}
                  <button
                    onClick={() => setModal({ type: 'edit', userId: u.id, username: u.username })}
                    style={iconBtnStyle}
                    title="עריכת שם"
                  >✏️</button>
                  <button
                    onClick={() => setModal({ type: 'reset', userId: u.id, username: u.username })}
                    style={iconBtnStyle}
                    title="איפוס סיסמה"
                  >🔑</button>
                  <button
                    onClick={() => handleDelete(u.id, u.username)}
                    style={{ ...iconBtnStyle, background: '#3a1010', border: '1px solid #dc354544', color: '#ff6b6b' }}
                    title="מחיקת משתמש"
                  >×</button>
                </div>

                {/* Row 2: permission toggles */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Toggle role */}
                  <ToggleBtn
                    active={isAdmin}
                    busy={busyRole}
                    activeColor="#007ACC"
                    onClick={() => handleToggleRole(u)}
                    label={isAdmin ? '👑 הסר הרשאת מנהל' : '👑 הפוך למנהל'}
                  />

                  {/* Toggle host (only non-admins) */}
                  {!isAdmin && (
                    <ToggleBtn
                      active={u.canHostRoom}
                      busy={busyHost}
                      activeColor="#1db954"
                      onClick={() => handleToggle(u, 'canHostRoom', !u.canHostRoom)}
                      label={`🎮 פתיחת חדר — ${u.canHostRoom ? 'מופעל' : 'כבוי'}`}
                    />
                  )}

                  {/* Block / Unblock */}
                  <ToggleBtn
                    active={isBlocked}
                    busy={busyBlock}
                    activeColor="#dc3545"
                    onClick={() => handleToggleBlock(u)}
                    label={isBlocked ? '✅ בטל חסימה' : '🚫 חסום משתמש'}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <UserModal modal={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />
      )}
    </>
  );
}

// ─── Activity log tab ─────────────────────────────────────────────────────────
function ActivityTab() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState('');

  useEffect(() => {
    getActivityLog()
      .then(setLog)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = searchUser.trim()
    ? log.filter(e => e.username.toLowerCase().includes(searchUser.trim().toLowerCase()))
    : log;

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return '—';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 20 }}>טוען...</div>;
  if (!log.length) return <div style={{ color: '#555', textAlign: 'center', paddingTop: 20 }}>אין נתונים עדיין</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        value={searchUser}
        onChange={e => setSearchUser(e.target.value)}
        placeholder="🔍 חיפוש לפי שם משתמש..."
        style={{
          width: '100%', background: '#1e1e1e', border: '1px solid #3a3a3a',
          borderRadius: 10, color: '#fff', padding: '9px 12px', fontSize: 14,
          direction: 'rtl', boxSizing: 'border-box', outline: 'none',
        }}
      />

      {filtered.length === 0 && (
        <div style={{ color: '#555', textAlign: 'center', paddingTop: 12 }}>אין רשומות</div>
      )}

      {filtered.map((entry, i) => (
        <div key={i} style={{
          background: '#2d2d30', borderRadius: 12, padding: '10px 14px',
          border: `1px solid ${entry.type === 'login' ? '#007ACC44' : '#3a3a3a'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{entry.username}</div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{formatDate(entry.timestamp)}</div>
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
                ⏱ {formatDuration(entry.durationMs)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function UserModal({ modal, onClose, onDone }) {
  const isAdd = modal.type === 'add';
  const isEdit = modal.type === 'edit';
  const isReset = modal.type === 'reset';

  const [username, setUsername] = useState(isEdit ? modal.username : '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isAdd) {
        if (!username.trim() || !password) return setError('נדרשים שם וסיסמה');
        await createUserApi(username.trim(), password, role);
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

// ─── Small helpers ────────────────────────────────────────────────────────────
function ToggleBtn({ active, busy, activeColor, onClick, label }) {
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

function Field({ label, value, onChange, type = 'text', placeholder }) {
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

const iconBtnStyle = {
  background: '#3a3a3a', border: 'none', color: '#aaa',
  borderRadius: 8, padding: '5px 10px', fontSize: 13, cursor: 'pointer',
};
