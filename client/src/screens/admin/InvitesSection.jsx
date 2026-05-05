import { useState, useEffect } from 'react';
import { listInvitesApi, deleteInviteApi, createInviteApi, getSettings as getSettingsApi } from '../../api/client.js';
import { csvDate } from '../../utils/csv.js';
import {
  SectionHeader, Card, Tag, ActionBtn, FormField,
  tableStyle, thStyle, tdStyle, inputStyle, btnPrimary,
} from './shared.jsx';

/**
 * Invitations table — list of pending/used signup links and an inline
 * "create new" form that calls into createInviteApi (with optional email
 * delivery via the configured SMTP).
 */
export default function InvitesSection() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try { setInvites(await listInvitesApi()); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleRevoke(token) {
    if (!confirm('לבטל את ההזמנה?')) return;
    try { await deleteInviteApi(token); load(); } catch {}
  }

  function copyLink(token) {
    const url = `${window.location.origin}/i/${token}`;
    navigator.clipboard?.writeText(url);
    alert('הקישור הועתק:\n' + url);
  }

  return (
    <>
      <SectionHeader
        title="📨 הזמנות"
        subtitle={`${invites.length} הזמנות`}
        actions={
          <button onClick={() => setShowCreate(s => !s)} style={btnPrimary}>
            {showCreate ? '✕ סגור' : '+ הזמנה חדשה'}
          </button>
        }
      />

      {showCreate && (
        <CreateInviteCard onCreated={() => { setShowCreate(false); load(); }} />
      )}

      <Card>
        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>טוען...</div>
        ) : invites.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 30 }}>אין הזמנות פעילות</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>נמען</th>
                <th style={thStyle}>נוצר ע״י</th>
                <th style={thStyle}>נוצר ב</th>
                <th style={thStyle}>פג תוקף</th>
                <th style={thStyle}>סטטוס</th>
                <th style={thStyle}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => {
                const expired = inv.expiresAt < Date.now();
                return (
                  <tr key={inv.token} style={{ borderBottom: '1px solid #2d2d33' }}>
                    <td style={tdStyle}>
                      {[inv.prefilledFirstName, inv.prefilledLastName].filter(Boolean).join(' ') || '—'}
                      {inv.prefilledEmail && (
                        <div style={{ fontSize: 11, color: '#888', direction: 'ltr' }}>{inv.prefilledEmail}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{inv.createdByName || '—'}</td>
                    <td style={tdStyle}>{csvDate(new Date(inv.createdAt).toISOString())}</td>
                    <td style={tdStyle}>{csvDate(new Date(inv.expiresAt).toISOString())}</td>
                    <td style={tdStyle}>
                      {inv.used ? <Tag color="#1db954">✓ נוצל</Tag>
                        : expired ? <Tag color="#dc3545">פג תוקף</Tag>
                        : <Tag color="#5bb8ff">🟢 פעיל</Tag>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!inv.used && !expired && (
                          <>
                            <ActionBtn onClick={() => copyLink(inv.token)} title="העתק קישור">📋</ActionBtn>
                            <ActionBtn onClick={() => handleRevoke(inv.token)} color="#dc3545" title="בטל">×</ActionBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ─── Create-invite inline card (used inside InvitesSection) ──────────────────
function CreateInviteCard({ onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');

  const [templates, setTemplates]               = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  useEffect(() => {
    getSettingsApi().then(s => {
      const tpls = Array.isArray(s.inviteTemplates) ? s.inviteTemplates : [];
      setTemplates(tpls);
      if (tpls.length) setSelectedTemplateId(tpls[0].id);
    }).catch(() => {});
  }, []);

  const [creating, setCreating] = useState(false);
  const [result, setResult]     = useState(null); // { url, emailSent, emailError }
  const [copied, setCopied]     = useState(false);

  function reset() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setResult(null); setCopied(false);
  }

  async function handleCreate(sendEmail = false) {
    if (sendEmail && (!email.trim() || !email.includes('@'))) {
      return alert('כדי לשלוח במייל — הזן כתובת מייל תקינה');
    }
    setCreating(true);
    try {
      const res = await createInviteApi({
        firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim(), sendEmail,
      });
      setResult(res);
      if (sendEmail && !res.emailSent && res.emailError) {
        alert(`המייל לא נשלח:\n${res.emailError}\n\nאך הקישור נוצר — אפשר להעתיק או לשלוח בוואטסאפ.`);
      }
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    setCreating(false);
  }

  function buildMsg() {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    const body = tpl?.body || `שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם: {url}`;
    return body
      .replace(/\{firstName\}/g, firstName || '')
      .replace(/\{lastName\}/g, lastName || '')
      .replace(/\{url\}/g, result?.url || '');
  }

  function handleCopy() {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => alert('לא ניתן להעתיק — בחר ידנית')
    );
  }

  function handleWhatsApp() {
    if (!result?.url) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;
    const msg = buildMsg();
    const url = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  return (
    <Card title="✨ יצירת הזמנה חדשה">
      {!result ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <FormField label="שם פרטי"   value={firstName} onChange={setFirstName} placeholder="לא חובה" />
            <FormField label="שם משפחה"  value={lastName}  onChange={setLastName}  placeholder="לא חובה" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <FormField label="כתובת מייל" value={email}    onChange={setEmail} type="email" placeholder="לשליחה במייל" ltr />
            <FormField label="טלפון"      value={phone}    onChange={setPhone} type="tel"  placeholder="לוואטסאפ — 0501234567" ltr />
          </div>

          {templates.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                תבנית הודעה (לוואטסאפ)
              </label>
              <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleCreate(true)} disabled={creating || !email.trim()}
              style={{ ...btnPrimary, flex: 1, opacity: creating || !email.trim() ? 0.5 : 1 }}>
              {creating ? '...' : '📧 שלח במייל'}
            </button>
            <button onClick={() => handleCreate(false)} disabled={creating}
              style={{ ...btnPrimary, background: '#1db954', flex: 1 }}>
              {creating ? '...' : '🔗 צור קישור'}
            </button>
          </div>
        </>
      ) : (
        // Result panel
        <>
          <div style={{
            background: result.emailSent ? '#1db95422' : '#007ACC22',
            border: `1px solid ${result.emailSent ? '#1db954' : '#007ACC'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ color: result.emailSent ? '#1db954' : '#5bb8ff', fontWeight: 700 }}>
              {result.emailSent ? '✅ ההזמנה נשלחה במייל!' : '🔗 הקישור מוכן'}
            </div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              {result.emailSent
                ? `נשלח אל ${email}. אפשר גם להעתיק או לשלוח בוואטסאפ.`
                : 'שתף את הקישור עם המשתמש בכל דרך.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={handleWhatsApp} style={{
              flex: 1, padding: '12px', borderRadius: 10, background: '#25D366',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              💬 שלח בוואטסאפ
            </button>
            <button onClick={handleCopy} style={{
              flex: 1, padding: '12px', borderRadius: 10,
              background: copied ? '#1db95433' : '#2d2d33',
              border: `1px solid ${copied ? '#1db954' : '#444'}`,
              color: copied ? '#1db954' : '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              {copied ? '✓ הועתק!' : '📋 העתק'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{
              flex: 1, padding: '10px', borderRadius: 10, background: 'transparent',
              border: '1px solid #444', color: '#aaa', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              🆕 הזמנה נוספת
            </button>
            <button onClick={() => onCreated?.()} style={{ ...btnPrimary, flex: 1 }}>
              סיום
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
