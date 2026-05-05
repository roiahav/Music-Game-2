import { useState } from 'react';
import { getSettings as getSettingsApi, createInviteApi } from '../../api/client.js';

/**
 * Admin "invite users" panel. Generates a one-time signup URL and offers to
 * send it via email (uses the SMTP config) or share via WhatsApp using a
 * configurable message template.
 */
export default function InviteSettingsPanel() {
  const [open, setOpen] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Submission state
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null); // { url, emailSent, emailError }
  const [copied, setCopied] = useState(false);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Load templates when the panel opens
  async function ensureTemplates() {
    if (templatesLoaded) return;
    try {
      const s = await getSettingsApi();
      const tpls = Array.isArray(s.inviteTemplates) ? s.inviteTemplates : [];
      setTemplates(tpls);
      if (tpls.length && !selectedTemplateId) setSelectedTemplateId(tpls[0].id);
    } catch {}
    setTemplatesLoaded(true);
  }

  function handleOpen() {
    if (!open) ensureTemplates();
    setOpen(o => !o);
  }

  function resetForm() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setResult(null); setCopied(false);
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
      () => alert('לא ניתן להעתיק — בחר ידנית')
    );
  }

  function buildMessage() {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    const body = tpl?.body || `שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם: {url}`;
    return body
      .replace(/\{firstName\}/g, firstName || '')
      .replace(/\{lastName\}/g, lastName || '')
      .replace(/\{url\}/g, result?.url || '');
  }

  function handleWhatsApp() {
    if (!result?.url) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;
    const msg = buildMessage();
    const whatsappUrl = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
  }

  const inputStyle = {
    background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
    color: '#fff', padding: '9px 12px', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', width: '100%',
  };

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>📨 הזמנת משתמשים</span>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, color: '#888', fontSize: 12 }}>
            צור קישור הרשמה ושלח אותו במייל או בוואטסאפ.
            <br/>המשתמש יוכל להיכנס רק אחרי שתאשר אותו ב<strong style={{ color: '#aaa' }}>ניהול משתמשים</strong>.
          </p>

          {!result ? (
            <>
              {/* Form */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    שם פרטי
                  </label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="לא חובה" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    שם משפחה
                  </label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="לא חובה" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  כתובת מייל <span style={{ color: '#666' }}>(לשליחה במייל)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{ ...inputStyle, direction: 'ltr' }}
                />
              </div>

              <div>
                <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  טלפון <span style={{ color: '#666' }}>(לשליחה בוואטסאפ)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0501234567"
                  style={{ ...inputStyle, direction: 'ltr' }}
                />
              </div>

              {/* Template picker (for WhatsApp) */}
              {templates.length > 0 && (
                <div>
                  <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    תבנית הודעה <span style={{ color: '#666' }}>(לוואטסאפ)</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                    style={{ ...inputStyle, direction: 'rtl' }}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Send buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleCreate(true)}
                  disabled={creating || !email.trim()}
                  style={{
                    flex: 1, minWidth: 130, padding: '11px', borderRadius: 10,
                    background: creating || !email.trim() ? '#3a3a3a' : '#007ACC',
                    border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: creating || !email.trim() ? 'not-allowed' : 'pointer',
                    opacity: creating || !email.trim() ? 0.6 : 1,
                  }}
                >
                  {creating ? '...' : '📧 שלח במייל'}
                </button>
                <button
                  onClick={() => handleCreate(false)}
                  disabled={creating}
                  style={{
                    flex: 1, minWidth: 130, padding: '11px', borderRadius: 10,
                    background: '#1db954', border: 'none', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {creating ? '...' : '🔗 צור קישור בלבד'}
                </button>
              </div>
            </>
          ) : (
            // ── Result state ──
            <>
              <div style={{
                background: result.emailSent ? '#1db95422' : '#007ACC22',
                border: `1px solid ${result.emailSent ? '#1db954' : '#007ACC'}`,
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ color: result.emailSent ? '#1db954' : '#5bb8ff', fontWeight: 700, fontSize: 13 }}>
                  {result.emailSent ? '✅ ההזמנה נשלחה במייל!' : '🔗 הקישור מוכן'}
                </div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                  {result.emailSent
                    ? `נשלח אל ${email}. אפשר גם לשלוח בוואטסאפ.`
                    : 'שתף את הקישור עם המשתמש בכל דרך שתבחר.'}
                </div>
              </div>

              {/* Action buttons (primary) */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleWhatsApp}
                  style={{
                    flex: 1, minWidth: 110, padding: '13px', borderRadius: 10,
                    background: '#25D366', border: 'none', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  💬 שלח בוואטסאפ
                </button>
                <button
                  onClick={handleCopy}
                  style={{
                    flex: 1, minWidth: 110, padding: '13px', borderRadius: 10,
                    background: copied ? '#1db95433' : '#3a3a3a',
                    border: `1px solid ${copied ? '#1db954' : '#444'}`,
                    color: copied ? '#1db954' : '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {copied ? '✓ הועתק!' : '📋 העתק קישור'}
                </button>
              </div>

              {/* URL — hidden behind a toggle so it doesn't dominate the panel */}
              <ShowUrlToggle url={result.url} />

              <button
                onClick={resetForm}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  background: 'none', border: '1px solid #444', color: '#aaa',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                🆕 הזמנה נוספת
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Show/hide URL toggle (used in invite result) ─────────────────────────────
function ShowUrlToggle({ url }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setShow(s => !s)}
        style={{
          background: 'none', border: 'none', color: '#666', fontSize: 11,
          cursor: 'pointer', padding: '4px 0', textDecoration: 'underline',
        }}
      >
        {show ? '▲ הסתר קישור' : '▼ הצג קישור גולמי'}
      </button>
      {show && (
        <div style={{
          marginTop: 6, background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11, color: '#5bb8ff', wordBreak: 'break-all', direction: 'ltr',
          fontFamily: 'monospace',
        }}>
          {url}
        </div>
      )}
    </div>
  );
}
