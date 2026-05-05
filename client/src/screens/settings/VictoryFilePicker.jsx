import { useState, useEffect } from 'react';
import api from '../../api/client.js';

/**
 * Bottom-sheet file picker for selecting a single audio file (used by the
 * "Victory song" admin setting). Wraps /api/browse with `files=true` so MP3s
 * are returned alongside folders. Selecting a file calls `onSelect(path)`.
 */
export default function VictoryFilePicker({ initialPath, onSelect, onClose }) {
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

  // Load the initial directory once on mount.
  useEffect(() => { navigate(initialPath || ''); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

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
