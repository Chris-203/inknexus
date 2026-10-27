import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { readJson, writeJson } from './storage';

// Whether the app icon shows how many series have new chapters, kept on this device only (not in backups).
const KEY = 'inknexus-app-badge';
const changes = createChanges();

/** Whether this browser can badge its icon. On iPhone that is only InkNexus opened from the Home Screen. */
export function canBadge(): boolean {
  return 'setAppBadge' in navigator;
}

/** Off unless turned on. */
export function badgesIcon(): boolean {
  return readJson(KEY) === true;
}

export function useBadgesIcon(): boolean {
  return useSyncExternalStore(changes.subscribe, badgesIcon);
}

/**
 * Turn the icon badge on or off. iPhone shows a badge only when notifications are allowed, so turning it on asks for
 * them first. Returns what to do when they were not allowed, and leaves the badge off.
 */
export async function setBadgesIcon(on: boolean): Promise<string | null> {
  if (on && typeof Notification !== 'undefined' && (await Notification.requestPermission()) !== 'granted')
    return 'Allow notifications for InkNexus to show the count on its icon. On iPhone: Settings, Notifications, InkNexus.';
  writeJson(KEY, on);
  changes.emit();
  return null;
}

/** Show `n` on the app icon, or clear it for 0. */
export function showBadge(n: number) {
  if (!canBadge()) return;
  // A badge the system refuses (notifications turned off since) only goes unseen; the switch says what it needs.
  (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}
