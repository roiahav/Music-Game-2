import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAVORITES_PATH = join(__dirname, '..', 'favorites.json');

function load() {
  if (!existsSync(FAVORITES_PATH)) return {};
  try { return JSON.parse(readFileSync(FAVORITES_PATH, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  writeFileSync(FAVORITES_PATH, JSON.stringify(data, null, 2));
}

export function getUserFavorites(userId) {
  return load()[userId] || [];
}

export function addFavorite(userId, song) {
  const data = load();
  if (!data[userId]) data[userId] = [];
  if (!data[userId].find(s => s.id === song.id)) {
    data[userId].push(song);
  }
  save(data);
  return data[userId];
}

export function removeFavorite(userId, songId) {
  const data = load();
  if (!data[userId]) return [];
  data[userId] = data[userId].filter(s => s.id !== songId);
  save(data);
  return data[userId];
}

export function reorderFavorites(userId, orderedIds) {
  const data = load();
  if (!data[userId]) return [];
  const map = Object.fromEntries(data[userId].map(s => [s.id, s]));
  const reordered = orderedIds.map(id => map[id]).filter(Boolean);
  // keep any songs not mentioned (shouldn't happen, but safety)
  const mentioned = new Set(orderedIds);
  const rest = data[userId].filter(s => !mentioned.has(s.id));
  data[userId] = [...reordered, ...rest];
  save(data);
  return data[userId];
}
