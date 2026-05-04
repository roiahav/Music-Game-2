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
    return join(folder, files[Math.floor(Math.random() * files.length)]);
  } catch { return null; }
}

// ── State ──
const rooms = new Map();
const socketToRoom = new Map();

// 1 point per correct field (artist / title / year) — base max 3 per round.
// +5 BONUS when all three are correct in the same round → max 8 per round.
const FIELD_POINTS = 1;
const PERFECT_BONUS = 5;

// ── Helpers ──
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  return code;
}
function serializePlayers(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map(p => ({
      socketId: p.socketId,
      name: p.name,
      userId: p.userId,
      score: p.score,
      perfectRounds: p.perfectRounds || 0,
      correctFields: p.correctFields || 0,
      songsAnswered: p.songsAnswered || 0,
      isHost: p.socketId === room.hostSocketId,
      submitted: !!p.submission,
    }));
}
function isMatch(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// ── Song loading (same pattern as other multiplayer modes) ──
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
    .filter(s => s.title && s.artist && s.year && !bl.has(s.id))
    .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
    .map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      year: s.year,
      filePath: s.filePath,
      coverUrl: s.filePath ? `/api/cover/${encodeURIComponent(s.filePath)}` : null,
      audioUrl: s.filePath ? `/api/audio/${encodeURIComponent(s.filePath)}` : (s.previewUrl || null),
    }))
    .filter(s => s.audioUrl);
}

function emitRoomUpdate(io, room) {
  io.to(room.code).emit('champ:room_update', { players: serializePlayers(room), code: room.code });
}

function startNextSong(io, room) {
  if (room.songIdx >= room.queue.length) return endGame(io, room);
  const song = room.queue[room.songIdx];
  room.currentSong = song;
  room.submissions = new Map();
  // Reset per-player submission flags
  for (const p of room.players.values()) p.submission = null;
  // Send the audio info but NOT the title/artist/year
  io.to(room.code).emit('champ:song', {
    songId: song.id,
    audioUrl: song.audioUrl,
    index: room.songIdx + 1,
    total: room.queue.length,
    timerSec: room.timerSec || 0,
  });
  emitRoomUpdate(io, room);
}

function maybeReveal(io, room) {
  // Reveal when every (non-host) player has submitted, or whenever host triggers it
  const submitters = [...room.players.values()].filter(p => p.socketId !== room.hostSocketId);
  if (submitters.length === 0) return;
  const allSubmitted = submitters.every(p => p.submission);
  if (allSubmitted) revealSong(io, room);
}

function revealSong(io, room) {
  const song = room.currentSong;
  if (!song) return;
  // Score every submission
  const results = [];
  for (const p of room.players.values()) {
    if (p.socketId === room.hostSocketId) continue;
    const s = p.submission || {};
    const artistOk = isMatch(s.artist, song.artist);
    const titleOk  = isMatch(s.title,  song.title);
    const yearOk   = String(s.year || '') === String(song.year);
    const correctCount = (artistOk ? 1 : 0) + (titleOk ? 1 : 0) + (yearOk ? 1 : 0);
    const allThree = correctCount === 3;
    const base    = correctCount * FIELD_POINTS;
    const bonus   = allThree ? PERFECT_BONUS : 0;
    const earned  = base + bonus;
    p.score += earned;
    p.correctFields = (p.correctFields || 0) + correctCount;
    p.songsAnswered = (p.songsAnswered || 0) + 1;
    if (allThree) p.perfectRounds = (p.perfectRounds || 0) + 1;
    results.push({
      socketId: p.socketId,
      name: p.name,
      submission: s,
      correct: { artist: artistOk, title: titleOk, year: yearOk },
      base,
      bonus,
      earned,
    });
  }
  io.to(room.code).emit('champ:reveal', {
    song: { id: song.id, title: song.title, artist: song.artist, year: song.year, coverUrl: song.coverUrl },
    results,
  });
  emitRoomUpdate(io, room);
}

function endGame(io, room) {
  const { game } = getSettings();
  const folderEnabled = game.victoryFolderEnabled !== false;
  const victoryFile =
    (folderEnabled && game.victoryAudioFolder && pickRandomVictorySong(game.victoryAudioFolder))
    || game.victoryAudioPath || null;
  const victoryAudioUrl = victoryFile ? `/api/audio/${encodeURIComponent(victoryFile)}` : null;
  io.to(room.code).emit('champ:ended', {
    players: serializePlayers(room),
    totalSongs: room.totalSongs || 0,
    victoryAudioUrl,
    victoryStartSeconds: Number(game.victoryStartSeconds) || 0,
  });
}

