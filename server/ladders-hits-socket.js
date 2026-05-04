/**
 * "סולמות ולהיטים" — multiplayer board game.
 *
 * Phases 1-2 implemented: lobby (create/join, avatar pick, host config) and
 * round mechanics (artist or year mode, autocomplete, fastest-correct wins
 * the round, optional timer, host can reveal/skip). Score = number of
 * rounds won. Phase 3 will add the dice roll + 100-square board + ladders/
 * slides; phase 4 adds the victory screen.
 *
 * Self-contained — does not share state with the other multiplayer files.
 * Event prefix: `lh:`.
 */

import { getSettings } from './services/SettingsStore.js';
import { scanFolder } from './services/FileScanner.js';
import { getSongMetadata } from './services/MetadataService.js';
import { getPlaylistTracks } from './services/SpotifyService.js';

// Board map — MUST stay in sync with client/src/components/laddersHitsMap.js.
// We duplicate rather than import across the server/client boundary because
// the server runs as plain Node ESM and shouldn't reach into the client tree.
const LADDERS = [
  [4, 25], [9, 31], [21, 42], [28, 84], [36, 57], [51, 67], [71, 91], [80, 99],
];
const SLIDES = [
  [17, 7], [54, 34], [62, 19], [64, 60], [87, 36], [93, 73], [95, 75], [98, 78],
];
const BOARD_END = 100;

function applyBoardMove(currentPos, dieValue) {
  const after = currentPos + dieValue;
  // Going past 100? Bounce back: classic snakes-&-ladders "exact roll wins".
  // To keep games short here we use the simpler "clamp to 100" rule — landing
  // exactly or past 100 wins.
  const landed = Math.min(BOARD_END, after);
  const ladder = LADDERS.find(([from]) => from === landed);
  if (ladder) return { intermediate: landed, final: ladder[1], effect: 'ladder' };
  const slide  = SLIDES.find(([from]) => from === landed);
  if (slide)  return { intermediate: landed, final: slide[1],  effect: 'slide' };
  return { intermediate: landed, final: landed, effect: null };
}

const rooms = new Map();        // code → room
const socketToRoom = new Map(); // socketId → code

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid typos
const FIGURINE_IDS = ['violin', 'guitar', 'drum', 'piano', 'mic', 'sax', 'trumpet', 'flute', 'dancer', 'singer', 'dj', 'conductor'];
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#d35400', '#16a085', '#c0392b', '#8e44ad'];

function makeCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(s)) return s;
  }
  // Extremely unlikely fallback
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Load songs from a list of playlist ids using the same loader pattern as
// the other multiplayer modes (champion-multiplayer-socket.js).
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
  // Dedup, drop blacklisted, attach audio/cover urls
  const seen = new Set();
  return all
    .filter(s => {
      if (!s.id || seen.has(s.id) || bl.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .map(s => ({
      ...s,
      audioUrl: s.audioUrl || (s.filePath ? `/api/audio/${encodeURIComponent(s.filePath)}` : null),
      coverUrl: s.coverUrl || (s.hasCover && s.filePath ? `/api/cover/${encodeURIComponent(s.filePath)}` : null),
    }));
}

// Normalised string match used for artist-mode answers
function normaliseStr(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[ְ-ׇֽׁׂ]/g, '') // strip Hebrew niqqud
    .replace(/\s+/g, ' ');
}
function isArtistMatch(answer, expected) {
  const a = normaliseStr(answer);
  const b = normaliseStr(expected);
  if (!a || !b) return false;
  return a === b;
}

// Year match: tolerant by ±1 to absorb common off-by-one tag errors
function isYearMatch(answer, expected) {
  const a = Number(answer);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1;
}

function pickFreeAvatar(room) {
  // Pick the first (figurineId, color) combo nobody else in the room is using
  const taken = new Set();
  for (const p of room.players.values()) {
    if (p.avatar) taken.add(`${p.avatar.figurineId}::${p.avatar.color}`);
  }
  for (const id of FIGURINE_IDS) {
    for (const color of COLORS) {
      const key = `${id}::${color}`;
      if (!taken.has(key)) return { figurineId: id, color };
    }
  }
  // Should never happen with 12×12 = 144 combos and a small lobby
  return { figurineId: FIGURINE_IDS[0], color: COLORS[0] };
}

function serializePlayers(room) {
  return [...room.players.values()].map(p => ({
    socketId: p.socketId,
    userId: p.userId,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    position: p.position,
    isHost: p.socketId === room.hostSocketId,
  }));
}

function serializeRoom(room) {
  return {
    code: room.code,
    hostSocketId: room.hostSocketId,
    mode: room.mode,
    timerSec: room.timerSec,
    playlistIds: room.playlistIds,
    songCount: room.songCount,
    status: room.status,
    songIdx: room.songIdx,
    totalRounds: room.queue ? room.queue.length : 0,
    players: serializePlayers(room),
  };
}

export function setupLaddersHits(io) {
  io.on('connection', socket => {

    socket.on('lh:create', ({ name, userId }) => {
      if (!name?.trim()) {
        socket.emit('lh:error', { message: 'יש לציין שם' });
        return;
      }
      const code = makeCode();
      const room = {
        code,
        hostSocketId: socket.id,
        mode: 'artist',           // 'artist' | 'year'
        timerSec: 30,
        songCount: 10,
        playlistIds: [],
        status: 'lobby',          // 'lobby' | 'playing' | 'done'
        players: new Map(),
        // Phase 2 game state — populated on lh:start
        queue: [],
        songIdx: -1,
        currentSong: null,
        roundEnded: false,
        roundWinnerSocketId: null,
        roundAttempts: new Map(),  // socketId → attempts count
        timerHandle: null,
        autocomplete: { artists: [] },
        diceRolled: false,        // true once the round winner has rolled
      };
      const avatar = pickFreeAvatar(room);
      room.players.set(socket.id, {
        socketId: socket.id,
        userId: userId || null,
        name: name.trim(),
        avatar,
        score: 0,
        position: 0,
      });
      rooms.set(code, room);
      socketToRoom.set(socket.id, code);
      socket.join(code);
      socket.emit('lh:created', { code, room: serializeRoom(room) });
    });

    socket.on('lh:join', ({ code, name, userId }) => {
      const trimmedCode = String(code || '').trim().toUpperCase();
      const trimmedName = String(name || '').trim();
      if (!trimmedCode || !trimmedName) {
        socket.emit('lh:error', { message: 'יש לציין קוד חדר ושם' });
        return;
      }
      const room = rooms.get(trimmedCode);
      if (!room) {
        socket.emit('lh:error', { message: 'חדר לא נמצא' });
        return;
      }
      if (room.status !== 'lobby') {
        socket.emit('lh:error', { message: 'המשחק כבר התחיל' });
        return;
      }
      // If this user is already in the room (e.g. re-connect), update the
      // socket binding rather than rejecting them.
      let existing = null;
      if (userId) {
        for (const p of room.players.values()) {
          if (p.userId && p.userId === userId) { existing = p; break; }
        }
      }
      if (existing) {
        room.players.delete(existing.socketId);
        existing.socketId = socket.id;
        room.players.set(socket.id, existing);
      } else {
        const avatar = pickFreeAvatar(room);
        room.players.set(socket.id, {
          socketId: socket.id,
          userId: userId || null,
          name: trimmedName,
          avatar,
          score: 0,
          position: 0,
        });
      }
      socketToRoom.set(socket.id, trimmedCode);
      socket.join(trimmedCode);
      socket.emit('lh:joined', { code: trimmedCode, room: serializeRoom(room), isHost: false });
      socket.to(trimmedCode).emit('lh:room_update', { room: serializeRoom(room) });
    });

    socket.on('lh:set_avatar', ({ figurineId, color }) => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;
      // Reject if the requested combo is already taken by someone else
      const wantKey = `${figurineId}::${color}`;
      for (const p of room.players.values()) {
        if (p.socketId === socket.id) continue;
        if (p.avatar && `${p.avatar.figurineId}::${p.avatar.color}` === wantKey) {
          socket.emit('lh:error', { message: 'אווטאר תפוס — בחר אחר' });
          return;
        }
      }
      if (FIGURINE_IDS.includes(figurineId) && COLORS.includes(color)) {
        player.avatar = { figurineId, color };
        io.to(code).emit('lh:room_update', { room: serializeRoom(room) });
      }
    });

    socket.on('lh:set_config', ({ mode, timerSec, playlistIds, songCount }) => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;
      if (mode === 'artist' || mode === 'year') room.mode = mode;
      if (typeof timerSec === 'number' && timerSec >= 0 && timerSec <= 180) room.timerSec = Math.round(timerSec);
      if (Array.isArray(playlistIds)) room.playlistIds = playlistIds.filter(x => typeof x === 'string');
      if (typeof songCount === 'number' && songCount >= 1 && songCount <= 200) room.songCount = Math.round(songCount);
      io.to(code).emit('lh:room_update', { room: serializeRoom(room) });
    });

    // ── Phase 2 — start the game ───────────────────────────────────────
    socket.on('lh:start', async () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;
      if (!room.playlistIds.length) {
        socket.emit('lh:error', { message: 'בחר לפחות פלייליסט אחד' });
        return;
      }
      try {
        const songs = await loadSongs(room.playlistIds);
        if (!songs.length) {
          socket.emit('lh:error', { message: 'אין שירים בפלייליסטים שנבחרו' });
          return;
        }
        const N = Math.max(1, Math.min(songs.length, Number(room.songCount) || 10));
        room.queue = shuffle(songs).slice(0, N);
        room.songIdx = -1;
        room.status = 'playing';
        // Build artist autocomplete from ALL the loaded songs (not just queue)
        // — same dedup-and-sort pattern champion-multiplayer-socket.js uses.
        const artistSet = new Set();
        for (const s of songs) {
          if (s.artist?.trim()) artistSet.add(s.artist.trim());
        }
        room.autocomplete = {
          artists: [...artistSet].sort((a, b) => a.localeCompare(b, 'he')),
        };
        // Reset per-game player stats
        for (const p of room.players.values()) {
          p.score = 0;
          p.position = 0;
        }
        io.to(room.code).emit('lh:started', {
          total: room.queue.length,
          autocomplete: room.autocomplete,
          mode: room.mode,
          timerSec: room.timerSec,
        });
        startNextRound(io, room);
      } catch (e) {
        socket.emit('lh:error', { message: `שגיאה בטעינת שירים: ${e.message || e}` });
      }
    });

    // ── Player submits an answer ───────────────────────────────────────
    socket.on('lh:answer', ({ value }) => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.status !== 'playing' || room.roundEnded) return;
      // Host can play too in this game (not excluded like champion mode);
      // we don't gate by host here. If you want host-spectator mode, gate here.
      const player = room.players.get(socket.id);
      if (!player) return;
      // Track attempts to give feedback on wrong answers without ending the round
      const attempts = (room.roundAttempts.get(socket.id) || 0) + 1;
      room.roundAttempts.set(socket.id, attempts);

      const song = room.currentSong;
      if (!song) return;
      const correct = room.mode === 'artist'
        ? isArtistMatch(value, song.artist)
        : isYearMatch(value, song.year);

      if (!correct) {
        socket.emit('lh:wrong', { value, attempts });
        return;
      }
      // First correct answer wins the round
      room.roundEnded = true;
      room.roundWinnerSocketId = socket.id;
      player.score = (player.score || 0) + 1;
      finishRound(io, room);
    });

    // ── Host: force-reveal the current round (no winner) ───────────────
    socket.on('lh:host_reveal', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;
      if (room.status !== 'playing' || room.roundEnded) return;
      room.roundEnded = true;
      room.roundWinnerSocketId = null;
      finishRound(io, room);
    });

    // ── Host: advance to the next round ────────────────────────────────
    socket.on('lh:host_next', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;
      if (room.status !== 'playing') return;
      startNextRound(io, room);
    });

    // ── Round winner rolls the die ─────────────────────────────────────
    socket.on('lh:roll_dice', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.status !== 'playing') return;
      if (!room.roundEnded) return;
      if (room.diceRolled) return;
      // Only the round winner can roll. If the round had no winner (host
      // skipped or timer expired), nobody rolls — the host advances directly.
      if (room.roundWinnerSocketId !== socket.id) return;
      const player = room.players.get(socket.id);
      if (!player) return;

      const value = 1 + Math.floor(Math.random() * 6);
      const move = applyBoardMove(player.position || 0, value);
      const fromPosition = player.position || 0;
      player.position = move.final;
      room.diceRolled = true;

      const reachedEnd = move.final >= BOARD_END;
      io.to(room.code).emit('lh:dice_rolled', {
        byPlayerSocketId: socket.id,
        value,
        fromPosition,
        intermediate: move.intermediate,
        finalPosition: move.final,
        effect: move.effect,
        players: serializePlayers(room),
        gameOver: reachedEnd,
      });

      if (reachedEnd) {
        // Give clients a moment to play the dice + move animation before
        // transitioning to the victory screen.
        setTimeout(() => endGame(io, room, socket.id), 2400);
      }
    });

    // ── Host: end the game early ───────────────────────────────────────
    socket.on('lh:end_game', () => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;
      endGame(io, room);
    });

    socket.on('lh:leave', () => {
      handleLeave(socket, io);
    });

    socket.on('disconnect', () => {
      handleLeave(socket, io);
    });
  });
}

