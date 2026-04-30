import { getSettings, updateSpotifyTokens } from './SettingsStore.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

async function refreshAccessToken() {
  const s = getSettings();
  const { clientId, clientSecret, refreshToken } = s.spotify;
  if (!refreshToken) return null;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000;
  updateSpotifyTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    tokenExpiresAt: expiresAt,
  });
  return data.access_token;
}

async function getToken() {
  const s = getSettings();
  const { accessToken, tokenExpiresAt } = s.spotify;
  if (accessToken && Date.now() < tokenExpiresAt - 30000) return accessToken;
  return await refreshAccessToken();
}

async function spotifyFetch(path, options = {}) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Spotify');
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Spotify API error ${res.status}`);
  }
  return res.json();
}

export async function getStatus() {
  try {
    const me = await spotifyFetch('/me');
    return { connected: true, userName: me.display_name };
  } catch {
    return { connected: false };
  }
}

export async function getUserPlaylists() {
  const data = await spotifyFetch('/me/playlists?limit=50');
  return data.items
    .filter(p => p && p.id)
    .map(p => ({ id: p.id, name: p.name, uri: p.uri, tracks: p.tracks?.total ?? 0 }));
}

export async function getPlaylistTracks(playlistId) {
  const songs = [];
  let url = `/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,uri,name,artists,album(name,release_date,images)))`;

  while (url) {
    const data = await spotifyFetch(url);
    for (const item of data.items) {
      const t = item.track;
      if (!t || t.is_local) continue;
      const year = (t.album.release_date || '').slice(0, 4);
      const coverUrl = t.album.images?.[0]?.url || '';
      songs.push({
        id: t.id,
        spotifyUri: t.uri,
        title: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        album: t.album.name,
        year,
        coverUrl,
        source: 'spotify',
      });
    }
    url = data.next ? data.next.replace(SPOTIFY_API, '') : null;
  }
  return songs;
}

export async function play(deviceId, uris) {
  const body = uris ? JSON.stringify({ uris }) : '{}';
  const qs = deviceId ? `?device_id=${deviceId}` : '';
  await spotifyFetch(`/me/player/play${qs}`, { method: 'PUT', body });
}

export async function pause() {
  await spotifyFetch('/me/player/pause', { method: 'PUT' });
}

export async function resume() {
  await spotifyFetch('/me/player/play', { method: 'PUT', body: '{}' });
}

export async function seek(positionMs) {
  await spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' });
}

export async function setVolume(volumePercent) {
  await spotifyFetch(`/me/player/volume?volume_percent=${volumePercent}`, { method: 'PUT' });
}

export async function getPlayerState() {
  return await spotifyFetch('/me/player');
}

export { getToken };
