import { parseFile } from 'music-metadata';
import { basename, extname } from 'path';
import { createHash } from 'crypto';

export async function getSongMetadata(filePath) {
  const id = createHash('sha1').update(filePath).digest('hex');
  let title = '', artist = '', album = '', year = '', genre = '', hasCover = false;

  try {
    const meta = await parseFile(filePath, { skipCovers: false, duration: true });
    const c = meta.common;
    title = c.title || '';
    artist = c.artist || (c.artists && c.artists[0]) || '';
    album = c.album || '';
    // Try multiple fields — different taggers use different fields
    year = '';
    if (c.year) year = String(c.year);
    else if (c.date) year = String(c.date).substring(0, 4);
    else if (c.originalyear) year = String(c.originalyear);
    else if (c.originaldate) year = String(c.originaldate).substring(0, 4);
    genre = (c.genre && c.genre[0]) ? c.genre[0].trim() : '';
    hasCover = !!(c.picture && c.picture.length > 0);
  } catch {
    // fall through to filename parsing
  }

  // Fallback: parse filename
  if (!title || !artist) {
    const name = basename(filePath, extname(filePath));
    // Common pattern: "Song Title - Artist Name - Spotimate.app" or "Artist - Title"
    const parts = name.split(' - ');
    if (parts.length >= 2) {
      if (!title) title = parts[0].trim();
      if (!artist) artist = parts[1].trim();
    } else if (!title) {
      title = name;
    }
  }

  return {
    id,
    filePath,
    filename: basename(filePath),
    title: title || basename(filePath, extname(filePath)),
    artist: artist || 'לא ידוע',
    album: album || '',
    year: year || '',
    genre: genre || '',
    hasCover,
    source: 'local',
  };
}

export async function getCoverBuffer(filePath) {
  try {
    const meta = await parseFile(filePath, { skipCovers: false });
    const pictures = meta.common.picture;
    if (pictures && pictures.length > 0) {
      return { data: pictures[0].data, format: pictures[0].format || 'image/jpeg' };
    }
  } catch {
    // no cover
  }
  return null;
}
