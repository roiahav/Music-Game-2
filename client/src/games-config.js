/**
 * Single source of truth for all home-screen games.
 * Order, visibility and per-user restrictions are stored in settings.json
 * (under settings.games) and merged on top of these defaults at render time.
 */
export const GAMES = [
  {
    id: 'solo', screen: 'solo', tab: 'game',
    icon: '🎧', label: 'משחק יחיד',
    descKey: 'solo_desc',
    bg: '#007ACC', subColor: '#a8d4f5',
  },
  {
    id: 'multiplayer', screen: 'multiplayer',
    icon: '🎮', label: 'משחק קבוצתי',
    descKey: 'group_desc',
    bg: '#1db954', subColor: '#a8f5c4',
  },
  {
    id: 'solo-typing', screen: 'solo-typing',
    icon: '🎤', label: 'ניחוש חופשי',
    descKey: 'free_desc',
    bg: '#9b59b6', subColor: '#d7b8f5',
  },
  {
    id: 'years', screen: 'years-chooser',
    icon: '📅', label: 'זיהוי שנים',
    descKey: 'years_desc',
    bg: '#f39c12', subColor: '#fde8b0',
  },
  {
    id: 'champion', screen: 'champion-chooser',
    icon: '🥇', label: 'אלוף הזיהויים',
    descRaw: 'זמר, שיר ושנה — 3 קוביות לכל שיר',
    bg: '#C9A227', subColor: '#fff5c5',
  },
  {
    id: 'ladders-hits', screen: 'ladders-hits',
    icon: '🎲', label: 'סולמות ולהיטים',
    descRaw: 'משחק קבוצתי על לוח — נחש, הטל קובייה והגיע ראשון לסיום',
    bg: '#16a085', subColor: '#a8f5e1',
  },
  {
    id: 'favorites', screen: 'favorites',
    icon: '❤️', label: 'המועדפים שלי',
    descKey: 'favorites_desc',
    bg: '#e74c3c', subColor: '#f5a8a8',
  },
];

export const DEFAULT_GAME_ORDER = GAMES.map(g => g.id);

/** Look up a game by id. */
export function findGame(id) {
  return GAMES.find(g => g.id === id) || null;
}

/**
 * Apply admin settings (order + hidden + restrictions) on top of the defaults
 * and filter to what the given user is allowed to see.
 *
 *   gamesConfig: {
 *     order:   ['game-id-1', 'game-id-2', ...],
 *     hidden:  ['game-id-x', ...],                       // hidden from EVERYONE
 *     allowedUsers: { 'game-id': ['userId1', 'userId2'] } // empty/missing = everyone allowed
 *   }
 *
 * Admins (role === 'admin') always see every game, regardless of hidden /
 * allowedUsers — so they can configure and test without locking themselves out.
 */
export function getVisibleGames(gamesConfig, currentUser) {
  const cfg = gamesConfig || {};
  const order  = Array.isArray(cfg.order) ? cfg.order : DEFAULT_GAME_ORDER;
  const hidden = new Set(Array.isArray(cfg.hidden) ? cfg.hidden : []);
  const allowedUsers = cfg.allowedUsers || {};
  const isAdmin = currentUser?.role === 'admin';

  // Resolve order, fall back to defaults for any new games not in saved order
  const resolved = [
    ...order.filter(id => GAMES.some(g => g.id === id)),
    ...DEFAULT_GAME_ORDER.filter(id => !order.includes(id)),
  ];

  return resolved
    .map(id => findGame(id))
    .filter(Boolean)
    .filter(game => {
      // Globally hidden — applies to everyone, including admins. Admins can
      // still re-show games from the settings panel (which renders GAMES directly).
      if (hidden.has(game.id)) return false;
      // Admins bypass per-user whitelist so they can always test
      if (isAdmin) return true;
      // Per-user whitelist (only applies when non-empty)
      const allowed = allowedUsers[game.id];
      if (Array.isArray(allowed) && allowed.length > 0) {
        return allowed.includes(currentUser?.id);
      }
      return true;
    });
}
