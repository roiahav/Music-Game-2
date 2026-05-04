import { useState, useRef, useEffect, useMemo } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { addPlaylist, getPlaylists, getSettings as getSettingsApi, saveSettings, testEmailSettings, createInviteApi, getUsers } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';
import SpotifyConnectPanel from '../components/SpotifyConnectPanel.jsx';
import SettingsPlaylistRow from '../components/SettingsPlaylistRow.jsx';
import FolderBrowser from '../components/FolderBrowser.jsx';
import AdminBlacklistSection from '../components/AdminBlacklistSection.jsx';
import OneDrivePanel from '../components/OneDrivePanel.jsx';
import MobileMetadataPanel from '../components/MobileMetadataPanel.jsx';
import AdminUsersScreen, { ActivityTab } from '../screens/AdminUsersScreen.jsx';
import { getJSON, setJSON } from '../utils/safeStorage.js';
import { GAMES, DEFAULT_GAME_ORDER } from '../games-config.js';

const SECTION_ORDER_KEY = 'mg_settings_section_order';
const SECTION_LOCK_KEY  = 'mg_settings_section_locked';
const DEFAULT_SECTION_ORDER = ['games-mgmt', 'metadata', 'victory', 'playlists', 'onedrive', 'users', 'activity-log', 'blacklist', 'email', 'invite', 'invite-templates'];

// Labels rendered inside the floating ghost during drag, so the user can see
// what they're moving even though the actual card is just an empty placeholder.
const SECTION_META = {
  'games-mgmt':        { icon: '🎮', label: 'ניהול משחקים' },
  'metadata':          { icon: '📝', label: 'עריכת תגיות שירים' },
  'victory':           { icon: '🏆', label: 'שיר ניצחון' },
  'playlists':         { icon: '🎵', label: 'פלייליסטים' },
  'onedrive':          { icon: '☁️', label: 'OneDrive — ספריית מוזיקה' },
  'users':             { icon: '👥', label: 'ניהול משתמשים' },
  'activity-log':      { icon: '📋', label: 'לוג פעילות' },
  'blacklist':         { icon: '🚫', label: 'שירים חסומים' },
  'email':             { icon: '📧', label: 'הגדרות מייל' },
  'invite':            { icon: '📨', label: 'הזמנת משתמשים' },
  'invite-templates':  { icon: '📝', label: 'תבניות הודעה' },
};

