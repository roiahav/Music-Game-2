import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from './store/settingsStore.js';
import { useAuthStore } from './store/authStore.js';
import { useThemeStore } from './store/themeStore.js';
import { THEMES, THEME_LIST, applyTheme } from './themes.js';
import GameScreen from './screens/GameScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import MultiplayerScreen from './screens/MultiplayerScreen.jsx';
import SoloTypingScreen from './screens/SoloTypingScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import CompleteProfileScreen from './screens/CompleteProfileScreen.jsx';
import ResetPasswordScreen from './screens/ResetPasswordScreen.jsx';
import RegisterScreen from './screens/RegisterScreen.jsx';
import AdminUsersScreen from './screens/AdminUsersScreen.jsx';
import FavoritesScreen from './screens/FavoritesScreen.jsx';
import YearsGameScreen from './screens/YearsGameScreen.jsx';
import YearsMultiplayerScreen from './screens/YearsMultiplayerScreen.jsx';
import { logoutApi, uploadAvatar, getAvatarUrl } from './api/client.js';
import { useLang } from './i18n/useLang.js';

const shell = {
  display: 'flex', flexDirection: 'column', height: '100dvh',
  background: 'var(--bg)', maxWidth: 480, margin: '0 auto', width: '100%',
};

export default function App() {
  const [screen, setScreen] = useState('home');
  const [tab, setTab] = useState('game');
  const [avatarKey, setAvatarKey] = useState(0);
  const load = useSettingsStore(s => s.load);
  const { token, user, login, logout } = useAuthStore();
  const { themeId, setTheme } = useThemeStore();
  const fileInputRef = useRef(null);
  const { t, dir } = useLang();

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    applyTheme(THEMES[themeId] || THEMES.dark);
  }, [themeId]);

  useEffect(() => { if (token) load(); }, [token]);

  // Password-reset link — handled before auth check so unauthenticated users can reset
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset_token');
  if (resetToken) {
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={() => { logout(); window.location.href = '/'; }}
      />
    );
  }

  // Invite-registration link — public, no auth required
  const inviteToken = urlParams.get('invite_token');
  if (inviteToken) {
    return (
      <RegisterScreen
        token={inviteToken}
        onDone={() => { window.location.href = '/'; }}
      />
    );
  }

  if (!token) return <LoginScreen />;

  // First-time login: ask for name + email + privacy consent
  if (!user?.profileCompleted) return <CompleteProfileScreen />;

  const isAdmin = user?.role === 'admin';
  const theme = THEMES[themeId] || THEMES.dark;

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
      login(token, { ...user, hasAvatar: true });
      setAvatarKey(k => k + 1);
    } catch {}
    e.target.value = '';
  }

  // ── Home screen ─────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={{ ...shell, direction: dir, alignItems: 'center', overflowY: 'auto' }}>
      {/* Top bar */}
      <div style={{
        width: '100%', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '14px 20px', flexShrink: 0,
      }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="לחץ להחלפת תמונה"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <AvatarCircle userId={user?.id} hasAvatar={user?.hasAvatar} name={user?.username} size={36} avatarKey={avatarKey} />
          <span style={{ color: 'var(--text2)', fontSize: 13 }}>{user?.username}</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} style={{ display: 'none' }} />
        <button
          onClick={handleLogout}
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}
        >
          {t('logout')}
        </button>
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 16, marginTop: 8 }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>🎵</div>
        <h1 style={{ color: 'var(--text)', fontSize: 24, fontWeight: 900, margin: '10px 0 4px' }}>{t('app_title')}</h1>
        <p style={{ color: 'var(--text3)', fontSize: 13, margin: 0 }}>{t('tagline')}</p>
      </div>

      {/* Theme picker */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20, alignItems: 'center' }}>
        {THEME_LIST.map(th => (
          <button
            key={th.id}
            onClick={() => setTheme(th.id)}
            title={th.label}
            style={{
              width: themeId === th.id ? 32 : 26,
              height: themeId === th.id ? 32 : 26,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${th.swatch}dd, ${th.bg2})`,
              border: themeId === th.id ? `3px solid ${th.swatch}` : '3px solid transparent',
              cursor: 'pointer', padding: 0,
              boxShadow: themeId === th.id ? `0 0 12px ${th.swatch}99` : 'none',
              transition: 'all 0.2s', outline: 'none', flexShrink: 0,
            }}
          />
        ))}
      </div>

      {/* Mode cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', padding: '0 24px 28px' }}>
        <button onClick={() => setScreen('solo')} style={modeCard('#007ACC', dir)}>
          <span style={{ fontSize: 38 }}>🎧</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('solo_game')}</div>
            <div style={{ color: '#a8d4f5', fontSize: 12, marginTop: 3 }}>{t('solo_desc')}</div>
          </div>
        </button>

        <button onClick={() => setScreen('multiplayer')} style={modeCard('#1db954', dir)}>
          <span style={{ fontSize: 38 }}>🎮</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('group_game')}</div>
            <div style={{ color: '#a8f5c4', fontSize: 12, marginTop: 3 }}>{t('group_desc')}</div>
          </div>
        </button>

        <button onClick={() => setScreen('solo-typing')} style={modeCard('#9b59b6', dir)}>
          <span style={{ fontSize: 38 }}>🎤</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('free_guess')}</div>
            <div style={{ color: '#d7b8f5', fontSize: 12, marginTop: 3 }}>{t('free_desc')}</div>
          </div>
        </button>

        <button onClick={() => setScreen('years')} style={modeCard('#f39c12', dir)}>
          <span style={{ fontSize: 38 }}>📅</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('years_game')}</div>
            <div style={{ color: '#fde8b0', fontSize: 12, marginTop: 3 }}>{t('years_desc')}</div>
          </div>
        </button>

        <button onClick={() => setScreen('years-multi')} style={modeCard('#e67e22', dir)}>
          <span style={{ fontSize: 38 }}>🏆</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('ygm_game')}</div>
            <div style={{ color: '#fdd5b0', fontSize: 12, marginTop: 3 }}>{t('ygm_desc')}</div>
          </div>
        </button>

        <button onClick={() => setScreen('favorites')} style={modeCard('#e74c3c', dir)}>
          <span style={{ fontSize: 38 }}>❤️</span>
          <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('my_favorites')}</div>
            <div style={{ color: '#f5a8a8', fontSize: 12, marginTop: 3 }}>{t('favorites_desc')}</div>
          </div>
        </button>

        {isAdmin && (
          <button onClick={() => { setScreen('solo'); setTab('settings'); }} style={modeCard('#666', dir)}>
            <span style={{ fontSize: 38 }}>⚙️</span>
            <div style={{ flex: 1, textAlign: dir === 'rtl' ? 'right' : 'left' }}>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>{t('settings')}</div>
              <div style={{ color: '#bbb', fontSize: 12, marginTop: 3 }}>{t('settings_admin_desc')}</div>
            </div>
          </button>
        )}
      </div>
    </div>
  );

  // ── Years game (solo) ─────────────────────────────────────────────────────────
  if (screen === 'years') return (
    <div style={{ ...shell }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <YearsGameScreen onExit={() => setScreen('home')} />
      </div>
    </div>
  );

  // ── Years game (multiplayer) ───────────────────────────────────────────────────
  if (screen === 'years-multi') return (
    <div style={{ ...shell }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <YearsMultiplayerScreen onExit={() => setScreen('home')} />
      </div>
    </div>
  );

  // ── Favorites ────────────────────────────────────────────────────────────────
  if (screen === 'favorites') return (
    <div style={{ ...shell }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <FavoritesScreen onExit={() => setScreen('home')} />
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

  // ── Solo typing ───────────────────────────────────────────────────────────────
  if (screen === 'solo-typing') return (
    <div style={{ ...shell }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <SoloTypingScreen onExit={() => setScreen('home')} />
      </div>
    </div>
  );

  // ── Solo ─────────────────────────────────────────────────────────────────────
  const tabs = [{ id: 'game', label: t('game_tab') }, { id: 'settings', label: '⚙️' }];
  if (isAdmin) tabs.push({ id: 'users', label: '👥' });

  return (
    <div style={{ ...shell }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border2)' }}>
        <button onClick={() => setScreen('home')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
          ⌂
        </button>
        <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>🎵 {t('app_title')}</span>
        <div className="flex gap-1">
          {tabs.map(tab_ => (
            <button key={tab_.id} onClick={() => setTab(tab_.id)}
              className="px-3 py-1 rounded-lg text-sm font-semibold cursor-pointer transition-all no-select"
              style={{ background: tab === tab_.id ? 'var(--accent)' : 'transparent', color: tab === tab_.id ? '#fff' : 'var(--text2)' }}>
              {tab_.label}
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
  const showImg = userId && hasAvatar !== false && !imgError;
  const initials = (name || '?').charAt(0).toUpperCase();

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: showImg ? 'transparent' : 'var(--accent-alpha)',
      border: `2px solid var(--accent)`,
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
        <span style={{ color: 'var(--accent)', fontSize: size * 0.45, fontWeight: 700 }}>{initials}</span>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function modeCard(accent, dir = 'rtl') {
  return {
    display: 'flex', alignItems: 'center', gap: 16,
    flexDirection: dir === 'rtl' ? 'row' : 'row-reverse',
    padding: '18px 20px', borderRadius: 16,
    background: `linear-gradient(135deg, ${accent}22 0%, ${accent}0d 100%)`,
    border: `1.5px solid ${accent}44`, cursor: 'pointer', width: '100%',
    transition: 'transform 0.12s, box-shadow 0.12s',
    boxShadow: `0 4px 20px ${accent}1a`,
    direction: dir,
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
