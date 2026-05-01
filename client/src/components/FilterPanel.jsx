import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLang } from '../i18n/useLang.js';

function getDecadeLabel(decade, lang) {
  const d = Number(decade);
  const short = d < 2000 ? String(d).slice(2) : String(d);
  if (lang === 'he') return d < 2000 ? `שנות ה-${short}` : `שנות ה-${d}`;
  if (lang === 'ar') return `${short}s`;
  if (lang === 'ru') return `${short}-е`;
  return `${short}s`; // en, es
}

function getDecade(year) {
  if (!year) return null;
  const y = Number(year);
  if (!y) return null;
  return String(Math.floor(y / 10) * 10);
}

export default function FilterPanel({ songs, excludedGenres, excludedDecades, onToggleGenre, onToggleDecade, onClear, onClose }) {
  const [view, setView] = useState('main'); // main | genre | decade
  const { t, lang } = useLang();

  const genres = useMemo(() => {
    const s = new Set();
    songs.forEach(song => { if (song.genre) s.add(song.genre); });
    return [...s].sort();
  }, [songs]);

  const decades = useMemo(() => {
    const s = new Set();
    songs.forEach(song => { const d = getDecade(song.year); if (d) s.add(d); });
    return [...s].sort();
  }, [songs]);

  const activeFilters = excludedGenres.size + excludedDecades.size;

  const chip = (label, isActive, onClick) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 20,
        border: `1.5px solid ${isActive ? '#007ACC' : '#3a3a3a'}`,
        background: isActive ? '#007ACC' : '#1e1e1e',
        color: isActive ? '#fff' : '#555',
        fontSize: 14,
        fontWeight: isActive ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      {isActive ? '✓ ' : ''}{label}
    </button>
  );

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 40 }}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 41,
          background: '#2d2d30', borderRadius: '20px 20px 0 0',
          maxWidth: 480, margin: '0 auto',
          direction: 'rtl',
        }}
      >
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '12px auto 0' }} />

        {view === 'main' && (
          <div style={{ padding: '16px 20px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>
                {t('filter_title')} {activeFilters > 0 && <span style={{ color: '#007ACC' }}>({activeFilters} {t('active_lbl')})</span>}
              </span>
              <button onClick={onClose} style={{ background: '#444', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => setView('genre')}
                style={mainBtn}
              >
                <span style={{ fontSize: 20 }}>🎸</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t('genre_lbl')}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {excludedGenres.size > 0 ? `${excludedGenres.size} ${t('hidden_lbl')}` : t('all_shown')}
                  </div>
                </div>
                <span style={{ marginRight: 'auto', color: '#555', fontSize: 18 }}>›</span>
              </button>

              <button
                onClick={() => setView('decade')}
                style={mainBtn}
              >
                <span style={{ fontSize: 20 }}>📅</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t('decade_lbl')}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {excludedDecades.size > 0 ? `${excludedDecades.size} ${t('hidden_lbl')}` : t('all_shown')}
                  </div>
                </div>
                <span style={{ marginRight: 'auto', color: '#555', fontSize: 18 }}>›</span>
              </button>
            </div>

            {activeFilters > 0 && (
              <button
                onClick={onClear}
                style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, background: '#3a1a1a', border: '1px solid #dc3545', color: '#ff6b6b', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {t('clear_filter')}
              </button>
            )}
          </div>
        )}

        {view === 'genre' && (
          <div style={{ padding: '16px 20px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0 }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{t('filter_genre')}</span>
            </div>
            {genres.length === 0 ? (
              <p style={{ color: '#555', textAlign: 'center' }}>{t('no_genre_info')}</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {genres.map(g => chip(g, !excludedGenres.has(g), () => onToggleGenre(g)))}
              </div>
            )}
            <button onClick={() => setView('main')} style={{ width: '100%', marginTop: 20, padding: '10px', borderRadius: 12, background: '#007ACC', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
              {t('ok_btn')}
            </button>
          </div>
        )}

        {view === 'decade' && (
          <div style={{ padding: '16px 20px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button onClick={() => setView('main')} style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0 }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>{t('decade_filter')}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {decades.map(d => chip(getDecadeLabel(d, lang), !excludedDecades.has(d), () => onToggleDecade(d)))}
            </div>
            <button onClick={() => setView('main')} style={{ width: '100%', marginTop: 20, padding: '10px', borderRadius: 12, background: '#007ACC', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
              {t('ok_btn')}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

const mainBtn = {
  display: 'flex', alignItems: 'center', gap: 14,
  width: '100%', padding: '14px 16px', borderRadius: 14,
  background: '#1e1e1e', border: '1px solid #3a3a3a',
  color: '#fff', cursor: 'pointer', textAlign: 'right',
};
