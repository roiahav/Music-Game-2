import { useState, useEffect } from 'react';
import { getActivityLog } from '../../api/client.js';
import { LogEntry, Stat } from './shared.jsx';

/**
 * Bottom-sheet modal showing every activity-log entry that involves a single
 * user — login/logout sessions where they were the actor, plus admin actions
 * either targeting them or performed by them.
 */
export default function UserLogModal({ user, onClose }) {
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
