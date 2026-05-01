import { useState, useEffect } from 'react';
import { getUsers, createUserApi, resetPasswordApi, updateUserApi, deleteUserApi, getActivityLog, approveUserApi, createInviteApi, getSettings as getSettingsApi } from '../api/client.js';

export default function AdminUsersScreen({ defaultFilter = 'all', onFilterConsumed }) {
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
        {subTab === 'users'
          ? <UsersTab defaultFilter={defaultFilter} onFilterConsumed={onFilterConsumed} />
          : <ActivityTab />}
      </div>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────
function UsersTab({ defaultFilter = 'all', onFilterConsumed }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(defaultFilter); // all | admin | host | blocked | pending

  // If parent passes a new defaultFilter (e.g. clicking the pending bell), apply it once
  useEffect(() => {
    if (defaultFilter && defaultFilter !== 'all') {
      setFilter(defaultFilter);
      onFilterConsumed?.();
    }
  }, [defaultFilter]); // eslint-disable-line
  const [toggling, setToggling] = useState(new Set()); // IDs being updated
  const [userLogFor, setUserLogFor] = useState(null); // user object for the log modal
  const [expiryFor, setExpiryFor] = useState(null);   // user object for the expiry-limit modal
  const [inviteOpen, setInviteOpen] = useState(false); // invite modal

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

  async function handleApprove(u) {
    if (!confirm(`לאשר את "${u.username}"? המשתמש יוכל מעכשיו להיכנס למערכת.`)) return;
    try { await approveUserApi(u.id); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }

  // Counts for filter chips
  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    host: users.filter(u => u.canHostRoom && u.role !== 'admin').length,
    blocked: users.filter(u => u.blocked).length,
    pending: users.filter(u => u.approved === false).length,
  };

  const filtered = users
    .filter(u => {
      if (filter === 'admin' && u.role !== 'admin') return false;
      if (filter === 'host' && !u.canHostRoom) return false;
      if (filter === 'blocked' && !u.blocked) return false;
      if (filter === 'pending' && u.approved !== false) return false;
      return true;
    })
    .filter(u => !search.trim() || u.username.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      // Admins first, then regular users — within each group, alphabetical
      if (a.role === b.role) return a.username.localeCompare(b.username, 'he');
      return a.role === 'admin' ? -1 : 1;
    });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>ניהול משתמשים</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setInviteOpen(true)}
            style={{ background: '#1db954', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            📨 הזמן
          </button>
          <button
            onClick={() => setModal({ type: 'add' })}
            style={{ background: '#007ACC', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            + הוסף
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <FilterChip label="הכל"          count={counts.all}     active={filter === 'all'}     color="#888"    onClick={() => setFilter('all')} />
        <FilterChip label="👑 אדמינים"    count={counts.admin}   active={filter === 'admin'}   color="#5bb8ff" onClick={() => setFilter('admin')} />
        <FilterChip label="🎮 מנהלי חדר"  count={counts.host}    active={filter === 'host'}    color="#1db954" onClick={() => setFilter('host')} />
        <FilterChip label="⏳ ממתינים"    count={counts.pending} active={filter === 'pending'} color="#e67e22" onClick={() => setFilter('pending')} disabled={counts.pending === 0} />
        <FilterChip label="🚫 חסומים"     count={counts.blocked} active={filter === 'blocked'} color="#ff6b6b" onClick={() => setFilter('blocked')} disabled={counts.blocked === 0} />
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
                      {u.expiresAt && !u.blocked && (
                        <span style={{
                          background: '#9b59b622', color: '#c39bd3',
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                        }}>
                          🕐 {formatRemaining(u.expiresAt)}
                        </span>
                      )}
                      {u.approved === false && (
                        <span style={{
                          background: '#e67e2233', color: '#e67e22',
                          borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                        }}>
                          ⏳ ממתין לאישור
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
                    onClick={() => setUserLogFor(u)}
                    style={iconBtnStyle}
                    title="לוג אישי"
                  >📋</button>
                  <button
                    onClick={() => setExpiryFor(u)}
                    style={{
                      ...iconBtnStyle,
                      ...(u.expiresAt ? { background: '#9b59b622', border: '1px solid #9b59b6', color: '#c39bd3' } : {}),
                    }}
                    title={u.expiresAt ? `פג תוקף ב-${formatExpiryDate(u.expiresAt)}` : 'הגבלת זמן'}
                  >🕐</button>
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
                  {u.protected ? (
                    <span
                      style={{ ...iconBtnStyle, background: '#1e1e1e', border: '1px solid #3a3a3a', color: '#888', cursor: 'default' }}
                      title="משתמש מערכת מוגן — לא ניתן למחיקה"
                    >🛡️</span>
                  ) : (
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      style={{ ...iconBtnStyle, background: '#3a1010', border: '1px solid #dc354544', color: '#ff6b6b' }}
                      title="מחיקת משתמש"
                    >×</button>
                  )}
                </div>

                {/* Row 2: permission toggles */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Approve (only if pending) */}
                  {u.approved === false && (
                    <button
                      onClick={() => handleApprove(u)}
                      style={{
                        background: '#1db95422', border: '1px solid #1db954',
                        color: '#1db954', borderRadius: 8, padding: '4px 12px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      ✅ אשר משתמש
                    </button>
                  )}

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

      {userLogFor && (
        <UserLogModal user={userLogFor} onClose={() => setUserLogFor(null)} />
      )}

      {expiryFor && (
        <ExpiryModal
          user={expiryFor}
          onClose={() => setExpiryFor(null)}
          onSave={async (newExpiresAt) => {
            try { await updateUserApi(expiryFor.id, { expiresAt: newExpiresAt }); load(); }
            catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
            setExpiryFor(null);
          }}
        />
      )}

      {inviteOpen && (
        <InviteModal onClose={() => setInviteOpen(false)} onCreated={() => { setInviteOpen(false); load(); }} />
      )}
    </>
  );
}

// ─── Time-limit helpers ───────────────────────────────────────────────────────
function formatExpiryDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatRemaining(ms) {
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
function formatLogDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatLogDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Render one log entry (login/logout or admin_action). */
function LogEntry({ entry }) {
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

// ─── Activity log tab ─────────────────────────────────────────────────────────
const ADMIN_ACTION_META = {
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

function ActivityTab() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | sessions | admin

  useEffect(() => {
    getActivityLog()
      .then(setLog)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Counts for the type-filter chips
  const counts = {
    all: log.length,
    sessions: log.filter(e => e.type === 'login' || e.type === 'logout').length,
    admin: log.filter(e => e.type === 'admin_action').length,
  };

  // Filter
  const filtered = log
    .filter(e => {
      if (typeFilter === 'sessions') return e.type === 'login' || e.type === 'logout';
      if (typeFilter === 'admin')    return e.type === 'admin_action';
      return true;
    })
    .filter(e => {
      if (!searchUser.trim()) return true;
      const q = searchUser.trim().toLowerCase();
      // Match against username (login/logout) or admin/target name (admin_action)
      return (
        (e.username || '').toLowerCase().includes(q) ||
        (e.adminName || '').toLowerCase().includes(q) ||
        (e.targetUsername || '').toLowerCase().includes(q)
      );
    });

  if (loading) return <div style={{ color: '#888', textAlign: 'center', paddingTop: 20 }}>טוען...</div>;
  if (!log.length) return <div style={{ color: '#555', textAlign: 'center', paddingTop: 20 }}>אין נתונים עדיין</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <FilterChip label="הכל"          count={counts.all}      active={typeFilter === 'all'}      color="#888"    onClick={() => setTypeFilter('all')} />
        <FilterChip label="🔑 כניסות"     count={counts.sessions} active={typeFilter === 'sessions'} color="#5bb8ff" onClick={() => setTypeFilter('sessions')} />
        <FilterChip label="⚙️ פעולות אדמין" count={counts.admin}    active={typeFilter === 'admin'}    color="#e67e22" onClick={() => setTypeFilter('admin')} />
      </div>

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

      {filtered.map((entry, i) => <LogEntry key={i} entry={entry} />)}
    </div>
  );
}

// ─── Per-user log modal ───────────────────────────────────────────────────────
function UserLogModal({ user, onClose }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActivityLog()
      .then(setLog)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Show entries where this user is involved — as the session owner,
  // as the target of an admin action, or as the admin who performed it.
  const filtered = log.filter(e => {
    if (e.type === 'login' || e.type === 'logout') {
      return e.userId === user.id;
    }
    if (e.type === 'admin_action') {
      return e.targetId === user.id || e.adminId === user.id;
    }
    return false;
  });

  // Quick stats for the header
  const stats = {
    logins:        filtered.filter(e => e.type === 'login').length,
    actionsOnUser: filtered.filter(e => e.type === 'admin_action' && e.targetId === user.id).length,
    actionsByUser: filtered.filter(e => e.type === 'admin_action' && e.adminId === user.id).length,
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: '#1e1e1e', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        padding: '16px 16px 30px', direction: 'rtl',
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '0 auto 14px' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 800 }}>
            📋 לוג: {user.username}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Stats row */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <Stat label="🔑 כניסות" value={stats.logins} color="#5bb8ff" />
            <Stat label="📥 פעולות עליו" value={stats.actionsOnUser} color="#e67e22" />
            {user.role === 'admin' && (
              <Stat label="📤 פעולות שביצע" value={stats.actionsByUser} color="#1db954" />
            )}
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <div style={{ color: '#888', textAlign: 'center', paddingTop: 20 }}>טוען...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', paddingTop: 30 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontSize: 13 }}>אין רשומות עבור משתמש זה</div>
            </div>
          )}
          {filtered.map((entry, i) => <LogEntry key={i} entry={entry} />)}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, color }) {
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
function FilterChip({ label, count, active, color, onClick, disabled = false }) {
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

// ─── Expiry-limit modal ───────────────────────────────────────────────────────
function ExpiryModal({ user, onClose, onSave }) {
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

/** Format a Date object as the value expected by <input type="datetime-local"> */
function toLocalDateTimeInput(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Invite modal ─────────────────────────────────────────────────────────────
function InviteModal({ onClose, onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null); // { url, emailSent, emailError }
  const [copied, setCopied] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  // Templates (loaded once on open)
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => {
    getSettingsApi()
      .then(s => {
        const tpls = Array.isArray(s.inviteTemplates) ? s.inviteTemplates : [];
        setTemplates(tpls);
        if (tpls.length) setSelectedTemplateId(tpls[0].id);
      })
      .catch(() => {});
  }, []);

  function buildMessage() {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    const body = tpl?.body || `שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם: {url}`;
    return body
      .replace(/\{firstName\}/g, firstName || '')
      .replace(/\{lastName\}/g, lastName || '')
      .replace(/\{url\}/g, result?.url || '');
  }

  async function handleCreate(sendEmail = false) {
    if (sendEmail && (!email.trim() || !email.includes('@'))) {
      return alert('כדי לשלוח במייל — הכנס כתובת מייל תקינה');
    }
    setCreating(true);
    try {
      const res = await createInviteApi({
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
        sendEmail,
      });
      setResult(res);
      if (sendEmail && !res.emailSent && res.emailError) {
        alert(`המייל לא נשלח:\n${res.emailError}\n\nאך הקישור נוצר — אפשר להעתיק/לשלוח בוואטסאפ.`);
      }
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת ההזמנה');
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => alert('לא ניתן להעתיק — בחר את הקישור ידנית')
    );
  }

  function handleWhatsApp() {
    if (!result?.url) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    // Convert local Israeli phone (05x...) to international (9725x...)
    const intlPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;
    const msg = buildMessage();
    const whatsappUrl = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
        background: '#2d2d30', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        padding: '20px 20px 30px', direction: 'rtl',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '0 auto 14px' }} />

        {!result ? (
          <>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>
              📨 הזמנת משתמש חדש
            </h3>
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 16px' }}>
              ייווצר קישור הרשמה. המשתמש יקבל גישה רק לאחר שתאשר אותו.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Field label="שם פרטי" value={firstName} onChange={setFirstName} placeholder="לא חובה" />
                <Field label="שם משפחה" value={lastName} onChange={setLastName} placeholder="לא חובה" />
              </div>
              <Field label="כתובת מייל" value={email} onChange={setEmail} type="email" placeholder="לשליחה במייל" />
              <Field label="טלפון" value={phone} onChange={setPhone} type="tel" placeholder="לשליחה בוואטסאפ — לדוג׳ 0501234567" />

              {/* Template picker (for WhatsApp) */}
              {templates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>
                    תבנית הודעה <span style={{ color: '#666', fontWeight: 400 }}>(לוואטסאפ)</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                    style={{ background: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 15, direction: 'rtl' }}
                  >
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleCreate(true)}
                disabled={creating || !email.trim()}
                style={{
                  flex: 1, minWidth: 130, padding: '12px', borderRadius: 12,
                  background: creating || !email.trim() ? '#3a3a3a' : '#007ACC',
                  border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: creating || !email.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? '...' : '📧 שלח במייל'}
              </button>
              <button
                onClick={() => handleCreate(false)}
                disabled={creating}
                style={{
                  flex: 1, minWidth: 130, padding: '12px', borderRadius: 12,
                  background: '#1db954', border: 'none', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {creating ? '...' : '🔗 צור קישור בלבד'}
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                width: '100%', marginTop: 8, padding: '10px', borderRadius: 12,
                background: 'none', border: '1px solid #444', color: '#888',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ביטול
            </button>
          </>
        ) : (
          // ── Result state ──
          <>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 16, fontWeight: 800 }}>
              {result.emailSent ? '✅ ההזמנה נשלחה!' : '🔗 קישור הזמנה מוכן'}
            </h3>
            <p style={{ color: '#888', fontSize: 12, margin: '0 0 14px' }}>
              {result.emailSent
                ? `המייל נשלח ל-${email}. אפשר גם לשלוח בוואטסאפ או להעתיק.`
                : 'שתף את הקישור עם המשתמש בכל דרך שתבחר.'}
            </p>

            {/* Action buttons (primary) */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                onClick={handleWhatsApp}
                style={{
                  flex: 1, minWidth: 110, padding: '13px', borderRadius: 12,
                  background: '#25D366', border: 'none', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                💬 שלח בוואטסאפ
              </button>
              <button
                onClick={handleCopy}
                style={{
                  flex: 1, minWidth: 110, padding: '13px', borderRadius: 12,
                  background: copied ? '#1db95433' : '#3a3a3a',
                  border: `1px solid ${copied ? '#1db954' : '#444'}`,
                  color: copied ? '#1db954' : '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {copied ? '✓ הועתק!' : '📋 העתק'}
              </button>
            </div>

            {/* Hidden raw URL behind a toggle */}
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={() => setShowUrl(s => !s)}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' }}
              >
                {showUrl ? '▲ הסתר קישור' : '▼ הצג קישור גולמי'}
              </button>
              {showUrl && (
                <div style={{
                  marginTop: 6, background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 11, color: '#5bb8ff', wordBreak: 'break-all', direction: 'ltr',
                  fontFamily: 'monospace',
                }}>
                  {result.url}
                </div>
              )}
            </div>

            <button
              onClick={onCreated}
              style={{
                width: '100%', padding: '12px', borderRadius: 12,
                background: '#007ACC', border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              סיום
            </button>
          </>
        )}
      </div>
    </>
  );
}
