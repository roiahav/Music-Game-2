import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { loginApi } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';
import LangPicker from '../components/LangPicker.jsx';
import ForgotPasswordScreen from './ForgotPasswordScreen.jsx';

const REMEMBER_KEY = 'mg_remember_username';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const login = useAuthStore(s => s.login);
  const { t, dir } = useLang();

  // Pre-fill the remembered username on mount (we never store the password ourselves —
  // the browser's password manager handles that part)
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) setUsername(saved);
    else setRemember(false);
  }, []);

  if (showForgot) return <ForgotPasswordScreen onBack={() => setShowForgot(false)} />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const { token, user } = await loginApi(username.trim(), password);

      // "Remember me" → save just the username for next time
      if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
      else localStorage.removeItem(REMEMBER_KEY);

      // Ask the browser's credential manager to remember the password (Chrome/Edge).
      // This explicitly triggers the "save password?" prompt where supported.
      try {
        if ('credentials' in navigator && window.PasswordCredential) {
          const cred = new window.PasswordCredential({
            id: username.trim(),
            password,
            name: user?.username || username.trim(),
          });
          await navigator.credentials.store(cred);
        }
      } catch { /* not supported on some browsers — fine, the form attrs still help */ }

      login(token, user);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.error === 'blocked') {
        setError(t('account_blocked'));
      } else if (err.response?.status === 403 && err.response?.data?.error === 'pending') {
        setError(err.response?.data?.message || 'החשבון ממתין לאישור מנהל');
      } else {
        setError(err.response?.data?.error || t('login_error'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', background: '#1e1e1e', direction: dir, padding: '0 28px',
    }}>
      <LangPicker style={{ marginBottom: 24 }} />

      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 60, lineHeight: 1 }}>🎵</div>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 900, margin: '12px 0 4px' }}>{t('app_title')}</h1>
        <p style={{ color: '#555', fontSize: 13, margin: 0 }}>{t('login_subtitle')}</p>
      </div>

      {/* method="post" + name attributes are what makes browsers detect this as a real
          login form and offer to save credentials. We still use e.preventDefault() and
          submit via fetch, but the attributes are critical for the heuristic. */}
      <form
        onSubmit={handleSubmit}
        method="post"
        action="#"
        autoComplete="on"
        style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="login-username" style={{ color: '#aaa', fontSize: 13, fontWeight: 600, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            {t('username')}
          </label>
          <input
            id="login-username"
            name="username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            style={{ ...inputStyle, direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }}
            placeholder={t('enter_username')}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="login-password" style={{ color: '#aaa', fontSize: 13, fontWeight: 600, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            {t('password')}
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ ...inputStyle, direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }}
            placeholder={t('enter_password')}
          />
        </div>

        {/* Remember-me checkbox */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', userSelect: 'none', padding: '4px 2px',
        }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#007ACC', cursor: 'pointer' }}
          />
          <span style={{ color: '#aaa', fontSize: 13 }}>{t('remember_me')}</span>
        </label>

        {error && (
          <div style={{ background: '#3a1010', color: '#ff6b6b', borderRadius: 10, padding: '10px 14px', fontSize: 14, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          style={{
            marginTop: 4, padding: '14px', borderRadius: 14,
            background: loading || !username.trim() || !password ? '#333' : '#007ACC',
            color: loading || !username.trim() || !password ? '#555' : '#fff',
            border: 'none', fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {loading ? t('logging_in') : t('login_btn')}
        </button>

        {/* Forgot password link */}
        <button
          type="button"
          onClick={() => setShowForgot(true)}
          style={{
            background: 'none', border: 'none', color: '#555',
            fontSize: 13, cursor: 'pointer', padding: '8px 0 0',
            textAlign: 'center', width: '100%',
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          {t('forgot_password')}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 12,
  color: '#fff', fontSize: 16, padding: '12px 14px', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};
