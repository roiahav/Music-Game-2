import { useState } from 'react';
import { getSettings as getSettingsApi, saveSettings, testEmailSettings } from '../../api/client.js';
import { useLang } from '../../i18n/useLang.js';

/**
 * Admin SMTP configuration panel — collapsible card with host/port/auth
 * fields, a "save" and a "test" button. Lives behind a unified Settings
 * order in the parent screen, but is otherwise self-contained.
 */
export default function EmailSettingsPanel() {
  const { t } = useLang();
  const [cfg, setCfg] = useState({
    smtpHost: '', smtpPort: 587, smtpSecure: false,
    smtpUser: '', smtpPass: '', fromName: 'Music Game', fromEmail: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | string(error)

  async function load() {
    if (loaded) return;
    try {
      const s = await getSettingsApi();
      if (s.email) setCfg(prev => ({ ...prev, ...s.email }));
    } catch {}
    setLoaded(true);
  }

  function handleOpen() { load(); setOpen(o => !o); }

  function handleChange(field, value) {
    setCfg(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({ email: cfg });
    } catch {}
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    // Save first, then test
    try {
      await saveSettings({ email: cfg });
      await testEmailSettings();
      setTestResult('ok');
    } catch (e) {
      setTestResult(e.response?.data?.error || e.message || 'שגיאה לא ידועה');
    } finally {
      setTesting(false);
    }
  }

  const inputStyle = {
    background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
    color: '#ccc', padding: '8px 10px', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', width: '100%', direction: 'ltr',
  };

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header row */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
          color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>📧 {t('email_settings')}</span>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Hint */}
          <p style={{ margin: 0, color: '#888', fontSize: 12, background: '#1e1e1e', borderRadius: 8, padding: '8px 10px' }}>
            💡 {t('email_hint')}
          </p>

          {/* Host + Port row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 3 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('email_smtp_host')} <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input
                value={cfg.smtpHost}
                onChange={e => handleChange('smtpHost', e.target.value)}
                placeholder="smtp.gmail.com"
                style={{ ...inputStyle, borderColor: cfg.smtpHost?.trim() ? '#444' : '#dc354555' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('email_smtp_port')}</label>
              <input type="number" value={cfg.smtpPort} onChange={e => handleChange('smtpPort', Number(e.target.value))} placeholder="587" style={inputStyle} />
            </div>
          </div>

          {/* SSL toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={cfg.smtpSecure}
              onChange={e => handleChange('smtpSecure', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#007ACC' }}
            />
            <span style={{ color: '#aaa', fontSize: 13 }}>{t('email_secure')}</span>
          </label>

          {/* User */}
          <div>
            <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t('email_smtp_user')} <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              type="email"
              value={cfg.smtpUser}
              onChange={e => handleChange('smtpUser', e.target.value)}
              placeholder="your@gmail.com"
              style={{ ...inputStyle, borderColor: cfg.smtpUser?.trim() ? '#444' : '#dc354555' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t('email_smtp_pass')} <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              type="password"
              value={cfg.smtpPass}
              onChange={e => handleChange('smtpPass', e.target.value)}
              placeholder="App Password..."
              autoComplete="new-password"
              style={{ ...inputStyle, borderColor: cfg.smtpPass?.trim() ? '#444' : '#dc354555' }}
            />
          </div>

          {/* From name + email row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('email_from_name')}</label>
              <input value={cfg.fromName} onChange={e => handleChange('fromName', e.target.value)} placeholder="Music Game" style={inputStyle} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('email_from_addr')}</label>
              <input type="email" value={cfg.fromEmail} onChange={e => handleChange('fromEmail', e.target.value)} placeholder="your@gmail.com" style={inputStyle} />
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: testResult === 'ok' ? '#1db95433' : '#3a1010',
              color: testResult === 'ok' ? '#1db954' : '#ff6b6b',
            }}>
              {testResult === 'ok' ? t('email_test_ok') : `${t('email_test_fail')} ${testResult}`}
            </div>
          )}

          {/* Buttons */}
          {(() => {
            const hasRequired = cfg.smtpHost?.trim() && cfg.smtpUser?.trim() && cfg.smtpPass?.trim();
            const disabled = !hasRequired || testing || saving;
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleTest}
                  disabled={disabled}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 10, border: '1px solid #444',
                    background: '#1e1e1e', color: disabled ? '#555' : '#ccc',
                    fontSize: 13, fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {testing ? '...' : t('email_test_btn')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={disabled}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 10, border: 'none',
                    background: disabled ? '#2d2d30' : '#007ACC',
                    color: disabled ? '#555' : '#fff',
                    fontSize: 13, fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
