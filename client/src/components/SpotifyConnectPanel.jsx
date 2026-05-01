import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { getSpotifyStatus } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';

export default function SpotifyConnectPanel() {
  const { spotify, saveSpotify, spotifyStatus, setSpotifyStatus } = useSettingsStore();
  const [clientId, setClientId] = useState(spotify.clientId || '');
  const [clientSecret, setClientSecret] = useState(spotify.clientSecret || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    getSpotifyStatus().then(setSpotifyStatus).catch(() => {});
  }, []);

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      alert(t('save'));
      return;
    }
    setSaving(true);
    try {
      await saveSpotify({ clientId, clientSecret });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function handleLogin() {
    if (!clientId.trim() || !clientSecret.trim()) {
      alert(t('save'));
      return;
    }
    window.open('http://127.0.0.1:3000/api/spotify/login', '_blank');
    const interval = setInterval(() => {
      getSpotifyStatus().then(s => {
        setSpotifyStatus(s);
        if (s.connected) clearInterval(interval);
      }).catch(() => {});
    }, 2000);
    setTimeout(() => clearInterval(interval), 120000);
  }

  const inputStyle = { background: '#1e1e1e', border: '1px solid #444', color: '#fff', direction: 'ltr' };

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: '#2d2d30', border: '1px solid #3a3a3a' }}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">{t('spotify_connect_title')}</h3>
        <span className="text-xs px-2 py-1 rounded-full" style={{
          background: spotifyStatus.connected ? '#1a3a1a' : '#3a1a1a',
          color: spotifyStatus.connected ? '#1db954' : '#ff6b6b',
        }}>
          {spotifyStatus.connected ? `✓ ${spotifyStatus.userName || t('connected').replace('● ', '')}` : t('disconnected')}
        </span>
      </div>

      {/* Credentials */}
      <div className="flex flex-col gap-2">
        <input
          className="rounded-lg px-3 py-2 text-xs w-full"
          style={inputStyle}
          placeholder="Client ID"
          value={clientId}
          onChange={e => { setClientId(e.target.value); setSaved(false); }}
        />
        <input
          className="rounded-lg px-3 py-2 text-xs w-full"
          style={inputStyle}
          placeholder="Client Secret"
          type="password"
          value={clientSecret}
          onChange={e => { setClientSecret(e.target.value); setSaved(false); }}
        />
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 rounded-lg text-sm font-semibold cursor-pointer active:scale-95 transition-all"
        style={{ background: saved ? '#28a745' : '#007ACC', color: '#fff', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? t('saving') : saved ? t('saved_ok') : t('save')}
      </button>

      {/* Login note + button */}
      <div className="rounded-lg p-3 text-xs flex flex-col gap-2" style={{ background: '#1e1e1e', border: '1px solid #333' }}>
        <p style={{ color: '#ffb347' }}>⚠️ {t('spotify_login_note')}</p>
        <p style={{ color: '#888' }}>{t('spotify_after_login')}</p>
        <button
          onClick={handleLogin}
          className="w-full py-2 rounded-lg font-semibold cursor-pointer active:scale-95 transition-all mt-1"
          style={{ background: '#1db954', color: '#000' }}
        >
          {t('spotify_connect_btn')}
        </button>
      </div>

      <p className="text-xs text-center" style={{ color: '#555' }}>
        {t('spotify_premium')}
      </p>
    </div>
  );
}
