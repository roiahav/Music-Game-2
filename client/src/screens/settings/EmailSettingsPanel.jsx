import { useState } from 'react';
import { useLang } from '../../i18n/useLang.js';
import EmailSettingsForm from './EmailSettingsForm.jsx';

/**
 * Mobile-Settings collapsible card for SMTP. Just wraps the shared
 * EmailSettingsForm with an open/close header so it doesn't take screen
 * space until the admin needs it. The form is also rendered (always-open)
 * in the desktop AdminDashboardScreen.
 */
export default function EmailSettingsPanel() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
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
        <div style={{ padding: '0 16px 16px' }}>
          <EmailSettingsForm autoload={open} />
        </div>
      )}
    </div>
  );
}
