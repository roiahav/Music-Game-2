import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { addPlaylist, getPlaylists } from '../api/client.js';
import SpotifyConnectPanel from '../components/SpotifyConnectPanel.jsx';
import SettingsPlaylistRow from '../components/SettingsPlaylistRow.jsx';
import GameOptionsBar from '../components/GameOptionsBar.jsx';
import FolderBrowser from '../components/FolderBrowser.jsx';

export default function SettingsScreen({ isAdmin = false }) {
  const { playlists, setPlaylists, game, saveGame } = useSettingsStore();
  const [adding, setAdding] = useState(false);
  const [showVictoryBrowser, setShowVictoryBrowser] = useState(false);
  const [showVictoryFolderBrowser, setShowVictoryFolderBrowser] = useState(false);

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
      <h2 className="text-lg font-bold">הגדרות</h2>

      <GameOptionsBar />

      {isAdmin && (
        <>
          <SpotifyConnectPanel />

          {/* Victory song */}
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: '#2d2d30', border: '1px solid #3a3a3a' }}>
            <h3 className="font-bold text-sm">🏆 שיר ניצחון</h3>
            <p style={{ color: '#888', fontSize: 12, margin: 0 }}>בסיום משחק קבוצתי — תיקייה (אקראי) תקדים קובץ בודד</p>

            {/* ── Folder (random) ── */}
            <div>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>📂 תיקייה (שיר אקראי)</label>
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
            </div>

            {/* ── Single file (fallback) ── */}
            <div>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>🎵 קובץ קבוע (גיבוי)</label>
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

          {/* Playlists */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">פלייליסטים</h3>
              <button
                onClick={handleAddPlaylist}
                disabled={adding}
                className="px-3 py-1 rounded-lg text-sm font-semibold cursor-pointer active:scale-95 transition-all"
                style={{ background: '#007ACC', color: '#fff', opacity: adding ? 0.6 : 1 }}
              >
                {adding ? '...' : '➕ הוסף'}
              </button>
            </div>
            {!playlists.length && (
              <div className="text-center py-6 text-sm rounded-xl" style={{ background: '#2d2d30', color: '#666' }}>
                אין פלייליסטים עדיין — לחץ "הוסף"
              </div>
            )}
            {playlists.map(p => <SettingsPlaylistRow key={p.id} playlist={p} />)}
          </div>

          <div className="text-center text-xs mt-4" style={{ color: '#555' }}>
            פתח את האפליקציה בטלפון דרך WiFi הביתי
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
