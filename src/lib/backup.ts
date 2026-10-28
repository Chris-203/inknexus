import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { daysAgo } from './format';
import { readJson, writeJson } from './storage';
import type { State } from './types';

// When a backup file was last saved from this device, kept on this device only (not in backups).
const KEY = 'inknexus-last-backup';
const changes = createChanges();

/** When a backup was last saved here, or 0 when none was. */
export function lastBackup(): number {
  const t = readJson(KEY);
  return typeof t === 'number' && t > 0 ? t : 0;
}

export function useLastBackup(): number {
  return useSyncExternalStore(changes.subscribe, lastBackup);
}

/** The backup's file name, dated so backups saved on different days do not replace each other. */
export function backupName(now = new Date()): string {
  const d = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((v) => String(v).padStart(2, '0')).join('-');
  return `inknexus-backup-${d}.json`;
}

/** The Settings line on the last backup, saying when the library changed after it. */
export function backupStatus(s: State, at: number, now = Date.now()): string {
  if (!at) return s.lib.length ? 'Not backed up from this device yet.' : 'Nothing to back up yet.';
  const changed = s.lib.some((x) => x.t > at);
  return `Last backed up ${daysAgo(at, now)}.${changed ? ' Your reading changed since then.' : ''}`;
}

/**
 * Save `s` as a backup file. On a phone it goes through the share sheet, where Save to Files can put it in iCloud Drive
 * or Google Drive and AirDrop can send it to another device; elsewhere, or when sharing fails, it downloads. Closing the
 * share sheet without saving leaves the last backup time as it was.
 */
export async function saveBackup(s: State) {
  const file = new File([JSON.stringify(s)], backupName(), { type: 'application/json' });
  // Desktop browsers that can share files show a share menu with no plain save, so they download instead.
  const share = matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] });
  if (share) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      download(file);
    }
  } else download(file);
  writeJson(KEY, Date.now());
  changes.emit();
}

function download(file: File) {
  const u = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = u;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download on iOS Safari.
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
