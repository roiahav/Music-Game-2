import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom, joinRoom, removePlayer, getRoomBySocket,
  serializePlayers, resetRoundDeltas, getRoundWinner, applyAnswer,
} from '../MultiplayerService.js';

// The service holds rooms in a module-level Map. Each test cleans up its own
// room by tracking the host socket id and calling removePlayer.
function teardownRoom(hostSocketId) {
  let r = getRoomBySocket(hostSocketId);
  while (r) {
    for (const id of [...r.players.keys()]) removePlayer(id);
    r = getRoomBySocket(hostSocketId);
  }
}

describe('MultiplayerService', () => {
  describe('createRoom', () => {
    it('builds a room with sane defaults', () => {
      const r = createRoom('host-sock', 'Alice', 'user-1');
      expect(r.code).toMatch(/^\d{4}$/);
      expect(r.status).toBe('lobby');
      expect(r.songCount).toBe(10);
      expect(r.timerSeconds).toBe(30);
      expect(r.players.size).toBe(1);
      const host = r.players.get('host-sock');
      expect(host).toMatchObject({ name: 'Alice', isHost: true, userId: 'user-1', score: 0, roundDelta: 0 });
      teardownRoom('host-sock');
    });

    it('trims the host name', () => {
      const r = createRoom('h2', '   Bob   ', null);
      expect(r.players.get('h2').name).toBe('Bob');
      teardownRoom('h2');
    });

    it('every code is unique', () => {
      const codes = new Set();
      const hosts = [];
      for (let i = 0; i < 5; i++) {
        const id = `h-uniq-${i}`;
        hosts.push(id);
        codes.add(createRoom(id, `P${i}`).code);
      }
      expect(codes.size).toBe(5);
      hosts.forEach(teardownRoom);
    });
  });

  describe('joinRoom', () => {
    it('rejects unknown room codes', () => {
      const res = joinRoom('0000', 'sock-z', 'NoOne');
      expect(res).toEqual({ error: 'קוד חדר שגוי' });
    });

    it('rejects joining a started game', () => {
      const r = createRoom('h-started', 'Host');
      r.status = 'playing';
      const res = joinRoom(r.code, 'late-joiner', 'Late');
      expect(res.error).toMatch(/כבר התחיל/);
      teardownRoom('h-started');
    });

    it('rejects duplicate names (case-insensitive, trimmed)', () => {
      const r = createRoom('h-dup', 'Alice');
      const res = joinRoom(r.code, 'sock-dup', '  ALICE  ');
      expect(res.error).toMatch(/תפוס/);
      teardownRoom('h-dup');
    });

    it('adds a guest player on success', () => {
      const r = createRoom('h-ok', 'Host');
      const res = joinRoom(r.code, 'sock-guest', 'Guest', 'user-99');
      expect(res.error).toBeUndefined();
      expect(res.room.players.size).toBe(2);
      const guest = res.room.players.get('sock-guest');
      expect(guest).toMatchObject({ name: 'Guest', isHost: false, userId: 'user-99', score: 0 });
      teardownRoom('h-ok');
    });
  });

  describe('removePlayer / host transfer', () => {
    it('promotes the next player to host when the original host leaves', () => {
      const r = createRoom('h-leave', 'Host');
      joinRoom(r.code, 'g1', 'Guest1');
      const after = removePlayer('h-leave');
      expect(after).not.toBeNull();
      expect(after.hostSocketId).toBe('g1');
      expect(after.players.get('g1').isHost).toBe(true);
      teardownRoom('g1');
    });

    it('deletes the room when the last player leaves', () => {
      const r = createRoom('h-solo', 'Host');
      const code = r.code;
      const after = removePlayer('h-solo');
      expect(after).toBeNull();
      // Code is now reusable
      expect(joinRoom(code, 'late', 'Late').error).toBe('קוד חדר שגוי');
    });
  });

  describe('applyAnswer', () => {
    let room;
    beforeEach(() => {
      room = createRoom('h-score', 'Scorer');
    });
    function teardown() { teardownRoom('h-score'); }

    it('full correct (title + artist + year) = 10 points', () => {
      const delta = applyAnswer(room, 'h-score',
        { titleCorrect: true, artistCorrect: true, yearCorrect: true, titlePenalty: false, artistPenalty: false });
      expect(delta).toBe(10);
      expect(room.players.get('h-score').score).toBe(10);
      teardown();
    });

    it('partial correct = 1 point per correct field', () => {
      const delta = applyAnswer(room, 'h-score',
        { titleCorrect: true, artistCorrect: false, yearCorrect: true, titlePenalty: false, artistPenalty: false });
      expect(delta).toBe(2);
      teardown();
    });

    it('penalties subtract from the round score', () => {
      const delta = applyAnswer(room, 'h-score',
        { titleCorrect: false, artistCorrect: false, yearCorrect: false, titlePenalty: true, artistPenalty: true });
      expect(delta).toBe(-2);
      expect(room.players.get('h-score').score).toBe(-2);
      teardown();
    });

    it('cumulative score and roundDelta both update', () => {
      applyAnswer(room, 'h-score', { titleCorrect: true, artistCorrect: false, yearCorrect: false, titlePenalty: false, artistPenalty: false });
      applyAnswer(room, 'h-score', { titleCorrect: true, artistCorrect: true, yearCorrect: false, titlePenalty: false, artistPenalty: false });
      const p = room.players.get('h-score');
      expect(p.score).toBe(3);     // 1 + 2
      expect(p.roundDelta).toBe(3);
      teardown();
    });

    it('returns 0 for unknown player without crashing', () => {
      expect(applyAnswer(room, 'nope', { titleCorrect: true, artistCorrect: true, yearCorrect: true, titlePenalty: false, artistPenalty: false })).toBe(0);
      teardown();
    });
  });

  describe('round helpers', () => {
    it('resetRoundDeltas zeros every player', () => {
      const r = createRoom('h-reset', 'Host');
      joinRoom(r.code, 'g-reset', 'Guest');
      applyAnswer(r, 'h-reset', { titleCorrect: true, artistCorrect: true, yearCorrect: true, titlePenalty: false, artistPenalty: false });
      applyAnswer(r, 'g-reset', { titleCorrect: true, artistCorrect: false, yearCorrect: false, titlePenalty: false, artistPenalty: false });
      resetRoundDeltas(r);
      expect(r.players.get('h-reset').roundDelta).toBe(0);
      expect(r.players.get('g-reset').roundDelta).toBe(0);
      // Cumulative score is preserved
      expect(r.players.get('h-reset').score).toBe(10);
      expect(r.players.get('g-reset').score).toBe(1);
      teardownRoom('h-reset');
    });

    it('getRoundWinner picks the player with the largest positive delta', () => {
      const r = createRoom('h-w', 'Host');
      joinRoom(r.code, 'g-w', 'Guest');
      applyAnswer(r, 'h-w', { titleCorrect: true, artistCorrect: false, yearCorrect: false, titlePenalty: false, artistPenalty: false });
      applyAnswer(r, 'g-w', { titleCorrect: true, artistCorrect: true, yearCorrect: true, titlePenalty: false, artistPenalty: false });
      const w = getRoundWinner(r);
      expect(w.name).toBe('Guest');
      expect(w.delta).toBe(10);
      teardownRoom('h-w');
    });

    it('getRoundWinner returns null when nobody scored positive', () => {
      const r = createRoom('h-none', 'Host');
      const w = getRoundWinner(r);
      expect(w).toBeNull();
      teardownRoom('h-none');
    });

    it('serializePlayers exposes only safe fields', () => {
      const r = createRoom('h-ser', 'Host', 'u-1');
      joinRoom(r.code, 'g-ser', 'Guest', 'u-2');
      const arr = serializePlayers(r);
      expect(arr).toHaveLength(2);
      expect(arr[0]).toEqual({ id: 'h-ser', name: 'Host', score: 0, isHost: true, userId: 'u-1' });
      expect(arr[1]).toEqual({ id: 'g-ser', name: 'Guest', score: 0, isHost: false, userId: 'u-2' });
      teardownRoom('h-ser');
    });
  });
});
