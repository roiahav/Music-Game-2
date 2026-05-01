import { create } from 'zustand';
import { getItem, setItem, removeItem, getJSON, setJSON } from '../utils/safeStorage.js';

const TOKEN_KEY = 'mg_token';
const USER_KEY = 'mg_user';

export const useAuthStore = create((set, get) => ({
  token: getItem(TOKEN_KEY) || null,
  user: getJSON(USER_KEY, null),

  login(token, user) {
    setItem(TOKEN_KEY, token);
    setJSON(USER_KEY, user);
    set({ token, user });
  },

  /** Merge fields into the stored user object (e.g. after completing profile) */
  patchUser(fields) {
    const merged = { ...get().user, ...fields };
    setJSON(USER_KEY, merged);
    set({ user: merged });
  },

  logout() {
    removeItem(TOKEN_KEY);
    removeItem(USER_KEY);
    set({ token: null, user: null });
  },
}));
