import { useState, useEffect } from 'react';
import api from '../api/client.js';

async function browseDir(path) {
  const params = path ? { path } : {};
  const r = await api.get('/browse', { params });
  return r.data;
}

export default function FolderBrowser({ initialPath, onSelect, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function navigate(path) {
    setLoading(true);
    setError('');
    try {
      const d = await browseDir(path);
      setData(d);
    } catch (e) {
      setError(e.response?.data?.error || 'שגיאה בטעינת תיקיות');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { navigate(initialPath || ''); }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60 }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
        background: '#2d2d30', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        display: 'flex', flexDirection: 'column',
        maxHeight: '75vh', direction: 'rtl',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '12px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 8px', flexShrink: 0 }}>
          <button
            onClick={() => data?.parent != null ? navigate(data.parent) : navigate('')}
            disabled={!data || (data.parent == null && data.path === '')}
            style={{
              background: 'none', border: 'none', color: '#888', fontSize: 22,
              cursor: 'pointer', padding: 0, lineHeight: 1,
              opacity: (!data || (data.parent == null && data.path === '')) ? 0.3 : 1,
            }}
          >
            ‹
          </button>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ color: '#aaa', fontSize: 11, marginBottom: 1 }}>בחר תיקייה</div>
            <div style={{
              color: '#fff', fontSize: 13, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              direction: 'ltr', textAlign: 'left',
            }}>
              {data?.path || '/'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#444', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, lineHeight: '28px', textAlign: 'center', padding: 0 }}>×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 8px' }}>
          {loading && (
            <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>טוען...</div>
          )}
          {error && (
            <div style={{ color: '#ff6b6b', textAlign: 'center', padding: 16 }}>{error}</div>
          )}
          {!loading && !error && data?.entries?.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', padding: 24 }}>אין תיקיות פנימיות</div>
          )}
          {!loading && !error && data?.entries?.map(entry => (
            <button
              key={entry.path}
              onClick={() => navigate(entry.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid #3a3a3a22', textAlign: 'right',
              }}
            >
              <span style={{ fontSize: 20 }}>📁</span>
              <span style={{ flex: 1, color: '#fff', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.name}
              </span>
              <span style={{ color: '#555', fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>

        {/* Footer — select current folder */}
        <div style={{ padding: '12px 16px 32px', flexShrink: 0, borderTop: '1px solid #3a3a3a' }}>
          <button
            onClick={() => { if (data?.path) onSelect(data.path); }}
            disabled={!data?.path}
            style={{
              width: '100%', padding: '13px', borderRadius: 14,
              background: data?.path ? '#007ACC' : '#333',
              color: data?.path ? '#fff' : '#555',
              border: 'none', fontSize: 15, fontWeight: 800,
              cursor: data?.path ? 'pointer' : 'not-allowed',
            }}
          >
            ✓ בחר תיקייה זו
          </button>
        </div>
      </div>
    </>
  );
}
