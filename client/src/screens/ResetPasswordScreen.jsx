import { useState } from 'react';
import { resetPasswordWithTokenApi } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';

export default function ResetPasswordScreen({ token, onDone }) {
  const { t, dir } = useLang();
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPass.length < 4) return setError(t('rp_err_short'));
    if (newPass !== confirmPass) return setError(t('rp_err_mismatch'));
    setLoading(true);
    setError('');
    try {
      await resetPasswordWithTokenApi(token, newPass);
      setDone(true);
      // Clean up URL — remove token from address bar
      window.history.replaceState({}, '', '/');
    } catch (err) {
      const msg = err.response?.data?.error || '';
      if (msg.includes('תוקף') || msg.includes('בתוקף')) {
        setError(t('rp_err_expired'));
      } else {
        setError(msg || t('rp_err_expired'));
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = newPass.length >= 4 && confirmPass.length >= 1 && !loading;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: 'var(--bg)', direction: dir, padding: '0 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {done ? (
          /* ── Success ── */
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={{ color: 'var(--text)', fontWeight: 900, fontSize: 22, margin: '0 0 12px' }}>
              {t('rp_success_title')}
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, margin: '0 0 32px' }}>
              {t('rp_success_sub')}
            </p>
            <button
              onClick={onDone}
              style={{
                width: '100%', padding: '14px', borderRadius: 14,
                background: 'var(--accent)', color: '#fff',
                border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {t('rp_go_login')}
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 56, marginBottom: 10 }}>🔐</div>
              <h1 style={{ color: 'var(--text)', fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>
                {t('rp_title')}
              </h1>
              <p style={{ color: 'var(--text2)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
                {t('rp_sub')}
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* New password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 700 }}>
                  {t('rp_new_pass')}
                </label>
                <input
                  type="password"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder={t('rp_pass_ph')}
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>

              {/* Confirm */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 700 }}>
                  {t('rp_confirm_pass')}
                </label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder={t('rp_pass_ph')}
                  autoComplete="new-password"
                  style={{
                    ...inputStyle,
                    borderColor: confirmPass && confirmPass !== newPass ? '#dc3545' : 'var(--border)',
                  }}
                />
                {confirmPass && confirmPass !== newPass && (
                  <span style={{ color: '#ff6b6b', fontSize: 12 }}>{t('rp_err_mismatch')}</span>
                )}
              </div>

              {/* Password strength indicator */}
              {newPass.length > 0 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {[4, 7, 10].map((threshold, i) => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: newPass.length >= threshold
                        ? i === 0 ? '#dc3545' : i === 1 ? '#e67e22' : '#1db954'
                        : 'var(--border)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
              )}

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
                disabled={!canSubmit || newPass !== confirmPass}
                style={{
                  marginTop: 4, padding: '14px', borderRadius: 14,
                  background: canSubmit && newPass === confirmPass ? 'var(--accent)' : 'var(--bg2)',
                  color: canSubmit && newPass === confirmPass ? '#fff' : 'var(--text2)',
                  border: 'none', fontSize: 16, fontWeight: 800,
                  cursor: canSubmit && newPass === confirmPass ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                {loading ? t('rp_updating') : t('rp_submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 12, color: 'var(--text)',
  fontSize: 16, padding: '13px 14px', outline: 'none',
  width: '100%', boxSizing: 'border-box', direction: 'ltr',
};
