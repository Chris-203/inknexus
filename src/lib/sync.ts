import { planImport, sameIds } from './importBackup';
import { isObj, toState } from './storage';
import { joined } from './store';
import type { Series } from './types';

/**
 * The parts of a series that sync on their own, so a shelf move on one device and a chapter read on another both
 * survive. A series' sources change together, because its chosen source is a place in its links. A field added to a
 * series syncs once it is in a part here. The ranking and the last-touched time follow on their own (see mergePair).
 */
const PARTS = {
  last: ['last'],
  shelf: ['shelf'],
  title: ['title'],
  cover: ['cover'],
  sources: ['md', 'mdh', 'al', 'links', 'src'],
} as const satisfies Record<string, readonly (keyof Series)[]>;

type Part = keyof typeof PARTS;
const NAMES = Object.keys(PARTS) as Part[];

/** When each part of a series last changed on a device, in ms. A part with no time has not changed since sync began. */
export type Times = Partial<Record<Part, number>>;

/** What sync keeps beside the library, so the library and backups stay as they are. */
export interface SyncLog {
  /** By series id. */
  changed: Record<string, Times>;
  /** When each removed series was removed, by series id, so it is removed on the other devices too. */
  removed: Record<string, number>;
}

/** A library with its sync log: what a device holds, and what it sends. */
export interface Synced {
  lib: Series[];
  log: SyncLog;
}

function isTime(v: unknown): v is number {
  return typeof v === 'number' && v > 0 && Number.isFinite(v);
}

function toTimes(v: unknown): Times {
  const times: Times = {};
  for (const p of NAMES) {
    const at = isObj(v) ? v[p] : 0;
    if (isTime(at)) times[p] = at;
  }
  return times;
}

/** A sync log from saved or synced data, with every time checked. Ids and parts come out in one order. */
export function toLog(v: unknown): SyncLog {
  const log: SyncLog = { changed: {}, removed: {} };
  const changed = isObj(v) && isObj(v.changed) ? v.changed : {};
  const removed = isObj(v) && isObj(v.removed) ? v.removed : {};
  for (const id of Object.keys(changed).sort()) {
    const times = toTimes(changed[id]);
    if (Object.keys(times).length) log.changed[id] = times;
  }
  for (const id of Object.keys(removed).sort()) {
    const at = removed[id];
    if (isTime(at)) log.removed[id] = at;
  }
  return log;
}

/**
 * A library with its sync log from saved or synced data, with every field checked and in one order, so two that hold
 * the same are the same as JSON. Null when it is not one.
 */
export function toSynced(v: unknown): Synced | null {
  const s = isObj(v) ? toState({ lib: v.lib }) : null;
  return s && { lib: s.lib, log: toLog(isObj(v) ? v.log : null) };
}

/** A removal is passed on for this long, then forgotten. A device away for longer brings the series back. */
export const REMOVED_FOR = 90 * 864e5;

