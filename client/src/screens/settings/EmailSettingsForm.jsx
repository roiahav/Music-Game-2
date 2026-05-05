import { useState, useEffect, useMemo } from 'react';
import { getSettings as getSettingsApi, saveSettings, testEmailSettings } from '../../api/client.js';
import { useLang } from '../../i18n/useLang.js';

/**
 * Common SMTP presets so an admin only has to pick a provider and fill in
 * username + password instead of memorising host names. The `secure` flag
 * matches what nodemailer expects: true = SMTPS (port 465), false = STARTTLS
 * upgrade on plaintext (typically port 587).
 */
export const SMTP_PROVIDERS = {
  custom:     { label: 'אישית מותאם', host: '',                      port: 587,  secure: false },
  office365:  { label: 'Office 365',  host: 'smtp.office365.com',    port: 587,  secure: false, hint: 'מוגבל ל-25 הודעות לדקה.' },
  gmail:      { label: 'Gmail',       host: 'smtp.gmail.com',        port: 587,  secure: false, hint: 'דורש App Password (לא הסיסמה הרגילה).' },
  outlook:    { label: 'Outlook.com', host: 'smtp-mail.outlook.com', port: 587,  secure: false },
  yahoo:      { label: 'Yahoo',       host: 'smtp.mail.yahoo.com',   port: 587,  secure: false, hint: 'דורש App Password.' },
  proton:     { label: 'ProtonMail',  host: '127.0.0.1',             port: 1025, secure: false, hint: 'דורש Proton Mail Bridge מותקן בשרת.' },
  zoho:       { label: 'Zoho',        host: 'smtp.zoho.com',         port: 465,  secure: true },
  sendgrid:   { label: 'SendGrid',    host: 'smtp.sendgrid.net',     port: 587,  secure: false, hint: 'שם משתמש = "apikey", סיסמה = ה-API key.' },
  mailgun:    { label: 'Mailgun',     host: 'smtp.mailgun.org',      port: 587,  secure: false },
  ses:        { label: 'AWS SES',     host: 'email-smtp.us-east-1.amazonaws.com', port: 587, secure: false, hint: 'החלף את ה-region אם צריך.' },
};

/** Match a saved host back to a provider key so the dropdown shows the right value. */
function detectProvider(host) {
  if (!host) return 'custom';
  const h = host.toLowerCase();
  for (const [key, p] of Object.entries(SMTP_PROVIDERS)) {
    if (p.host && p.host.toLowerCase() === h) return key;
  }
  return 'custom';
}

/**
 * The form body — provider preset dropdown + SMTP fields + save/test buttons.
 * Self-contained: loads `email` from settings on mount and writes back on save.
 *
 * Parent decides where to render this — collapsible card in mobile Settings,
 * or full card inside the desktop Admin Dashboard.
 */
export default function EmailSettingsForm({ autoload = true }) {
  const { t } = useLang();
  const [cfg, setCfg] = useState({
    smtpHost: '', smtpPort: 587, smtpSecure: false,
    smtpUser: '', smtpPass: '', fromName: 'Music Game', fromEmail: '',
  });
  const [provider, setProvider] = useState('custom');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | string(error)

  useEffect(() => {
    if (!autoload) return;
    let cancelled = false;
    getSettingsApi()
      .then(s => {
        if (cancelled || !s.email) return;
        setCfg(prev => ({ ...prev, ...s.email }));
        setProvider(detectProvider(s.email.smtpHost));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [autoload]);

  const providerHint = useMemo(() => SMTP_PROVIDERS[provider]?.hint, [provider]);

  function handleProviderChange(next) {
    setProvider(next);
    const preset = SMTP_PROVIDERS[next];
    if (!preset || next === 'custom') return;
    // Apply the preset to host/port/secure but keep user/pass/from intact.
    setCfg(prev => ({ ...prev, smtpHost: preset.host, smtpPort: preset.port, smtpSecure: preset.secure }));
    setTestResult(null);
  }

  function handleChange(field, value) {
    setCfg(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
    if (field === 'smtpHost') setProvider(detectProvider(value));
  }

  async function handleSave() {
    setSaving(true);
    try { await saveSettings({ email: cfg }); }
    catch {}
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
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
  const labelStyle = { color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Provider preset */}
      <div>
        <label style={labelStyle}>ספק מייל</label>
        <select
          value={provider}
          onChange={e => handleProviderChange(e.target.value)}
          style={{ ...inputStyle, direction: 'rtl' }}
        >
          {Object.entries(SMTP_PROVIDERS).map(([key, p]) => (
            <option key={key} value={key}>{p.label}</option>
          ))}
        </select>
        {providerHint && (
          <p style={{ margin: '6px 2px 0', color: '#ffb347', fontSize: 11, lineHeight: 1.5 }}>
            ⚠️ {providerHint}
          </p>
        )}
      </div>

      {/* Hint */}
      <p style={{ margin: 0, color: '#888', fontSize: 12, background: '#1e1e1e', borderRadius: 8, padding: '8px 10px' }}>
        💡 {t('email_hint')}
      </p>

      {/* Host + Port row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 3 }}>
          <label style={labelStyle}>
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
          <label style={labelStyle}>{t('email_smtp_port')}</label>
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
        <span style={{ color: '#666', fontSize: 11 }}>
          ({cfg.smtpSecure ? 'SSL/TLS — פורט 465' : 'STARTTLS — פורט 587'})
        </span>
      </label>

      {/* User */}
      <div>
        <label style={labelStyle}>
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
        <label style={labelStyle}>
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
          <label style={labelStyle}>{t('email_from_name')}</label>
          <input value={cfg.fromName} onChange={e => handleChange('fromName', e.target.value)} placeholder="Music Game" style={inputStyle} />
        </div>
        <div style={{ flex: 2 }}>
          <label style={labelStyle}>{t('email_from_addr')}</label>
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
  );
}
