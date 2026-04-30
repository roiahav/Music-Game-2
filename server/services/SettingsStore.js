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
  },
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
