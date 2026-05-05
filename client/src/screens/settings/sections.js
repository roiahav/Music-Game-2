// Settings-screen section identity, default order and per-section icon/label.
// Shared by SettingsScreen.jsx (the orchestrator) and the drag-ghost overlay
// rendered while the user reorders cards.

export const SECTION_ORDER_KEY = 'mg_settings_section_order';
export const SECTION_LOCK_KEY  = 'mg_settings_section_locked';

export const DEFAULT_SECTION_ORDER = [
  'games-mgmt', 'metadata', 'victory', 'playlists', 'onedrive',
  'users', 'activity-log', 'blacklist', 'email', 'invite', 'invite-templates',
];

// Labels rendered inside the floating ghost during drag, so the user can see
// what they're moving even though the actual card is just an empty placeholder.
export const SECTION_META = {
  'games-mgmt':        { icon: '🎮', label: 'ניהול משחקים' },
  'metadata':          { icon: '📝', label: 'עריכת תגיות שירים' },
  'victory':           { icon: '🏆', label: 'שיר ניצחון' },
  'playlists':         { icon: '🎵', label: 'פלייליסטים' },
  'onedrive':          { icon: '☁️', label: 'OneDrive — ספריית מוזיקה' },
  'users':             { icon: '👥', label: 'ניהול משתמשים' },
  'activity-log':      { icon: '📋', label: 'לוג פעילות' },
  'blacklist':         { icon: '🚫', label: 'שירים חסומים' },
  'email':             { icon: '📧', label: 'הגדרות מייל' },
  'invite':            { icon: '📨', label: 'הזמנת משתמשים' },
  'invite-templates':  { icon: '📝', label: 'תבניות הודעה' },
};
