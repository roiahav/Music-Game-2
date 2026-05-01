import { create } from 'zustand';

const TOKEN_KEY = 'mg_token';
const USER_KEY = 'mg_user';

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: (() => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } })(),

  login(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  /** Merge fields into the stored user object (e.g. after completing profile) */
  patchUser(fields) {
    const merged = { ...get().user, ...fields };
    localStorage.setItem(USER_KEY, JSON.stringify(merged));
    set({ user: merged });
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  },
}));
