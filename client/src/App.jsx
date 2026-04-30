import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from './store/settingsStore.js';
import { useAuthStore } from './store/authStore.js';
import GameScreen from './screens/GameScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import MultiplayerScreen from './screens/MultiplayerScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import AdminUsersScreen from './screens/AdminUsersScreen.jsx';
import { logoutApi, uploadAvatar, getAvatarUrl } from './api/client.js';

const shell = {
  display: 'flex', flexDirection: 'column', height: '100dvh',
  background: '#1e1e1e', maxWidth: 480, margin: '0 auto', width: '100%',
};

export default function App() {
  const [screen, setScreen] = useState('home');
  const [tab, setTab] = useState('game');
  const [avatarKey, setAvatarKey] = useState(0); // force re-render after upload
  const load = useSettingsStore(s => s.load);
  const { token, user, login, logout } = useAuthStore();
  const fileInputRef = useRef(null);

  useEffect(() => { if (token) load(); }, [token]);

  if (!token) return <LoginScreen />;

  const isAdmin = user?.role === 'admin';

  async function handleLogout() {
    try { await logoutApi(); } catch {}
    logout();
  }

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await resizeAndEncode(file, 300);
    try {
      await uploadAvatar(base64);
      // Update stored user to reflect hasAvatar
      login(token, { ...user, hasAvatar: true });
      setAvatarKey(k => k + 1);
    } catch {}
    e.target.value = '';
  }

  // ── Home screen ─────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={{ ...shell, direction: 'rtl', alignItems: 'center', justifyContent: 'center' }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px',
      }}>
        {/* Avatar */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="לחץ להחלפת תמונה"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <AvatarCircle userId={user?.id} hasAvatar={user?.hasAvatar} name={user?.username} size={36} avatarKey={avatarKey} />
          <span style={{ color: '#888', fontSize: 13 }}>{user?.username}</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} style={{ display: 'none' }} />
        <button
          onClick={handleLogout}
          style={{ background: 'none', border: '1px solid #3a3a3a', color: '#888', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          יציאה
        </button>
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 60, lineHeight: 1 }}>🎵</div>
        <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 900, margin: '12px 0 4px' }}>חידון מוזיקה</h1>
        <p style={{ color: '#555', fontSize: 14, margin: 0 }}>בחר מצב משחק</p>
      </div>

      {/* Mode cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', padding: '0 28px' }}>
        <button onClick={() => setScreen('solo')} style={modeCard('#007ACC')}>
          <span style={{ fontSize: 40 }}>🎧</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>משחק יחיד</div>
            <div style={{ color: '#a8d4f5', fontSize: 13, marginTop: 4 }}>נגן לבד, גלה שירים</div>
          </div>
        </button>

        <button onClick={() => setScreen('multiplayer')} style={modeCard('#1db954')}>
          <span style={{ fontSize: 40 }}>🎮</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>משחק קבוצתי</div>
            <div style={{ color: '#a8f5c4', fontSize: 13, marginTop: 4 }}>התחרו עם חברים מהטלפון</div>
          </div>
        </button>

        {isAdmin && (
          <button onClick={() => { setScreen('solo'); setTab('settings'); }} style={modeCard('#555')}>
            <span style={{ fontSize: 40 }}>⚙️</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>הגדרות</div>
              <div style={{ color: '#bbb', fontSize: 13, marginTop: 4 }}>פלייליסטים, Spotify, משתמשים</div>
            </div>
          </button>
        )}
      </div>
    </div>
  );

  // ── Multiplayer ──────────────────────────────────────────────────────────────
  if (screen === 'multiplayer') return (
    <div style={{ ...shell, direction: 'rtl' }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <MultiplayerScreen onExit={() => setScreen('home')} />
      </div>
    </div>
  );

  // ── Solo ─────────────────────────────────────────────────────────────────────
  const tabs = [{ id: 'game', label: 'משחק' }, { id: 'settings', label: '⚙️' }];
  if (isAdmin) tabs.push({ id: 'users', label: '👥' });

  return (
    <div style={{ ...shell }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #2d2d30' }}>
        <button onClick={() => setScreen('home')}
          style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
          ⌂
        </button>
        <span className="text-lg font-bold" style={{ color: '#fff' }}>🎵 חידון מוזיקה</span>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-1 rounded-lg text-sm font-semibold cursor-pointer transition-all no-select"
              style={{ background: tab === t.id ? '#007ACC' : 'transparent', color: tab === t.id ? '#fff' : '#888' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {tab === 'game' && <GameScreen />}
        {tab === 'settings' && <div className="flex-1 overflow-y-auto"><SettingsScreen isAdmin={isAdmin} /></div>}
        {tab === 'users' && isAdmin && <div className="flex-1 overflow-y-auto"><AdminUsersScreen /></div>}
      </div>
    </div>
  );
}

// ── Avatar circle component ──────────────────────────────────────────────────
export function AvatarCircle({ userId, hasAvatar, name, size = 36, avatarKey = 0, style = {} }) {
  const [imgError, setImgError] = useState(false);
  // hasAvatar=undefined means "try anyway" (e.g. multiplayer serialised players)
  const showImg = userId && hasAvatar !== false && !imgError;
  const initials = (name || '?').charAt(0).toUpperCase();

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: showImg ? 'transparent' : '#007ACC55',
      border: `2px solid #007ACC66`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0, ...style,
    }}>
      {showImg ? (
        <img
          key={avatarKey}
          src={`${getAvatarUrl(userId)}?v=${avatarKey}`}
          alt={name}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ color: '#5bb8ff', fontSize: size * 0.45, fontWeight: 700 }}>{initials}</span>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function modeCard(accent) {
  return {
    display: 'flex', alignItems: 'center', gap: 18, flexDirection: 'row-reverse',
    padding: '20px 22px', borderRadius: 18,
    background: `linear-gradient(135deg, ${accent}22 0%, ${accent}11 100%)`,
    border: `1.5px solid ${accent}55`, cursor: 'pointer', width: '100%',
    transition: 'transform 0.12s, box-shadow 0.12s',
    boxShadow: `0 4px 24px ${accent}22`,
  };
}

async function resizeAndEncode(file, maxSize = 300) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}
