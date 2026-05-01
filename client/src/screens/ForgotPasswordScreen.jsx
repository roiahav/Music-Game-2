import { useState } from 'react';
import { forgotPasswordApi } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';

export default function ForgotPasswordScreen({ onBack }) {
  const { t, dir } = useLang();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) return setError(t('cp_err_email'));
    setLoading(true);
    setError('');
    try {
      await forgotPasswordApi(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשליחה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: 'var(--bg)', direction: dir, padding: '0 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: 'var(--text2)',
            fontSize: 14, cursor: 'pointer', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          ← {t('fp_back_login')}
        </button>

        {sent ? (
          /* ── Success state ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>📬</div>
            <h2 style={{ color: 'var(--text)', fontWeight: 900, fontSize: 22, margin: '0 0 12px' }}>
              {t('fp_success_title')}
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, margin: '0 0 32px' }}>
              {t('fp_success_sub')}
            </p>
            <button
              onClick={onBack}
              style={{
                width: '100%', padding: '14px', borderRadius: 14,
                background: 'var(--accent)', color: '#fff',
                border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {t('fp_back_login')}
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>🔑</div>
              <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
                {t('fp_title')}
              </h1>
              <p style={{ color: 'var(--text2)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                {t('fp_sub')}
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 700 }}>
                  {t('fp_email_label')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('fp_email_ph')}
                  autoComplete="email"
                  style={{
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderRadius: 12, color: 'var(--text)',
                    fontSize: 16, padding: '13px 14px', outline: 'none',
                    width: '100%', boxSizing: 'border-box', direction: 'ltr',
                  }}
                />
              </div>

              {error && (
                <div style={{
                  background: '#3a1010', color: '#ff6b6b',
                  borderRadius: 10, padding: '10px 14px', fontSize: 14, textAlign: 'center',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.includes('@')}
                style={{
                  marginTop: 4, padding: '14px', borderRadius: 14,
                  background: loading || !email.includes('@') ? 'var(--bg2)' : 'var(--accent)',
                  color: loading || !email.includes('@') ? 'var(--text2)' : '#fff',
                  border: 'none', fontSize: 16, fontWeight: 800,
                  cursor: loading || !email.includes('@') ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {loading ? t('fp_sending') : t('fp_send_btn')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
