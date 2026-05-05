import { useState, useEffect } from 'react';
import { getAdminStatsApi, getActivityLog } from '../../api/client.js';
import {
  SectionHeader, Card, btnLink, ActivityRow, AvatarCircle,
} from './shared.jsx';

/**
 * Top-level dashboard overview — KPI grid, daily-logins chart, system-health
 * card and a "recent activity" feed. Fully self-contained: pulls stats from
 * /api/admin/stats and the most recent rows from /api/activity.
 */
export default function OverviewSection({ onNav }) {
  const [stats, setStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [refreshAt, setRefreshAt] = useState(Date.now());

  function reload() {
    Promise.all([getAdminStatsApi(), getActivityLog()])
      .then(([s, log]) => {
        setStats(s);
        setRecentActivity(log.slice(0, 6));
        setRefreshAt(Date.now());
      })
      .catch(() => {});
  }
  useEffect(() => { reload(); }, []);

  return (
    <>
      <SectionHeader
        title="📊 סקירה כללית"
        subtitle={`עודכן ${new Date(refreshAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        actions={<button onClick={reload} style={btnLink}>↻ רענן</button>}
      />

      {!stats ? (
        <div style={{ color: '#888' }}>טוען...</div>
      ) : (
        <>
          {/* ── Row 1: User counts ── */}
          <div style={{ marginBottom: 14, color: '#888', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>👥 משתמשים</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard icon="👥" label="סה״כ משתמשים"  value={stats.totals.users}     color="#007ACC" onClick={() => onNav('users')} />
            <StatCard icon="🟢" label="פעילים (7 ימים)" value={stats.activity.active7d}  color="#1db954" sub={pct(stats.activity.active7d, stats.totals.users)} />
            <StatCard icon="🌙" label="פעילים (30 ימים)" value={stats.activity.active30d} color="#5bb8ff" sub={pct(stats.activity.active30d, stats.totals.users)} />
            <StatCard icon="✨" label="חדשים השבוע"    value={stats.activity.newThisWeek}  color="#9b59b6" />
            <StatCard icon="📅" label="חדשים החודש"    value={stats.activity.newThisMonth} color="#9b59b6" />
            <StatCard icon="⏳" label="ממתינים לאישור" value={stats.totals.pending}   color="#e67e22" alert={stats.totals.pending > 0} onClick={() => onNav('messages')} />
            <StatCard icon="🚫" label="חסומים"         value={stats.totals.blocked}   color="#dc3545" onClick={() => onNav('users')} />
            <StatCard icon="🕐" label="עם הגבלת זמן"   value={stats.totals.timeLimited} color="#9b59b6" />
          </div>

          {/* ── Row 2: Engagement ── */}
          <div style={{ marginBottom: 14, color: '#888', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>📈 שימוש ומעורבות</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard icon="🔑" label="כניסות היום"   value={stats.activity.loginsToday}    color="#1db954" />
            <StatCard icon="📋" label="סה״כ כניסות"   value={stats.activity.loginsTotal}    color="#aaa" onClick={() => onNav('activity')} />
            <StatCard icon="⏱" label="מש׳ ממוצע (דק׳)"  value={stats.activity.avgSessionMin} color="#5bb8ff" />
            <StatCard icon="🕒" label="זמן שימוש כולל" value={`${stats.activity.totalSessionHours}ש׳`} color="#5bb8ff" />
            <StatCard icon="❤️" label="סה״כ מועדפים"   value={stats.favorites.total}          color="#dc3545" />
            <StatCard icon="📊" label="ממוצע למשתמש"   value={stats.favorites.avg}            color="#dc3545" />
            <StatCard icon="🎵" label="פלייליסטים"     value={stats.system.playlistsCount}    color="#9b59b6" onClick={() => onNav('playlists')} />
            <StatCard icon="⚙️" label="פעולות אדמין (24ש׳)" value={stats.activity.adminActions24h} color="#888" onClick={() => onNav('activity')} />
          </div>

          {/* ── Charts row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18, marginBottom: 18 }}>
            <Card title={`📈 כניסות לפי יום — 14 ימים אחרונים`}>
              <DailyLoginsChart data={stats.dailyLogins} />
            </Card>

            <Card title="🟢 בריאות המערכת">
              <SystemHealth system={stats.system} />
            </Card>
          </div>

          {/* ── Lists row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <Card title="🏆 משתמשים פעילים ביותר">
              {stats.topUsers.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>אין נתונים עדיין</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.topUsers.map((u, i) => <TopUserRow key={u.id} user={u} rank={i + 1} max={stats.topUsers[0].loginCount} />)}
                </div>
              )}
            </Card>

            <Card title="❤️ שירים מועדפים בולטים">
              {stats.topSongs.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>טרם סומנו מועדפים</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stats.topSongs.map((s, i) => <TopSongRow key={s.id} song={s} rank={i + 1} max={stats.topSongs[0].count} />)}
                </div>
              )}
            </Card>
          </div>

          {/* ── Recent activity ── */}
          <Card title="📋 פעילות אחרונה" actions={<button onClick={() => onNav('activity')} style={btnLink}>הצג הכל ←</button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentActivity.length === 0 && <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>אין פעילות עדיין</div>}
              {recentActivity.map((e, i) => <ActivityRow key={i} entry={e} compact />)}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function pct(part, whole) {
  if (!whole) return null;
  return `${Math.round((part / whole) * 100)}%`;
}

function DailyLoginsChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, padding: '8px 0' }}>
      {data.map((d, i) => {
        const h = (d.count / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }} title={`${d.label}: ${d.count} כניסות`}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <div style={{
                width: '100%',
                height: `${h}%`,
                minHeight: d.count > 0 ? 2 : 0,
                background: `linear-gradient(180deg, #5bb8ff, #007ACC)`,
                borderRadius: '4px 4px 0 0',
                position: 'relative',
                transition: 'height 0.3s',
              }}>
                {d.count > 0 && (
                  <span style={{
                    position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 10, color: '#5bb8ff', fontWeight: 700,
                  }}>{d.count}</span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 9, color: '#666', whiteSpace: 'nowrap' }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TopUserRow({ user, rank, max }) {
  const pctWidth = (user.loginCount / max) * 100;
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px auto 1fr auto', gap: 10, alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontSize: 16, textAlign: 'center' }}>{medal}</span>
      <AvatarCircle userId={user.id} hasAvatar={user.hasAvatar} name={user.username} size={26} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</div>
        <div style={{ height: 4, background: '#0f0f12', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pctWidth}%`, height: '100%', background: '#007ACC' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#5bb8ff', minWidth: 30, textAlign: 'left' }}>{user.loginCount}</span>
    </div>
  );
}

function TopSongRow({ song, rank, max }) {
  const pctWidth = (song.count / max) * 100;
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 10, alignItems: 'center', padding: '6px 0' }}>
      <span style={{ fontSize: 16, textAlign: 'center' }}>{medal}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
        <div style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {song.artist}{song.year ? ` · ${song.year}` : ''}
        </div>
        <div style={{ height: 4, background: '#0f0f12', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pctWidth}%`, height: '100%', background: '#dc3545' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#dc3545', minWidth: 30, textAlign: 'left' }}>❤ {song.count}</span>
    </div>
  );
}

function SystemHealth({ system }) {
  const days = Math.floor(system.uptimeMs / 86400000);
  const hr   = Math.floor((system.uptimeMs % 86400000) / 3600000);
  const min  = Math.floor((system.uptimeMs % 3600000) / 60000);
  const uptime = days > 0 ? `${days}י ${hr}ש` : (hr > 0 ? `${hr}ש ${min}ד` : `${min}ד`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <HealthRow icon="📧" label="שירות מייל (SMTP)"  status={system.emailConfigured ? 'ok' : 'off'} text={system.emailConfigured ? 'מוגדר' : 'לא מוגדר'} />
      <HealthRow icon="🎧" label="חיבור Spotify"      status={system.spotifyConnected ? 'ok' : 'off'} text={system.spotifyConnected ? 'מחובר' : 'לא מחובר'} />
      <HealthRow icon="🎵" label="פלייליסטים"          status="info" text={String(system.playlistsCount)} />
      <HealthRow icon="🚫" label="שירים חסומים"        status="info" text={String(system.blacklistCount)} />
      <HealthRow icon="📝" label="תבניות הזמנה"        status="info" text={String(system.inviteTemplates)} />
      <HealthRow icon="⏱" label="זמן פעילות שרת"      status="info" text={uptime} />
      <HealthRow icon="📦" label="גרסת Node"           status="info" text={system.nodeVersion} />
    </div>
  );
}

function HealthRow({ icon, label, status, text }) {
  const color = status === 'ok' ? '#1db954' : status === 'off' ? '#dc3545' : '#5bb8ff';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ fontSize: 14, textAlign: 'center' }}>{icon}</span>
      <span style={{ color: '#aaa' }}>{label}</span>
      <span style={{ color, fontWeight: 700, padding: '2px 8px', background: `${color}22`, borderRadius: 6, fontSize: 11 }}>
        {status === 'ok' && '✓ '}{status === 'off' && '✕ '}{text}
      </span>
    </div>
  );
}

function StatCard({ icon, label, value, color, alert, onClick, sub }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{
      background: '#1a1a1f', border: `1px solid ${alert ? color : '#2d2d33'}`,
      borderRadius: 12, padding: '14px 16px',
      textAlign: 'right', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s',
      borderRight: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 16 }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{sub}</span>}
      </div>
    </button>
  );
}
