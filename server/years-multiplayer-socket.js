import { getSettings } from './services/SettingsStore.js';
import { scanFolder } from './services/FileScanner.js';
import { getSongMetadata } from './services/MetadataService.js';
import { getPlaylistTracks } from './services/SpotifyService.js';
import { readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { generateRoomCode } from './utils/roomCode.js';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac']);

function pickRandomVictorySong(folder) {
  if (!folder || !existsSync(folder)) return null;
  try {
    const files = readdirSync(folder).filter(f => AUDIO_EXT.has(extname(f).toLowerCase()));
    if (!files.length) return null;
    return join(folder, files[Math.floor(Math.random() * files.length)]);
  } catch { return null; }
}

// ── State ──────────────────────────────────────────────────────────────────────
const rooms = new Map();       // code → room
const socketToRoom = new Map(); // socketId → code

// Points awarded per claim order in a round (1st fastest = most points)
const CLAIM_POINTS = [3, 2, 2, 1];
const SONGS_PER_ROUND = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  return generateRoomCode(c => rooms.has(c));
}

function serializePlayers(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map(p => ({
      socketId: p.socketId,
      name: p.name,
      userId: p.userId,
      score: p.score,
      isHost: p.socketId === room.hostSocketId,
    }));
}

// ── Song loading (mirrors multiplayer-socket.js) ───────────────────────────────
async function loadSongs(playlistIds) {
  const settings = getSettings();
  const { playlists, blacklist = [] } = settings;
  const bl = new Set(blacklist);
  const all = [];

  for (const pid of playlistIds) {
    const pl = playlists.find(p => p.id === pid);
    if (!pl) continue;

    if (pl.type === 'local') {
      const files = scanFolder(pl.path);
      const BATCH = 15;
      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const meta = await Promise.all(batch.map(f => getSongMetadata(f)));
        all.push(...meta);
      }
    } else if (pl.type === 'spotify') {
      const id = pl.spotifyUri.split(':').pop();
      const tracks = await getPlaylistTracks(id);
      all.push(...tracks);
    }
  }

  const seen = new Set();
  return all
    .filter(s => s.year && !bl.has(s.id))
    .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
    .map(s => ({
      ...s,
      audioUrl: s.audioUrl || `/api/audio/${encodeURIComponent(s.filePath)}`,
      coverUrl: s.hasCover ? `/api/cover/${encodeURIComponent(s.filePath)}` : (s.coverUrl || null),
    }));
}

// Pick 4 songs with unique years if possible
function pickRoundSongs(allSongs) {
  const shuffled = shuffle(allSongs);
  const picked = [];
  const usedYears = new Set();
  for (const s of shuffled) {
    if (!usedYears.has(s.year)) {
      picked.push(s);
      usedYears.add(s.year);
      if (picked.length === SONGS_PER_ROUND) break;
    }
  }
  if (picked.length < SONGS_PER_ROUND) {
    for (const s of shuffled) {
      if (!picked.find(p => p.id === s.id)) picked.push(s);
      if (picked.length === SONGS_PER_ROUND) break;
    }
  }
  return picked;
}

// ── Round flow ─────────────────────────────────────────────────────────────────
function sendRound(io, room) {
  room.roundIndex++;
  if (room.roundIndex >= room.totalRounds) {
    endGame(io, room);
    return;
  }

  clearTimeout(room.roundTimer);

  const roundSongs = pickRoundSongs(room.allSongs);
  const yearOptions = shuffle(roundSongs.map(s => s.year));

  room.currentRound = {
    roundNum: room.roundIndex + 1,
    roundSongs,
    yearOptions,
    claims: {},    // songId → { socketId, name, year, points }
    claimOrder: 0,
    ended: false,
  };

  // Send songs WITHOUT year/title/artist — revealed only at round end
  io.to(room.code).emit('ygm:round', {
    roundNum: room.currentRound.roundNum,
    total: room.totalRounds,
    songs: roundSongs.map(s => ({
      id: s.id,
      audioUrl: s.audioUrl,
      coverUrl: s.coverUrl || null,
    })),
    yearOptions,
    timerSeconds: room.timerSeconds,
  });

  if (room.timerSeconds > 0) {
    room.roundTimer = setTimeout(() => finishRound(io, room), room.timerSeconds * 1000);
  }
}

function finishRound(io, room) {
  if (!room.currentRound || room.currentRound.ended) return;
  clearTimeout(room.roundTimer);
  room.currentRound.ended = true;

  io.to(room.code).emit('ygm:round_end', {
    claims: room.currentRound.claims,
    roundSongs: room.currentRound.roundSongs.map(s => ({
      id: s.id,
      year: s.year,
      title: s.title || '',
      artist: s.artist || '',
      audioUrl: s.audioUrl,
      coverUrl: s.coverUrl || null,
    })),
    players: serializePlayers(room),
  });
}

function endGame(io, room) {
  clearTimeout(room.roundTimer);
  room.status = 'ended';
  const { game } = getSettings();
  const folderEnabled = game.victoryFolderEnabled !== false;
  const victoryFilePath =
    (folderEnabled && game.victoryAudioFolder && pickRandomVictorySong(game.victoryAudioFolder))
    || game.victoryAudioPath
    || null;
  const victoryAudioUrl = victoryFilePath
    ? `/api/audio/${encodeURIComponent(victoryFilePath)}`
    : null;
  io.to(room.code).emit('ygm:ended', {
    players: serializePlayers(room),
    victoryAudioUrl,
    victoryStartSeconds: Number(game.victoryStartSeconds) || 0,
  });
}

