import { useState, useEffect } from 'react';
import { getUsers, approveUserApi, deleteUserApi } from '../../api/client.js';
import { SectionHeader, Card, Tag, AvatarCircle } from './shared.jsx';

/**
 * Pending join requests inbox. Lists every user with `approved === false`
 * and offers per-row Approve / Reject buttons. The `onChange` callback
 * lets the dashboard sidebar refresh its badge after each action.
 */
export default function MessagesSection({ onChange }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const list = await getUsers();
      setPending(list.filter(u => u.approved === false));
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleApprove(u) {
    setBusyId(u.id);
    try {
      await approveUserApi(u.id);
      await load();
      onChange?.();
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    setBusyId(null);
  }

  async function handleReject(u) {
    if (!confirm(`לדחות ולמחוק את הבקשה של "${u.username}"?`)) return;
    setBusyId(u.id);
    try {
      await deleteUserApi(u.id);
      await load();
      onChange?.();
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    setBusyId(null);
  }

  function timeAgo(idStr) {
    const ts = Number(idStr);
    if (isNaN(ts)) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    const hr  = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (day > 0) return `לפני ${day} ימים`;
    if (hr > 0)  return `לפני ${hr} שעות`;
    if (min > 0) return `לפני ${min} דק׳`;
    return 'זה עתה';
  }

  return (
    <>
      <SectionHeader
        title="📬 בקשות הצטרפות"
        subtitle={pending.length === 0
          ? 'אין בקשות פתוחות'
          : `${pending.length} משתמשים ממתינים לאישור שלך`}
      />

      {loading ? (
        <div style={{ color: '#888' }}>טוען...</div>
      ) : pending.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#aaa', marginBottom: 6 }}>תיבת הדואר ריקה</div>
            <div style={{ fontSize: 12 }}>כשמשתמש חדש ירשום עצמו דרך קישור הזמנה, הבקשה תופיע כאן.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map(u => (
            <div key={u.id} style={{
              background: '#1a1a1f', border: '1px solid #e67e2244',
              borderRadius: 12, padding: 18,
              borderRight: '4px solid #e67e22',
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
            }}>
              <AvatarCircle userId={u.id} hasAvatar={u.hasAvatar} name={u.username} size={48} />

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{u.username}</span>
                  <Tag color="#e67e22">⏳ ממתין</Tag>
                  <span style={{ fontSize: 11, color: '#888' }}>{timeAgo(u.id)}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontSize: 13 }}>
                  {(u.firstName || u.lastName) && (
                    <InfoLine label="שם מלא" value={[u.firstName, u.lastName].filter(Boolean).join(' ')} />
                  )}
                  {u.email && <InfoLine label="מייל" value={u.email} ltr />}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => handleApprove(u)} disabled={busyId === u.id}
                  style={{
                    background: '#1db954', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700,
                    cursor: busyId === u.id ? 'wait' : 'pointer', opacity: busyId === u.id ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}>
                  ✅ אשר
                </button>
                <button onClick={() => handleReject(u)} disabled={busyId === u.id}
                  style={{
                    background: 'transparent', border: '1px solid #dc354555', color: '#dc3545',
                    borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700,
                    cursor: busyId === u.id ? 'wait' : 'pointer', opacity: busyId === u.id ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}>
                  🗑️ דחה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function InfoLine({ label, value, ltr }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#ddd', fontSize: 13, direction: ltr ? 'ltr' : 'rtl', textAlign: 'right' }}>{value}</div>
    </div>
  );
}
