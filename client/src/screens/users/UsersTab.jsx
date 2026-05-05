import { useState, useEffect } from 'react';
import {
  getUsers, updateUserApi, deleteUserApi, approveUserApi,
} from '../../api/client.js';
import {
  FilterChip, ToggleBtn,
  iconBtnStyle, formatExpiryDate, formatRemaining,
} from './shared.jsx';
import UserModal from './UserModal.jsx';
import UserLogModal from './UserLogModal.jsx';
import ExpiryModal from './ExpiryModal.jsx';
import InviteModal from './InviteModal.jsx';

/**
 * Mobile Settings → "ניהול משתמשים" panel. Lists every user as a
 * collapsible row, with filter chips, search and four modals
 * (add/edit/reset, log, expiry, invite). The activity log is its
 * own panel — see ActivityTab.jsx.
 */
export default function UsersTab({ defaultFilter = 'all', onFilterConsumed }) {
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
  const [expandedUserId, setExpandedUserId] = useState(null); // collapsible user rows

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
            const isExpanded = expandedUserId === u.id;

            return (
              <div key={u.id} style={{
                background: isBlocked ? '#2a1010' : '#2d2d30',
                borderRadius: 14,
                border: `1px solid ${isBlocked ? '#dc354544' : '#3a3a3a'}`,
                opacity: isBlocked ? 0.85 : 1,
                transition: 'all 0.15s',
                overflow: 'hidden',
              }}>
                {/* Collapsed header — username only + chevron, always visible. Tapping toggles expand. */}
                <button
                  onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'right', color: 'inherit',
                  }}
                >
                  <span style={{
                    flex: 1, minWidth: 0, color: isBlocked ? '#ff6b6b' : '#fff',
                    fontWeight: 700, fontSize: 15,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {u.username}
                  </span>
                  {isBlocked && <span style={{ fontSize: 13, color: '#ff6b6b' }}>🚫</span>}
                  {u.approved === false && <span style={{ fontSize: 13, color: '#e67e22' }}>⏳</span>}
                  {isAdmin && <span style={{ fontSize: 13, color: '#5bb8ff' }}>👑</span>}
                  <span style={{ color: '#888', fontSize: 14, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </button>

                {isExpanded && (
                <div style={{ padding: '0 14px 12px' }}>
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
                )}
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
