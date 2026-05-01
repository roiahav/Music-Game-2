import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { addPlaylist, getPlaylists, getSettings as getSettingsApi, saveSettings, testEmailSettings } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';
import SpotifyConnectPanel from '../components/SpotifyConnectPanel.jsx';
import SettingsPlaylistRow from '../components/SettingsPlaylistRow.jsx';
import GameOptionsBar from '../components/GameOptionsBar.jsx';
import FolderBrowser from '../components/FolderBrowser.jsx';
import AdminBlacklistSection from '../components/AdminBlacklistSection.jsx';

export default function SettingsScreen({ isAdmin = false }) {
  const { playlists, setPlaylists, game, saveGame } = useSettingsStore();
  const { t } = useLang();
  const [adding, setAdding] = useState(false);
  const [showVictoryBrowser, setShowVictoryBrowser] = useState(false);
  const [showVictoryFolderBrowser, setShowVictoryFolderBrowser] = useState(false);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);

  async function handleAddPlaylist() {
    setAdding(true);
    try {
      await addPlaylist({ name: 'פלייליסט חדש', type: 'local', path: '' });
      const updated = await getPlaylists();
      setPlaylists(updated);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h2 className="text-lg font-bold">{t('settings')}</h2>

      <GameOptionsBar />

      {isAdmin && (
        <>
          {/* Victory song */}
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: '#2d2d30', border: '1px solid #3a3a3a' }}>
            <h3 className="font-bold text-sm">{t('victory_song')}</h3>
            <p style={{ color: '#888', fontSize: 12, margin: 0 }}>{t('victory_song_desc')}</p>

            {/* ── Folder (random) ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ color: '#aaa', fontSize: 12 }}>{t('folder_random')}</label>
                {/* Toggle enable/disable folder */}
                <button
                  onClick={() => saveGame({ victoryFolderEnabled: !game.victoryFolderEnabled })}
                  style={{
                    background: game.victoryFolderEnabled !== false ? '#1db95433' : 'transparent',
                    border: `1px solid ${game.victoryFolderEnabled !== false ? '#1db954' : '#3a3a3a'}`,
                    color: game.victoryFolderEnabled !== false ? '#1db954' : '#555',
                    borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {game.victoryFolderEnabled !== false ? '✓ פעיל' : '✗ כבוי'}
                </button>
              </div>
              {game.victoryFolderEnabled !== false && (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={game.victoryAudioFolder || ''}
                      onChange={e => saveGame({ victoryAudioFolder: e.target.value })}
                      placeholder="נתיב לתיקייה עם שירי ניצחון..."
                      style={{
                        flex: 1, background: '#1e1e1e', border: '1px solid #444',
                        color: '#ccc', borderRadius: 8, padding: '8px 10px',
                        fontSize: 13, direction: 'ltr',
                      }}
                    />
                    <button
                      onClick={() => setShowVictoryFolderBrowser(true)}
                      style={{
                        background: '#1db954', border: 'none', color: '#fff',
                        borderRadius: 8, padding: '8px 12px', fontSize: 13,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      📁
                    </button>
                  </div>
                  {game.victoryAudioFolder && (
                    <p style={{ color: '#1db954', fontSize: 11, margin: '4px 0 0', direction: 'ltr' }}>
                      ✓ {game.victoryAudioFolder}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Single file (fallback) ── */}
            <div>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>{t('single_file')}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={game.victoryAudioPath || ''}
                  onChange={e => saveGame({ victoryAudioPath: e.target.value })}
                  placeholder="נתיב לקובץ MP3..."
                  style={{
                    flex: 1, background: '#1e1e1e', border: '1px solid #444',
                    color: '#ccc', borderRadius: 8, padding: '8px 10px',
                    fontSize: 13, direction: 'ltr',
                  }}
                />
                <button
                  onClick={() => setShowVictoryBrowser(true)}
                  style={{
                    background: '#007ACC', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13,
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  📁
                </button>
              </div>
              {game.victoryAudioPath && (
                <audio
                  controls
                  src={`/api/audio/${encodeURIComponent(game.victoryAudioPath)}`}
                  style={{ width: '100%', marginTop: 6 }}
                />
              )}
            </div>
          </div>

          {/* Playlists (collapsible — contains Spotify connection too) */}
          <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setPlaylistsOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                color: '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>🎵 {t('playlists_title')}</span>
                {playlists.length > 0 && (
                  <span style={{ fontSize: 11, color: '#5bb8ff', background: '#007ACC22', padding: '2px 8px', borderRadius: 10, border: '1px solid #007ACC55', fontWeight: 700 }}>
                    {playlists.length}
                  </span>
                )}
              </div>
              <span style={{ color: '#888', fontSize: 18 }}>{playlistsOpen ? '▲' : '▼'}</span>
            </button>

            {playlistsOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Spotify connection — at the top, since it powers Spotify-type playlists */}
                <SpotifyConnectPanel />

                {/* Add playlist button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleAddPlaylist}
                    disabled={adding}
                    style={{
                      background: '#007ACC', color: '#fff', border: 'none',
                      padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1,
                    }}
                  >
                    {adding ? '...' : '+ ' + t('add_playlist')}
                  </button>
                </div>

                {!playlists.length && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: '#666', background: '#1e1e1e', borderRadius: 10 }}>
                    {t('no_playlists')}
                  </div>
                )}
                {playlists.map(p => <SettingsPlaylistRow key={p.id} playlist={p} />)}
              </div>
            )}
          </div>

          {/* Blacklist */}
          {playlists.some(p => p.type === 'local') && (
            <AdminBlacklistSection playlists={playlists} />
          )}

          {/* Email / SMTP */}
          <EmailSettingsPanel />

          <div className="text-center text-xs mt-4" style={{ color: '#555' }}>
            {t('wifi_hint')}
          </div>
        </>
      )}

      {showVictoryBrowser && (
        <VictoryFilePicker
          initialPath={game.victoryAudioPath ? game.victoryAudioPath.replace(/[^/\\]*$/, '') : ''}
          onSelect={path => { saveGame({ victoryAudioPath: path }); setShowVictoryBrowser(false); }}
          onClose={() => setShowVictoryBrowser(false)}
        />
      )}

      {showVictoryFolderBrowser && (
        <FolderBrowser
          initialPath={game.victoryAudioFolder || ''}
          onSelect={path => { saveGame({ victoryAudioFolder: path }); setShowVictoryFolderBrowser(false); }}
          onClose={() => setShowVictoryFolderBrowser(false)}
        />
      )}
    </div>
  );
}

// ─── Email SMTP Panel ─────────────────────────────────────────────────────────
function EmailSettingsPanel() {
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

// File picker — extends FolderBrowser with MP3 file listing
import api from '../api/client.js';

function VictoryFilePicker({ initialPath, onSelect, onClose }) {
  const [dir, setDir] = useState(initialPath || '');
  const [entries, setEntries] = useState(null);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function navigate(path) {
    setLoading(true); setError('');
    try {
      const r = await api.get('/browse', { params: { path: path || '', files: 'true' } });
      setDir(r.data.path || '');
      setParent(r.data.parent);
      setEntries(r.data.entries || []);
    } catch (e) { setError(e.response?.data?.error || 'שגיאה'); }
    finally { setLoading(false); }
  }

  useState(() => { navigate(initialPath || ''); });

  const folders = (entries || []).filter(e => e.type === 'dir');
  const files = (entries || []).filter(e => e.type === 'file');

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
        background: '#2d2d30', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh', direction: 'rtl',
      }}>
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '12px auto 0', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 8px', flexShrink: 0 }}>
          <button onClick={() => parent != null ? navigate(parent) : navigate('')}
            disabled={parent == null && dir === ''}
            style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', opacity: (parent == null && dir === '') ? 0.3 : 1 }}>‹</button>
          <div style={{ flex: 1, color: '#ccc', fontSize: 12, direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir || '/'}</div>
          <button onClick={onClose} style={{ background: '#444', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>טוען...</div>}
          {error && <div style={{ color: '#ff6b6b', textAlign: 'center', padding: 16 }}>{error}</div>}
          {folders.map(e => (
            <button key={e.path} onClick={() => navigate(e.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid #3a3a3a22', cursor: 'pointer' }}>
              <span>📁</span>
              <span style={{ flex: 1, color: '#fff', fontSize: 14, textAlign: 'right' }}>{e.name}</span>
              <span style={{ color: '#555' }}>›</span>
            </button>
          ))}
          {files.map(e => (
            <button key={e.path} onClick={() => onSelect(e.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid #3a3a3a22', cursor: 'pointer' }}>
              <span>🎵</span>
              <span style={{ flex: 1, color: '#5bb8ff', fontSize: 14, textAlign: 'right' }}>{e.name}</span>
            </button>
          ))}
          {!loading && !error && folders.length === 0 && files.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', padding: 24 }}>אין קבצים</div>
          )}
        </div>
      </div>
    </>
  );
}