function startNextRound(io, room) {
  if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }
  room.songIdx++;
  if (room.songIdx >= room.queue.length) {
    endGame(io, room);
    return;
  }
  const song = room.queue[room.songIdx];
  room.currentSong = song;
  room.roundEnded = false;
  room.roundWinnerSocketId = null;
  room.roundAttempts = new Map();
  room.diceRolled = false;

  // Players don't see the artist/title/year — only the audio
  io.to(room.code).emit('lh:song', {
    index: room.songIdx + 1,
    total: room.queue.length,
    songId: song.id,
    audioUrl: song.audioUrl,
    timerSec: room.timerSec,
  });

  if (room.timerSec > 0) {
    room.timerHandle = setTimeout(() => {
      if (room.roundEnded) return;
      room.roundEnded = true;
      room.roundWinnerSocketId = null;
      finishRound(io, room);
    }, room.timerSec * 1000 + 500); // small grace
  }
}

function finishRound(io, room) {
  if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }
  const song = room.currentSong;
  io.to(room.code).emit('lh:round_end', {
    songId: song?.id,
    correct: {
      artist: song?.artist || '',
      title: song?.title || '',
      year: song?.year || '',
    },
    coverUrl: song?.coverUrl || null,
    winnerSocketId: room.roundWinnerSocketId,
    players: serializePlayers(room),
    isLastRound: room.songIdx + 1 >= room.queue.length,
  });
}

