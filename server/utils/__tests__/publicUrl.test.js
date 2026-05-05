import { describe, it, expect } from 'vitest';
import { publicOrigin, spotifyRedirectUri } from '../publicUrl.js';

function makeReq({ protocol = 'http', host = 'localhost:3000' } = {}) {
  return {
    protocol,
    get(name) { return name.toLowerCase() === 'host' ? host : undefined; },
  };
}

describe('publicOrigin', () => {
  it('uses request protocol + host', () => {
    expect(publicOrigin(makeReq({ protocol: 'https', host: 'musicgame.duckdns.org:8443' })))
      .toBe('https://musicgame.duckdns.org:8443');
  });

  it('falls back to http://localhost when host is missing', () => {
    const req = { protocol: undefined, get: () => undefined };
    expect(publicOrigin(req)).toMatch(/^http:\/\/localhost:/);
  });
});

describe('spotifyRedirectUri', () => {
  it('appends /callback to the public origin', () => {
    expect(spotifyRedirectUri(makeReq({ protocol: 'https', host: 'example.com' })))
      .toBe('https://example.com/callback');
  });

  it('preserves non-standard ports (e.g. 8443)', () => {
    expect(spotifyRedirectUri(makeReq({ protocol: 'https', host: 'musicgame.duckdns.org:8443' })))
      .toBe('https://musicgame.duckdns.org:8443/callback');
  });
});
