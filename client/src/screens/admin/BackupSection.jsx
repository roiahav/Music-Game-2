import { useState } from 'react';
import { previewBackupApi, importBackupApi } from '../../api/client.js';
import { useAuthStore } from '../../store/authStore.js';
import { SectionHeader, Card, btnPrimary } from './shared.jsx';

/**
 * Full system backup / restore. Export downloads a JSON dump of the
 * entire data directory; restore previews + (after confirmation) imports
 * that dump, replacing every existing record.
 */
export default function BackupSection() {
  const [importPreview, setImportPreview] = useState(null);  // { summary, payload }
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [exportedAt, setExportedAt] = useState(null);

  function handleExport() {
    // Trigger a download via a hidden anchor that hits the API.
    // Authenticate by using fetch + blob (since /export needs Bearer token).
    const token = useAuthStore.getState().token;
    fetch('/api/backup/export', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('שגיאה בייצוא');
        // Pull the suggested filename from the Content-Disposition header
        const cd = r.headers.get('content-disposition') || '';
        const m = cd.match(/filename="?([^"]+)"?/);
        const filename = m ? m[1] : `music-game-backup-${new Date().toISOString().slice(0,10)}.json`;
        return r.blob().then(blob => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportedAt(new Date());
      })
      .catch(e => alert(e.message || 'שגיאה בייצוא'));
  }

  async function handleFilePick(e) {
    setImportError('');
    setImportPreview(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await previewBackupApi(payload);
      setImportPreview({ summary: res.summary, payload });
    } catch (err) {
      setImportError(err.response?.data?.error || err.message || 'קובץ לא תקין');
    }
  }

  async function handleConfirmImport() {
    if (!importPreview) return;
    if (!confirm(
      'אזהרה — שחזור גיבוי יחליף את כל הנתונים הקיימים:\n' +
      `• ${importPreview.summary.userCount} משתמשים\n` +
      `• ${importPreview.summary.activityCount} רשומות לוג\n` +
      `• ${importPreview.summary.avatarCount} תמונות פרופיל\n\n` +
      'הפעולה אינה הפיכה. לבצע שחזור?'
    )) return;

    setImporting(true);
    try {
      await importBackupApi(importPreview.payload);
      alert('✅ השחזור הושלם בהצלחה!\n\nכדי להבטיח טעינה תקינה, האפליקציה תרענן את עצמה.');
      window.location.reload();
    } catch (err) {
      setImportError(err.response?.data?.error || 'שגיאה בשחזור');
      setImporting(false);
    }
  }

  return (
    <>
      <SectionHeader
        title="💾 גיבוי / שחזור"
        subtitle="ייצוא וייבוא של כל המידע — משתמשים, הגדרות, לוג ומועדפים"
      />

      {/* Warning */}
      <div style={{
        background: '#3a2010', border: '1px solid #e67e22', borderRadius: 12,
        padding: '14px 18px', marginBottom: 20,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, color: '#e67e22', marginBottom: 4 }}>קובץ הגיבוי מכיל מידע רגיש</div>
          <div style={{ fontSize: 12, color: '#c0926a', lineHeight: 1.6 }}>
            הקובץ כולל גיבוב סיסמאות, כתובות מייל ופרטי משתמשים. שמור אותו במקום מאובטח, אל תשלח אותו
            במייל לא מוצפן ואל תאחסן אותו בדיסק משותף ציבורי.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Export card */}
        <Card title="📥 ייצוא גיבוי">
          <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.7, margin: '0 0 16px' }}>
            הורדת כל הנתונים כקובץ JSON אחד. מתאים ל-<strong>גיבוי תקופתי</strong>,
            <strong> העברה בין שרתים</strong>, או שחזור אחרי תקלה.
          </p>
          <ul style={{ margin: '0 0 16px', padding: '0 18px 0 0', color: '#888', fontSize: 12, lineHeight: 1.8 }}>
            <li>חשבונות משתמשים (כולל שמות, מיילים, גיבובי סיסמאות)</li>
            <li>הגדרות כלליות, פלייליסטים, חיבור Spotify, SMTP</li>
            <li>תבניות הזמנה ורשימת חסומים</li>
            <li>לוג פעילות מלא</li>
            <li>מועדפים של כל המשתמשים</li>
            <li>תמונות פרופיל (avatars)</li>
          </ul>
          <button onClick={handleExport} style={{ ...btnPrimary, width: '100%' }}>
            💾 הורד קובץ גיבוי
          </button>
          {exportedAt && (
            <div style={{ marginTop: 10, color: '#1db954', fontSize: 11, textAlign: 'center' }}>
              ✓ הגיבוי האחרון בוצע ב-{exportedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </Card>

        {/* Import card */}
        <Card title="⬆️ שחזור מגיבוי">
          <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.7, margin: '0 0 16px' }}>
            טעינת קובץ גיבוי קודם. <strong style={{ color: '#dc3545' }}>פעולה זו תחליף את כל המידע הקיים.</strong>
          </p>

          {!importPreview ? (
            <>
              <label style={{
                display: 'block', padding: '20px', textAlign: 'center',
                background: '#0f0f12', border: '2px dashed #2d2d33', borderRadius: 10,
                cursor: 'pointer', color: '#888', fontSize: 13, fontWeight: 600,
                transition: 'all 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = '#5bb8ff'}
              onMouseOut={e => e.currentTarget.style.borderColor = '#2d2d33'}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                בחר קובץ גיבוי (.json)
                <input type="file" accept=".json,application/json" onChange={handleFilePick}
                  style={{ display: 'none' }} />
              </label>
              {importError && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#3a1010', color: '#ff6b6b', borderRadius: 8, fontSize: 12 }}>
                  ❌ {importError}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ background: '#0f0f12', border: '1px solid #2d2d33', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ color: '#5bb8ff', fontWeight: 700, marginBottom: 8 }}>📋 תקציר הגיבוי</div>
                <PreviewLine label="נוצר בתאריך" value={importPreview.summary.exportedAt ? new Date(importPreview.summary.exportedAt).toLocaleString('he-IL') : '—'} />
                <PreviewLine label="יוצר הגיבוי" value={importPreview.summary.exportedByName || '—'} />
                <PreviewLine label="משתמשים" value={importPreview.summary.userCount} />
                <PreviewLine label="פלייליסטים" value={importPreview.summary.playlistCount} />
                <PreviewLine label="רשומות לוג" value={importPreview.summary.activityCount} />
                <PreviewLine label="תמונות פרופיל" value={importPreview.summary.avatarCount} />
                <PreviewLine label="מועדפים (משתמשים)" value={importPreview.summary.favoritesCount} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setImportPreview(null)} style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #444',
                  background: 'transparent', color: '#aaa', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>
                  ביטול
                </button>
                <button onClick={handleConfirmImport} disabled={importing} style={{
                  flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                  background: '#dc3545', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1,
                }}>
                  {importing ? 'משחזר...' : '⬆️ שחזר ועקוף את הנתונים הקיימים'}
                </button>
              </div>
              {importError && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#3a1010', color: '#ff6b6b', borderRadius: 8, fontSize: 12 }}>
                  ❌ {importError}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function PreviewLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#fff', fontWeight: 700 }}>{value}</span>
    </div>
  );
}
