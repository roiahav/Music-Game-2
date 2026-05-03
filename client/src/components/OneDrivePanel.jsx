/**
 * OneDrivePanel — collapsible settings card for syncing music from a OneDrive
 * folder down to the server's local music directory. Admin-only.
 *
 * Three-state UI:
 *   1. rclone NOT installed on server → setup instructions
 *   2. rclone installed but remote not configured → setup instructions
 *   3. Fully configured → status + sync controls
 */
import { useState, useEffect, useRef } from 'react';
import {
  getOneDriveStatus, syncOneDrive, updateOneDriveSettings, probeOneDrive,
} from '../api/client.js';

const SYNC_INTERVAL_OPTIONS = [
  { value: 0,   label: 'ידני בלבד' },
  { value: 5,   label: 'כל 5 דקות' },
  { value: 15,  label: 'כל 15 דקות' },
  { value: 30,  label: 'כל 30 דקות' },
  { value: 60,  label: 'כל שעה' },
  { value: 360, label: 'כל 6 שעות' },
];

export default function OneDrivePanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);     // server status snapshot
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState(null);       // local edits to settings
  const [savedFlash, setSavedFlash] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const refreshRef = useRef(null);

  async function refresh() {
    try {
      const s = await getOneDriveStatus();
      setStatus(s);
      setDraft(prev => prev ?? { ...s.config });
    } catch (e) {
      setStatus({ error: e.message });
    }
  }

  useEffect(() => {
    if (!open) return;
    refresh();
    // Auto-refresh every 5s while panel is open + sync isn't actively running
    refreshRef.current = setInterval(refresh, 5000);
    return () => clearInterval(refreshRef.current);
  }, [open]);

  async function save() {
    if (!draft) return;
    setLoading(true);
    try {
      const r = await updateOneDriveSettings(draft);
      setDraft({ ...r.onedrive });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      await refresh();
    } catch (e) {
      alert('שמירה נכשלה: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function doSync(deleteMissing = false) {
    if (deleteMissing && !confirm('סנכרון מלא ימחק קבצים שלא קיימים ב-OneDrive. להמשיך?')) return;
    setSyncing(true);
    try {
      await syncOneDrive(deleteMissing);
      await refresh();
    } catch (e) {
      alert('סנכרון נכשל: ' + e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function doProbe() {
    setProbeResult({ loading: true });
    try {
      const r = await probeOneDrive();
      setProbeResult(r);
    } catch (e) {
      setProbeResult({ ok: false, error: e.message });
    }
  }

  // ── Header ──
  const od = status?.config || {};
  const headerBadge = !status ? '...' :
    !status.rclone?.installed ? '⚠ rclone לא מותקן' :
    !status.remoteConfigured ? '⚠ לא מחובר' :
    !od.enabled ? 'כבוי' :
    od.lastSyncOk === false ? '✕ שגיאה' :
    od.lastSyncOk === true ? '✓ פעיל' : 'מוכן';

  const badgeColor = !status ? '#888' :
    !status.rclone?.installed || !status.remoteConfigured ? '#ff9f1c' :
    !od.enabled ? '#888' :
    od.lastSyncOk === false ? '#dc3545' :
    od.lastSyncOk === true ? '#1db954' : '#5bb8ff';

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>☁️ ספריית מוזיקה ב-OneDrive</span>
          <span style={{
            fontSize: 11, color: badgeColor, background: `${badgeColor}22`,
            padding: '2px 10px', borderRadius: 10, border: `1px solid ${badgeColor}55`, fontWeight: 700,
          }}>
            {headerBadge}
          </span>
        </div>
        <span style={{ color: 'var(--text2)', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!status && <div style={{ color: 'var(--text2)', fontSize: 13, padding: 12 }}>טוען מצב…</div>}

          {status && !status.rclone?.installed && <SetupRcloneInstructions />}

          {status?.rclone?.installed && !status.remoteConfigured && (
            <SetupRemoteInstructions remoteName={od.remoteName} />
          )}

          {status?.rclone?.installed && status.remoteConfigured && (
            <>
              {/* Connection summary */}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.7 }}>
                <Row k="rclone" v={`v${status.rclone.version}`} />
                <Row k="remote ב-rclone" v={od.remoteName} />
                <Row k="קבצים מקומיים" v={`${status.local.totalFiles} קבצים · ${fmtBytes(status.local.sizeBytes)}`} />
                {od.lastSyncAt > 0 && (
                  <Row
                    k="סנכרון אחרון"
                    v={`${fmtAgo(od.lastSyncAt)} · ${od.lastSyncMessage}`}
                    color={od.lastSyncOk === false ? '#ff6b6b' : od.lastSyncOk ? '#1db954' : 'var(--text2)'}
                  />
                )}
                {od.lastSyncStats && (od.lastSyncStats.added || od.lastSyncStats.removed || od.lastSyncStats.changed) ? (
                  <Row k="שינויים אחרונים" v={`+${od.lastSyncStats.added} ✎${od.lastSyncStats.changed} −${od.lastSyncStats.removed}`} />
                ) : null}
              </div>

              {/* Settings — editable */}
              {draft && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="שם ה-remote ב-rclone (כפי שהוגדר ב-`rclone config`)">
                    <input
                      value={draft.remoteName}
                      onChange={e => setDraft({ ...draft, remoteName: e.target.value })}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="תיקייה ב-OneDrive (יחסי לשורש)">
                    <input
                      value={draft.remoteFolder}
                      onChange={e => setDraft({ ...draft, remoteFolder: e.target.value })}
                      placeholder="Music Game/Songs"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="תיקייה מקומית בשרת (יעד הסנכרון)">
                    <input
                      value={draft.localFolder}
                      onChange={e => setDraft({ ...draft, localFolder: e.target.value })}
                      placeholder="/home/oren/music"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="תדירות סנכרון אוטומטי">
                    <select
                      value={draft.syncIntervalMinutes}
                      onChange={e => setDraft({ ...draft, syncIntervalMinutes: Number(e.target.value) })}
                      style={inputStyle}
                    >
                      {SYNC_INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!draft.enabled}
                      onChange={e => setDraft({ ...draft, enabled: e.target.checked })}
                    />
                    סנכרון פעיל (אם כבוי, הכפתורים הידניים עדיין עובדים)
                  </label>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={save} disabled={loading} style={btnPrimary}>
                      {loading ? 'שומר…' : savedFlash ? '✓ נשמר' : '💾 שמור הגדרות'}
                    </button>
                    <button onClick={doProbe} style={btnSecondary}>🔎 בדוק חיבור</button>
                  </div>

                  {probeResult && !probeResult.loading && (
                    <div style={{
                      fontSize: 12, padding: '8px 12px', borderRadius: 8,
                      background: probeResult.ok ? '#0d2e0d' : '#3a1010',
                      color: probeResult.ok ? '#1db954' : '#ff6b6b',
                      border: `1px solid ${probeResult.ok ? '#1db954' : '#dc3545'}`,
                    }}>
                      {probeResult.ok ? '✓ התיקייה ב-OneDrive נגישה' : `✕ ${probeResult.error}`}
                    </div>
                  )}
                </div>
              )}

              {/* Sync controls */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => doSync(false)} disabled={syncing || status.syncInProgress} style={btnPrimary}>
                  {syncing || status.syncInProgress ? '⏳ מסנכרן…' : '🔄 סנכרן עכשיו (הוסף/עדכן)'}
                </button>
                <button onClick={() => doSync(true)} disabled={syncing || status.syncInProgress} style={btnDanger}>
                  ⚠️ סנכרון מלא (כולל מחיקה)
                </button>
              </div>

              <div style={{ color: 'var(--text2)', fontSize: 11, lineHeight: 1.6 }}>
                💡 <strong style={{ color: 'var(--text)' }}>איך משתמשים?</strong> העלה קבצי MP3 לתיקייה <code style={codeStyle}>{od.remoteFolder}/</code> ב-OneDrive שלך — מהדפדפן, מהאפליקציה במחשב, מהמובייל. הסנכרון יוריד אותם לשרת באופן אוטומטי. מומלץ לארגן בתת-תיקיות לפי פלייליסט (למשל <code style={codeStyle}>{od.remoteFolder}/עברי/</code>) ולכוון את הפלייליסטים לאותן תיקיות בהגדרות הפלייליסטים.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Setup wizards ─────────────────────────────────────────────────────────
function SetupRcloneInstructions() {
  return (
    <div style={{ background: '#3a2a10', border: '1px solid #ff9f1c', borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.7, color: '#ffcd75' }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠ rclone לא מותקן בשרת</div>
      <div style={{ color: '#ffe9b8' }}>
        כדי להתקין: התחבר לשרת דרך SSH והרץ:
      </div>
      <pre style={preStyle}>{`sudo apt install -y rclone`}</pre>
    </div>
  );
}

function SetupRemoteInstructions({ remoteName }) {
  return (
    <div style={{ background: '#3a2a10', border: '1px solid #ff9f1c', borderRadius: 10, padding: 14, fontSize: 12, lineHeight: 1.7, color: '#ffcd75' }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠ remote של OneDrive לא הוגדר</div>
      <div style={{ color: '#ffe9b8', marginBottom: 8 }}>
        נדרשת הגדרה חד-פעמית של OAuth. התחבר לשרת ב-SSH והרץ:
      </div>
      <pre style={preStyle}>{`rclone config

# בתפריט בחר:
#   n) New remote
#   name>  ${remoteName || 'onedrive'}
#   Storage>  onedrive
#   client_id>  (ENTER ריק)
#   client_secret>  (ENTER ריק)
#   region>  global (1)
#   Edit advanced config>  n
#   Use auto config>  n   ← אם אין דפדפן בשרת
#   ← תקבל קישור: פתח אותו בדפדפן במחשב,
#       התחבר ל-Microsoft, ותקבל טוקן להדביק חזרה
#   Choose drive type>  onedrive (1)
#   Drive ID>  (אישור על הראשון)
#   y) Yes`}</pre>
      <div style={{ color: '#ffe9b8', marginTop: 8 }}>
        אחרי הסיום — לחץ על &quot;רענן&quot; כאן או חזור לדף.
      </div>
    </div>
  );
}

// ─── Tiny presentational helpers ───────────────────────────────────────────
function Row({ k, v, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '2px 0' }}>
      <span style={{ color: 'var(--text2)' }}>{k}</span>
      <span style={{ color: color || 'var(--text)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 4, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}
function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function fmtAgo(ts) {
  if (!ts) return 'מעולם לא';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)   return 'עכשיו';
  if (sec < 3600) return `לפני ${Math.floor(sec / 60)} דק'`;
  if (sec < 86400) return `לפני ${Math.floor(sec / 3600)} שע'`;
  return `לפני ${Math.floor(sec / 86400)} ימים`;
}

// ─── Styles ────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg)',
  border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 8, padding: '8px 10px', fontSize: 13,
};
const btnPrimary = {
  background: 'var(--accent)', color: '#fff', border: 'none',
  borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary = {
  background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnDanger = {
  background: '#3a1010', color: '#ff6b6b', border: '1px solid #dc3545',
  borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const codeStyle = {
  background: 'var(--bg)', padding: '1px 6px', borderRadius: 4,
  border: '1px solid var(--border)', fontSize: 11,
};
const preStyle = {
  background: '#1a1a1a', color: '#dcdcaa', padding: 10, borderRadius: 6,
  fontSize: 11, overflow: 'auto', margin: '6px 0', lineHeight: 1.4,
};
