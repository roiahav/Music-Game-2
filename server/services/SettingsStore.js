import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', 'settings.json');

const DEFAULT_SETTINGS = {
  playlists: [],
  spotify: {
    clientId: '',
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    tokenExpiresAt: 0,
  },
  game: {
    shuffle: true,
    hintsEnabled: true,
    timerSeconds: 30,
    victoryAudioPath: '',
    victoryAudioFolder: '',
    victoryFolderEnabled: true,
    victoryStartSeconds: 0,
  },
  email: {
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    fromName: 'Music Game',
    fromEmail: '',
  },
  blacklist: [],
  // Per-game admin controls for the home screen:
  //   order:        explicit display order (game ids); missing ids fall back to defaults
  //   hidden:       game ids hidden from EVERYONE (admins still see them)
  //   allowedUsers: { gameId: [userId, ...] } — non-empty array = only those users see it
  games: {
    order: [],
    hidden: [],
    allowedUsers: {},
  },
  // OneDrive sync — uploads to OneDrive get pulled down to the local music
  // folder periodically. Configured server-side via rclone; this object is the
  // app-level config + last-run state surfaced in the UI.
  onedrive: {
    enabled: false,                  // master toggle
    remoteName: 'onedrive',          // rclone remote name (matches `rclone config`)
    remoteFolder: 'Music Game/Songs',// folder on OneDrive to mirror
    localFolder: '/home/oren/music', // destination on the server
    syncIntervalMinutes: 5,          // 0 = manual only
    lastSyncAt: 0,                   // ms timestamp
    lastSyncOk: null,                // null=never, true=success, false=failed
    lastSyncMessage: '',             // short human-readable status
    lastSyncStats: null,             // { added, removed, changed, totalFiles, sizeBytes }
  },
  inviteTemplates: [
    {
      id: 'tmpl-default',
      name: 'ידידותי',
      body: 'היי {firstName}! 🎵\nהוזמנת להצטרף ל-Music Game — חידון מוזיקה משעשע.\n\n👉 לחץ להרשמה: {url}\n\nהקישור בתוקף ל-7 ימים.',
    },
    {
      id: 'tmpl-formal',
      name: 'רשמי',
      body: 'שלום {firstName} {lastName},\n\nהוזמנת להצטרף לאפליקציית Music Game.\nלהרשמה: {url}\n\nהקישור בתוקף ל-7 ימים.',
    },
    {
      id: 'tmpl-family',
      name: 'משפחתי',
      body: 'שלום {firstName} 💙\nהוזמנת ל-Music Game — חידון מוזיקה למשפחה!\n\nהירשם כאן 👇\n{url}',
    },
  ],
};

function load() {
  if (!existsSync(SETTINGS_PATH)) return structuredClone(DEFAULT_SETTINGS);
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function save(settings) {
  const tmp = SETTINGS_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
  writeFileSync(SETTINGS_PATH, readFileSync(tmp, 'utf-8'), 'utf-8');
}

export function getSettings() {
  return load();
}

export function saveSettings(settings) {
  save(settings);
}

export function updateSpotifyTokens({ accessToken, refreshToken, tokenExpiresAt }) {
  const s = load();
  s.spotify.accessToken = accessToken;
  s.spotify.refreshToken = refreshToken;
  s.spotify.tokenExpiresAt = tokenExpiresAt;
  save(s);
}
