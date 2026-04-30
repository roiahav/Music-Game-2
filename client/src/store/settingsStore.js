import { create } from 'zustand';
import { getSettings, saveSettings, getPlaylists } from '../api/client.js';

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
  loaded: false,

  async load() {
    try {
      const playlists = await getPlaylists();
      set({ playlists: playlists || [] });
    } catch {}

    try {
      const s = await getSettings();
      const serverGame = { ...DEFAULT_GAME, ...(s.game || {}) };
      // Merge: local prefs (timer/shuffle chosen by user) take priority
      const localPrefs = getLocalGame();
      set({ game: { ...serverGame, ...localPrefs }, spotify: s.spotify || {}, loaded: true });
    } catch {
      set({ loaded: true });
    }
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
