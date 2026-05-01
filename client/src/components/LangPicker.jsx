import { LANGS } from '../i18n/translations.js';
import { useLangStore } from '../store/langStore.js';

export default function LangPicker({ style = {} }) {
  const { lang, setLang } = useLangStore();

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', direction: 'ltr', ...style }}>
      {LANGS.map(l => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          style={{
            padding: '4px 10px',
            borderRadius: 20,
            border: `1.5px solid ${lang === l.code ? '#007ACC' : '#3a3a3a'}`,
            background: lang === l.code ? '#007ACC' : '#1e1e1e',
            color: lang === l.code ? '#fff' : '#888',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: 64,
            justifyContent: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {l.flag && <span>{l.flag}</span>}
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
}
