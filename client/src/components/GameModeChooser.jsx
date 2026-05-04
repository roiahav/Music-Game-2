import { useLang } from '../i18n/useLang.js';

export default function GameModeChooser({ title, icon, accent, subColor, onSolo, onMulti, onBack }) {
  const { t, dir } = useLang();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 10 }}>
        <button
          onClick={onBack}
          style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            color: 'var(--fg)', borderRadius: 10, padding: '6px 14px',
            cursor: 'pointer', fontSize: 16,
          }}
        >
          {dir === 'rtl' ? '→' : '←'}
        </button>
        <div style={{ flex: 1, textAlign: 'center', color: 'var(--fg)', fontSize: 22, fontWeight: 800 }}>
          {icon} {title}
        </div>
        <div style={{ width: 48 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '24px 24px 28px' }}>
        <button onClick={onSolo} style={cardStyle(accent, dir)}>
          <span style={{ fontSize: 38 }}>🎧</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('solo_game')}</div>
            <div style={{ color: subColor || '#fff', fontSize: 12, marginTop: 3 }}>{t('chooser_solo_desc')}</div>
          </div>
        </button>

        <button onClick={onMulti} style={cardStyle(accent, dir)}>
          <span style={{ fontSize: 38 }}>👥</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('group_game')}</div>
            <div style={{ color: subColor || '#fff', fontSize: 12, marginTop: 3 }}>{t('chooser_multi_desc')}</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function cardStyle(accent, dir) {
  return {
    display: 'flex', alignItems: 'center', gap: 16,
    flexDirection: dir === 'rtl' ? 'row' : 'row-reverse',
    padding: '20px 22px', borderRadius: 16,
    background: `linear-gradient(135deg, ${accent}33 0%, ${accent}14 100%)`,
    border: `1.5px solid ${accent}66`, cursor: 'pointer', width: '100%',
    transition: 'transform 0.12s, box-shadow 0.12s',
    boxShadow: `0 4px 20px ${accent}1a`,
    direction: dir,
  };
}
