import {
  createRoom, joinRoom, removePlayer, getRoomBySocket,
  serializePlayers, applyAnswer, resetRoundDeltas, getRoundWinner,
} from './services/MultiplayerService.js';
import { getSettings } from './services/SettingsStore.js';
import { scanFolder } from './services/FileScanner.js';
import { getSongMetadata } from './services/MetadataService.js';
import { getPlaylistTracks } from './services/SpotifyService.js';
import { readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac']);

function pickRandomVictorySong(folder) {
  if (!folder || !existsSync(folder)) return null;
  try {
    const files = readdirSync(folder).filter(f => AUDIO_EXT.has(extname(f).toLowerCase()));
    if (!files.length) return null;
    const picked = files[Math.floor(Math.random() * files.length)];
    return join(folder, picked);
  } catch {
    return null;
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadPlaylistSongs(playlistId) {
  const settings = getSettings();
  const { playlists, blacklist = [] } = settings;
  const bl = new Set(blacklist);
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) throw new Error('פלייליסט לא נמצא');
  if (playlist.type === 'local') {
    const files = scanFolder(playlist.path);
    // Process in small batches to avoid OOM on low-RAM devices (e.g. QNAP ARM)
    const BATCH = 15;
    const songs = [];
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(f => getSongMetadata(f)));
      songs.push(...results);
    }
    return songs
      .filter(s => !bl.has(s.id))
      .map(s => ({
        ...s,
        audioUrl: `/api/audio/${encodeURIComponent(s.filePath)}`,
        coverUrl: s.hasCover ? `/api/cover/${encodeURIComponent(s.filePath)}` : null,
      }));
  }
  if (playlist.type === 'spotify') {
    const id = playlist.spotifyUri.split(':').pop();
    const tracks = await getPlaylistTracks(id);
    return tracks.filter(s => !bl.has(s.id));
  }
  return [];
}

function sendNextSong(io, room) {
  room.currentSongIndex++;
  if (room.currentSongIndex >= room.songs.length) {
    endGame(io, room);
    return;
  }
  clearTimeout(room.revealTimer);
  clearTimeout(room.scoreTimer);
  room.answersReceived = 0;
  resetRoundDeltas(room);

  const song = room.songs[room.currentSongIndex];
  const songData = {
    index: room.currentSongIndex + 1,
    total: room.songs.length,
    songId: song.id || `s-${room.currentSongIndex}`,
    audioUrl: song.audioUrl || '',
    coverUrl: song.coverUrl || null,
    title: song.title || '',
    artist: song.artist || '',
    year: String(song.year || ''),
  };
  io.to(room.code).emit('mp:song', songData);

  if (room.timerSeconds > 0) {
    room.revealTimer = setTimeout(() => triggerReveal(io, room), room.timerSeconds * 1000);
  }
}

function triggerReveal(io, room) {
  clearTimeout(room.revealTimer);
  room.answersReceived = 0;
  io.to(room.code).emit('mp:reveal');
  room.scoreTimer = setTimeout(() => broadcastScores(io, room), 2000);
}

function broadcastScores(io, room) {
  clearTimeout(room.scoreTimer);
  const roundWinner = getRoundWinner(room);
  io.to(room.code).emit('mp:score_update', {
    players: serializePlayers(room),
    roundWinner: roundWinner || null,
  });
}

function endGame(io, room) {
  clearTimeout(room.revealTimer);
  clearTimeout(room.scoreTimer);
  room.status = 'ended';
  const { game } = getSettings();
  // Prefer random file from folder (if enabled); fall back to single file
  const folderEnabled = game.victoryFolderEnabled !== false;
  const victoryFilePath = (folderEnabled && game.victoryAudioFolder && pickRandomVictorySong(game.victoryAudioFolder))
    || game.victoryAudioPath
    || null;
  const victoryAudioUrl = victoryFilePath
    ? `/api/audio/${encodeURIComponent(victoryFilePath)}`
    : null;
  io.to(room.code).emit('mp:ended', {
    players: serializePlayers(room),
    victoryAudioUrl,
    victoryStartSeconds: Number(game.victoryStartSeconds) || 0,
  });
}

export function setupMultiplayer(io) {
  io.on('connection', socket => {

    socket.on('mp:create', ({ name, userId }) => {
      if (!name?.trim()) return;
      const room = createRoom(socket.id, name, userId || null);
      socket.join(room.code);
      socket.emit('mp:created', { code: room.code, players: serializePlayers(room) });
    });

    socket.on('mp:join', ({ code, name, userId }) => {
      if (!code || !name?.trim()) return;
      const result = joinRoom(code.trim(), socket.id, name, userId || null);
      if (result.error) { socket.emit('mp:error', { message: result.error }); return; }
      socket.join(code.trim());
      socket.emit('mp:joined', { code: code.trim(), players: serializePlayers(result.room), isHost: false });
      socket.to(code.trim()).emit('mp:room_update', { players: serializePlayers(result.room) });
    });

    socket.on('mp:start', async ({ playlistId, playlistIds, songCount, timerSeconds, excludedDecades }) => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      room.songCount = Number(songCount) || 10;
      room.timerSeconds = Number(timerSeconds) || 30;
      room.status = 'playing';
      // Support both single playlistId (legacy) and multiple playlistIds
      const ids = playlistIds?.length ? playlistIds : (playlistId ? [playlistId] : []);
      if (!ids.length) { socket.emit('mp:error', { message: 'לא נבחר פלייליסט' }); return; }
      try {
        const results = await Promise.all(ids.map(id => loadPlaylistSongs(id)));
        // Deduplicate by song id
        const seen = new Set();
        let songs = results.flat().filter(s => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
        // Apply decade filter
        if (excludedDecades && excludedDecades.length > 0) {
          const exSet = new Set(excludedDecades);
          const filtered = songs.filter(s => {
            if (!s.year) return true;
            const d = String(Math.floor(Number(s.year) / 10) * 10);
            return !exSet.has(d);
          });
          if (filtered.length > 0) songs = filtered;
        }
        songs = shuffle(songs);
        if (room.songCount > 0) songs = songs.slice(0, room.songCount);
        room.songs = songs;
        room.currentSongIndex = -1;
        io.to(room.code).emit('mp:started', { total: songs.length });
        sendNextSong(io, room);
      } catch (e) {
        socket.emit('mp:error', { message: `שגיאה בטעינת שירים: ${e.message}` });
      }
    });

    socket.on('mp:answer', (answer) => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.status !== 'playing') return;
      applyAnswer(room, socket.id, answer);
      room.answersReceived++;
      if (room.answersReceived >= room.players.size) {
        broadcastScores(io, room);
      }
    });

    socket.on('mp:host_reveal', () => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      triggerReveal(io, room);
    });

    socket.on('mp:host_next', () => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      sendNextSong(io, room);
    });

    socket.on('mp:end_game', () => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      endGame(io, room);
    });

    socket.on('mp:host_seek', ({ seconds }) => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      io.to(room.code).emit('mp:seek', { seconds: Number(seconds) || 30 });
    });

    socket.on('mp:mute_all', () => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      socket.to(room.code).emit('mp:muted', { muted: true });
    });

    socket.on('mp:unmute_all', () => {
      const room = getRoomBySocket(socket.id);
      if (!room || room.hostSocketId !== socket.id) return;
      socket.to(room.code).emit('mp:muted', { muted: false });
    });

    socket.on('disconnect', () => {
      const room = removePlayer(socket.id);
      if (room) io.to(room.code).emit('mp:room_update', { players: serializePlayers(room) });
    });
  });
}