function endGame(io, room, boardWinnerSocketId = null) {
  if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }
  if (room.status === 'done') return; // idempotent
  room.status = 'done';
  // Primary win condition (phase 3+): a player reached the end of the board.
  // Fallback (out of rounds): highest position wins; tie-break by score.
  let winner = null;
  if (boardWinnerSocketId) {
    winner = room.players.get(boardWinnerSocketId) || null;
  } else {
    const sorted = [...room.players.values()].sort((a, b) => {
      if ((b.position || 0) !== (a.position || 0)) return (b.position || 0) - (a.position || 0);
      return (b.score || 0) - (a.score || 0);
    });
    winner = sorted[0] || null;
  }
  const settings = getSettings();
  const victoryPath = settings?.game?.victoryAudioPath;
  const victoryAudioUrl = victoryPath
    ? `/api/audio/${encodeURIComponent(victoryPath)}`
    : (room.currentSong?.audioUrl || null);
  io.to(room.code).emit('lh:ended', {
    players: serializePlayers(room),
    winnerSocketId: winner?.socketId || null,
    victoryAudioUrl,
    reason: boardWinnerSocketId ? 'reached_end' : 'all_rounds_played',
  });
}

function handleLeave(socket, io) {
  const code = socketToRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  socketToRoom.delete(socket.id);
  if (!room) return;
  room.players.delete(socket.id);
  if (room.players.size === 0) {
    if (room.timerHandle) { clearTimeout(room.timerHandle); room.timerHandle = null; }
    rooms.delete(code);
    return;
  }
  // Promote a new host if the host left
  if (room.hostSocketId === socket.id) {
    const next = room.players.values().next().value;
    if (next) room.hostSocketId = next.socketId;
  }
  io.to(code).emit('lh:room_update', { room: serializeRoom(room) });
}

export const LADDERS_HITS_FIGURINES = FIGURINE_IDS;
export const LADDERS_HITS_COLORS = COLORS;