// ── Setup ──
export function setupChampionMultiplayer(io) {
  io.on('connection', (socket) => {
    // ─── Create room ───
    socket.on('champ:create', ({ name, userId }) => {
      const code = makeCode();
      const room = {
        code,
        hostSocketId: socket.id,
        players: new Map(),
        status: 'lobby',
        queue: [],
        songIdx: 0,
        currentSong: null,
        submissions: new Map(),
        autocomplete: { artists: [], titles: [] },
      };
      room.players.set(socket.id, {
        socketId: socket.id,
        userId: userId || '',
        name: name || 'מנהל',
        score: 0,
        submission: null,
      });
      rooms.set(code, room);
      socketToRoom.set(socket.id, code);
      socket.join(code);
      socket.emit('champ:created', { code, players: serializePlayers(room) });
    });

    // ─── Join room ───
    socket.on('champ:join', ({ code, name, userId }) => {
      const room = rooms.get(code?.toUpperCase());
      if (!room) return socket.emit('champ:error', { message: 'חדר לא נמצא' });
      if (room.status !== 'lobby') return socket.emit('champ:error', { message: 'המשחק כבר התחיל' });
      room.players.set(socket.id, {
        socketId: socket.id,
        userId: userId || '',
        name: name || 'שחקן',
        score: 0,
        submission: null,
      });
      socketToRoom.set(socket.id, room.code);
      socket.join(room.code);
      socket.emit('champ:joined', { code: room.code, players: serializePlayers(room) });
      emitRoomUpdate(io, room);
    });

    // ─── Start game (host) ───
    socket.on('champ:start', async ({ playlistIds, songCount, timerSec, decades }) => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || socket.id !== room.hostSocketId) return;

      const loaded = await loadSongs(playlistIds || []);
      if (loaded.length === 0) {
        return socket.emit('champ:error', { message: 'אין שירים בפלייליסט שנבחר' });
      }

      // Year filter — empty/missing = no restriction. decades is an array of
      // decade-start years (e.g. [1990, 2000]); a song matches if its year falls
      // in any of them.
      const decadeSet = new Set((decades || []).map(d => Number(d)).filter(Boolean));
      const allSongs = decadeSet.size === 0
        ? loaded
        : loaded.filter(s => {
            const y = Number(s.year);
            if (!y) return false;
            return decadeSet.has(Math.floor(y / 10) * 10);
          });
      if (allSongs.length === 0) {
        return socket.emit('champ:error', { message: 'אין שירים בעשורים הנבחרים' });
      }
      const N = Math.min(Number(songCount) || 10, allSongs.length);
      const queue = shuffle(allSongs).slice(0, N);

      // Build dedup'd autocomplete lists from ALL the loaded songs
      const artistsSet = new Set();
      const titlesSet  = new Set();
      for (const s of allSongs) {
        if (s.artist?.trim()) artistsSet.add(s.artist.trim());
        if (s.title?.trim())  titlesSet.add(s.title.trim());
      }
      const sortFn = (a, b) => a.localeCompare(b, 'he');
      const artists = [...artistsSet].sort(sortFn);
      const titles  = [...titlesSet].sort(sortFn);

      room.queue = queue;
      room.songIdx = 0;
      room.status = 'playing';
      room.autocomplete = { artists, titles };
      room.timerSec = Math.max(0, Math.min(600, Number(timerSec) || 0));
      room.totalSongs = queue.length;
      // Reset scores
      for (const p of room.players.values()) {
        p.score = 0;
        p.submission = null;
        p.correctFields = 0;
        p.perfectRounds = 0;
        p.songsAnswered = 0;
      }

      io.to(room.code).emit('champ:started', { total: queue.length, autocomplete: { artists, titles }, timerSec: room.timerSec });
      startNextSong(io, room);
    });

    // ─── Submit answers (player) ───
    socket.on('champ:submit', ({ artist, title, year }) => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || room.status !== 'playing') return;
      const p = room.players.get(socket.id);
      if (!p || socket.id === room.hostSocketId) return;
      if (p.submission) return; // already submitted
      p.submission = {
        artist: (artist || '').trim(),
        title:  (title  || '').trim(),
        year:   year ? Number(year) : null,
      };
      emitRoomUpdate(io, room);
      maybeReveal(io, room);
    });

    // ─── Force reveal (host) ───
    socket.on('champ:reveal', () => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || socket.id !== room.hostSocketId) return;
      revealSong(io, room);
    });

    // ─── Next song (host) ───
    socket.on('champ:next', () => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || socket.id !== room.hostSocketId) return;
      room.songIdx++;
      startNextSong(io, room);
    });

    // ─── Mute / unmute all other players (host) ───
    // socket.to(room) emits to everyone in the room EXCEPT the sender, so the
    // host's own audio keeps playing while players' phones go silent.
    socket.on('champ:mute_all', () => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || socket.id !== room.hostSocketId) return;
      socket.to(room.code).emit('champ:muted', { muted: true });
    });
    socket.on('champ:unmute_all', () => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || socket.id !== room.hostSocketId) return;
      socket.to(room.code).emit('champ:muted', { muted: false });
    });

    // ─── End game early (host) ───
    socket.on('champ:end', () => {
      const code = socketToRoom.get(socket.id);
      const room = rooms.get(code);
      if (!room || socket.id !== room.hostSocketId) return;
      endGame(io, room);
    });

    // ─── Disconnect cleanup ───
    socket.on('disconnect', () => {
      const code = socketToRoom.get(socket.id);
      const room = code ? rooms.get(code) : null;
      socketToRoom.delete(socket.id);
      if (!room) return;
      const wasHost = socket.id === room.hostSocketId;
      room.players.delete(socket.id);
      if (room.players.size === 0) {
        rooms.delete(room.code);
        return;
      }
      if (wasHost) {
        // Pass host to first remaining player
        const next = [...room.players.values()][0];
        room.hostSocketId = next.socketId;
      }
      emitRoomUpdate(io, room);
      // If we were waiting on this player's submission, check if all others submitted
      if (room.status === 'playing') maybeReveal(io, room);
    });
  });
}
