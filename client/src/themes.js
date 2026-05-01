export const THEMES = {
  dark: {
    id: 'dark',
    label: 'כחול',
    labelEn: 'Blue',
    swatch: '#007ACC',
    bg:      '#1e1e1e',
    bg2:     '#2d2d30',
    bg3:     '#252526',
    border:  '#3a3a3a',
    border2: '#2d2d30',
    accent:  '#007ACC',
    accentAlpha: '#007ACC33',
    text:    '#ffffff',
    text2:   '#888888',
    text3:   '#555555',
  },
  galaxy: {
    id: 'galaxy',
    label: 'גלקסי',
    labelEn: 'Galaxy',
    swatch: '#9b59b6',
    bg:      '#0d0920',
    bg2:     '#1c1535',
    bg3:     '#160f2a',
    border:  '#3a2a5a',
    border2: '#2a1f45',
    accent:  '#9b59b6',
    accentAlpha: '#9b59b633',
    text:    '#ffffff',
    text2:   '#b8a8d0',
    text3:   '#7a6a90',
  },
  forest: {
    id: 'forest',
    label: 'יער',
    labelEn: 'Forest',
    swatch: '#1db954',
    bg:      '#091a0e',
    bg2:     '#122b19',
    bg3:     '#0e2214',
    border:  '#1e4a28',
    border2: '#163820',
    accent:  '#1db954',
    accentAlpha: '#1db95433',
    text:    '#ffffff',
    text2:   '#88b898',
    text3:   '#507060',
  },
  sunset: {
    id: 'sunset',
    label: 'שקיעה',
    labelEn: 'Sunset',
    swatch: '#e67e22',
    bg:      '#1a0e08',
    bg2:     '#2e1c10',
    bg3:     '#241408',
    border:  '#5a3020',
    border2: '#421f10',
    accent:  '#e67e22',
    accentAlpha: '#e67e2233',
    text:    '#ffffff',
    text2:   '#c09878',
    text3:   '#806050',
  },
};

export const THEME_LIST = Object.values(THEMES);

export function applyTheme(theme) {
  const r = document.documentElement.style;
  r.setProperty('--bg',           theme.bg);
  r.setProperty('--bg2',          theme.bg2);
  r.setProperty('--bg3',          theme.bg3);
  r.setProperty('--border',       theme.border);
  r.setProperty('--border2',      theme.border2);
  r.setProperty('--accent',       theme.accent);
  r.setProperty('--accent-alpha', theme.accentAlpha);
  r.setProperty('--text',         theme.text);
  r.setProperty('--text2',        theme.text2);
  r.setProperty('--text3',        theme.text3);
}
