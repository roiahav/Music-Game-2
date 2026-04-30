import { io } from 'socket.io-client';

let _socket = null;

export function getSocket() {
  if (!_socket) {
    // In dev, Vite proxies /socket.io → localhost:3000.
    // In production, the page is served from Express so same origin works.
    _socket = io(window.location.origin, { autoConnect: false });
  }
  return _socket;
}
