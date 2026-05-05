import { useEffect, useState, useRef, useCallback } from 'react';
import { getSpotifyAccessToken } from '../api/client.js';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const PLAYER_NAME = 'Music Game 🎵';

/** Promise that resolves when window.Spotify.Player is available. */
let _sdkReady = null;
function loadSDK() {
  if (_sdkReady) return _sdkReady;
  _sdkReady = new Promise((resolve, reject) => {
    if (window.Spotify?.Player) return resolve(window.Spotify);
    // The SDK calls this global once it's done initialising.
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
    const tag = document.createElement('script');
    tag.src = SDK_SRC;
    tag.async = true;
    tag.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.head.appendChild(tag);
  });
  return _sdkReady;
}

/**
 * Spotify Web Playback SDK client. Loads the SDK on first call, creates a
 * single browser-side player, and surfaces its deviceId once Spotify reports
 * `ready`. Call `play(uris)` to start playback on this device — Spotify Connect
 * routes the audio here. Requires Spotify Premium.
 *
 * Accepts an `enabled` flag so screens that don't need Spotify don't load
 * the 200 KB SDK eagerly.
 *
 * Returns:
 *   { ready, deviceId, error, play(uris), pause(), resume() }
 */
export function useSpotifyPlayer(enabled = true) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState('');
  const playerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let listeners = [];

    (async () => {
      let Spotify;
      try { Spotify = await loadSDK(); }
      catch (e) { if (!cancelled) setError(e.message); return; }

      if (cancelled) return;

      const player = new Spotify.Player({
        name: PLAYER_NAME,
        getOAuthToken: async (cb) => {
          try {
            const { accessToken } = await getSpotifyAccessToken();
            cb(accessToken);
          } catch {
            cb('');
          }
        },
        volume: 0.7,
      });
      playerRef.current = player;

      // Track listeners so we can `removeListener` cleanly on unmount.
      const on = (ev, fn) => { player.addListener(ev, fn); listeners.push([ev, fn]); };

      on('ready',          ({ device_id }) => { if (!cancelled) { setDeviceId(device_id); setReady(true); } });
      on('not_ready',      () => { if (!cancelled) setReady(false); });
      on('initialization_error',     ({ message }) => { if (!cancelled) setError(message); });
      on('authentication_error',     ({ message }) => { if (!cancelled) setError(`auth: ${message}`); });
      on('account_error',            ({ message }) => { if (!cancelled) setError(`account: ${message}`); }); // typically "Premium required"
      on('playback_error',           ({ message }) => { if (!cancelled) setError(`playback: ${message}`); });

      const ok = await player.connect();
      if (!ok && !cancelled) setError('connect_failed');
    })();

    return () => {
      cancelled = true;
      const player = playerRef.current;
      if (player) {
        for (const [ev, fn] of listeners) {
          try { player.removeListener(ev, fn); } catch {}
        }
        try { player.disconnect(); } catch {}
        playerRef.current = null;
      }
    };
  }, [enabled]);

  // Exposed control helpers — small wrappers around the SDK so consumers
  // don't have to grab playerRef themselves.
  const play   = useCallback(async (uris) => {
    const p = playerRef.current;
    if (!p || !deviceId) return;
    // The SDK can only play `_uri` strings, but it's simpler (and matches the
    // server endpoint) to use Spotify Connect: PUT /me/player/play with our
    // deviceId. The server already does this via /api/spotify/play. Consumers
    // should call spotifyPlay(uris, deviceId) directly. play() here just
    // resumes whatever is queued, in case they didn't.
    try { await p.resume(); } catch {}
  }, [deviceId]);
  const pause  = useCallback(async () => { try { await playerRef.current?.pause(); } catch {} }, []);
  const resume = useCallback(async () => { try { await playerRef.current?.resume(); } catch {} }, []);

  return { ready, deviceId, error, play, pause, resume };
}
