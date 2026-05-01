import { create } from 'zustand';
import { LANGS } from '../i18n/translations.js';

const DEFAULT = 'he';

function getSaved() {
  try { return localStorage.getItem('mg_lang') || DEFAULT; } catch { return DEFAULT; }
}

export const useLangStore = create((set) => ({
  lang: getSaved(),
  setLang: (code) => {
    try { localStorage.setItem('mg_lang', code); } catch {}
    set({ lang: code });
  },
}));

export function getLangDir(code) {
  return LANGS.find(l => l.code === code)?.dir || 'rtl';
}