function differs(a: Series, b: Series, part: Part): boolean {
  return PARTS[part].some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/**
 * `log` after the library went from `before` to `after` at `now`: each changed part of each series gets the time, a
 * new series gets it on every part, and a removed series is noted. Rankings are left out: they refresh on their own.
 */
export function noteChanges(log: SyncLog, before: Series[], after: Series[], now: number): SyncLog {
  const old = new Map(before.map((x) => [x.id, x]));
  const changed = { ...log.changed };
  const removed = { ...log.removed };
  for (const x of after) {
    const was = old.get(x.id);
    old.delete(x.id);
    if (was === x) continue;
    const parts = NAMES.filter((p) => !was || differs(was, x, p));
    if (parts.length) changed[x.id] = { ...changed[x.id], ...Object.fromEntries(parts.map((p) => [p, now])) };
    delete removed[x.id];
  }
  for (const id of old.keys()) {
    delete changed[id];
    removed[id] = now;
  }
  return { changed, removed };
}

/** Two series with the same name that MangaDex or AniList know as different ones. */
function clash(a: Series, b: Series): boolean {
  return (!!a.md && !!b.md && a.md !== b.md) || (a.al !== null && b.al !== null && a.al !== b.al);
}

/**
 * One series from two devices' versions, with `theirs`' id. Each part comes from the version that changed it last.
 * Where neither did, or both at the same moment, the versions are joined: the further chapter and every source.
 */
function mergePair(mine: Series, at: Times, theirs: Series, their: Times): { x: Series; times: Times } {
  let x = joined(theirs, mine);
  const times: Times = {};
  for (const p of NAMES) {
    const a = at[p] ?? 0;
    const b = their[p] ?? 0;
    if (a || b) times[p] = Math.max(a, b);
    const from = a > b ? mine : theirs;
    if (a !== b) x = { ...x, ...Object.fromEntries(PARTS[p].map((k) => [k, from[k]])) };
  }
  // A ranking belongs to one AniList entry; keep the newer one for the entry the series ends up with.
  const info = [mine.info, theirs.info].filter((i) => i?.al === Number(x.al)).sort((i, j) => j!.at - i!.at)[0];
  return { x: { ...x, info }, times };
}

/** A merged library, and the new id of each of this device's series that took the synced copy's id. */
export interface Merged extends Synced {
  moved: Record<string, string>;
}

/**
 * This device's library merged with the synced copy. A removal on either side wins unless the other side changed the
 * series after it. A series both sides have under one id is that series. The rest are paired like a backup import
 * (MangaDex id, AniList id or title), one to one, except that two series MangaDex or AniList know as different ones
 * stay apart. A pair keeps the synced copy's id, so every device ends on the same ids.
 */
export function mergeSynced(mine: Synced, theirs: Synced, now: number): Merged {
  const removed: Record<string, number> = {};
  for (const [id, at] of [...Object.entries(mine.log.removed), ...Object.entries(theirs.log.removed)]) {
    if (now - at < REMOVED_FOR) removed[id] = Math.max(at, removed[id] ?? 0);
  }
  // Removed series go before any pairing, so a removed series is never taken for another one with its name.
  const stays = (s: Synced) => s.lib.filter((x) => (removed[x.id] ?? -1) < Math.max(0, ...Object.values(s.log.changed[x.id] ?? {})));
  const ours = new Map(stays(mine).map((x) => [x.id, x]));
  const their = stays(theirs);
  const there = new Set(their.map((x) => x.id));

  // In planImport's words the library is the synced copy, so a duplicate's `mine` is their series and its `theirs` is ours.
  const plan = planImport(
    their.filter((x) => !ours.has(x.id)),
    [...ours.values()].filter((x) => !there.has(x.id)),
  );
  const pairs = new Map<string, Series>();
  const moved: Record<string, string> = {};
  for (const d of plan.dupes) {
    if (pairs.has(d.mine.id) || (!sameIds(d.mine, d.theirs) && clash(d.mine, d.theirs))) continue;
    pairs.set(d.mine.id, d.theirs);
    moved[d.theirs.id] = d.mine.id;
  }

  const lib: Series[] = [];
  const changed: Record<string, Times> = {};
  const add = (x: Series, times: Times) => {
    lib.push(x);
    if (Object.keys(times).length) changed[x.id] = times;
    delete removed[x.id];
  };
  for (const y of their) {
    const x = pairs.get(y.id) ?? ours.get(y.id);
    const times = theirs.log.changed[y.id] ?? {};
    const pair = x && mergePair(x, mine.log.changed[x.id] ?? {}, y, times);
    add(pair?.x ?? y, pair?.times ?? times);
  }
  for (const x of ours.values()) if (!there.has(x.id) && !(x.id in moved)) add(x, mine.log.changed[x.id] ?? {});
  return { lib, log: { changed, removed }, moved };
}
