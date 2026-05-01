import { useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { loginApi } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';
import LangPicker from '../components/LangPicker.jsx';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore(s => s.login);
  const { t, dir } = useLang();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const { token, user } = await loginApi(username.trim(), password);
      login(token, user);
    } catch (err) {
      // blocked account returns 403 with error:'blocked'
      if (err.response?.status === 403 && err.response?.data?.error === 'blocked') {
        setError(t('account_blocked'));
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

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>{t('username')}</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            style={inputStyle}
            placeholder={t('enter_username')}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ color: '#aaa', fontSize: 13, fontWeight: 600 }}>{t('password')}</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            style={inputStyle}
            placeholder={t('enter_password')}
          />
        </div>

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
      </form>
    </div>
  );
}

const inputStyle = {
  background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 12,
  color: '#fff', fontSize: 16, padding: '12px 14px', outline: 'none',
  width: '100%', boxSizing: 'border-box', direction: 'ltr',
};
