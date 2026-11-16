import { useSyncExternalStore } from 'react';
import { why } from './api';
import { createChanges } from './changes';
import { moveDownloads } from './downloads';
import { ago } from './format';
import { moveSpots } from './spots';
import { isObj, readJson, writeJson } from './storage';
import { getState, replaceState, watchStore } from './store';
import { mergeSynced, noteChanges, toLog, toSynced, type Merged, type SyncLog, type Synced } from './sync';

/**
 * This device's side of library sync. A device syncs while it has a sync code: every device with the same code shares
 * one library, kept by the Vercel Function api/sync.js. The code, the sync log and when the device last synced are kept
 * on this device only, never in the library or backups.
 */
const KEY = 'inknexus-sync';
const API = '/api/sync';
/** A change is sent this long after it, so several in a row go as one. */
const WAIT = 2000;
/** While the app is open, other devices' changes are fetched this often. */
const EVERY = 5 * 60e3;
/** Coming back to the app fetches them too, unless it just did. */
const FRESH = 15e3;
/** Letters and digits that are hard to mix up when a code is typed. */
const LETTERS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface SyncState {
  /** This device's sync code, or '' while sync is off. */
  code: string;
  /** When it last synced, in ms, or 0 before the first time. */
  at: number;
  busy: boolean;
  /** Why the last sync failed and what to do, or '' when it worked. */
  error: string;
}

/** What the sync function answers: the synced copy and its version, and whether a save was refused as out of date. */
export interface Answer {
  version: number;
  library: unknown;
  stale?: boolean;
}

/** Fetch the synced copy, or with `save`, send the library to replace version `save.version`. */
type Call = (save?: { version: number; library: Synced }) => Promise<Answer>;

/** A typed or pasted sync code as it is sent: 20 letters and digits in groups of five. Null when it is not one. */
export function codeFrom(text: string): string | null {
  const c = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return c.length === 20 ? c.match(/.{5}/g)!.join('-') : null;
}

/** A new sync code, 100 random bits: the code is all that keeps a synced library private. */
export function newCode(): string {
  return codeFrom(Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => LETTERS[b & 31]).join(''))!;
}

function syncHint(status: number): string {
  if (status === 401) return 'the sync code was refused; turn sync off and enter the code again';
  if (status === 403) return 'request refused; reload the page and try again';
  if (status === 413) return 'the library is too large to sync';
  if (status === 429) return 'too many sync requests; it will try again in a few minutes';
  if (status === 404 || status === 503) return 'sync is not set up on this site yet';
  return 'the sync server is not answering; it will try again in a few minutes';
}

async function call(code: string, save?: Parameters<Call>[0]): Promise<Answer> {
  const body = save && JSON.stringify(save);
  let r: Response;
  try {
    r = await fetch(API, {
      method: save ? 'PUT' : 'GET',
      headers: { Authorization: `Bearer ${code}`, ...(save && { 'Content-Type': 'application/json' }) },
      body,
      // Like api(): the function falls back to the Referer on browsers without Sec-Fetch-Site.
      referrerPolicy: 'same-origin',
      cache: 'no-store',
      // Lets a sync started as the app is left finish. Browsers refuse it on a large body.
      keepalive: !body || body.length < 16000,
    });
  } catch {
    throw new Error('no connection; it will try again when you are back online');
  }
  if (!r.ok && r.status !== 409) throw new Error(syncHint(r.status));
  // A site without the function answers with a page.
  const a: unknown = await r.json().catch(() => null);
  if (!isObj(a) || typeof a.version !== 'number') throw new Error(syncHint(404));
  return { version: a.version, library: a.library, stale: r.status === 409 };
}

/**
 * One sync: fetch the synced copy, merge this device's library with it, keep the result here with `apply`, and send it
 * when the synced copy lacks any of it. When another device saved in between, merge with what it saved and send again.
 */
export async function exchange(call: Call, local: () => Synced, apply: (m: Merged) => void, now = Date.now): Promise<void> {
  let theirs = await call();
  for (let tries = 0; tries < 5; tries++) {
    const copy = toSynced(theirs.library);
    if (theirs.library && !copy) throw new Error('the synced library cannot be read; turn sync off, then on again for a new code');
    const merged = mergeSynced(local(), copy ?? { lib: [], log: toLog(null) }, now());
    apply(merged);
    const mine = toSynced(merged)!;
    if (copy && JSON.stringify(mine) === JSON.stringify(copy)) return;
    theirs = await call({ version: theirs.version, library: mine });
    if (!theirs.stale) return;
  }
  throw new Error('other devices kept saving at the same moment; it will try again in a few minutes');
}

function load(): { state: SyncState; log: SyncLog } {
  const v = readJson(KEY);
  const code = (isObj(v) && typeof v.code === 'string' && codeFrom(v.code)) || '';
  const at = isObj(v) && typeof v.at === 'number' && v.at > 0 ? v.at : 0;
  return { state: { code, at, busy: false, error: '' }, log: toLog(isObj(v) ? v.log : null) };
}

