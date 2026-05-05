import { useState, useEffect } from 'react';
import { getUsers, logoutApi } from '../api/client.js';
import { useAuthStore } from '../store/authStore.js';
import { AvatarCircle } from '../App.jsx';
import MusicLibraryPanel from '../components/MusicLibraryPanel.jsx';
import OverviewSection from './admin/OverviewSection.jsx';
import UsersSection from './admin/UsersSection.jsx';
import ActivitySection from './admin/ActivitySection.jsx';
import InvitesSection from './admin/InvitesSection.jsx';
import PlaylistsSection from './admin/PlaylistsSection.jsx';
import MessagesSection from './admin/MessagesSection.jsx';
import BackupSection from './admin/BackupSection.jsx';

const ZOOM_KEY = 'mg2-dashboard-zoom';
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
function loadZoom() {
  const v = parseFloat(localStorage.getItem(ZOOM_KEY) || '1');
  return Number.isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX ? v : 1;
}

/**
 * Desktop admin dashboard — sidebar nav + a content area that swaps in one
 * of the section components. All actual feature logic lives inside the
 * matching `screens/admin/<Section>Section.jsx` file.
 */
export default function AdminDashboardScreen({ onExit }) {
  const [section, setSection] = useState('overview');
  const [pendingCount, setPendingCount] = useState(0);
  const [zoom, setZoom] = useState(loadZoom);
  const { user, logout } = useAuthStore();

  useEffect(() => { localStorage.setItem(ZOOM_KEY, String(zoom)); }, [zoom]);
  const bumpZoom  = () => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const trimZoom  = () => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const resetZoom = () => setZoom(1);

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
      zoom: zoom,
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
          <NavItem icon="🎶" label="ספריית מוזיקה" active={section === 'music'}    onClick={() => setSection('music')} />
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

        {/* Font-size (zoom) controls — affect the whole dashboard via the
            CSS `zoom` property on the root div. Persisted to localStorage. */}
        <div style={{
          margin: '0 12px 8px', padding: 6,
          background: '#2d2d33', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
        }}>
          <span style={{ fontSize: 11, color: '#888', paddingInlineStart: 4 }}>גודל פונט</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={trimZoom}  disabled={zoom <= ZOOM_MIN} title="הקטן" style={zoomBtn}>−</button>
            <button onClick={resetZoom} title="איפוס" style={{ ...zoomBtn, minWidth: 38, fontSize: 11 }}>{Math.round(zoom * 100)}%</button>
            <button onClick={bumpZoom}  disabled={zoom >= ZOOM_MAX} title="הגדל" style={zoomBtn}>+</button>
          </div>
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
        {section === 'music'     && <MusicLibraryPanel />}
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

const zoomBtn = {
  background: '#1a1a1f', border: '1px solid #444',
  color: '#ddd', borderRadius: 6, padding: '2px 8px',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
  minWidth: 24,
};
