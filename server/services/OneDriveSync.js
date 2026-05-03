/**
 * OneDriveSync — wraps the `rclone` CLI to mirror a OneDrive folder down to
 * the local music directory. Designed for a single-admin self-host scenario:
 *
 *   1. Admin runs `rclone config` once via SSH to authorize OneDrive (browser-
 *      based OAuth). The token lives at ~/.config/rclone/rclone.conf.
 *   2. This service shells out to `rclone copy` periodically (or on demand)
 *      to mirror the configured remote folder into settings.onedrive.localFolder.
 *   3. We use `copy` not `sync` for safety — files removed from OneDrive will
 *      NOT be deleted from the server. Admin can run `sync` explicitly via the
 *      "delete missing" button in the UI if they want a true mirror.
 *
 * State (last run time, stats, errors) is persisted into settings.json so the
 * UI can show what happened without re-running anything.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { getSettings, saveSettings } from './SettingsStore.js';

let runningSync = null;          // null or Promise — guards against parallel runs
let intervalTimer = null;        // setInterval handle
let intervalCurrentMinutes = -1; // last interval we scheduled, so we know when to reschedule

// ── rclone presence + remote check ──
export function checkRcloneInstalled() {
  return new Promise(resolve => {
    const p = spawn('rclone', ['version']);
    p.on('error', () => resolve({ installed: false, version: null }));
    let out = '';
    p.stdout?.on('data', d => { out += d.toString(); });
    p.on('close', code => {
      if (code !== 0) return resolve({ installed: false, version: null });
      const m = out.match(/rclone\s+v(\S+)/);
      resolve({ installed: true, version: m?.[1] || 'unknown' });
    });
  });
}

export function checkRemoteConfigured(remoteName) {
  return new Promise(resolve => {
    const p = spawn('rclone', ['listremotes']);
    p.on('error', () => resolve(false));
    let out = '';
    p.stdout?.on('data', d => { out += d.toString(); });
    p.on('close', () => {
      const names = out.split('\n').map(s => s.trim().replace(/:$/, '')).filter(Boolean);
      resolve(names.includes(remoteName));
    });
  });
}

// Quick check: can we actually list the remote folder? Catches expired tokens
// and bad folder names early.
export function probeRemote(remoteName, remoteFolder) {
  return new Promise(resolve => {
    const arg = `${remoteName}:${remoteFolder}`;
    const p = spawn('rclone', ['lsd', arg, '--max-depth', '1']);
    let err = '';
    p.stderr?.on('data', d => { err += d.toString(); });
    p.on('error', e => resolve({ ok: false, error: e.message }));
    p.on('close', code => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.trim().split('\n').pop() || `rclone exit ${code}` });
    });
  });
}

// ── Local folder stats (after sync) ──
function statsForLocalFolder(folder) {
  if (!existsSync(folder)) return { totalFiles: 0, sizeBytes: 0 };
  let totalFiles = 0;
  let sizeBytes = 0;
  const audioExt = new Set(['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg']);
  const walk = dir => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase();
        if (!audioExt.has(ext)) continue;
        try {
          const s = statSync(p);
          sizeBytes += s.size;
          totalFiles++;
        } catch {}
      }
    }
  };
  walk(folder);
  return { totalFiles, sizeBytes };
}

// ── The actual sync run ──
export async function runSync({ deleteMissing = false } = {}) {
  // Single-flight guard — if a sync is already running, return its promise
  if (runningSync) return runningSync;

  const s = getSettings();
  const od = s.onedrive || {};
  if (!od.enabled) {
    return { ok: false, error: 'OneDrive sync לא פעיל בהגדרות' };
  }

  // Make sure the local folder exists
  try { if (!existsSync(od.localFolder)) mkdirSync(od.localFolder, { recursive: true }); }
  catch (e) { return persistResult(false, `יצירת תיקייה מקומית נכשלה: ${e.message}`); }

  const remoteArg = `${od.remoteName}:${od.remoteFolder}`;
  const verb = deleteMissing ? 'sync' : 'copy';
  const args = [
    verb,
    remoteArg,
    od.localFolder,
    '--transfers', '4',
    '--checkers', '8',
    '--stats', '0',           // we don't need rclone's interim stats
    '--use-json-log',
    '--log-level', 'INFO',
  ];

  runningSync = new Promise((resolve) => {
    const startedAt = Date.now();
    let added = 0, removed = 0, changed = 0;
    let lastError = '';
    const child = spawn('rclone', args);

    const consume = buf => {
      buf.toString().split('\n').forEach(line => {
        if (!line.trim()) return;
        try {
          const j = JSON.parse(line);
          const msg = j.msg || '';
          if (/^Copied/.test(msg))   added++;
          else if (/^Updated/.test(msg)) changed++;
          else if (/^Deleted/.test(msg)) removed++;
          if (j.level === 'error') lastError = msg;
        } catch { /* not json — rclone sometimes prints plain text */ }
      });
    };
    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);

    child.on('error', e => {
      runningSync = null;
      resolve(persistResult(false, `rclone לא נמצא או נכשל: ${e.message}`, startedAt));
    });
    child.on('close', code => {
      runningSync = null;
      const { totalFiles, sizeBytes } = statsForLocalFolder(od.localFolder);
      const stats = { added, removed, changed, totalFiles, sizeBytes };
      if (code === 0) {
        resolve(persistResult(true, `סנכרון הושלם · +${added} ✎${changed} −${removed}`, startedAt, stats));
      } else {
        resolve(persistResult(false, lastError || `rclone exit code ${code}`, startedAt, stats));
      }
    });
  });

  return runningSync;
}

function persistResult(ok, message, startedAt = Date.now(), stats = null) {
  const s = getSettings();
  s.onedrive = s.onedrive || {};
  s.onedrive.lastSyncAt = Date.now();
  s.onedrive.lastSyncOk = ok;
  s.onedrive.lastSyncMessage = message;
  if (stats) s.onedrive.lastSyncStats = stats;
  saveSettings(s);
  return { ok, message, durationMs: Date.now() - startedAt, stats };
}

// ── Periodic sync timer (re-reads settings each tick so UI changes apply) ──
export function startSyncScheduler() {
  // Check current settings every 30 seconds; if interval changed, reschedule
  const tick = () => {
    const s = getSettings();
    const od = s.onedrive || {};
    const desired = od.enabled ? Math.max(0, Number(od.syncIntervalMinutes) || 0) : 0;

    if (desired !== intervalCurrentMinutes) {
      if (intervalTimer) clearInterval(intervalTimer);
      intervalTimer = null;
      intervalCurrentMinutes = desired;
      if (desired > 0) {
        intervalTimer = setInterval(() => {
          // Run sync but swallow errors here — they're persisted anyway
          runSync().catch(() => {});
        }, desired * 60 * 1000);
        console.log(`[onedrive] sync scheduled every ${desired} min`);
      } else {
        console.log('[onedrive] periodic sync disabled');
      }
    }
  };
  tick();
  setInterval(tick, 30 * 1000);
}

// ── Public status snapshot for the API ──
export async function getStatus() {
  const s = getSettings();
  const od = s.onedrive || {};
  const rclone = await checkRcloneInstalled();
  const remoteOk = rclone.installed
    ? await checkRemoteConfigured(od.remoteName || 'onedrive')
    : false;
  const local = statsForLocalFolder(od.localFolder || '/home/oren/music');
  return {
    config: od,
    rclone,
    remoteConfigured: remoteOk,
    syncInProgress: !!runningSync,
    local,
  };
}
