import { useState, useEffect } from 'react';
import api, { getBlacklist, addToBlacklist, removeFromBlacklist } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';

export default function AdminBlacklistSection({ playlists }) {
  const [selectedId, setSelectedId] = useState(playlists[0]?.id || '');
  const [songs, setSongs] = useState([]);
  const [blacklist, setBlacklist] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showOnlyBlocked, setShowOnlyBlocked] = useState(false);
  const [toggling, setToggling] = useState(new Set()); // IDs being toggled
  const { t } = useLang();

  // Load blacklist on mount
  useEffect(() => {
    getBlacklist().then(ids => setBlacklist(new Set(ids))).catch(() => {});
  }, []);

  // Load songs when playlist changes
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setSongs([]);
    setSearch('');
    // includeBlacklisted=1 so admin can see and manage all songs
    api.get(`/playlists/${selectedId}/songs?includeBlacklisted=1`)
      .then(r => setSongs(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  async function toggleBlacklist(song) {
    if (toggling.has(song.id)) return;
    setToggling(prev => new Set([...prev, song.id]));
    try {
      if (blacklist.has(song.id)) {
        await removeFromBlacklist(song.id);
        setBlacklist(prev => { const n = new Set(prev); n.delete(song.id); return n; });
      } else {
        await addToBlacklist(song.id);
        setBlacklist(prev => new Set([...prev, song.id]));
      }
    } catch { /* ignore */ }
    setToggling(prev => { const n = new Set(prev); n.delete(song.id); return n; });
  }

  const filtered = songs.filter(s => {
    if (showOnlyBlocked && !blacklist.has(s.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.title || '').toLowerCase().includes(q)
      || (s.artist || '').toLowerCase().includes(q);
  });

  const blacklistedCount = songs.filter(s => blacklist.has(s.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>{t('blacklist_title')}</h3>
        {blacklistedCount > 0 && (
          <span style={{ fontSize: 12, color: '#ff6b6b', background: '#3a1010', padding: '2px 8px', borderRadius: 10, border: '1px solid #dc3545' }}>
            {blacklistedCount} {t('blocked_label').replace(/[✕×] ?/, '')}
          </span>
        )}
      </div>

      <p style={{ color: '#888', fontSize: 12, margin: 0 }}>
        {t('blacklist_desc')}
      </p>

      {/* Playlist select */}
      <select
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 14, direction: 'rtl' }}
      >
        {playlists.filter(p => p.type === 'local').map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {/* Search */}
      {songs.length > 10 && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search_song')}
          style={{ width: '100%', background: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 14, direction: 'rtl', boxSizing: 'border-box' }}
        />
      )}

      {/* Show-only-blocked toggle */}
      <button
        onClick={() => setShowOnlyBlocked(v => !v)}
        disabled={blacklistedCount === 0}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', borderRadius: 10,
          background: showOnlyBlocked ? '#3a1010' : '#2d2d30',
          border: `1px solid ${showOnlyBlocked ? '#dc3545' : '#3a3a3a'}`,
          color: showOnlyBlocked ? '#ff6b6b' : '#aaa',
          fontSize: 13, fontWeight: 600,
          cursor: blacklistedCount === 0 ? 'not-allowed' : 'pointer',
          opacity: blacklistedCount === 0 ? 0.5 : 1,
          transition: 'all 0.15s',
        }}
      >
        <span style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          border: `2px solid ${showOnlyBlocked ? '#dc3545' : '#555'}`,
          background: showOnlyBlocked ? '#dc3545' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: '#fff', fontWeight: 900, lineHeight: 1,
        }}>
          {showOnlyBlocked && '✓'}
        </span>
        🚫 {t('show_only_blocked')}
        {blacklistedCount > 0 && (
          <span style={{ marginRight: 'auto', fontSize: 12, opacity: 0.8 }}>
            ({blacklistedCount})
          </span>
        )}
      </button>

      {/* Song list */}
      {loading ? (
        <p style={{ color: '#555', textAlign: 'center', fontSize: 13 }}>{t('loading_songs')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 380, overflowY: 'auto', borderRadius: 10, border: '1px solid #3a3a3a' }}>
          {filtered.length === 0 && (
            <p style={{ color: '#555', textAlign: 'center', fontSize: 13, padding: 16 }}>
              {songs.length === 0 ? t('no_songs') : t('no_results')}
            </p>
          )}
          {filtered.map((song, i) => {
            const blocked = blacklist.has(song.id);
            const busy = toggling.has(song.id);
            return (
              <div
                key={song.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < filtered.length - 1 ? '1px solid #2a2a2a' : 'none',
                  background: blocked ? '#2a1010' : 'transparent',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: blocked ? '#ff6b6b' : '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {song.title || song.filename}
                  </div>
                  <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                    {song.artist}{song.year ? ` · ${song.year}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => toggleBlacklist(song)}
                  disabled={busy}
                  title={blocked ? t('unblock_song') : t('block_song')}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    border: 'none',
                    background: blocked ? '#3a1010' : '#2d2d30',
                    color: blocked ? '#ff6b6b' : '#888',
                    opacity: busy ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {busy ? '...' : blocked ? t('blocked_label') : '🚫'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {blacklistedCount > 0 && (
        <button
          onClick={async () => {
            const idsToRemove = songs.filter(s => blacklist.has(s.id)).map(s => s.id);
            await Promise.all(idsToRemove.map(id => removeFromBlacklist(id)));
            setBlacklist(prev => {
              const n = new Set(prev);
              idsToRemove.forEach(id => n.delete(id));
              return n;
            });
          }}
          style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textAlign: 'right' }}
        >
          {t('unblock_all')}
        </button>
      )}
    </div>
  );
}
