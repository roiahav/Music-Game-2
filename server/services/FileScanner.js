import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.flac', '.ogg', '.wav', '.aac']);

export function scanFolder(folderPath) {
  const files = [];
  try {
    walk(folderPath, files);
  } catch (err) {
    throw new Error(`Cannot scan folder "${folderPath}": ${err.message}`);
  }
  return files;
}

function walk(dir, out) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && AUDIO_EXTS.has(extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
}
