import { create } from 'zustand';
import { getSettings, getGamesConfig, saveSettings, getPlaylists } from '../api/client.js';

const GAME_LS_KEY = 'mg_game_prefs';
const DEFAULT_GAME = { shuffle: true, hintsEnabled: true, timerSeconds: 30, victoryAudioPath: '' };

function getLocalGame() {
  try { return JSON.parse(localStorage.getItem(GAME_LS_KEY)) || {}; } catch { return {}; }
}

export const useSettingsStore = create((set, get) => ({
  playlists: [],
  game: { ...DEFAULT_GAME, ...getLocalGame() },
  spotify: { clientId: '', clientSecret: '' },
  spotifyStatus: { connected: false },
  games: { order: [], hidden: [], allowedUsers: {} },
  loaded: false,

  async load() {
    try {
      const playlists = await getPlaylists();
      set({ playlists: playlists || [] });
    } catch {}

    // Games config — public-safe, available to every authenticated user so the
    // home screen can apply admin-chosen order/hidden/allowedUsers for everyone.
    try {
      const games = await getGamesConfig();
      set({ games: games || { order: [], hidden: [], allowedUsers: {} } });
    } catch {}

    // Full settings — admin-only. Non-admins get 403 here, which is fine; we
    // still want to attempt it so admins get spotify/email/etc. on first load.
    try {
      const s = await getSettings();
      const serverGame = { ...DEFAULT_GAME, ...(s.game || {}) };
      // Merge: local prefs (timer/shuffle chosen by user) take priority
      const localPrefs = getLocalGame();
      set({
        game: { ...serverGame, ...localPrefs },
        spotify: s.spotify || {},
        games: s.games || get().games,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  async saveGamesConfig(games) {
    set({ games });
    try { await saveSettings({ games }); } catch {}
  },

  async saveGame(game) {
    const merged = { ...get().game, ...game };
    set({ game: merged });
    localStorage.setItem(GAME_LS_KEY, JSON.stringify(merged));
    try { await saveSettings({ game: merged }); } catch {}
  },

  async saveSpotify(spotify) {
    const s = get();
    set({ spotify: { ...s.spotify, ...spotify } });
    await saveSettings({ spotify: { ...s.spotify, ...spotify } });
  },

  setPlaylists(playlists) { set({ playlists }); },
  setSpotifyStatus(status) { set({ spotifyStatus: status }); },
}));