let { state, log } = load();
/** The library as of the last change noted in the log. */
let seen = getState().lib;
/** Where series went whose id changed in this visit, old id to new, for a view still open on the old id. */
const moved: Record<string, string> = {};
const changes = createChanges();
/** Set while a change waits to be sent. */
let timer: ReturnType<typeof setTimeout> | undefined;
/** When a sync last started. */
let tried = 0;
let running: Promise<void> | null = null;
let next: Promise<void> | null = null;

function update(change: Partial<SyncState>) {
  state = { ...state, ...change };
  changes.emit();
}

function keep() {
  writeJson(KEY, state.code ? { code: state.code, at: state.at, log } : null);
}

export function useSync(): SyncState {
  return useSyncExternalStore(changes.subscribe, () => state);
}

/** The Settings line on sync. */
export function syncStatus(s: Pick<SyncState, 'at' | 'error'>, now = Date.now()): string {
  const when = s.at ? ago(s.at, now) : '';
  if (s.error) return `Sync failed: ${s.error}.${when && ` Last synced ${when}.`}`;
  return when ? `Synced ${when}.` : 'Syncing…';
}

/** The id series `id` has now: the synced copy's when sync paired it with a series from another device. */
export function movedTo(id: string): string {
  return moved[id] ?? id;
}

/** Take a merged library as this device's: the library, the log, and what is kept by series id on the device. */
function apply(m: Merged) {
  const mine = toSynced(m)!;
  log = mine.log;
  keep();
  moveSpots(m.moved);
  moveDownloads(m.moved);
  for (const id of Object.keys(moved)) moved[id] = m.moved[moved[id]!] ?? moved[id]!;
  Object.assign(moved, m.moved);
  if (JSON.stringify(mine.lib) === JSON.stringify(toSynced({ lib: getState().lib })!.lib)) return;
  // Seen first, so the merge is not noted as changes made here.
  seen = mine.lib;
  replaceState({ ...getState(), lib: mine.lib });
}

/**
 * Sync now, when sync is on. One sync runs at a time: asked during one, it syncs once more after it. Never rejects:
 * a failure goes to the state, for Settings to show.
 */
export function syncNow(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (!state.code) return Promise.resolve();
  if (running) return (next ??= running.then(() => ((next = null), syncNow())));
  const code = state.code;
  // Turned off or given a new code part way: nothing more is sent or kept under the old code.
  const still = () => state.code === code;
  tried = Date.now();
  update({ busy: true });
  running = exchange(
    (save) => (still() ? call(code, save) : Promise.reject(new Error('sync was turned off'))),
    () => ({ lib: getState().lib, log }),
    (m) => {
      if (still()) apply(m);
    },
  )
    .then(
      () => {
        if (!still()) return;
        update({ at: Date.now(), error: '' });
        keep();
      },
      (e) => {
        if (still()) update({ error: why(e) });
      },
    )
    .finally(() => {
      running = null;
      update({ busy: false });
    });
  return running;
}

function turnOn(code: string) {
  log = toLog(null);
  seen = getState().lib;
  update({ code, at: 0, error: '' });
  keep();
}

/** Turn sync on with a new code, or change the code, and save this device's library under it. */
export function startSync(): Promise<void> {
  turnOn(newCode());
  return syncNow();
}

/**
 * Sync with the library another device saved under a code. Throws, saying why, when the text is not a code, no library
 * is under it or it cannot be asked; sync then stays as it was.
 */
export async function joinSync(text: string): Promise<void> {
  const code = codeFrom(text);
  if (!code) throw new Error('That is not a sync code. A code has 20 letters and digits, like ABCDE-FGHJK-LMNPQ-RSTUV.');
  let found: Answer;
  try {
    found = await call(code);
  } catch (e) {
    throw new Error(`Could not check the code: ${why(e)}.`);
  }
  if (!found.library) throw new Error('No library is synced under that code. Check it against the device that shows it.');
  turnOn(code);
  await syncNow();
}

/** Turn sync off on this device. The synced copy stays for the other devices. */
export function stopSync() {
  clearTimeout(timer);
  timer = undefined;
  log = toLog(null);
  update({ code: '', at: 0, error: '' });
  keep();
}

watchStore(() => {
  const lib = getState().lib;
  if (lib === seen) return;
  if (state.code) {
    log = noteChanges(log, seen, lib, Date.now());
    keep();
    clearTimeout(timer);
    timer = setTimeout(syncNow, WAIT);
  }
  seen = lib;
});

if (typeof document !== 'undefined') {
  addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    // Leaving the app sends a change still waiting; coming back fetches what other devices changed.
    if (document.visibilityState === 'hidden' ? timer : Date.now() - tried > FRESH) void syncNow();
  });
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), EVERY);
  void syncNow();
}
