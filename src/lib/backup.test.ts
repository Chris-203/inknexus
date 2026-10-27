import { backupName, backupStatus, lastBackup } from './backup';
import type { Series } from './types';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

const series = (t: number): Series => ({ id: 'a', title: 'A', cover: '', md: null, al: null, links: [], last: 3, t });
const now = new Date(2026, 9, 27, 12).getTime();

describe('backup', () => {
  it('names the file by the local date', () => {
    expect(backupName(new Date(2026, 0, 5, 23, 30))).toBe('inknexus-backup-2026-01-05.json');
  });
  it('has no last backup until one is saved, and ignores a bad saved value', () => {
    expect(lastBackup()).toBe(0);
    memory.set('inknexus-last-backup', '"soon"');
    expect(lastBackup()).toBe(0);
    memory.set('inknexus-last-backup', String(now));
    expect(lastBackup()).toBe(now);
  });
  it('says when the library was last backed up and whether reading changed after', () => {
    expect(backupStatus({ lib: [] }, 0, now)).toBe('Nothing to back up yet.');
    expect(backupStatus({ lib: [series(now)] }, 0, now)).toBe('Not backed up from this device yet.');
    expect(backupStatus({ lib: [series(now - 1000)] }, now, now)).toBe('Last backed up today.');
    expect(backupStatus({ lib: [series(now)] }, now - 3 * 864e5, now)).toBe('Last backed up 3 days ago. Your reading changed since then.');
  });
});
