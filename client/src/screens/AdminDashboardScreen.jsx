import { useState, useEffect, useMemo } from 'react';
import {
  getUsers, updateUserApi, resetPasswordApi, deleteUserApi, approveUserApi,
  getActivityLog, listInvitesApi, deleteInviteApi, getPlaylists,
  previewBackupApi, importBackupApi, createInviteApi, getSettings as getSettingsApi,
  getAdminStatsApi, createUserApi,
} from '../api/client.js';
import { useAuthStore } from '../store/authStore.js';
import { logoutApi } from '../api/client.js';
import { downloadCSV, csvDate } from '../utils/csv.js';
import { AvatarCircle } from '../App.jsx';

// ─── Public component ─────────────────────────────────────────────────────────
export default function AdminDashboardScreen({ onExit }) {
  const [section, setSection] = useState('overview');
  const [pendingCount, setPendingCount] = useState(0);
  const { user, logout } = useAuthStore();

  // Refresh pending count when navigating between sections, so the sidebar badge stays current
  function refreshPending() {
    getUsers()
      .then(list => setPendingCount(list.filter(u => u.approved === false).length))
      .catch(() => {});
  }
  useEffect(() => { refreshPending(); }, [section]);

  async function handleLogout() {
    try { await logoutApi(); } catch {}
    logout();
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '240px 1fr',
      height: '100dvh', background: '#0f0f12',
      color: '#fff', fontFamily: 'system-ui, sans-serif',
      direction: 'rtl',
    }}>
      {/* Sidebar */}
      <aside style={{
        background: '#1a1a1f', borderLeft: '1px solid #2d2d33',
        display: 'flex', flexDirection: 'column',
        padding: '20px 0',
      }}>
        <div style={{ padding: '0 22px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>🎵</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Music Game</div>
            <div style={{ fontSize: 11, color: '#888' }}>ממשק ניהול</div>
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 12px', gap: 2 }}>
          <NavItem icon="📊" label="סקירה כללית"   active={section === 'overview'} onClick={() => setSection('overview')} />
          <NavItem icon="📬" label="בקשות הצטרפות" active={section === 'messages'} onClick={() => setSection('messages')} badge={pendingCount} />
          <NavItem icon="👥" label="משתמשים"      active={section === 'users'}    onClick={() => setSection('users')} />
          <NavItem icon="📋" label="לוג פעילות"   active={section === 'activity'} onClick={() => setSection('activity')} />
          <NavItem icon="📨" label="הזמנות"       active={section === 'invites'}  onClick={() => setSection('invites')} />
          <NavItem icon="🎵" label="פלייליסטים"   active={section === 'playlists'} onClick={() => setSection('playlists')} />
          <NavItem icon="💾" label="גיבוי / שחזור" active={section === 'backup'}    onClick={() => setSection('backup')} />
        </nav>

        {/* User box at bottom */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #2d2d33', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AvatarCircle userId={user?.id} hasAvatar={user?.hasAvatar} name={user?.username} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.username}
            </div>
            <div style={{ fontSize: 10, color: '#888' }}>👑 מנהל</div>
          </div>
          <button onClick={handleLogout} title="יציאה" style={iconButton}>↩</button>
        </div>

        <button
          onClick={onExit}
          style={{
            margin: '0 12px 8px', padding: '8px',
            background: '#2d2d33', border: 'none', color: '#aaa',
            borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ← חזרה לאפליקציה
        </button>
      </aside>

      {/* Main content */}
      <main style={{ overflow: 'auto', padding: 28 }}>
        {section === 'overview'  && <OverviewSection onNav={setSection} />}
        {section === 'users'     && <UsersSection />}
        {section === 'activity'  && <ActivitySection />}
        {section === 'invites'   && <InvitesSection />}
        {section === 'playlists' && <PlaylistsSection />}
        {section === 'backup'    && <BackupSection />}
        {section === 'messages'  && <MessagesSection onChange={refreshPending} />}
      </main>
    </div>
  );
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick, badge = 0 }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', border: 'none', borderRadius: 8,
      background: active ? '#007ACC22' : 'transparent',
      color: active ? '#5bb8ff' : '#bbb',
      fontSize: 14, fontWeight: active ? 700 : 500,
      cursor: 'pointer', textAlign: 'right',
      transition: 'all 0.12s',
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1, textAlign: 'right' }}>{label}</span>
      {badge > 0 && (
        <span style={{
          background: '#dc3545', color: '#fff',
          fontSize: 11, fontWeight: 800,
          borderRadius: 10, padding: '1px 7px', minWidth: 18, textAlign: 'center',
          lineHeight: 1.4,
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

const iconButton = {
  background: 'transparent', border: '1px solid #444',
  color: '#888', borderRadius: 8, padding: '4px 10px',
  fontSize: 14, cursor: 'pointer',
};

// ─── Section: Overview ────────────────────────────────────────────────────────
function OverviewSection({ onNav }) {
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

// ─── Daily logins bar chart ──
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

// ─── Top user row ──
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

// ─── Top song row ──
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

// ─── System health ──
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

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// ─── Section: Users ───────────────────────────────────────────────────────────
function UsersSection() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'username', dir: 'asc' });
  const [showAdd, setShowAdd] = useState(false);

  async function load() {
    setLoading(true);
    try { setUsers(await getUsers()); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = users.filter(u => {
      if (filter === 'admin'   && u.role !== 'admin') return false;
      if (filter === 'host'    && !u.canHostRoom)     return false;
      if (filter === 'pending' && u.approved !== false) return false;
      if (filter === 'blocked' && !u.blocked)         return false;
      return true;
    });
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = a[sort.key] ?? ''; const bv = b[sort.key] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'he');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [users, search, filter, sort]);

  function setSortKey(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function exportCSV() {
    const rows = [
      ['שם משתמש','שם פרטי','שם משפחה','מייל','תפקיד','מנהל חדר','סטטוס','תאריך תפוגה'],
      ...filtered.map(u => [
        u.username, u.firstName, u.lastName, u.email,
        u.role === 'admin' ? 'מנהל' : 'משתמש',
        u.canHostRoom ? 'כן' : 'לא',
        u.blocked ? 'חסום' : (u.approved === false ? 'ממתין' : 'פעיל'),
        u.expiresAt ? csvDate(new Date(u.expiresAt).toISOString()) : '',
      ]),
    ];
    downloadCSV(`users-${todayStr()}.csv`, rows);
  }

  async function handleApprove(u) {
    if (!confirm(`לאשר את "${u.username}"?`)) return;
    try { await approveUserApi(u.id); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }
  async function handleBlock(u) {
    const verb = u.blocked ? 'לבטל חסימה של' : 'לחסום את';
    if (!confirm(`${verb} "${u.username}"?`)) return;
    try { await updateUserApi(u.id, { blocked: !u.blocked }); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }
  async function handleDelete(u) {
    if (u.protected) return alert('משתמש מערכת מוגן');
    if (!confirm(`למחוק את "${u.username}"?`)) return;
    try { await deleteUserApi(u.id); load(); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }
  async function handleResetPassword(u) {
    const newPass = prompt(`סיסמה חדשה עבור "${u.username}":`);
    if (!newPass || newPass.length < 4) return;
    try { await resetPasswordApi(u.id, newPass); alert('הסיסמה אופסה'); } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
  }

  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    host: users.filter(u => u.canHostRoom && u.role !== 'admin').length,
    pending: users.filter(u => u.approved === false).length,
    blocked: users.filter(u => u.blocked).length,
  };

  return (
    <>
      <SectionHeader
        title="👥 ניהול משתמשים"
        subtitle={`${filtered.length} מתוך ${users.length} משתמשים`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAdd(true)} style={{ ...btnPrimary, background: '#1db954' }}>
              + משתמש חדש
            </button>
            <button onClick={exportCSV} style={btnPrimary}>📥 ייצוא ל-CSV</button>
          </div>
        }
      />

      <Card>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 חיפוש לפי שם / מייל..."
            style={{ ...inputStyle, flex: '0 0 280px' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill label={`הכל ${counts.all}`}        active={filter === 'all'}     onClick={() => setFilter('all')} />
            <Pill label={`👑 ${counts.admin}`}        active={filter === 'admin'}   onClick={() => setFilter('admin')} />
            <Pill label={`🎮 ${counts.host}`}         active={filter === 'host'}    onClick={() => setFilter('host')} />
            <Pill label={`⏳ ${counts.pending}`}      active={filter === 'pending'} onClick={() => setFilter('pending')} disabled={!counts.pending} color="#e67e22" />
            <Pill label={`🚫 ${counts.blocked}`}      active={filter === 'blocked'} onClick={() => setFilter('blocked')} disabled={!counts.blocked} color="#dc3545" />
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>טוען...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th onClick={() => setSortKey('username')}  label="שם משתמש"  sortKey="username"  current={sort} />
                  <Th onClick={() => setSortKey('firstName')} label="שם מלא"     sortKey="firstName" current={sort} />
                  <Th onClick={() => setSortKey('email')}     label="מייל"        sortKey="email"     current={sort} />
                  <Th onClick={() => setSortKey('role')}      label="תפקיד"       sortKey="role"      current={sort} />
                  <th style={thStyle}>סטטוס</th>
                  <th style={thStyle}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} style={{ background: u.blocked ? '#2a1010' : 'transparent', borderBottom: '1px solid #2d2d33' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AvatarCircle userId={u.id} hasAvatar={u.hasAvatar} name={u.username} size={28} />
                        <span style={{ fontWeight: 600 }}>{u.username}</span>
                        {u.protected && <span title="מערכת מוגן" style={{ fontSize: 11 }}>🛡️</span>}
                      </div>
                    </td>
                    <td style={tdStyle}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ ...tdStyle, direction: 'ltr', fontSize: 12, color: '#aaa' }}>{u.email || '—'}</td>
                    <td style={tdStyle}>
                      {u.role === 'admin' ? <span style={{ color: '#5bb8ff' }}>👑 מנהל</span> : <span style={{ color: '#888' }}>👤 משתמש</span>}
                    </td>
                    <td style={tdStyle}>
                      {u.blocked      && <Tag color="#dc3545">🚫 חסום</Tag>}
                      {u.approved === false && <Tag color="#e67e22">⏳ ממתין</Tag>}
                      {!u.blocked && u.approved !== false && <Tag color="#1db954">✓ פעיל</Tag>}
                      {u.canHostRoom && !u.blocked && <Tag color="#1db954">🎮</Tag>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {u.approved === false && <ActionBtn onClick={() => handleApprove(u)} color="#1db954" title="אשר">✅</ActionBtn>}
                        <ActionBtn onClick={() => handleResetPassword(u)} title="איפוס סיסמה">🔑</ActionBtn>
                        <ActionBtn onClick={() => handleBlock(u)} color={u.blocked ? '#1db954' : '#dc3545'} title={u.blocked ? 'בטל חסימה' : 'חסום'}>
                          {u.blocked ? '✓' : '🚫'}
                        </ActionBtn>
                        {!u.protected && <ActionBtn onClick={() => handleDelete(u)} color="#dc3545" title="מחיקה">×</ActionBtn>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#666', padding: 30 }}>לא נמצאו משתמשים</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}
    </>
  );
}

// ─── Add user modal ──
function AddUserModal({ onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [role, setRole] = useState('user');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return setError('שם משתמש נדרש');
    if (password.length < 4) return setError('סיסמה חייבת להיות לפחות 4 תווים');
    if (password !== confirmPass) return setError('הסיסמאות אינן תואמות');

    setSubmitting(true);
    setError('');
    try {
      await createUserApi(username.trim(), password, role);
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה ביצירת המשתמש');
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 101,
        background: '#1a1a1f', border: '1px solid #2d2d33',
        borderRadius: 14, padding: 26,
        width: 'min(440px, 90vw)', direction: 'rtl',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>+ הוספת משתמש חדש</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#888', fontSize: 22,
            cursor: 'pointer', padding: 0, lineHeight: 1,
          }}>✕</button>
        </div>
        <p style={{ margin: '0 0 18px', color: '#888', fontSize: 12 }}>
          המשתמש יוכל להיכנס מיד עם פרטי הכניסה. בכניסה הראשונה הוא יתבקש להשלים פרופיל.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="שם משתמש *" value={username} onChange={setUsername} placeholder="לדוג׳ דני כהן" />
          <FormField label="סיסמה *" value={password} onChange={setPassword} type="password" placeholder="לפחות 4 תווים" />
          <FormField label="אימות סיסמה *" value={confirmPass} onChange={setConfirmPass} type="password" placeholder="הקלד שוב" />

          <div>
            <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
              תפקיד
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="user">👤 משתמש רגיל</option>
              <option value="admin">👑 מנהל</option>
            </select>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: '#3a1010', color: '#ff6b6b', borderRadius: 8, fontSize: 13 }}>
              ❌ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '12px', borderRadius: 10, background: 'transparent',
              border: '1px solid #444', color: '#aaa', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              ביטול
            </button>
            <button type="submit" disabled={submitting} style={{
              flex: 2, padding: '12px', borderRadius: 10, background: '#1db954',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}>
              {submitting ? 'יוצר...' : '✅ צור משתמש'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Section: Activity ────────────────────────────────────────────────────────
function ActivitySection() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');     // all | login | logout | admin
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    getActivityLog().then(setLog).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return log.filter(e => {
      if (type !== 'all') {
        if (type === 'admin' && e.type !== 'admin_action') return false;
        if (type === 'login'  && e.type !== 'login')  return false;
        if (type === 'logout' && e.type !== 'logout') return false;
      }
      if (fromDate && new Date(e.timestamp) < new Date(fromDate)) return false;
      if (toDate) {
        const end = new Date(toDate); end.setHours(23, 59, 59, 999);
        if (new Date(e.timestamp) > end) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [e.username, e.adminName, e.targetUsername, e.ip].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [log, search, type, fromDate, toDate]);

  function exportCSV() {
    const rows = [
      ['תאריך','סוג','משתמש','מבצע (למפעולות אדמין)','פעולה','IP','משך (יציאה)'],
      ...filtered.map(e => [
        csvDate(e.timestamp),
        e.type === 'admin_action' ? 'פעולת אדמין' : (e.type === 'login' ? 'כניסה' : 'יציאה'),
        e.username || e.targetUsername || '',
        e.adminName || '',
        e.action || '',
        e.ip || '',
        e.durationMs ? Math.round(e.durationMs / 1000) + ' שנ׳' : '',
      ]),
    ];
    downloadCSV(`activity-${todayStr()}.csv`, rows);
  }

  return (
    <>
      <SectionHeader
        title="📋 לוג פעילות"
        subtitle={`${filtered.length} רשומות`}
        actions={<button onClick={exportCSV} style={btnPrimary}>📥 ייצוא ל-CSV</button>}
      />

      <Card>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 חיפוש..." style={{ ...inputStyle, flex: '0 0 220px' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill label="הכל"     active={type === 'all'}    onClick={() => setType('all')} />
            <Pill label="🔑 כניסה" active={type === 'login'}  onClick={() => setType('login')} />
            <Pill label="🚪 יציאה" active={type === 'logout'} onClick={() => setType('logout')} />
            <Pill label="⚙️ אדמין" active={type === 'admin'}  onClick={() => setType('admin')} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#888', fontSize: 12 }}>
            <span>טווח:</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={dateStyle} />
            <span>—</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={dateStyle} />
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate(''); }} style={{ ...iconButton, fontSize: 11 }}>✕ נקה</button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>טוען...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '60dvh', overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>אין רשומות</div>}
            {filtered.map((e, i) => <ActivityRow key={i} entry={e} />)}
          </div>
        )}
      </Card>
    </>
  );
}

function ActivityRow({ entry, compact = false }) {
  const isAdmin = entry.type === 'admin_action';
  const color   = isAdmin ? '#9b59b6' : (entry.type === 'login' ? '#5bb8ff' : '#aaa');
  const icon    = isAdmin ? '⚙️' : (entry.type === 'login' ? '🔑' : '🚪');
  const label   = isAdmin ? entry.action : (entry.type === 'login' ? 'כניסה' : 'יציאה');

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: 12,
      padding: compact ? '8px 12px' : '10px 14px',
      background: '#161618', borderRadius: 8,
      border: `1px solid ${color}22`,
    }}>
      <span style={{ fontSize: compact ? 16 : 18 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {entry.username || entry.targetUsername || '—'}
          {isAdmin && entry.adminName && (
            <span style={{ color: '#888', fontWeight: 400, fontSize: 11 }}>
              {' '}· בידי {entry.adminName}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#888' }}>{csvDate(entry.timestamp)}{entry.ip && ` · ${entry.ip}`}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, padding: '3px 10px', background: `${color}22`, borderRadius: 6 }}>
        {label}
      </span>
      {entry.durationMs && (
        <span style={{ fontSize: 10, color: '#666' }}>⏱ {Math.round(entry.durationMs / 1000)}s</span>
      )}
    </div>
  );
}

// ─── Section: Invites ─────────────────────────────────────────────────────────
function InvitesSection() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try { setInvites(await listInvitesApi()); } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleRevoke(token) {
    if (!confirm('לבטל את ההזמנה?')) return;
    try { await deleteInviteApi(token); load(); } catch {}
  }

  function copyLink(token) {
    const url = `${window.location.origin}/i/${token}`;
    navigator.clipboard?.writeText(url);
    alert('הקישור הועתק:\n' + url);
  }

  return (
    <>
      <SectionHeader
        title="📨 הזמנות"
        subtitle={`${invites.length} הזמנות`}
        actions={
          <button onClick={() => setShowCreate(s => !s)} style={btnPrimary}>
            {showCreate ? '✕ סגור' : '+ הזמנה חדשה'}
          </button>
        }
      />

      {showCreate && (
        <CreateInviteCard onCreated={() => { setShowCreate(false); load(); }} />
      )}

      <Card>
        {loading ? (
          <div style={{ color: '#888', padding: 20 }}>טוען...</div>
        ) : invites.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 30 }}>אין הזמנות פעילות</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>נמען</th>
                <th style={thStyle}>נוצר ע״י</th>
                <th style={thStyle}>נוצר ב</th>
                <th style={thStyle}>פג תוקף</th>
                <th style={thStyle}>סטטוס</th>
                <th style={thStyle}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => {
                const expired = inv.expiresAt < Date.now();
                return (
                  <tr key={inv.token} style={{ borderBottom: '1px solid #2d2d33' }}>
                    <td style={tdStyle}>
                      {[inv.prefilledFirstName, inv.prefilledLastName].filter(Boolean).join(' ') || '—'}
                      {inv.prefilledEmail && (
                        <div style={{ fontSize: 11, color: '#888', direction: 'ltr' }}>{inv.prefilledEmail}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{inv.createdByName || '—'}</td>
                    <td style={tdStyle}>{csvDate(new Date(inv.createdAt).toISOString())}</td>
                    <td style={tdStyle}>{csvDate(new Date(inv.expiresAt).toISOString())}</td>
                    <td style={tdStyle}>
                      {inv.used ? <Tag color="#1db954">✓ נוצל</Tag>
                        : expired ? <Tag color="#dc3545">פג תוקף</Tag>
                        : <Tag color="#5bb8ff">🟢 פעיל</Tag>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!inv.used && !expired && (
                          <>
                            <ActionBtn onClick={() => copyLink(inv.token)} title="העתק קישור">📋</ActionBtn>
                            <ActionBtn onClick={() => handleRevoke(inv.token)} color="#dc3545" title="בטל">×</ActionBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ─── Section: Playlists ───────────────────────────────────────────────────────
function PlaylistsSection() {
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

// ─── Create-invite inline card (used inside InvitesSection) ──────────────────
function CreateInviteCard({ onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [phone, setPhone]         = useState('');

  const [templates, setTemplates]               = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  useEffect(() => {
    getSettingsApi().then(s => {
      const tpls = Array.isArray(s.inviteTemplates) ? s.inviteTemplates : [];
      setTemplates(tpls);
      if (tpls.length) setSelectedTemplateId(tpls[0].id);
    }).catch(() => {});
  }, []);

  const [creating, setCreating] = useState(false);
  const [result, setResult]     = useState(null); // { url, emailSent, emailError }
  const [copied, setCopied]     = useState(false);

  function reset() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setResult(null); setCopied(false);
  }

  async function handleCreate(sendEmail = false) {
    if (sendEmail && (!email.trim() || !email.includes('@'))) {
      return alert('כדי לשלוח במייל — הזן כתובת מייל תקינה');
    }
    setCreating(true);
    try {
      const res = await createInviteApi({
        firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim(), sendEmail,
      });
      setResult(res);
      if (sendEmail && !res.emailSent && res.emailError) {
        alert(`המייל לא נשלח:\n${res.emailError}\n\nאך הקישור נוצר — אפשר להעתיק או לשלוח בוואטסאפ.`);
      }
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    setCreating(false);
  }

  function buildMsg() {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    const body = tpl?.body || `שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם: {url}`;
    return body
      .replace(/\{firstName\}/g, firstName || '')
      .replace(/\{lastName\}/g, lastName || '')
      .replace(/\{url\}/g, result?.url || '');
  }

  function handleCopy() {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => alert('לא ניתן להעתיק — בחר ידנית')
    );
  }

  function handleWhatsApp() {
    if (!result?.url) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;
    const msg = buildMsg();
    const url = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  return (
    <Card title="✨ יצירת הזמנה חדשה">
      {!result ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <FormField label="שם פרטי"   value={firstName} onChange={setFirstName} placeholder="לא חובה" />
            <FormField label="שם משפחה"  value={lastName}  onChange={setLastName}  placeholder="לא חובה" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <FormField label="כתובת מייל" value={email}    onChange={setEmail} type="email" placeholder="לשליחה במייל" ltr />
            <FormField label="טלפון"      value={phone}    onChange={setPhone} type="tel"  placeholder="לוואטסאפ — 0501234567" ltr />
          </div>

          {templates.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                תבנית הודעה (לוואטסאפ)
              </label>
              <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleCreate(true)} disabled={creating || !email.trim()}
              style={{ ...btnPrimary, flex: 1, opacity: creating || !email.trim() ? 0.5 : 1 }}>
              {creating ? '...' : '📧 שלח במייל'}
            </button>
            <button onClick={() => handleCreate(false)} disabled={creating}
              style={{ ...btnPrimary, background: '#1db954', flex: 1 }}>
              {creating ? '...' : '🔗 צור קישור'}
            </button>
          </div>
        </>
      ) : (
        // Result panel
        <>
          <div style={{
            background: result.emailSent ? '#1db95422' : '#007ACC22',
            border: `1px solid ${result.emailSent ? '#1db954' : '#007ACC'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 14,
          }}>
            <div style={{ color: result.emailSent ? '#1db954' : '#5bb8ff', fontWeight: 700 }}>
              {result.emailSent ? '✅ ההזמנה נשלחה במייל!' : '🔗 הקישור מוכן'}
            </div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              {result.emailSent
                ? `נשלח אל ${email}. אפשר גם להעתיק או לשלוח בוואטסאפ.`
                : 'שתף את הקישור עם המשתמש בכל דרך.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={handleWhatsApp} style={{
              flex: 1, padding: '12px', borderRadius: 10, background: '#25D366',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              💬 שלח בוואטסאפ
            </button>
            <button onClick={handleCopy} style={{
              flex: 1, padding: '12px', borderRadius: 10,
              background: copied ? '#1db95433' : '#2d2d33',
              border: `1px solid ${copied ? '#1db954' : '#444'}`,
              color: copied ? '#1db954' : '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              {copied ? '✓ הועתק!' : '📋 העתק'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={reset} style={{
              flex: 1, padding: '10px', borderRadius: 10, background: 'transparent',
              border: '1px solid #444', color: '#aaa', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              🆕 הזמנה נוספת
            </button>
            <button onClick={() => onCreated?.()} style={{ ...btnPrimary, flex: 1 }}>
              סיום
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function FormField({ label, value, onChange, type = 'text', placeholder, ltr }) {
  return (
    <div>
      <label style={{ color: '#888', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%', direction: ltr ? 'ltr' : 'rtl' }}
      />
    </div>
  );
}

// ─── Section: Messages (pending join requests) ────────────────────────────────
function MessagesSection({ onChange }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const list = await getUsers();
      setPending(list.filter(u => u.approved === false));
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleApprove(u) {
    setBusyId(u.id);
    try {
      await approveUserApi(u.id);
      await load();
      onChange?.();
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    setBusyId(null);
  }

  async function handleReject(u) {
    if (!confirm(`לדחות ולמחוק את הבקשה של "${u.username}"?`)) return;
    setBusyId(u.id);
    try {
      await deleteUserApi(u.id);
      await load();
      onChange?.();
    } catch (e) { alert(e.response?.data?.error || 'שגיאה'); }
    setBusyId(null);
  }

  function timeAgo(idStr) {
    const ts = Number(idStr);
    if (isNaN(ts)) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    const hr  = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (day > 0) return `לפני ${day} ימים`;
    if (hr > 0)  return `לפני ${hr} שעות`;
    if (min > 0) return `לפני ${min} דק׳`;
    return 'זה עתה';
  }

  return (
    <>
      <SectionHeader
        title="📬 בקשות הצטרפות"
        subtitle={pending.length === 0
          ? 'אין בקשות פתוחות'
          : `${pending.length} משתמשים ממתינים לאישור שלך`}
      />

      {loading ? (
        <div style={{ color: '#888' }}>טוען...</div>
      ) : pending.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#aaa', marginBottom: 6 }}>תיבת הדואר ריקה</div>
            <div style={{ fontSize: 12 }}>כשמשתמש חדש ירשום עצמו דרך קישור הזמנה, הבקשה תופיע כאן.</div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map(u => (
            <div key={u.id} style={{
              background: '#1a1a1f', border: '1px solid #e67e2244',
              borderRadius: 12, padding: 18,
              borderRight: '4px solid #e67e22',
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
            }}>
              <AvatarCircle userId={u.id} hasAvatar={u.hasAvatar} name={u.username} size={48} />

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{u.username}</span>
                  <Tag color="#e67e22">⏳ ממתין</Tag>
                  <span style={{ fontSize: 11, color: '#888' }}>{timeAgo(u.id)}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontSize: 13 }}>
                  {(u.firstName || u.lastName) && (
                    <InfoLine label="שם מלא" value={[u.firstName, u.lastName].filter(Boolean).join(' ')} />
                  )}
                  {u.email && <InfoLine label="מייל" value={u.email} ltr />}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={() => handleApprove(u)} disabled={busyId === u.id}
                  style={{
                    background: '#1db954', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700,
                    cursor: busyId === u.id ? 'wait' : 'pointer', opacity: busyId === u.id ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}>
                  ✅ אשר
                </button>
                <button onClick={() => handleReject(u)} disabled={busyId === u.id}
                  style={{
                    background: 'transparent', border: '1px solid #dc354555', color: '#dc3545',
                    borderRadius: 8, padding: '8px 18px', fontSize: 12, fontWeight: 700,
                    cursor: busyId === u.id ? 'wait' : 'pointer', opacity: busyId === u.id ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}>
                  🗑️ דחה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function InfoLine({ label, value, ltr }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#ddd', fontSize: 13, direction: ltr ? 'ltr' : 'rtl', textAlign: 'right' }}>{value}</div>
    </div>
  );
}

// ─── Section: Backup / Restore ────────────────────────────────────────────────
function BackupSection() {
  const [importPreview, setImportPreview] = useState(null);  // { summary, payload }
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [exportedAt, setExportedAt] = useState(null);

  function handleExport() {
    // Trigger a download via a hidden anchor that hits the API.
    // Authenticate by using fetch + blob (since /export needs Bearer token).
    const token = localStorage.getItem('mg_token');
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

// ─── Shared sub-components ────────────────────────────────────────────────────
function SectionHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}

function Card({ title, actions, children }) {
  return (
    <div style={{
      background: '#1a1a1f', border: '1px solid #2d2d33', borderRadius: 12,
      padding: 18, marginBottom: 20,
    }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {title && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

function Pill({ label, active, onClick, disabled, color = '#5bb8ff' }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      padding: '5px 12px', borderRadius: 16,
      background: active ? `${color}22` : '#1e1e22',
      border: `1px solid ${active ? color : '#2d2d33'}`,
      color: active ? color : (disabled ? '#444' : '#aaa'),
      fontSize: 12, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      whiteSpace: 'nowrap',
    }}>{label}</button>
  );
}

function Th({ label, sortKey, onClick, current }) {
  const active = current.key === sortKey;
  return (
    <th onClick={onClick} style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}>
      {label} {active && (current.dir === 'asc' ? '▲' : '▼')}
    </th>
  );
}

function Tag({ color, children }) {
  return (
    <span style={{
      display: 'inline-block', marginInlineEnd: 4,
      padding: '2px 8px', borderRadius: 6,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function ActionBtn({ children, onClick, color = '#888', title }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: `${color}22`, border: `1px solid ${color}55`, color,
      borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer',
      lineHeight: 1, minWidth: 28,
    }}>{children}</button>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle    = { textAlign: 'right', padding: '10px 12px', color: '#888', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #2d2d33' };
const tdStyle    = { padding: '10px 12px', verticalAlign: 'middle' };
const inputStyle = { background: '#0f0f12', border: '1px solid #2d2d33', borderRadius: 8, color: '#fff', padding: '8px 12px', fontSize: 13, outline: 'none' };
const dateStyle  = { ...inputStyle, padding: '6px 8px', fontSize: 12, colorScheme: 'dark' };
const btnPrimary = { background: '#007ACC', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnLink    = { background: 'none', border: 'none', color: '#5bb8ff', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
