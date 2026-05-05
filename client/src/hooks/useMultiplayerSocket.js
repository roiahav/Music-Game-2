import { useEffect, useMemo, useState } from 'react';
import { getSocket } from '../services/socket.js';
import { useConnectionLostBanner } from './useConnectionLostBanner.js';

/**
 * One-stop multiplayer socket setup. Handles the bits every multiplayer
 * screen used to repeat:
 *
 *  - Connect to the shared socket.io singleton on mount, disconnect on
 *    unmount.
 *  - Track `connected` and `mySocketId` reactively.
 *  - Wire `useConnectionLostBanner` so the sticky "מתחבר מחדש…" banner
 *    appears automatically.
 *
 * The screen still adds its own `mp:*` / `champ:*` / `lh:*` listeners.
 * Those should be registered inside a separate useEffect (or the same
 * one) and torn down with `socket.off(...)` on unmount.
 *
 * Returns `{ socket, connected, mySocketId }`.
 */
export function useMultiplayerSocket() {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(false);
  const [mySocketId, setMySocketId] = useState('');
  useConnectionLostBanner(connected);

  useEffect(() => {
    function onConnect()      { setMySocketId(socket.id); setConnected(true); }
    function onDisconnect()   { setConnected(false); }
    function onConnectError() { setConnected(false); }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // The shared socket starts with autoConnect: false. Connecting again is a
    // no-op when already connected (e.g. when navigating between two MP
    // screens), so this is safe to call unconditionally.
    socket.connect();

    // If we mounted while the socket was already connected (e.g. a remount
    // after a back+forward navigation), the 'connect' event has long since
    // fired — sync the state immediately.
    if (socket.connected) {
      setConnected(true);
      setMySocketId(socket.id);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      // Disconnect on unmount so the next MP screen gets a fresh session.
      // Re-using the socket across screens is fine, but server-side rooms
      // associate with the socket id, so a clean reconnect avoids stale
      // membership.
      socket.disconnect();
    };
  }, [socket]);

  return { socket, connected, mySocketId };
}
