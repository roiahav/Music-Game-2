import { useState, useEffect } from 'react';
import { createInviteApi, getSettings as getSettingsApi } from '../../api/client.js';
import { Field } from './shared.jsx';

/**
 * Bottom-sheet "create invite" modal — collects optional name/email/phone,
 * lets the admin pick a WhatsApp message template, and after creation
 * presents Copy / WhatsApp / hidden-raw-URL controls.
 */
export default function InviteModal({ onClose, onCreated }) {
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
