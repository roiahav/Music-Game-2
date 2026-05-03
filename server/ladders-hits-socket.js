/**
 * "סולמות ולהיטים" — multiplayer board game (Phase 1: lobby only).
 *
 * Phase 1 covers room creation/joining, avatar selection, and host config
 * (mode = 'artist'|'year', timerSec, playlistIds). Subsequent phases add
 * round mechanics, dice rolls, board movement, ladder/slide effects, and
 * the victory screen.
 *
 * Self-contained — does not share state with the other multiplayer files.
 * Event prefix: `lh:`.
 */

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
    status: room.status,
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
        playlistIds: [],
        status: 'lobby',          // 'lobby' | 'playing' | 'done'
        players: new Map(),
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

    socket.on('lh:set_config', ({ mode, timerSec, playlistIds }) => {
      const code = socketToRoom.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) return;
      if (mode === 'artist' || mode === 'year') room.mode = mode;
      if (typeof timerSec === 'number' && timerSec >= 0 && timerSec <= 180) room.timerSec = Math.round(timerSec);
      if (Array.isArray(playlistIds)) room.playlistIds = playlistIds.filter(x => typeof x === 'string');
      io.to(code).emit('lh:room_update', { room: serializeRoom(room) });
    });

    socket.on('lh:leave', () => {
      handleLeave(socket, io);
    });

    socket.on('disconnect', () => {
      handleLeave(socket, io);
    });
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
