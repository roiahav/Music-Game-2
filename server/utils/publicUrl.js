/**
 * Build the public origin (protocol + host[:port]) the client used to reach us.
 * Honours `X-Forwarded-Proto` / `X-Forwarded-Host` set by Caddy and similar
 * reverse proxies, with `app.set('trust proxy', 1)` already enabled in
 * server/index.js.
 *
 * Falls back to localhost:<PORT> when nothing else is available so dev still
 * works.
 */
export function publicOrigin(req) {
  const proto = req.protocol || 'http';
  const host  = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
}

/** Spotify OAuth redirect URI — must match the one registered in the Spotify Developer Dashboard. */
export function spotifyRedirectUri(req) {
  return `${publicOrigin(req)}/callback`;
}
