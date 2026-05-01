import { useState, useEffect } from 'react';
import { validateInviteApi, registerInviteApi } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';

const PRIVACY_TEXT = `חוק הגנת הפרטיות (תשמ"א-1981) מחייב אותנו להודיע לך על השימוש במידע האישי שלך.

המידע שתמסור (שם פרטי, שם משפחה, כתובת מייל) ישמש אך ורק לצרכים הבאים:
• זיהוי המשתמש במערכת
• שחזור סיסמה במקרה של שכחה

המידע לא יועבר לצד שלישי כלשהו ולא ישמש למטרות שיווק.`;

export default function RegisterScreen({ token, onDone }) {
  const { dir } = useLang();

  // State
  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState('');
  const [invitedBy, setInvitedBy] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Validate token + load prefill on mount
  useEffect(() => {
    validateInviteApi(token)
      .then(d => {
        setInvitedBy(d.invitedBy || '');
        if (d.prefilledFirstName) setFirstName(d.prefilledFirstName);
        if (d.prefilledLastName)  setLastName(d.prefilledLastName);
        if (d.prefilledEmail)     setEmail(d.prefilledEmail);
      })
      .catch(err => setTokenError(err.response?.data?.error || 'הקישור אינו בתוקף'))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return setError('נא להזין שם משתמש');
    if (password.length < 4) return setError('סיסמה חייבת להיות לפחות 4 תווים');
    if (password !== confirmPass) return setError('הסיסמאות אינן תואמות');
    if (!firstName.trim() || !lastName.trim()) return setError('נא להזין שם פרטי ושם משפחה');
    if (!email.includes('@')) return setError('נא להזין כתובת מייל תקינה');
    if (!privacyAccepted) return setError('יש לאשר את מדיניות הפרטיות');

    setSubmitting(true);
    setError('');
    try {
      await registerInviteApi(token, { username, password, firstName, lastName, email });
      setDone(true);
      window.history.replaceState({}, '', '/');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהרשמה');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ──
  if (validating) {
    return (
      <div style={fullScreen(dir)}>
        <div style={{ color: 'var(--text2)' }}>בודק קישור...</div>
      </div>
    );
  }

  // ── Invalid token ──
  if (tokenError) {
    return (
      <div style={fullScreen(dir)}>
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
            הקישור אינו בתוקף
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            {tokenError}. בקש ממנהל המערכת לשלוח לך קישור חדש.
          </p>
          <button onClick={onDone} style={{
            padding: '14px 32px', borderRadius: 14,
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: 16, fontWeight: 800, cursor: 'pointer',
          }}>
            חזור לכניסה
          </button>
        </div>
      </div>
    );
  }

  // ── Done state ──
  if (done) {
    return (
      <div style={fullScreen(dir)}>
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>📨</div>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>
            ההרשמה הושלמה!
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, margin: '0 0 32px' }}>
            החשבון שלך נוצר בהצלחה.<br/>
            <strong style={{ color: '#e67e22' }}>אדמין יאשר אותך בקרוב</strong> ואז תוכל להיכנס למערכת.
          </p>
          <button onClick={onDone} style={{
            padding: '14px 32px', borderRadius: 14,
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: 16, fontWeight: 800, cursor: 'pointer',
          }}>
            חזור לכניסה
          </button>
        </div>
      </div>
    );
  }

  // ── Registration form ──
  return (
    <div style={fullScreen(dir)}>
      {/* Privacy policy modal */}
      {showPolicy && (
        <>
          <div onClick={() => setShowPolicy(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto',
            background: 'var(--bg2)', borderRadius: '20px 20px 0 0',
            padding: '20px 20px 40px', zIndex: 51, direction: 'rtl',
            maxHeight: '80dvh', overflowY: 'auto',
          }}>
            <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <h3 style={{ color: 'var(--text)', fontWeight: 900, margin: '0 0 16px', fontSize: 17 }}>🔒 מדיניות הפרטיות</h3>
            <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 20px' }}>{PRIVACY_TEXT}</p>
            <button
              onClick={() => { setPrivacyAccepted(true); setShowPolicy(false); }}
              style={{ width: '100%', padding: '13px', borderRadius: 14, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}
            >
              קראתי ומסכים/ה
            </button>
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 380, padding: '24px 24px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>🎵</div>
          <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
            הרשמה ל-Music Game
          </h1>
          {invitedBy && (
            <p style={{ color: 'var(--text2)', fontSize: 13, margin: 0 }}>
              הוזמנת על ידי <strong style={{ color: 'var(--accent)' }}>{invitedBy}</strong>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="שם משתמש" value={username} onChange={setUsername} placeholder="לדוגמה: דני כהן" autoComplete="username" />

          <div style={{ display: 'flex', gap: 8 }}>
            <Field label="שם פרטי" value={firstName} onChange={setFirstName} autoComplete="given-name" />
            <Field label="שם משפחה" value={lastName} onChange={setLastName} autoComplete="family-name" />
          </div>

          <Field label="כתובת מייל" value={email} onChange={setEmail} type="email" autoComplete="email" placeholder="name@example.com" />

          <Field label="סיסמה" value={password} onChange={setPassword} type="password" autoComplete="new-password" placeholder="לפחות 4 תווים" />
          <Field label="אימות סיסמה" value={confirmPass} onChange={setConfirmPass} type="password" autoComplete="new-password" />

          {/* Privacy consent */}
          <div
            onClick={() => { if (!privacyAccepted) setShowPolicy(true); else setPrivacyAccepted(false); }}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
              background: privacyAccepted ? 'var(--accent)18' : 'var(--bg2)',
              border: `1px solid ${privacyAccepted ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, padding: '12px 14px', transition: 'all 0.15s',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
              border: `2px solid ${privacyAccepted ? 'var(--accent)' : 'var(--border)'}`,
              background: privacyAccepted ? 'var(--accent)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {privacyAccepted && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>✓</span>}
            </div>
            <div>
              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>
                קראתי ומסכים/ה למדיניות הפרטיות
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); setShowPolicy(true); }}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', marginTop: 2 }}>
                לחץ לקריאת המדיניות ←
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: '#3a1010', color: '#ff6b6b', borderRadius: 10, padding: '10px 14px', fontSize: 14, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting}
            style={{
              marginTop: 4, padding: '14px', borderRadius: 14,
              background: submitting ? 'var(--bg2)' : 'var(--accent)',
              color: submitting ? 'var(--text2)' : '#fff',
              border: 'none', fontSize: 16, fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'נרשם...' : '✨ הירשם'}
          </button>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12, margin: '20px 0 0', lineHeight: 1.5 }}>
          לאחר הרישום, החשבון יעבור לאישור מנהל לפני שתוכל להיכנס.
        </p>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, autoComplete }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ color: 'var(--text2)', fontSize: 12, fontWeight: 700 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--text)',
          fontSize: 15, padding: '11px 12px', outline: 'none',
          width: '100%', boxSizing: 'border-box',
          direction: type === 'email' || type === 'password' ? 'ltr' : 'rtl',
        }}
      />
    </div>
  );
}

const fullScreen = (dir) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100dvh', background: 'var(--bg)', direction: dir,
});
