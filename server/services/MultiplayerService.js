import { generateRoomCode } from '../utils/roomCode.js';

const rooms = new Map();

function generateCode() {
  return generateRoomCode(c => rooms.has(c));
}

export function createRoom(hostSocketId, hostName, hostUserId) {
  const code = generateCode();
  const room = {
    code, hostSocketId, songs: [], currentSongIndex: -1,
    songCount: 10, timerSeconds: 30, playlistId: null, status: 'lobby',
    players: new Map(), revealTimer: null, scoreTimer: null, answersReceived: 0,
  };
  room.players.set(hostSocketId, { name: hostName.trim(), score: 0, isHost: true, userId: hostUserId || null, roundDelta: 0 });
  rooms.set(code, room);
  return room;
}

export function joinRoom(code, socketId, name, userId) {
  const room = rooms.get(code);
  if (!room) return { error: 'קוד חדר שגוי' };
  if (room.status !== 'lobby') return { error: 'המשחק כבר התחיל' };
  const taken = [...room.players.values()].some(p => p.name.toLowerCase() === name.trim().toLowerCase());
  if (taken) return { error: 'שם זה כבר תפוס' };
  room.players.set(socketId, { name: name.trim(), score: 0, isHost: false, userId: userId || null, roundDelta: 0 });
  return { room };
}

export function removePlayer(socketId) {
  for (const [code, room] of rooms) {
    if (!room.players.has(socketId)) continue;
    room.players.delete(socketId);
    if (room.players.size === 0) { rooms.delete(code); return null; }
    if (room.hostSocketId === socketId) {
      const [newId] = room.players.keys();
      room.players.get(newId).isHost = true;
      room.hostSocketId = newId;
    }
    return room;
  }
  return null;
}

export function getRoomBySocket(socketId) {
  for (const room of rooms.values())
    if (room.players.has(socketId)) return room;
  return null;
}

export function serializePlayers(room) {
  return [...room.players.entries()].map(([id, p]) => ({
    id, name: p.name, score: p.score, isHost: p.isHost, userId: p.userId,
  }));
}

export function resetRoundDeltas(room) {
  for (const p of room.players.values()) p.roundDelta = 0;
}

export function getRoundWinner(room) {
  let winner = null;
  let maxDelta = 0;
  for (const [id, p] of room.players.entries()) {
    if (p.roundDelta > maxDelta) {
      maxDelta = p.roundDelta;
      winner = { id, name: p.name, userId: p.userId, delta: maxDelta };
    }
  }
  return winner;
}

export function applyAnswer(room, socketId, answer) {
  const player = room.players.get(socketId);
  if (!player) return 0;
  const { titleCorrect, artistCorrect, yearCorrect, titlePenalty, artistPenalty } = answer;
  let delta = 0;
  if (titleCorrect && artistCorrect && yearCorrect) {
    delta = 10;
  } else {
    if (titleCorrect) delta += 1;
    if (artistCorrect) delta += 1;
    if (yearCorrect) delta += 1;
  }
  if (titlePenalty) delta -= 1;
  if (artistPenalty) delta -= 1;
  player.score += delta;
  player.roundDelta += delta;
  return delta;
}
