import { useState, useEffect } from 'react';
import { getPlaylists } from '../../api/client.js';
import { SectionHeader, Card, Tag, tableStyle, thStyle, tdStyle } from './shared.jsx';

/**
 * Read-only playlist overview for the dashboard. Editing happens inside the
 * mobile Settings screen (the link in the footer text below).
 */
export default function PlaylistsSection() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getPlaylists().then(setPlaylists).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <SectionHeader title="🎵 פלייליסטים" subtitle={`${playlists.length} פלייליסטים`} />
      <Card>
        {loading ? <div style={{ color: '#888', padding: 20 }}>טוען...</div> : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>שם</th>
                <th style={thStyle}>סוג</th>
                <th style={thStyle}>מקור</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #2d2d33' }}>
                  <td style={tdStyle}><strong>{p.name}</strong></td>
                  <td style={tdStyle}>
                    {p.type === 'local' ? <Tag color="#1db954">📁 מקומי</Tag> : <Tag color="#1ed760">🎧 Spotify</Tag>}
                  </td>
                  <td style={{ ...tdStyle, direction: 'ltr', fontSize: 12, color: '#aaa' }}>
                    {p.path || p.spotifyUri || '—'}
                  </td>
                </tr>
              ))}
              {playlists.length === 0 && (
                <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#666' }}>אין פלייליסטים</td></tr>
              )}
            </tbody>
          </table>
        )}
        <p style={{ color: '#666', fontSize: 12, margin: '14px 0 0' }}>
          לעריכה — חזור לאפליקציה והיכנס להגדרות.
        </p>
      </Card>
    </>
  );
}
