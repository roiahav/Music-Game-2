import { useState, useEffect, useMemo } from 'react';
import { getActivityLog } from '../../api/client.js';
import { downloadCSV, csvDate } from '../../utils/csv.js';
import {
  SectionHeader, Card, Pill, ActivityRow,
  inputStyle, dateStyle, btnPrimary, iconButton,
  todayStr,
} from './shared.jsx';

/**
 * Full activity log with text search, type filter (login / logout /
 * admin actions) and an optional date range. CSV export covers the
 * currently-filtered subset.
 */
export default function ActivitySection() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');     // all | login | logout | admin
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    getActivityLog().then(setLog).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return log.filter(e => {
      if (type !== 'all') {
        if (type === 'admin' && e.type !== 'admin_action') return false;
        if (type === 'login'  && e.type !== 'login')  return false;
        if (type === 'logout' && e.type !== 'logout') return false;
      }
      if (fromDate && new Date(e.timestamp) < new Date(fromDate)) return false;
      if (toDate) {
        const end = new Date(toDate); end.setHours(23, 59, 59, 999);
        if (new Date(e.timestamp) > end) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [e.username, e.adminName, e.targetUsername, e.ip].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [log, search, type, fromDate, toDate]);

  function exportCSV() {
    const rows = [
      ['תאריך','סוג','משתמש','מבצע (למפעולות אדמין)','פעולה','IP','משך (יציאה)'],
      ...filtered.map(e => [
        csvDate(e.timestamp),
        e.type === 'admin_action' ? 'פעולת אדמין' : (e.type === 'login' ? 'כניסה' : 'יציאה'),
        e.username || e.targetUsername || '',
        e.adminName || '',
        e.action || '',
        e.ip || '',
        e.durationMs ? Math.round(e.durationMs / 1000) + ' שנ׳' : '',
      ]),
    ];
    downloadCSV(`activity-${todayStr()}.csv`, rows);
  }

  return (
    <>
      <SectionHeader
        title="📋 לוג פעילות"
        subtitle={`${filtered.length} רשומות`}
        actions={<button onClick={exportCSV} style={btnPrimary}>📥 ייצוא ל-CSV</button>}
      />

      <Card>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 חיפוש..." style={{ ...inputStyle, flex: '0 0 220px' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill label="הכל"     active={type === 'all'}    onClick={() => setType('all')} />
            <Pill label="🔑 כניסה" active={type === 'login'}  onClick={() => setType('login')} />
            <Pill label="🚪 יציאה" active={type === 'logout'} onClick={() => setType('logout')} />
            <Pill label="⚙️ אדמין" active={type === 'admin'}  onClick={() => setType('admin')} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#888', fontSize: 12 }}>
            <span>טווח:</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={dateStyle} />
            <span>—</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={dateStyle} />
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate(''); }} style={{ ...iconButton, fontSize: 11 }}>✕ נקה</button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>טוען...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '60dvh', overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>אין רשומות</div>}
            {filtered.map((e, i) => <ActivityRow key={i} entry={e} />)}
          </div>
        )}
      </Card>
    </>
  );
}