// ── Main export ────────────────────────────────────────────────────────────────
export function setupYearsMultiplayer(io) {
  io.on('connection', socket => {

    // ── Lobby ────────────────────────────────────────────────────────────────
    socket.on('ygm:create', ({ name, userId }) => {
      if (!name?.trim()) return;
      const code = makeCode();
      const room = {
        code,
        hostSocketId: socket.id,
        players: new Map([[socket.id, {
          socketId: socket.id, name: name.trim(),
          userId: userId || null, score: 0,
        }]]),
        status: 'lobby',
        allSongs: [],
        totalRounds: 10,
        timerSeconds: 0,
        roundIndex: -1,
        currentRound: null,
        roundTimer: null,
      };
      rooms.set(code, room);
      socketToRoom.set(socket.id, code);
      socket.join(code);
      socket.emit('ygm:created', { code, players: serializePlayers(room) });
    });

    socket.on('ygm:join', ({ code, name, userId }) => {
      if (!code || !name?.trim()) return;
      const c = code.trim().toUpperCase();
      const room = rooms.get(c);
      if (!room) { socket.emit('ygm:error', { message: 'חדר לא נמצא' }); return; }
      if (room.status !== 'lobby') { socket.emit('ygm:error', { message: 'המשחק כבר התחיל' }); return; }
      room.players.set(socket.id, {
        socketId: socket.id, name: name.trim(),
        userId: userId || null, score: 0,
      });
      socketToRoom.set(socket.id, c);
      socket.join(c);
      socket.emit('ygm:joined', { code: c, players: serializePlayers(room), isHost: false });
      socket.to(c).emit('ygm:room_update', { players: serializePlayers(room) });
    });

    // ── Start game ───────────────────────────────────────────────────────────
    socket.on('ygm:start', async ({ playlistIds, songCount, timerSeconds }) => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.hostSocketId !== socket.id) return;

      const ids = Array.isArray(playlistIds) ? playlistIds : [];
      if (!ids.length) { socket.emit('ygm:error', { message: 'לא נבחר פלייליסט' }); return; }

      room.totalRounds = Number(songCount) || 10;
      room.timerSeconds = Number(timerSeconds) || 0;
      room.status = 'playing';
      room.roundIndex = -1;
      for (const p of room.players.values()) p.score = 0;

      try {
        room.allSongs = await loadSongs(ids);
        if (room.allSongs.length < SONGS_PER_ROUND) {
          socket.emit('ygm:error', { message: 'לא מספיק שירים עם שנה בפלייליסט' });
          room.status = 'lobby';
          return;
        }
        io.to(room.code).emit('ygm:started', { total: room.totalRounds });
        sendRound(io, room);
      } catch (e) {
        socket.emit('ygm:error', { message: `שגיאה בטעינת שירים: ${e.message}` });
        room.status = 'lobby';
      }
    });

    // ── Guess ────────────────────────────────────────────────────────────────
    socket.on('ygm:guess', ({ songId, year }) => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.status !== 'playing' || !room.currentRound || room.currentRound.ended) return;

      const { currentRound } = room;
      if (currentRound.claims[songId]) return; // already claimed by someone

      const song = currentRound.roundSongs.find(s => s.id === songId);
      if (!song) return;

      const player = room.players.get(socket.id);
      if (!player) return;

      if (String(year) === String(song.year)) {
        // ✅ Correct — claim the song
        currentRound.claimOrder++;
        const points = CLAIM_POINTS[currentRound.claimOrder - 1] ?? 1;
        player.score += points;
        currentRound.claims[songId] = {
          socketId: socket.id,
          name: player.name,
          year,
          points,
        };

        io.to(room.code).emit('ygm:claim', {
          songId,
          socketId: socket.id,
          playerName: player.name,
          year,
          points,
          players: serializePlayers(room),
        });

        // All 4 songs claimed → end round
        if (Object.keys(currentRound.claims).length >= currentRound.roundSongs.length) {
          finishRound(io, room);
        }
      } else {
        // ❌ Wrong — tell only this player
        socket.emit('ygm:wrong', { songId });
      }
    });

    // ── Host controls ────────────────────────────────────────────────────────
    socket.on('ygm:host_next', () => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.hostSocketId !== socket.id) return;
      sendRound(io, room);
    });

    socket.on('ygm:host_reveal', () => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.hostSocketId !== socket.id) return;
      finishRound(io, room);
    });

    socket.on('ygm:end_game', () => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.hostSocketId !== socket.id) return;
      endGame(io, room);
    });

    socket.on('ygm:host_seek', ({ seconds }) => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      if (!room || room.hostSocketId !== socket.id) return;
      io.to(room.code).emit('ygm:seek', { seconds: Number(seconds) || 30 });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const code = socketToRoom.get(socket.id);
      socketToRoom.delete(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      room.players.delete(socket.id);
      if (room.players.size === 0) {
        clearTimeout(room.roundTimer);
        rooms.delete(code);
      } else {
        if (room.hostSocketId === socket.id) {
          room.hostSocketId = room.players.keys().next().value;
          io.to(code).emit('ygm:host_changed', { newHostSocketId: room.hostSocketId });
        }
        io.to(code).emit('ygm:room_update', { players: serializePlayers(room) });
      }
    });
  });
}