export default function SettingsScreen({ isAdmin = false, usersDefaultFilter = 'all', onUsersFilterConsumed }) {
  const { playlists, setPlaylists, game, saveGame } = useSettingsStore();
  const { t } = useLang();
  const [adding, setAdding] = useState(false);
  const [showVictoryBrowser, setShowVictoryBrowser] = useState(false);
  const [showVictoryFolderBrowser, setShowVictoryFolderBrowser] = useState(false);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);
  const [victoryOpen, setVictoryOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const previewAudioRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);

  // ── Section order (drag-to-reorder) ──
  const [sectionOrder, setSectionOrder] = useState(() => {
    const saved = getJSON(SECTION_ORDER_KEY, null);
    if (!Array.isArray(saved)) return DEFAULT_SECTION_ORDER;
    // Backfill: if a new section was added since the user saved their order,
    // append it at the end so they don't lose access
    const valid = saved.filter(id => DEFAULT_SECTION_ORDER.includes(id));
    const missing = DEFAULT_SECTION_ORDER.filter(id => !valid.includes(id));
    return [...valid, ...missing];
  });

  // Lock state — when true, drag handles are hidden so the user can't
  // accidentally reorder sections. Default ON so dragging is opt-in.
  const [sectionsLocked, setSectionsLocked] = useState(() => {
    const saved = getJSON(SECTION_LOCK_KEY, null);
    return saved === null ? true : !!saved;
  });
  function toggleLocked() {
    setSectionsLocked(v => {
      const next = !v;
      setJSON(SECTION_LOCK_KEY, next);
      return next;
    });
  }

  // Drag state — same Pointer Events pattern as FavoritesScreen
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragY, setDragY] = useState(null);
  const dragStartY = useRef(0);
  const DRAG_THRESHOLD = 5;

  function persistOrder(next) {
    setSectionOrder(next);
    setJSON(SECTION_ORDER_KEY, next);
  }

  function handlePointerDown(e, idx) {
    if (sectionsLocked) return; // hard-block when the order is locked
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDragIdx(idx);
    setDragOverIdx(idx);
    setDragY(e.clientY);
    setDragActive(false);
    dragStartY.current = e.clientY;
  }

  function handlePointerMove(e) {
    if (dragIdx === null) return;
    if (!dragActive && Math.abs(e.clientY - dragStartY.current) > DRAG_THRESHOLD) setDragActive(true);
    if (!dragActive && Math.abs(e.clientY - dragStartY.current) <= DRAG_THRESHOLD) return;
    setDragY(e.clientY);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-section-idx]');
    if (row) {
      const overIdx = parseInt(row.dataset.sectionIdx, 10);
      if (!isNaN(overIdx) && overIdx !== dragOverIdx) setDragOverIdx(overIdx);
    }
  }

  function handlePointerUp() {
    if (dragActive && dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const next = [...sectionOrder];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dragOverIdx, 0, moved);
      persistOrder(next);
    }
    setDragIdx(null);
    setDragOverIdx(null);
    setDragY(null);
    setDragActive(false);
  }

  function handlePointerCancel() {
    setDragIdx(null);
    setDragOverIdx(null);
    setDragY(null);
    setDragActive(false);
  }

  function resetOrder() {
    persistOrder(DEFAULT_SECTION_ORDER);
  }

  // Build the props for a draggable wrapper given a section id.
  // CSS `order` is what actually moves the cards visually — the flex container
  // re-orders children by `order` value, no JSX restructuring needed.
  function dragProps(id) {
    const idx = sectionOrder.indexOf(id);
    if (idx === -1) return null;
    const isThisDragging = dragIdx === idx && dragActive;
    const isThisOver     = dragOverIdx === idx && dragIdx !== idx && dragActive;
    return {
      idx,
      order: idx + 1,            // +1 so GameOptionsBar (no order) stays at 0 visually
      locked: sectionsLocked,
      isDragging: isThisDragging,
      isDragOver: isThisOver,
      isDragMovingDown: dragIdx !== null && dragOverIdx > dragIdx,
      handlers: {
        onPointerDown:   e => handlePointerDown(e, idx),
        onPointerMove:   handlePointerMove,
        onPointerUp:     handlePointerUp,
        onPointerCancel: handlePointerCancel,
      },
    };
  }

  // Auto-open the users section when navigated here with a non-default filter
  // (e.g. the home-screen 📨 bell forwards us with usersDefaultFilter='pending')
  useEffect(() => {
    if (usersDefaultFilter && usersDefaultFilter !== 'all') setUsersOpen(true);
  }, [usersDefaultFilter]);

  // Refresh the pending-count badge whenever the panel re-mounts
  useEffect(() => {
    if (!isAdmin) return;
    getUsers()
      .then(list => setPendingCount(list.filter(u => u.approved === false).length))
      .catch(() => {});
  }, [isAdmin, usersOpen]);

  async function handleAddPlaylist() {
    setAdding(true);
    try {
      await addPlaylist({ name: 'פלייליסט חדש', type: 'local', path: '' });
      const updated = await getPlaylists();
      setPlaylists(updated);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      {/* Floating ghost while dragging — shows what's being moved */}
      {dragActive && dragIdx !== null && (
        <SettingsDragGhost
          id={sectionOrder[dragIdx]}
          dragY={dragY}
          accent="var(--accent)"
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', order: -2, gap: 6 }}>
        <h2 className="text-lg font-bold">{t('settings')}</h2>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={toggleLocked}
              title={sectionsLocked ? 'הסר נעילה ואפשר שינוי סדר' : 'נעל את סדר ההגדרות'}
              style={{
                background: sectionsLocked ? '#1db95422' : '#3a1010',
                border: `1px solid ${sectionsLocked ? '#1db954' : '#dc3545'}`,
                color:  sectionsLocked ? '#1db954' : '#ff6b6b',
                borderRadius: 16, padding: '4px 12px',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {sectionsLocked ? '🔒 נעול' : '🔓 פתוח'}
            </button>
            {!sectionsLocked && (
              <button
                onClick={resetOrder}
                style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
                title="החזרת סדר ההגדרות לברירת מחדל"
              >
                ↻ אפס סדר
              </button>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          {/* Games management — visibility, order, per-user restrictions */}
          <DraggableCard {...dragProps('games-mgmt')}>
            <GamesManagementPanel />
          </DraggableCard>

          {/* Mobile-friendly ID3-tag editor for songs across every playlist */}
          <DraggableCard {...dragProps('metadata')}>
            <MobileMetadataPanel />
          </DraggableCard>

          {/* Victory song (collapsible) */}
          <DraggableCard {...dragProps('victory')}>
          <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setVictoryOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>🏆 {t('victory_song')}</span>
                {(game.victoryAudioPath || game.victoryAudioFolder) && (
                  <span style={{ fontSize: 11, color: '#1db954', background: '#1db95422', padding: '2px 8px', borderRadius: 10, border: '1px solid #1db95455', fontWeight: 700 }}>
                    ✓
                  </span>
                )}
              </div>
              <span style={{ color: '#888', fontSize: 18 }}>{victoryOpen ? '▲' : '▼'}</span>
            </button>

          {victoryOpen && (
          <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#888', fontSize: 12, margin: 0 }}>{t('victory_song_desc')}</p>

            {/* ── Folder (random) ── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ color: '#aaa', fontSize: 12 }}>{t('folder_random')}</label>
                {/* Toggle enable/disable folder */}
                <button
                  onClick={() => saveGame({ victoryFolderEnabled: !game.victoryFolderEnabled })}
                  style={{
                    background: game.victoryFolderEnabled !== false ? '#1db95433' : 'transparent',
                    border: `1px solid ${game.victoryFolderEnabled !== false ? '#1db954' : '#3a3a3a'}`,
                    color: game.victoryFolderEnabled !== false ? '#1db954' : '#555',
                    borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {game.victoryFolderEnabled !== false ? '✓ פעיל' : '✗ כבוי'}
                </button>
              </div>
              {game.victoryFolderEnabled !== false && (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={game.victoryAudioFolder || ''}
                      onChange={e => saveGame({ victoryAudioFolder: e.target.value })}
                      placeholder="נתיב לתיקייה עם שירי ניצחון..."
                      style={{
                        flex: 1, background: '#1e1e1e', border: '1px solid #444',
                        color: '#ccc', borderRadius: 8, padding: '8px 10px',
                        fontSize: 13, direction: 'ltr',
                      }}
                    />
                    <button
                      onClick={() => setShowVictoryFolderBrowser(true)}
                      style={{
                        background: '#1db954', border: 'none', color: '#fff',
                        borderRadius: 8, padding: '8px 12px', fontSize: 13,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      📁
                    </button>
                  </div>
                  {game.victoryAudioFolder && (
                    <p style={{ color: '#1db954', fontSize: 11, margin: '4px 0 0', direction: 'ltr' }}>
                      ✓ {game.victoryAudioFolder}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Single file (fallback) ── */}
            <div>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>{t('single_file')}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={game.victoryAudioPath || ''}
                  onChange={e => saveGame({ victoryAudioPath: e.target.value })}
                  placeholder="נתיב לקובץ MP3..."
                  style={{
                    flex: 1, background: '#1e1e1e', border: '1px solid #444',
                    color: '#ccc', borderRadius: 8, padding: '8px 10px',
                    fontSize: 13, direction: 'ltr',
                  }}
                />
                <button
                  onClick={() => setShowVictoryBrowser(true)}
                  style={{
                    background: '#007ACC', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '8px 12px', fontSize: 13,
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  📁
                </button>
              </div>
              {game.victoryAudioPath && (
                <audio
                  controls
                  src={`/api/audio/${encodeURIComponent(game.victoryAudioPath)}`}
                  style={{ width: '100%', marginTop: 6 }}
                />
              )}
            </div>

            {/* ── Start time (chorus picker) ── */}
            <div style={{ background: '#1e1e1e', borderRadius: 10, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
                ⏱ {t('victory_start_at')}
              </label>
              <p style={{ color: '#888', fontSize: 11, margin: 0 }}>
                {t('victory_start_desc')}
              </p>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Numeric input */}
                <input
                  type="number"
                  min="0"
                  max="600"
                  step="1"
                  value={game.victoryStartSeconds || 0}
                  onChange={e => saveGame({ victoryStartSeconds: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  style={{
                    width: 80, background: '#2d2d30', border: '1px solid #444',
                    color: '#fff', borderRadius: 8, padding: '8px 10px',
                    fontSize: 14, textAlign: 'center', direction: 'ltr',
                  }}
                />
                <span style={{ color: '#aaa', fontSize: 13 }}>{t('seconds')}</span>

                {/* Preview button */}
                {(game.victoryAudioPath || game.victoryAudioFolder) && (
                  <button
                    onClick={() => {
                      const path = game.victoryAudioPath;
                      if (!path || !previewAudioRef.current) return;
                      const el = previewAudioRef.current;
                      if (previewing) {
                        el.pause();
                        setPreviewing(false);
                        return;
                      }
                      el.src = `/api/audio/${encodeURIComponent(path)}`;
                      el.load();
                      const onReady = () => {
                        const startAt = Math.max(0, parseInt(game.victoryStartSeconds, 10) || 0);
                        if (startAt > 0) try { el.currentTime = startAt; } catch {}
                        el.play().catch(() => {});
                        setPreviewing(true);
                        el.removeEventListener('loadedmetadata', onReady);
                      };
                      el.addEventListener('loadedmetadata', onReady);
                    }}
                    disabled={!game.victoryAudioPath}
                    title={!game.victoryAudioPath ? t('victory_preview_need_file') : ''}
                    style={{
                      marginRight: 'auto',
                      background: previewing ? '#dc3545' : '#1db954',
                      border: 'none', color: '#fff', borderRadius: 8,
                      padding: '8px 14px', fontSize: 12, fontWeight: 700,
                      cursor: game.victoryAudioPath ? 'pointer' : 'not-allowed',
                      opacity: game.victoryAudioPath ? 1 : 0.4,
                    }}
                  >
                    {previewing ? '⏸ ' + t('stop') : '▶ ' + t('preview')}
                  </button>
                )}
              </div>

              {/* Hidden preview audio element */}
              <audio
                ref={previewAudioRef}
                onEnded={() => setPreviewing(false)}
                onPause={() => setPreviewing(false)}
                style={{ display: 'none' }}
              />
            </div>
          </div>
          )}
          </div>
          </DraggableCard>

          {/* Playlists (collapsible — contains Spotify connection too) */}
          <DraggableCard {...dragProps('playlists')}>
          <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setPlaylistsOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
                color: '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>🎵 {t('playlists_title')}</span>
                {playlists.length > 0 && (
                  <span style={{ fontSize: 11, color: '#5bb8ff', background: '#007ACC22', padding: '2px 8px', borderRadius: 10, border: '1px solid #007ACC55', fontWeight: 700 }}>
                    {playlists.length}
                  </span>
                )}
              </div>
              <span style={{ color: '#888', fontSize: 18 }}>{playlistsOpen ? '▲' : '▼'}</span>
            </button>

            {playlistsOpen && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Spotify connection — at the top, since it powers Spotify-type playlists */}
                <SpotifyConnectPanel />

                {/* Add playlist button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleAddPlaylist}
                    disabled={adding}
                    style={{
                      background: '#007ACC', color: '#fff', border: 'none',
                      padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1,
                    }}
                  >
                    {adding ? '...' : '+ ' + t('add_playlist')}
                  </button>
                </div>

                {!playlists.length && (
                  <div style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: '#666', background: '#1e1e1e', borderRadius: 10 }}>
                    {t('no_playlists')}
                  </div>
                )}
                {playlists.map(p => <SettingsPlaylistRow key={p.id} playlist={p} />)}
              </div>
            )}
          </div>
          </DraggableCard>

          {/* OneDrive sync (admin-only) */}
          <DraggableCard {...dragProps('onedrive')}>
            <OneDrivePanel />
          </DraggableCard>

          {/* Users management — collapsible (admin-only) */}
          <DraggableCard {...dragProps('users')}>
          <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setUsersOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>👥 ניהול משתמשים</span>
                {pendingCount > 0 && (
                  <span style={{ fontSize: 11, color: '#fff', background: '#dc3545', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>
                    {pendingCount}
                  </span>
                )}
              </div>
              <span style={{ color: '#888', fontSize: 18 }}>{usersOpen ? '▲' : '▼'}</span>
            </button>

            {usersOpen && (
              <div style={{ padding: '0 0 12px' }}>
                <AdminUsersScreen
                  defaultFilter={usersDefaultFilter}
                  onFilterConsumed={onUsersFilterConsumed}
                />
              </div>
            )}
          </div>
          </DraggableCard>

          {/* Activity log — collapsible */}
          <DraggableCard {...dragProps('activity-log')}>
          <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
            <button
              onClick={() => setActivityLogOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>📋 לוג פעילות</span>
              <span style={{ color: '#888', fontSize: 18 }}>{activityLogOpen ? '▲' : '▼'}</span>
            </button>

            {activityLogOpen && (
              <div style={{ padding: '0 20px 20px' }}>
                <ActivityTab />
              </div>
            )}
          </div>
          </DraggableCard>

          {/* Blacklist */}
          {playlists.some(p => p.type === 'local') && (
            <DraggableCard {...dragProps('blacklist')}>
              <AdminBlacklistSection playlists={playlists} />
            </DraggableCard>
          )}

          {/* Email / SMTP */}
          <DraggableCard {...dragProps('email')}>
            <EmailSettingsPanel />
          </DraggableCard>

          {/* Invite users */}
          <DraggableCard {...dragProps('invite')}>
            <InviteSettingsPanel />
          </DraggableCard>

          {/* Invite message templates */}
          <DraggableCard {...dragProps('invite-templates')}>
            <InviteTemplatesPanel />
          </DraggableCard>

          <div className="text-center text-xs mt-4" style={{ color: '#555', order: 999 }}>
            {t('wifi_hint')}
          </div>
        </>
      )}

      {showVictoryBrowser && (
        <VictoryFilePicker
          initialPath={game.victoryAudioPath ? game.victoryAudioPath.replace(/[^/\\]*$/, '') : ''}
          onSelect={path => { saveGame({ victoryAudioPath: path }); setShowVictoryBrowser(false); }}
          onClose={() => setShowVictoryBrowser(false)}
        />
      )}

      {showVictoryFolderBrowser && (
        <FolderBrowser
          initialPath={game.victoryAudioFolder || ''}
          onSelect={path => { saveGame({ victoryAudioFolder: path }); setShowVictoryFolderBrowser(false); }}
          onClose={() => setShowVictoryFolderBrowser(false)}
        />
      )}
    </div>
  );
}

// ─── Email SMTP Panel ─────────────────────────────────────────────────────────
function EmailSettingsPanel() {
  const { t } = useLang();
  const [cfg, setCfg] = useState({
    smtpHost: '', smtpPort: 587, smtpSecure: false,
    smtpUser: '', smtpPass: '', fromName: 'Music Game', fromEmail: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | string(error)

  async function load() {
    if (loaded) return;
    try {
      const s = await getSettingsApi();
      if (s.email) setCfg(prev => ({ ...prev, ...s.email }));
    } catch {}
    setLoaded(true);
  }

  function handleOpen() { load(); setOpen(o => !o); }

  function handleChange(field, value) {
    setCfg(prev => ({ ...prev, [field]: value }));
    setTestResult(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings({ email: cfg });
    } catch {}
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    // Save first, then test
    try {
      await saveSettings({ email: cfg });
      await testEmailSettings();
      setTestResult('ok');
    } catch (e) {
      setTestResult(e.response?.data?.error || e.message || 'שגיאה לא ידועה');
    } finally {
      setTesting(false);
    }
  }

  const inputStyle = {
    background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
    color: '#ccc', padding: '8px 10px', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', width: '100%', direction: 'ltr',
  };

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header row */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
          color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>📧 {t('email_settings')}</span>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Hint */}
          <p style={{ margin: 0, color: '#888', fontSize: 12, background: '#1e1e1e', borderRadius: 8, padding: '8px 10px' }}>
            💡 {t('email_hint')}
          </p>

          {/* Host + Port row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 3 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('email_smtp_host')} <span style={{ color: '#dc3545' }}>*</span>
              </label>
              <input
                value={cfg.smtpHost}
                onChange={e => handleChange('smtpHost', e.target.value)}
                placeholder="smtp.gmail.com"
                style={{ ...inputStyle, borderColor: cfg.smtpHost?.trim() ? '#444' : '#dc354555' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('email_smtp_port')}</label>
              <input type="number" value={cfg.smtpPort} onChange={e => handleChange('smtpPort', Number(e.target.value))} placeholder="587" style={inputStyle} />
            </div>
          </div>

          {/* SSL toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={cfg.smtpSecure}
              onChange={e => handleChange('smtpSecure', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#007ACC' }}
            />
            <span style={{ color: '#aaa', fontSize: 13 }}>{t('email_secure')}</span>
          </label>

          {/* User */}
          <div>
            <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t('email_smtp_user')} <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              type="email"
              value={cfg.smtpUser}
              onChange={e => handleChange('smtpUser', e.target.value)}
              placeholder="your@gmail.com"
              style={{ ...inputStyle, borderColor: cfg.smtpUser?.trim() ? '#444' : '#dc354555' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              {t('email_smtp_pass')} <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <input
              type="password"
              value={cfg.smtpPass}
              onChange={e => handleChange('smtpPass', e.target.value)}
              placeholder="App Password..."
              autoComplete="new-password"
              style={{ ...inputStyle, borderColor: cfg.smtpPass?.trim() ? '#444' : '#dc354555' }}
            />
          </div>

          {/* From name + email row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('email_from_name')}</label>
              <input value={cfg.fromName} onChange={e => handleChange('fromName', e.target.value)} placeholder="Music Game" style={inputStyle} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('email_from_addr')}</label>
              <input type="email" value={cfg.fromEmail} onChange={e => handleChange('fromEmail', e.target.value)} placeholder="your@gmail.com" style={inputStyle} />
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: testResult === 'ok' ? '#1db95433' : '#3a1010',
              color: testResult === 'ok' ? '#1db954' : '#ff6b6b',
            }}>
              {testResult === 'ok' ? t('email_test_ok') : `${t('email_test_fail')} ${testResult}`}
            </div>
          )}

          {/* Buttons */}
          {(() => {
            const hasRequired = cfg.smtpHost?.trim() && cfg.smtpUser?.trim() && cfg.smtpPass?.trim();
            const disabled = !hasRequired || testing || saving;
            return (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleTest}
                  disabled={disabled}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 10, border: '1px solid #444',
                    background: '#1e1e1e', color: disabled ? '#555' : '#ccc',
                    fontSize: 13, fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {testing ? '...' : t('email_test_btn')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={disabled}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 10, border: 'none',
                    background: disabled ? '#2d2d30' : '#007ACC',
                    color: disabled ? '#555' : '#fff',
                    fontSize: 13, fontWeight: 700,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// File picker — extends FolderBrowser with MP3 file listing
import api from '../api/client.js';

function VictoryFilePicker({ initialPath, onSelect, onClose }) {
  const [dir, setDir] = useState(initialPath || '');
  const [entries, setEntries] = useState(null);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function navigate(path) {
    setLoading(true); setError('');
    try {
      const r = await api.get('/browse', { params: { path: path || '', files: 'true' } });
      setDir(r.data.path || '');
      setParent(r.data.parent);
      setEntries(r.data.entries || []);
    } catch (e) { setError(e.response?.data?.error || 'שגיאה'); }
    finally { setLoading(false); }
  }

  useState(() => { navigate(initialPath || ''); });

  const folders = (entries || []).filter(e => e.type === 'dir');
  const files = (entries || []).filter(e => e.type === 'file');

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
        background: '#2d2d30', borderRadius: '20px 20px 0 0',
        maxWidth: 480, margin: '0 auto',
        display: 'flex', flexDirection: 'column', maxHeight: '80vh', direction: 'rtl',
      }}>
        <div style={{ width: 40, height: 4, background: '#555', borderRadius: 2, margin: '12px auto 0', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 8px', flexShrink: 0 }}>
          <button onClick={() => parent != null ? navigate(parent) : navigate('')}
            disabled={parent == null && dir === ''}
            style={{ background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', opacity: (parent == null && dir === '') ? 0.3 : 1 }}>‹</button>
          <div style={{ flex: 1, color: '#ccc', fontSize: 12, direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir || '/'}</div>
          <button onClick={onClose} style={{ background: '#444', border: 'none', color: '#fff', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>טוען...</div>}
          {error && <div style={{ color: '#ff6b6b', textAlign: 'center', padding: 16 }}>{error}</div>}
          {folders.map(e => (
            <button key={e.path} onClick={() => navigate(e.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid #3a3a3a22', cursor: 'pointer' }}>
              <span>📁</span>
              <span style={{ flex: 1, color: '#fff', fontSize: 14, textAlign: 'right' }}>{e.name}</span>
              <span style={{ color: '#555' }}>›</span>
            </button>
          ))}
          {files.map(e => (
            <button key={e.path} onClick={() => onSelect(e.path)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 16px', background: 'none', border: 'none', borderBottom: '1px solid #3a3a3a22', cursor: 'pointer' }}>
              <span>🎵</span>
              <span style={{ flex: 1, color: '#5bb8ff', fontSize: 14, textAlign: 'right' }}>{e.name}</span>
            </button>
          ))}
          {!loading && !error && folders.length === 0 && files.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', padding: 24 }}>אין קבצים</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Invite Users Panel (collapsible) ─────────────────────────────────────────
function InviteSettingsPanel() {
  const [open, setOpen] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Submission state
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null); // { url, emailSent, emailError }
  const [copied, setCopied] = useState(false);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templatesLoaded, setTemplatesLoaded] = useState(false);

  // Load templates when the panel opens
  async function ensureTemplates() {
    if (templatesLoaded) return;
    try {
      const s = await getSettingsApi();
      const tpls = Array.isArray(s.inviteTemplates) ? s.inviteTemplates : [];
      setTemplates(tpls);
      if (tpls.length && !selectedTemplateId) setSelectedTemplateId(tpls[0].id);
    } catch {}
    setTemplatesLoaded(true);
  }

  function handleOpen() {
    if (!open) ensureTemplates();
    setOpen(o => !o);
  }

  function resetForm() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone('');
    setResult(null); setCopied(false);
  }

  async function handleCreate(sendEmail = false) {
    if (sendEmail && (!email.trim() || !email.includes('@'))) {
      return alert('כדי לשלוח במייל — הכנס כתובת מייל תקינה');
    }
    setCreating(true);
    try {
      const res = await createInviteApi({
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
        sendEmail,
      });
      setResult(res);
      if (sendEmail && !res.emailSent && res.emailError) {
        alert(`המייל לא נשלח:\n${res.emailError}\n\nאך הקישור נוצר — אפשר להעתיק/לשלוח בוואטסאפ.`);
      }
    } catch (e) {
      alert(e.response?.data?.error || 'שגיאה ביצירת ההזמנה');
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => alert('לא ניתן להעתיק — בחר ידנית')
    );
  }

  function buildMessage() {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    const body = tpl?.body || `שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם: {url}`;
    return body
      .replace(/\{firstName\}/g, firstName || '')
      .replace(/\{lastName\}/g, lastName || '')
      .replace(/\{url\}/g, result?.url || '');
  }

  function handleWhatsApp() {
    if (!result?.url) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;
    const msg = buildMessage();
    const whatsappUrl = intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(whatsappUrl, '_blank');
  }

  const inputStyle = {
    background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
    color: '#fff', padding: '9px 12px', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', width: '100%',
  };

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>📨 הזמנת משתמשים</span>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, color: '#888', fontSize: 12 }}>
            צור קישור הרשמה ושלח אותו במייל או בוואטסאפ.
            <br/>המשתמש יוכל להיכנס רק אחרי שתאשר אותו ב<strong style={{ color: '#aaa' }}>ניהול משתמשים</strong>.
          </p>

          {!result ? (
            <>
              {/* Form */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    שם פרטי
                  </label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="לא חובה" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    שם משפחה
                  </label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="לא חובה" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  כתובת מייל <span style={{ color: '#666' }}>(לשליחה במייל)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={{ ...inputStyle, direction: 'ltr' }}
                />
              </div>

              <div>
                <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  טלפון <span style={{ color: '#666' }}>(לשליחה בוואטסאפ)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0501234567"
                  style={{ ...inputStyle, direction: 'ltr' }}
                />
              </div>

              {/* Template picker (for WhatsApp) */}
              {templates.length > 0 && (
                <div>
                  <label style={{ color: '#aaa', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    תבנית הודעה <span style={{ color: '#666' }}>(לוואטסאפ)</span>
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                    style={{ ...inputStyle, direction: 'rtl' }}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Send buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleCreate(true)}
                  disabled={creating || !email.trim()}
                  style={{
                    flex: 1, minWidth: 130, padding: '11px', borderRadius: 10,
                    background: creating || !email.trim() ? '#3a3a3a' : '#007ACC',
                    border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: creating || !email.trim() ? 'not-allowed' : 'pointer',
                    opacity: creating || !email.trim() ? 0.6 : 1,
                  }}
                >
                  {creating ? '...' : '📧 שלח במייל'}
                </button>
                <button
                  onClick={() => handleCreate(false)}
                  disabled={creating}
                  style={{
                    flex: 1, minWidth: 130, padding: '11px', borderRadius: 10,
                    background: '#1db954', border: 'none', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {creating ? '...' : '🔗 צור קישור בלבד'}
                </button>
              </div>
            </>
          ) : (
            // ── Result state ──
            <>
              <div style={{
                background: result.emailSent ? '#1db95422' : '#007ACC22',
                border: `1px solid ${result.emailSent ? '#1db954' : '#007ACC'}`,
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ color: result.emailSent ? '#1db954' : '#5bb8ff', fontWeight: 700, fontSize: 13 }}>
                  {result.emailSent ? '✅ ההזמנה נשלחה במייל!' : '🔗 הקישור מוכן'}
                </div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
                  {result.emailSent
                    ? `נשלח אל ${email}. אפשר גם לשלוח בוואטסאפ.`
                    : 'שתף את הקישור עם המשתמש בכל דרך שתבחר.'}
                </div>
              </div>

              {/* Action buttons (primary) */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={handleWhatsApp}
                  style={{
                    flex: 1, minWidth: 110, padding: '13px', borderRadius: 10,
                    background: '#25D366', border: 'none', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  💬 שלח בוואטסאפ
                </button>
                <button
                  onClick={handleCopy}
                  style={{
                    flex: 1, minWidth: 110, padding: '13px', borderRadius: 10,
                    background: copied ? '#1db95433' : '#3a3a3a',
                    border: `1px solid ${copied ? '#1db954' : '#444'}`,
                    color: copied ? '#1db954' : '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {copied ? '✓ הועתק!' : '📋 העתק קישור'}
                </button>
              </div>

              {/* URL — hidden behind a toggle so it doesn't dominate the panel */}
              <ShowUrlToggle url={result.url} />

              <button
                onClick={resetForm}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  background: 'none', border: '1px solid #444', color: '#aaa',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                🆕 הזמנה נוספת
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Show/hide URL toggle (used in invite result) ─────────────────────────────
function ShowUrlToggle({ url }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setShow(s => !s)}
        style={{
          background: 'none', border: 'none', color: '#666', fontSize: 11,
          cursor: 'pointer', padding: '4px 0', textDecoration: 'underline',
        }}
      >
        {show ? '▲ הסתר קישור' : '▼ הצג קישור גולמי'}
      </button>
      {show && (
        <div style={{
          marginTop: 6, background: '#1e1e1e', border: '1px solid #444', borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11, color: '#5bb8ff', wordBreak: 'break-all', direction: 'ltr',
          fontFamily: 'monospace',
        }}>
          {url}
        </div>
      )}
    </div>
  );
}

// ─── Invite Templates Panel (CRUD for message templates) ─────────────────────
function InviteTemplatesPanel() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [editingId, setEditingId] = useState(null);   // id being edited
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const s = await getSettingsApi();
      setTemplates(Array.isArray(s.inviteTemplates) ? s.inviteTemplates : []);
    } catch {}
    setLoaded(true);
  }

  function handleOpen() {
    if (!loaded) load();
    setOpen(o => !o);
  }

  async function persist(next) {
    setSaving(true);
    try { await saveSettings({ inviteTemplates: next }); setTemplates(next); }
    catch (e) { alert(e.response?.data?.error || 'שגיאה בשמירה'); }
    finally { setSaving(false); }
  }

  function startNew() {
    setEditingId('__new__');
    setEditName('');
    setEditBody('שלום {firstName}!\nהוזמנת ל-Music Game 🎵\n\n👉 הירשם כאן: {url}');
  }

  function startEdit(tpl) {
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditBody(tpl.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditBody('');
  }

  async function saveEdit() {
    if (!editName.trim()) return alert('נא להזין שם תבנית');
    if (!editBody.trim()) return alert('נא להזין תוכן הודעה');
    if (!editBody.includes('{url}')) {
      if (!confirm('שים לב — אין {url} בתבנית, הקישור לא יוטמע. להמשיך בכל זאת?')) return;
    }

    let next;
    if (editingId === '__new__') {
      const newTpl = { id: 'tmpl-' + Date.now(), name: editName.trim(), body: editBody };
      next = [...templates, newTpl];
    } else {
      next = templates.map(t => t.id === editingId ? { ...t, name: editName.trim(), body: editBody } : t);
    }
    await persist(next);
    cancelEdit();
  }

  async function deleteTemplate(id) {
    const tpl = templates.find(t => t.id === id);
    if (!confirm(`למחוק את התבנית "${tpl?.name}"?`)) return;
    await persist(templates.filter(t => t.id !== id));
  }

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>📝 תבניות הודעה להזמנה</span>
          {templates.length > 0 && (
            <span style={{ fontSize: 11, color: '#5bb8ff', background: '#007ACC22', padding: '2px 8px', borderRadius: 10, border: '1px solid #007ACC55', fontWeight: 700 }}>
              {templates.length}
            </span>
          )}
        </div>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: '#888', fontSize: 12 }}>
            תבניות לשליחה בוואטסאפ. תוכל לבחור מהן בעת שליחת הזמנה.
            <br/>
            <span style={{ color: '#aaa' }}>תוויות זמינות:</span>{' '}
            <code style={{ color: '#5bb8ff', fontSize: 11 }}>{'{firstName} {lastName} {url}'}</code>
          </p>

          {/* Existing templates */}
          {templates.map(tpl => (
            editingId === tpl.id ? (
              <TemplateEditor
                key={tpl.id}
                name={editName} setName={setEditName}
                body={editBody} setBody={setEditBody}
                onSave={saveEdit} onCancel={cancelEdit} saving={saving}
              />
            ) : (
              <div key={tpl.id} style={{
                background: '#1e1e1e', border: '1px solid #3a3a3a',
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{tpl.name}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(tpl)} style={tplBtnStyle('#444')}>✏️ ערוך</button>
                    <button onClick={() => deleteTemplate(tpl.id)} style={tplBtnStyle('#dc354544')}>🗑️</button>
                  </div>
                </div>
                <pre style={{
                  margin: 0, color: '#aaa', fontSize: 11, whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit', maxHeight: 80, overflowY: 'auto',
                }}>{tpl.body}</pre>
              </div>
            )
          ))}

          {/* New template editor */}
          {editingId === '__new__' && (
            <TemplateEditor
              name={editName} setName={setEditName}
              body={editBody} setBody={setEditBody}
              onSave={saveEdit} onCancel={cancelEdit} saving={saving}
            />
          )}

          {/* + Add button */}
          {editingId === null && (
            <button
              onClick={startNew}
              style={{
                padding: '10px', borderRadius: 10,
                background: '#007ACC22', border: '1px dashed #007ACC55',
                color: '#5bb8ff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              + תבנית חדשה
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ name, setName, body, setBody, onSave, onCancel, saving }) {
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #007ACC', borderRadius: 10, padding: '12px' }}>
      <label style={{ color: '#aaa', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>שם תבנית</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="לדוג׳ ידידותי / רשמי / משפחתי"
        style={{
          width: '100%', background: '#2d2d30', border: '1px solid #444',
          color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          boxSizing: 'border-box', outline: 'none', marginBottom: 10,
        }}
      />
      <label style={{ color: '#aaa', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 4 }}>תוכן ההודעה</label>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={6}
        style={{
          width: '100%', background: '#2d2d30', border: '1px solid #444',
          color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13,
          boxSizing: 'border-box', outline: 'none', resize: 'vertical',
          fontFamily: 'inherit', lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={onCancel}
          style={{ flex: 1, padding: '9px', borderRadius: 8, background: 'none', border: '1px solid #444', color: '#aaa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          ביטול
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ flex: 2, padding: '9px', borderRadius: 8, background: '#007ACC', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {saving ? 'שומר...' : '💾 שמור תבנית'}
        </button>
      </div>
    </div>
  );
}

const tplBtnStyle = (bg) => ({
  background: bg, border: 'none', color: '#fff',
  borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
  cursor: 'pointer',
});

// ─── Games management panel ──────────────────────────────────────────────────
// Lets admin hide/show, reorder and per-user-restrict each home-screen game.
const GAMES_MGMT_OPEN_KEY = 'mg_settings_games_mgmt_open';

function GamesManagementPanel() {
  const gamesConfig = useSettingsStore(s => s.games);
  const saveGamesConfig = useSettingsStore(s => s.saveGamesConfig);

  // Default OPEN so admins can immediately see the home-screen reorder UI
  const [open, setOpen] = useState(() => {
    const saved = getJSON(GAMES_MGMT_OPEN_KEY, null);
    return saved === null ? true : !!saved;
  });
  useEffect(() => { setJSON(GAMES_MGMT_OPEN_KEY, open); }, [open]);
  const [users, setUsers] = useState([]);
  const [expandedGameId, setExpandedGameId] = useState(null);

  // Drag-to-reorder state
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragY, setDragY] = useState(null);
  const dragStartY = useRef(0);

  useEffect(() => {
    if (open && users.length === 0) {
      getUsers().then(setUsers).catch(() => {});
    }
  }, [open]);

  // Resolved order — falls back to defaults for games not in the saved order
  const order = useMemo(() => {
    const saved = Array.isArray(gamesConfig?.order) ? gamesConfig.order : [];
    const known = new Set(GAMES.map(g => g.id));
    const ordered = [...saved.filter(id => known.has(id)),
                     ...DEFAULT_GAME_ORDER.filter(id => !saved.includes(id))];
    return ordered;
  }, [gamesConfig]);

  const hidden       = useMemo(() => new Set(gamesConfig?.hidden || []), [gamesConfig]);
  const allowedUsers = gamesConfig?.allowedUsers || {};

  function persist(next) {
    saveGamesConfig(next);
  }

  function toggleVisible(gameId) {
    const next = {
      order: order,
      hidden: hidden.has(gameId)
        ? [...hidden].filter(id => id !== gameId)
        : [...hidden, gameId],
      allowedUsers,
    };
    persist(next);
  }

  function toggleAllowedUser(gameId, userId) {
    const cur = allowedUsers[gameId] || [];
    const nextList = cur.includes(userId) ? cur.filter(id => id !== userId) : [...cur, userId];
    const nextAllowed = { ...allowedUsers };
    if (nextList.length) nextAllowed[gameId] = nextList; else delete nextAllowed[gameId];
    persist({ order, hidden: [...hidden], allowedUsers: nextAllowed });
  }

  function clearRestriction(gameId) {
    const nextAllowed = { ...allowedUsers };
    delete nextAllowed[gameId];
    persist({ order, hidden: [...hidden], allowedUsers: nextAllowed });
  }

  function moveTo(fromId, toId) {
    if (fromId === toId) return;
    const next = [...order];
    const fromIdx = next.indexOf(fromId);
    const toIdx   = next.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    persist({ order: next, hidden: [...hidden], allowedUsers });
  }

  // Drag handlers — same pattern as the other drag implementations
  function onPointerDown(e, id) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDragId(id);
    setDragOverId(id);
    setDragY(e.clientY);
    setDragActive(false);
    dragStartY.current = e.clientY;
  }
  function onPointerMove(e) {
    if (!dragId) return;
    if (!dragActive && Math.abs(e.clientY - dragStartY.current) > 5) setDragActive(true);
    if (!dragActive) return;
    setDragY(e.clientY);
    const el  = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest('[data-game-id]');
    if (row) {
      const id = row.dataset.gameId;
      if (id !== dragOverId) setDragOverId(id);
    }
  }
  function onPointerUp() {
    if (dragActive && dragId && dragOverId && dragId !== dragOverId) {
      moveTo(dragId, dragOverId);
    }
    setDragId(null); setDragOverId(null); setDragY(null); setDragActive(false);
  }
  function onPointerCancel() {
    setDragId(null); setDragOverId(null); setDragY(null); setDragActive(false);
  }

  return (
    <div style={{ background: '#2d2d30', border: '1px solid #3a3a3a', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🎮 ניהול משחקים</span>
          {hidden.size > 0 && (
            <span style={{ fontSize: 11, color: '#888', background: '#1e1e1e', padding: '2px 8px', borderRadius: 10, border: '1px solid #444', fontWeight: 700 }}>
              {hidden.size} מוסתרים
            </span>
          )}
        </div>
        <span style={{ color: '#888', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: '#888', fontSize: 12, margin: 0 }}>
            הסתר/הצג משחקים, גרור לשינוי סדר במסך הבית, והגבל משחק למשתמשים ספציפיים.
            <br/>אדמינים תמיד רואים את כל המשחקים.
          </p>

          {/* Drag ghost */}
          {dragActive && dragId && dragY != null && (
            <div style={{
              position: 'fixed',
              top: dragY - 26, left: '50%',
              transform: 'translateX(-50%) rotate(-1.5deg) scale(1.03)',
              width: 'calc(100% - 32px)', maxWidth: 420,
              zIndex: 1000, pointerEvents: 'none',
              background: 'var(--bg2)', border: '2px solid var(--accent)',
              borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              direction: 'rtl',
            }}>
              <span style={{ color: 'var(--accent)', fontSize: 18 }}>⠿</span>
              <span style={{ fontSize: 22 }}>{GAMES.find(g => g.id === dragId)?.icon}</span>
              <span style={{ color: '#fff', fontWeight: 800 }}>{GAMES.find(g => g.id === dragId)?.label}</span>
            </div>
          )}

          {order.map(id => {
            const g = GAMES.find(gg => gg.id === id);
            if (!g) return null;
            const isHidden     = hidden.has(id);
            const isExpanded   = expandedGameId === id;
            const restrictedTo = allowedUsers[id] || [];
            const isDragging   = dragId === id && dragActive;
            const isDragOver   = dragOverId === id && dragId !== id && dragActive;

            return (
              <div
                key={id}
                data-game-id={id}
                style={{
                  background: isDragging
                    ? `repeating-linear-gradient(45deg, #1e1e1e, #1e1e1e 8px, #2d2d30 8px, #2d2d30 16px)`
                    : (isHidden ? '#1a1a1a' : '#1e1e1e'),
                  border: `1px solid ${isDragOver ? 'var(--accent)' : '#3a3a3a'}`,
                  borderRadius: 10, opacity: isDragging ? 0.3 : (isHidden ? 0.6 : 1),
                  transition: 'all 0.12s',
                }}
              >
                {/* Row 1: drag handle + icon + label + visibility toggle + expand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                  <span
                    onPointerDown={e => onPointerDown(e, id)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    style={{
                      color: '#666', fontSize: 18, cursor: 'grab', flexShrink: 0,
                      touchAction: 'none', userSelect: 'none',
                      padding: '6px 8px', margin: '-6px -8px',
                    }}
                    title="גרור לשינוי סדר"
                  >⠿</span>

                  <span style={{ fontSize: 20, flexShrink: 0 }}>{g.icon}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: isHidden ? '#888' : '#fff', fontWeight: 700, fontSize: 13,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textDecoration: isHidden ? 'line-through' : 'none',
                    }}>
                      {g.label}
                    </div>
                    {restrictedTo.length > 0 && (
                      <div style={{ color: '#9b59b6', fontSize: 10, marginTop: 2 }}>
                        🔒 מוגבל ל-{restrictedTo.length} משתמשים
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => toggleVisible(id)}
                    title={isHidden ? 'הצג' : 'הסתר'}
                    style={{
                      background: isHidden ? '#3a1010' : '#1db95422',
                      border: `1px solid ${isHidden ? '#dc3545' : '#1db954'}`,
                      color: isHidden ? '#ff6b6b' : '#1db954',
                      borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {isHidden ? '🚫 מוסתר' : '👁 גלוי'}
                  </button>

                  <button
                    onClick={() => setExpandedGameId(isExpanded ? null : id)}
                    title="הגבלת משתמשים"
                    style={{
                      background: restrictedTo.length > 0 ? '#9b59b622' : '#1e1e1e',
                      border: `1px solid ${restrictedTo.length > 0 ? '#9b59b6' : '#444'}`,
                      color: restrictedTo.length > 0 ? '#c39bd3' : '#888',
                      borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    🔒
                  </button>
                </div>

                {/* Row 2: per-user restriction list (when expanded) */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #3a3a3a', padding: '10px 12px' }}>
                    <div style={{ color: '#888', fontSize: 11, marginBottom: 8, lineHeight: 1.6 }}>
                      <strong style={{ color: '#aaa' }}>הגבלה למשתמשים:</strong> אם תבחר משתמשים, רק הם יראו את המשחק (אדמינים תמיד רואים).
                      ריק = כולם יכולים לשחק.
                    </div>
                    {restrictedTo.length > 0 && (
                      <button
                        onClick={() => clearRestriction(id)}
                        style={{
                          background: 'none', border: '1px solid #444',
                          color: '#888', borderRadius: 8, padding: '4px 10px',
                          fontSize: 11, cursor: 'pointer', marginBottom: 8,
                        }}
                      >
                        ✕ נקה הגבלה (אפשר לכולם)
                      </button>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {users.length === 0 ? (
                        <span style={{ color: '#666', fontSize: 12 }}>טוען משתמשים...</span>
                      ) : users.filter(u => u.role !== 'admin').map(u => {
                        const allowed = restrictedTo.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() => toggleAllowedUser(id, u.id)}
                            style={{
                              background: allowed ? '#9b59b622' : '#1e1e1e',
                              border: `1px solid ${allowed ? '#9b59b6' : '#3a3a3a'}`,
                              color: allowed ? '#c39bd3' : '#888',
                              borderRadius: 14, padding: '4px 12px',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            {allowed ? '✓ ' : ''}{u.username}
                          </button>
                        );
                      })}
                    </div>
                    {users.length > 0 && users.every(u => u.role === 'admin') && (
                      <div style={{ color: '#666', fontSize: 11, marginTop: 6 }}>
                        אין משתמשים רגילים — אדמינים רואים את כל המשחקים בכל מקרה.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── DraggableCard wrapper ────────────────────────────────────────────────────
// Adds a wide ⠿ handle above each settings card and assigns CSS `order` so the
// flex-column parent renders cards in the user's chosen order. The dragged
// card becomes a "ghost slot" (faded + diagonal stripes) and the actual visual
// gets rendered as a floating ghost via SettingsDragGhost.
function DraggableCard({ idx, order, locked, handlers, isDragging, isDragOver, isDragMovingDown, children }) {
  return (
    <div
      data-section-idx={idx}
      style={{
        order,
        opacity: isDragging ? 0.25 : 1,
        background: isDragging
          ? `repeating-linear-gradient(45deg, var(--bg2), var(--bg2) 8px, var(--bg) 8px, var(--bg) 16px)`
          : 'transparent',
        borderRadius: isDragging ? 14 : 0,
        transition: isDragging ? 'none' : 'opacity 0.15s',
        position: 'relative',
        // Drop-target indicator: thick line on the edge where the dragged item will land
        ...(isDragOver && isDragMovingDown  ? { boxShadow: 'inset 0 -3px 0 var(--accent), 0 0 0 2px var(--accent-alpha)' } : {}),
        ...(isDragOver && !isDragMovingDown ? { boxShadow: 'inset 0  3px 0 var(--accent), 0 0 0 2px var(--accent-alpha)' } : {}),
      }}
    >
      {/* Drag handle — only rendered when sections are unlocked. When locked,
          we collapse the spacer entirely so cards sit flush with no orphan grip. */}
      {!locked && (
        <div
          {...handlers}
          style={{
            height: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#555', fontSize: 16, letterSpacing: 4,
            cursor: 'grab',
            touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
            marginBottom: 4, marginTop: -2,
            background: 'transparent',
            borderRadius: 8,
            transition: 'background 0.12s, color 0.12s',
          }}
          onPointerEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = '#888'; }}
          onPointerLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555'; }}
          title="גרור לשינוי סדר"
        >
          ⠿⠿⠿
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Floating drag ghost ──────────────────────────────────────────────────────
// Rendered at fixed position following the finger so the user always sees what
// they're moving — same UX as FavoritesScreen.
function SettingsDragGhost({ id, dragY, accent }) {
  const meta = SECTION_META[id];
  if (!meta || dragY == null) return null;
  return (
    <div style={{
      position: 'fixed',
      top: dragY - 30,
      left: '50%',
      transform: 'translateX(-50%) rotate(-1.5deg) scale(1.03)',
      width: 'calc(100% - 32px)', maxWidth: 440,
      zIndex: 1000, pointerEvents: 'none',
      background: 'var(--bg2)',
      border: `2px solid ${accent}`,
      borderRadius: 14,
      boxShadow: '0 10px 30px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      direction: 'rtl',
    }}>
      <span style={{ color: accent, fontSize: 22, opacity: 0.9 }}>⠿</span>
      <span style={{ fontSize: 22 }}>{meta.icon}</span>
      <span style={{ color: 'var(--text, #fff)', fontWeight: 800, fontSize: 16, flex: 1 }}>
        {meta.label}
      </span>
    </div>
  );
}
