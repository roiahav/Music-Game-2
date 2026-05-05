import { useState, useEffect } from 'react';
import { getActivityLog } from '../../api/client.js';
import { FilterChip, LogEntry } from './shared.jsx';

/**
 * Embeddable activity-log feed used by the mobile Settings drag-card with
 * the "📋 לוג פעילות" title. Lists every login/logout + admin action with
 * type filter chips and a free-text user-search.
 */
export default function ActivityTab() {
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
