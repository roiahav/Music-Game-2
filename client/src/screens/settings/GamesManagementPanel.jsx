import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useSettingsStore } from '../../store/settingsStore.js';
import { getUsers } from '../../api/client.js';
import { getJSON, setJSON } from '../../utils/safeStorage.js';
import { GAMES, DEFAULT_GAME_ORDER } from '../../games-config.js';

const GAMES_MGMT_OPEN_KEY = 'mg_settings_games_mgmt_open';

const CATEGORY_RANK = { solo: 0, multi: 1, personal: 2 };
const CATEGORY_LABELS = {
  solo:     { icon: '🎧', text: 'משחקים יחידים' },
  multi:    { icon: '👥', text: 'משחקים קבוצתיים' },
  personal: { icon: '⭐', text: 'אישי' },
};

/**
 * Admin panel for the home-screen game inventory: hide/show, drag-reorder
 * within each category, and per-user whitelist. Persisted via the global
 * settings store under `gamesConfig`.
 */
export default function GamesManagementPanel() {
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
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolved order — falls back to defaults for games not in the saved order.
  // Always grouped by category (solo → multi → personal) so the home-screen
  // group buttons reflect what the admin sees here.
  const order = useMemo(() => {
    const saved = Array.isArray(gamesConfig?.order) ? gamesConfig.order : [];
    const known = new Set(GAMES.map(g => g.id));
    const merged = [
      ...saved.filter(id => known.has(id)),
      ...DEFAULT_GAME_ORDER.filter(id => !saved.includes(id)),
    ];
    const cat = id => CATEGORY_RANK[GAMES.find(g => g.id === id)?.category] ?? 99;
    return [...merged].sort((a, b) => cat(a) - cat(b));
  }, [gamesConfig]);

  function categoryOf(id) {
    return GAMES.find(g => g.id === id)?.category || 'personal';
  }

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
    // Only allow reorder within the same category — keeps the home-screen groups
    // consistent with what the admin sees here.
    if (categoryOf(fromId) !== categoryOf(toId)) return;
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

          {(() => {
            let lastCategory = null;
            return order.map(id => {
              const g = GAMES.find(gg => gg.id === id);
              if (!g) return null;
              const isHidden     = hidden.has(id);
              const isExpanded   = expandedGameId === id;
              const restrictedTo = allowedUsers[id] || [];
              const isDragging   = dragId === id && dragActive;
              const isDragOver   = dragOverId === id && dragId !== id && dragActive;
              const showHeading  = g.category !== lastCategory;
              lastCategory = g.category;
              const heading = showHeading ? CATEGORY_LABELS[g.category] : null;

              return (
                <Fragment key={id}>
                  {heading && (
                    <div style={{
                      marginTop: showHeading && lastCategory ? 10 : 0,
                      color: '#bbb', fontSize: 12, fontWeight: 700,
                      padding: '4px 4px 2px', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontSize: 14 }}>{heading.icon}</span>
                      <span>{heading.text}</span>
                    </div>
                  )}
                  <div
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
                </Fragment>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
