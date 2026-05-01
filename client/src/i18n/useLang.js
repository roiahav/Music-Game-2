import { useLangStore, getLangDir } from '../store/langStore.js';
import { T } from './translations.js';

/** Replace {key} placeholders in a template string */
function fill(tpl, vars) {
  if (!vars) return tpl;
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), tpl);
}

export function useLang() {
  const lang = useLangStore(s => s.lang);
  const dir  = getLangDir(lang);

  function t(key, vars) {
    const row = T[key];
    if (!row) return key;
    const tpl = row[lang] ?? row['he'] ?? key;
    return fill(tpl, vars);
  }

  return { t, lang, dir };
}
