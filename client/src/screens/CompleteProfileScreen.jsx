import { useState } from 'react';
import { completeProfileApi } from '../api/client.js';
import { useAuthStore } from '../store/authStore.js';
import { useLang } from '../i18n/useLang.js';

const PRIVACY_TEXT = `חוק הגנת הפרטיות (תשמ"א-1981) מחייב אותנו להודיע לך על השימוש במידע האישי שלך.

המידע שתמסור (שם פרטי, שם משפחה, כתובת מייל) ישמש אך ורק לצרכים הבאים:
• זיהוי המשתמש במערכת
• שחזור סיסמה במקרה של שכחה
• יצירת קשר אם יידרש בנוגע לחשבון שלך

המידע לא יועבר לצד שלישי כלשהו ולא ישמש למטרות שיווק או פרסום.
הנתונים מאוחסנים על שרת פרטי בלבד.

בלחיצה על "אישור וכניסה" אתה/את מאשר/ת שקראת מדיניות זו ומסכים/ה לה.`;

export default function CompleteProfileScreen() {
  const { t, dir } = useLang();
  const patchUser = useAuthStore(s => s.patchUser);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim()) return setError(t('cp_err_firstname'));
    if (!lastName.trim()) return setError(t('cp_err_lastname'));
    if (!email.trim() || !email.includes('@')) return setError(t('cp_err_email'));
    if (!privacyAccepted) return setError(t('cp_err_privacy'));

    setLoading(true);
    setError('');
    try {
      const { user } = await completeProfileApi({ firstName, lastName, email });
      patchUser(user);
    } catch (err) {
      setError(err.response?.data?.error || t('cp_err_generic'));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = firstName.trim() && lastName.trim() && email.includes('@') && privacyAccepted && !loading;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: 'var(--bg)', direction: dir, padding: '0 24px',
    }}>
      {/* Policy modal */}
      {showPolicy && (
        <>
          <div
            onClick={() => setShowPolicy(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto',
            background: 'var(--bg2)', borderRadius: '20px 20px 0 0',
            padding: '20px 20px 40px', zIndex: 51, direction: 'rtl',
            maxHeight: '80dvh', overflowY: 'auto',
          }}>
            <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <h3 style={{ color: 'var(--text)', fontWeight: 900, margin: '0 0 16px', fontSize: 17 }}>
              🔒 {t('cp_privacy_title')}
            </h3>
            <p style={{
              color: 'var(--text2)', fontSize: 14, lineHeight: 1.7,
              whiteSpace: 'pre-wrap', margin: '0 0 20px',
            }}>
              {PRIVACY_TEXT}
            </p>
            <button
              onClick={() => { setPrivacyAccepted(true); setShowPolicy(false); }}
              style={{
                width: '100%', padding: '13px', borderRadius: 14,
                background: 'var(--accent)', color: '#fff',
                border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {t('cp_accept_policy')}
            </button>
          </div>
        </>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 10 }}>👋</div>
        <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900, margin: '0 0 6px' }}>
          {t('cp_welcome_title')}
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          {t('cp_welcome_sub')}
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        {/* First + Last name in a row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Field
            label={t('cp_firstname')}
            value={firstName}
            onChange={setFirstName}
            placeholder={t('cp_firstname_ph')}
            autoComplete="given-name"
          />
          <Field
            label={t('cp_lastname')}
            value={lastName}
            onChange={setLastName}
            placeholder={t('cp_lastname_ph')}
            autoComplete="family-name"
          />
        </div>

        {/* Email */}
        <Field
          label={t('cp_email')}
          value={email}
          onChange={setEmail}
          placeholder={t('cp_email_ph')}
          type="email"
          autoComplete="email"
        />

        {/* Privacy checkbox */}
        <div
          onClick={() => {
            if (!privacyAccepted) setShowPolicy(true);
            else setPrivacyAccepted(false);
          }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
            background: privacyAccepted ? 'var(--accent)18' : 'var(--bg2)',
            border: `1px solid ${privacyAccepted ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: '12px 14px',
            transition: 'all 0.15s',
          }}
        >
          {/* Custom checkbox */}
          <div style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: `2px solid ${privacyAccepted ? 'var(--accent)' : 'var(--border)'}`,
            background: privacyAccepted ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
            {privacyAccepted && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
          </div>
          <div>
            <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>
              {t('cp_privacy_agree')}
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setShowPolicy(true); }}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', textDecoration: 'underline', marginTop: 2,
              }}
            >
              {t('cp_read_policy')} ←
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#3a1010', color: '#ff6b6b',
            borderRadius: 10, padding: '10px 14px', fontSize: 14, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            marginTop: 4, padding: '14px', borderRadius: 14,
            background: canSubmit ? 'var(--accent)' : 'var(--bg2)',
            color: canSubmit ? '#fff' : 'var(--text2)',
            border: 'none', fontSize: 16, fontWeight: 800,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {loading ? t('cp_saving') : t('cp_submit')}
        </button>
      </form>
    </div>
  );
}

// ── sub-component ─────────────────────────────────────────────────────────────
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
        }}
      />
    </div>
  );
}
