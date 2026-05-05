import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore.js';
import { addPlaylist, getPlaylists } from '../api/client.js';
import { useLang } from '../i18n/useLang.js';
import SpotifyConnectPanel from '../components/SpotifyConnectPanel.jsx';
import SettingsPlaylistRow from '../components/SettingsPlaylistRow.jsx';
import FolderBrowser from '../components/FolderBrowser.jsx';
import AdminBlacklistSection from '../components/AdminBlacklistSection.jsx';
import OneDrivePanel from '../components/OneDrivePanel.jsx';
import MobileMetadataPanel from '../components/MobileMetadataPanel.jsx';
import AdminUsersScreen, { ActivityTab } from '../screens/AdminUsersScreen.jsx';
import { getJSON, setJSON } from '../utils/safeStorage.js';
import EmailSettingsPanel from './settings/EmailSettingsPanel.jsx';
import VictoryFilePicker from './settings/VictoryFilePicker.jsx';
import GamesManagementPanel from './settings/GamesManagementPanel.jsx';
import InviteSettingsPanel from './settings/InviteSettingsPanel.jsx';
import InviteTemplatesPanel from './settings/InviteTemplatesPanel.jsx';
import { DraggableCard, SettingsDragGhost } from './settings/DraggableCard.jsx';
import { SECTION_ORDER_KEY, SECTION_LOCK_KEY, DEFAULT_SECTION_ORDER } from './settings/sections.js';

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

