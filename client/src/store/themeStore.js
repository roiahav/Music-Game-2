import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useThemeStore = create(
  persist(
    (set) => ({
      themeId: 'dark',
      setTheme: (id) => set({ themeId: id }),
    }),
    { name: 'mg2-theme' }
  )
);
