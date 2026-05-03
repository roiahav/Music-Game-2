import axios from 'axios';
import { getItem, removeItem } from '../utils/safeStorage.js';

const TOKEN_KEY = 'mg_token';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      removeItem(TOKEN_KEY);
      removeItem('mg_user');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const loginApi = (username, password) => api.post('/auth/login', { username, password }).then(r => r.data);
export const logoutApi = () => api.post('/auth/logout');
export const getMeApi = () => api.get('/auth/me').then(r => r.data);
export const completeProfileApi = (data) => api.post('/auth/complete-profile', data).then(r => r.data);
export const forgotPasswordApi = (email) => api.post('/auth/forgot-password', { email }).then(r => r.data);
export const resetPasswordWithTokenApi = (token, newPassword) => api.post('/auth/reset-password', { token, newPassword }).then(r => r.data);

// Invites (admin)
export const createInviteApi = (data) => api.post('/invites', data).then(r => r.data);
export const listInvitesApi = () => api.get('/invites').then(r => r.data);
export const deleteInviteApi = (token) => api.delete(`/invites/${token}`).then(r => r.data);
// Invites (public)
export const validateInviteApi = (token) => api.get(`/invites/${token}`).then(r => r.data);
export const registerInviteApi = (token, data) => api.post(`/invites/${token}/register`, data).then(r => r.data);
// User approval (admin)
export const approveUserApi = (id) => api.post(`/users/${id}/approve`).then(r => r.data);

// Admin stats (aggregated metrics)
export const getAdminStatsApi = () => api.get('/admin/stats').then(r => r.data);

// Backup / restore (admin)
export const previewBackupApi = (data) => api.post('/backup/preview', data, { maxContentLength: Infinity, maxBodyLength: Infinity }).then(r => r.data);
export const importBackupApi  = (data) => api.post('/backup/import',  data, { maxContentLength: Infinity, maxBodyLength: Infinity }).then(r => r.data);
// For export we trigger a download via window.location instead of axios so
// the browser handles the Content-Disposition response naturally.

// Users (admin)
export const getUsers = () => api.get('/users').then(r => r.data);
export const createUserApi = (username, password, role) => api.post('/users', { username, password, role }).then(r => r.data);
export const resetPasswordApi = (id, password) => api.post(`/users/${id}/reset-password`, { password });
export const updateUserApi = (id, fields) => api.patch(`/users/${id}`, fields).then(r => r.data);
export const deleteUserApi = id => api.delete(`/users/${id}`);

// Activity log (admin)
export const getActivityLog = () => api.get('/activity').then(r => r.data);

// Avatar
export const uploadAvatar = (imageData) => api.post('/users/me/avatar', { imageData });
export const getAvatarUrl = (userId) => `/api/users/${userId}/avatar`;

// Playlists
export const getPlaylists = () => api.get('/playlists').then(r => r.data);
export const getPlaylistSongs = id => api.get(`/playlists/${id}/songs`).then(r => r.data);

// Settings
export const getSettings = () => api.get('/settings').then(r => r.data);
export const saveSettings = data => api.post('/settings', data);
export const testEmailSettings = () => api.post('/settings/test-email').then(r => r.data);
export const addPlaylist = data => api.post('/settings/playlists', data);
export const updatePlaylist = data => api.post('/settings/playlists', data);
export const deletePlaylist = id => api.delete(`/settings/playlists/${id}`);

// Spotify
export const getSpotifyStatus = () => api.get('/spotify/status').then(r => r.data);
export const getUserSpotifyPlaylists = () => api.get('/spotify/playlists').then(r => r.data);
export const spotifyPlay = (uris, deviceId) => api.post('/spotify/play', { uris, deviceId });
export const spotifyPause = () => api.post('/spotify/pause');
export const spotifyResume = () => api.post('/spotify/resume');
export const spotifySeek = positionMs => api.post('/spotify/seek', { positionMs });
export const spotifyVolume = volume => api.post('/spotify/volume', { volume });
export const getSpotifyPlayer = () => api.get('/spotify/player').then(r => r.data);

// Blacklist (admin)
export const getBlacklist = () => api.get('/blacklist').then(r => r.data);
export const addToBlacklist = (songId) => api.post(`/blacklist/${songId}`).then(r => r.data);
export const removeFromBlacklist = (songId) => api.delete(`/blacklist/${songId}`).then(r => r.data);

// Favorites
export const getFavorites = () => api.get('/favorites').then(r => r.data);
export const addFavorite = (songId, song) => api.post(`/favorites/${songId}`, song).then(r => r.data);
export const removeFavorite = (songId) => api.delete(`/favorites/${songId}`).then(r => r.data);
export const reorderFavorites = (ids) => api.patch('/favorites/reorder', { ids }).then(r => r.data);

// Admin music library (admin)
export const getMusicStats = () => api.get('/admin/music/stats').then(r => r.data);
export const listMusicFiles = (playlistId) => api.get(`/admin/music/list/${playlistId}`).then(r => r.data);
export const deleteMusicFile = (playlistId, filename) =>
  api.delete('/admin/music/file', { params: { playlistId, filename } }).then(r => r.data);
export const uploadMusicFiles = (playlistId, files, onProgress) => {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  return api.post(`/admin/music/upload?playlistId=${encodeURIComponent(playlistId)}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  }).then(r => r.data);
};

// OneDrive sync (admin)
export const getOneDriveStatus = () => api.get('/onedrive/status').then(r => r.data);
export const probeOneDrive = () => api.post('/onedrive/probe').then(r => r.data);
export const syncOneDrive = (deleteMissing = false) => api.post('/onedrive/sync', { deleteMissing }).then(r => r.data);
export const updateOneDriveSettings = (cfg) => api.put('/onedrive/settings', cfg).then(r => r.data);
