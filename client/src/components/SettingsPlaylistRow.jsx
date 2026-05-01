import { useState } from 'react';
import { updatePlaylist, deletePlaylist, getUserSpotifyPlaylists, getPlaylists } from '../api/client.js';
import { useSettingsStore } from '../store/settingsStore.js';
import SpotifyPlaylistPicker from './SpotifyPlaylistPicker.jsx';
import FolderBrowser from './FolderBrowser.jsx';
import { useLang } from '../i18n/useLang.js';

export default function SettingsPlaylistRow({ playlist }) {
  const [name, setName] = useState(playlist.name);
  const [path, setPath] = useState(playlist.path || '');
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [loadingSpotify, setLoadingSpotify] = useState(false);
  const setPlaylists = useSettingsStore(s => s.setPlaylists);
  const { t } = useLang();

  const isSpotify = playlist.type === 'spotify';

  async function handleSave() {
    setSaving(true);
    try {
      await updatePlaylist({ id: playlist.id, name, path, type: playlist.type, spotifyUri: playlist.spotifyUri });
      const updated = await getPlaylists();
      setPlaylists(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`למחוק את "${name}"?`)) return;
    await deletePlaylist(playlist.id);
    const updated = await getPlaylists();
    setPlaylists(updated);
  }

  async function openSpotifyPicker() {
    setLoadingSpotify(true);
    try {
      const lists = await getUserSpotifyPlaylists();
      setSpotifyPlaylists(lists);
      setPickerOpen(true);
    } catch (e) {
      alert('שגיאה בטעינת פלייליסטים: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoadingSpotify(false);
    }
  }

  async function handleSpotifySelect(selected) {
    setPickerOpen(false);
    try {
      await updatePlaylist({ id: playlist.id, name, type: 'spotify', path: '', spotifyUri: selected.uri });
      const updated = await getPlaylists();
      setPlaylists(updated);
    } catch (e) {
      alert('שגיאה: ' + (e.response?.data?.error || e.message));
    }
  }

  async function switchToLocal() {
    await updatePlaylist({ id: playlist.id, name, type: 'local', path, spotifyUri: '' });
    const updated = await getPlaylists();
    setPlaylists(updated);
  }

  return (
    <>
      <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: '#2d2d30', border: '1px solid #3a3a3a' }}>
        {/* Name + Delete */}
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: '#1e1e1e', border: '1px solid #444', color: '#fff', direction: 'rtl' }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('pl_name_ph')}
          />
          <button
            onClick={handleDelete}
            className="text-lg cursor-pointer active:scale-95 transition-all"
            style={{ color: '#dc3545' }}
            title="מחק"
          >
            🗑️
          </button>
        </div>

        {/* Path / Spotify URI */}
        {isSpotify ? (
          <div className="flex items-center gap-2">
            <span className="text-xs flex-1 truncate" style={{ color: '#888', direction: 'ltr' }}>
              {playlist.spotifyUri || 'לא מחובר'}
            </span>
          </div>
        ) : (
          <input
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: '#1e1e1e', border: '1px solid #444', color: '#ccc', direction: 'ltr' }}
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="C:\Music\מוזיקה"
          />
        )}

        {/* Type switcher + Save */}
        <div className="flex gap-2">
          <button
            onClick={() => { switchToLocal(); setFolderBrowserOpen(true); }}
            className="px-3 py-1 rounded-lg text-xs cursor-pointer active:scale-95 transition-all"
            style={{
              background: !isSpotify ? '#007ACC' : '#2d2d30',
              color: !isSpotify ? '#fff' : '#888',
              border: '1px solid #444',
            }}
          >
            {t('folder_btn')}
          </button>
          <button
            onClick={openSpotifyPicker}
            disabled={loadingSpotify}
            className="px-3 py-1 rounded-lg text-xs cursor-pointer active:scale-95 transition-all"
            style={{
              background: isSpotify ? '#1db954' : '#2d2d30',
              color: isSpotify ? '#000' : '#888',
              border: '1px solid #444',
              opacity: loadingSpotify ? 0.6 : 1,
            }}
          >
            {loadingSpotify ? '⏳' : '🟢'} Spotify
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mr-auto px-4 py-1 rounded-lg text-xs font-semibold cursor-pointer active:scale-95 transition-all"
            style={{ background: '#28a745', color: '#fff', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '...' : t('save')}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <SpotifyPlaylistPicker
          playlists={spotifyPlaylists}
          onSelect={handleSpotifySelect}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {folderBrowserOpen && (
        <FolderBrowser
          initialPath={path || ''}
          onSelect={selected => { setPath(selected); setFolderBrowserOpen(false); }}
          onClose={() => setFolderBrowserOpen(false)}
        />
      )}
    </>
  );
}
