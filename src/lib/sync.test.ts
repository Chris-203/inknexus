import { mergeSynced, noteChanges, REMOVED_FOR, type SyncLog, type Synced } from './sync';
import type { Link, Series } from './types';

const s = (o: Partial<Series>): Series => ({ id: 'x', title: 'T', cover: '', md: null, al: null, links: [], last: 0, t: 0, ...o });
const l = (url: string): Link => ({ label: '', url });
const EMPTY: SyncLog = { changed: {}, removed: {} };
const side = (lib: Series[], log: Partial<SyncLog> = {}): Synced => ({ lib, log: { ...EMPTY, ...log } });
const MD1 = '11111111-1111-1111-1111-111111111111';
const MD2 = '22222222-2222-2222-2222-222222222222';
const ALL = { last: 5, shelf: 5, title: 5, cover: 5, sources: 5 };
const byId = (lib: Series[]) => [...lib].sort((a, b) => a.id.localeCompare(b.id));

describe('noteChanges', () => {
  it('gives the time to each part that changed, and leaves the others', () => {
    const a = s({ id: 'a', last: 3 });
    const b = s({ id: 'b' });
    const log = noteChanges({ changed: { a: { shelf: 1 } }, removed: {} }, [a, b], [{ ...a, last: 4, t: 9 }, b], 5);
    expect(log).toEqual({ changed: { a: { shelf: 1, last: 5 } }, removed: {} });
  });

  it('counts a move back to Reading, a new name, a new cover and a hidden source', () => {
    const a = s({ id: 'a', shelf: 'done', md: MD1, links: [l('https://a.example/1')] });
    expect(noteChanges(EMPTY, [a], [{ ...a, shelf: undefined }], 5).changed).toEqual({ a: { shelf: 5 } });
    expect(noteChanges(EMPTY, [a], [{ ...a, title: 'New' }], 5).changed).toEqual({ a: { title: 5 } });
    expect(noteChanges(EMPTY, [a], [{ ...a, cover: 'https://a.example/c.png' }], 5).changed).toEqual({ a: { cover: 5 } });
    expect(noteChanges(EMPTY, [a], [{ ...a, mdh: true, src: '' }], 5).changed).toEqual({ a: { sources: 5 } });
    expect(noteChanges(EMPTY, [a], [{ ...a, links: [{ ...a.links[0]!, rn: 7 }] }], 5).changed).toEqual({ a: { sources: 5 } });
  });

  it('gives a new series the time on every part', () => {
    expect(noteChanges(EMPTY, [], [s({ id: 'a' })], 5).changed).toEqual({ a: ALL });
  });

  it('leaves out a refreshed ranking, a new last-touched time and a copy that changed nothing', () => {
    const a = s({ id: 'a', al: 7 });
    const info = { al: 7, at: 9, score: 80, lists: 1, ranks: [] };
    expect(noteChanges(EMPTY, [a], [{ ...a, info }], 5)).toEqual(EMPTY);
    expect(noteChanges(EMPTY, [a], [{ ...a, t: 9 }], 5)).toEqual(EMPTY);
    expect(noteChanges(EMPTY, [a], [{ ...a, links: [] }], 5)).toEqual(EMPTY);
  });

  it('notes a removed series and forgets its times, and forgets the removal when the series is back', () => {
    const a = s({ id: 'a' });
    const gone = noteChanges({ changed: { a: { last: 1 } }, removed: {} }, [a], [], 5);
    expect(gone).toEqual({ changed: {}, removed: { a: 5 } });
    expect(noteChanges(gone, [], [a], 6)).toEqual({ changed: { a: { last: 6, shelf: 6, title: 6, cover: 6, sources: 6 } }, removed: {} });
  });

  it('does not change the log it was given', () => {
    const log: SyncLog = { changed: { a: { last: 1 } }, removed: { b: 1 } };
    noteChanges(log, [s({ id: 'a' })], [s({ id: 'b' })], 5);
    expect(log).toEqual({ changed: { a: { last: 1 } }, removed: { b: 1 } });
  });
});

describe('mergeSynced', () => {
  it('joins two libraries that never synced: every series, the further chapter, every source, the synced copy’s ids', () => {
    const mine = side([
      s({ id: 'p1', title: 'Solo Leveling', md: MD1, last: 10, t: 4, links: [l('https://a.example/1')] }),
      s({ id: 'p2', title: 'Phone only' }),
      s({ id: 'p3', title: 'Same name!', last: 2 }),
    ]);
    const theirs = side([
      s({ id: 'c1', title: 'Solo Leveling (Official)', md: MD1, last: 4, t: 9, shelf: 'done', links: [l('https://b.example/1')] }),
      s({ id: 'c2', title: 'Computer only' }),
      s({ id: 'c3', title: 'same name', last: 1 }),
    ]);
    const r = mergeSynced(mine, theirs, 100);
    expect(r.lib).toEqual([
      s({ id: 'c1', title: 'Solo Leveling (Official)', md: MD1, last: 10, t: 9, shelf: 'done', links: [l('https://b.example/1'), l('https://a.example/1')] }),
      s({ id: 'c2', title: 'Computer only' }),
      s({ id: 'c3', title: 'same name', last: 2 }),
      s({ id: 'p2', title: 'Phone only' }),
    ]);
    expect(r.moved).toEqual({ p1: 'c1', p3: 'c3' });
    expect(r.log).toEqual(EMPTY);
  });

  it('keeps apart two series with one name that MangaDex or AniList know as different ones', () => {
    const r = mergeSynced(
      side([s({ id: 'p1', md: MD1 }), s({ id: 'p2', title: 'U', al: 1 })]),
      side([s({ id: 'c1', md: MD2 }), s({ id: 'c2', title: 'U', al: 2 })]),
      100,
    );
    expect(r.lib.map((x) => x.id)).toEqual(['c1', 'c2', 'p1', 'p2']);
    expect(r.moved).toEqual({});
  });

  it('still pairs a series with the same id or MangaDex id when its AniList match differs', () => {
    const r = mergeSynced(side([s({ id: 'a', al: 1 }), s({ id: 'p', md: MD1, al: 1 })]), side([s({ id: 'a', al: 2 }), s({ id: 'c', md: MD1, al: 2 })]), 100);
    expect(r.lib.map((x) => [x.id, x.al])).toEqual([
      ['a', 2],
      ['c', 2],
    ]);
  });

  it('takes each part from the side that changed it last, so a shelf move and a chapter read both survive', () => {
    const mine = side([s({ id: 'a', last: 12, t: 50, shelf: 'plan', title: 'Old name' })], { changed: { a: { last: 50, title: 10 } } });
    const theirs = side([s({ id: 'a', last: 11, t: 40, shelf: 'done', title: 'New name' })], { changed: { a: { last: 40, shelf: 45, title: 20 } } });
    const r = mergeSynced(mine, theirs, 100);
    expect(r.lib).toEqual([s({ id: 'a', last: 12, t: 50, shelf: 'done', title: 'New name' })]);
    expect(r.log.changed).toEqual({ a: { last: 50, shelf: 45, title: 20 } });
  });

  it('takes a chapter set back on purpose over a further one changed earlier or never', () => {
    const lower = side([s({ id: 'a', last: 8 })], { changed: { a: { last: 50 } } });
    expect(mergeSynced(lower, side([s({ id: 'a', last: 10 })], { changed: { a: { last: 40 } } }), 100).lib[0]!.last).toBe(8);
    expect(mergeSynced(lower, side([s({ id: 'a', last: 10 })]), 100).lib[0]!.last).toBe(8);
    expect(mergeSynced(side([s({ id: 'a', last: 10 })]), lower, 100).lib[0]!.last).toBe(8);
  });

  it('passes on a move back to Reading and a removed link', () => {
    const mine = side([s({ id: 'a', links: [l('https://a.example/1')], src: 'l0' })], { changed: { a: { shelf: 50, sources: 50 } } });
    const theirs = side([s({ id: 'a', shelf: 'drop', md: MD1, links: [l('https://b.example/1'), l('https://a.example/1')], src: 'l1' })]);
    const [x] = mergeSynced(mine, theirs, 100).lib;
    expect(x).toEqual(s({ id: 'a', links: [l('https://a.example/1')], src: 'l0' }));
    expect(x!.shelf).toBeUndefined();
  });

  it('removes a series removed on either side, unless the other side changed it after', () => {
    const kept = side([s({ id: 'a' }), s({ id: 'b' })], { changed: { a: { last: 30 }, b: { last: 60 } } });
    const removed = side([], { removed: { a: 50, b: 50 } });
    for (const r of [mergeSynced(kept, removed, 100), mergeSynced(removed, kept, 100)]) {
      expect(r.lib.map((x) => x.id)).toEqual(['b']);
      expect(r.log).toEqual({ changed: { b: { last: 60 } }, removed: { a: 50 } });
    }
  });

  it('removes a series that never changed, and one paired under another id', () => {
    const r = mergeSynced(side([s({ id: 'a' }), s({ id: 'p', md: MD1 })]), side([s({ id: 'c', md: MD1 })], { removed: { a: 50, p: 50 } }), 100);
    expect(r.lib).toEqual([]);
    expect(r.log.removed).toEqual({ a: 50, p: 50 });
  });

  it('forgets a removal after 90 days, so a device away for longer brings the series back', () => {
    const r = mergeSynced(side([s({ id: 'a' })]), side([], { removed: { a: 50, b: 60 } }), 55 + REMOVED_FOR);
    expect(r.lib.map((x) => x.id)).toEqual(['a']);
    expect(r.log.removed).toEqual({ b: 60 });
  });

  it('keeps the newer ranking for the AniList entry the series ends up with', () => {
    const info = (al: number, at: number) => ({ al, at, score: 80, lists: 1, ranks: [] });
    const newer = mergeSynced(side([s({ id: 'a', al: 7, info: info(7, 9) })]), side([s({ id: 'a', al: 7, info: info(7, 3) })]), 100);
    expect(newer.lib[0]!.info).toEqual(info(7, 9));
    const rematched = mergeSynced(
      side([s({ id: 'a', al: 8, info: info(8, 9) })]),
      side([s({ id: 'a', al: 7, info: info(7, 3) })], { changed: { a: { sources: 5 } } }),
      100,
    );
    expect(rematched.lib[0]).toEqual(s({ id: 'a', al: 7, info: info(7, 3) }));
    const none = mergeSynced(side([s({ id: 'a', al: 8, info: info(8, 9) })]), side([s({ id: 'a', al: 9 })], { changed: { a: { sources: 5 } } }), 100);
    expect(none.lib[0]!.al).toBe(9);
    expect(none.lib[0]!.info).toBeUndefined();
  });

  it('merges two of this device’s series that the synced copy has as one', () => {
    const mine = side([s({ id: 'p1', md: MD1, last: 3 }), s({ id: 'p2', title: 'Other', al: 7, last: 9 })]);
    const r = mergeSynced(mine, side([s({ id: 'c', md: MD1, al: 7 })]), 100);
    expect(r.lib).toEqual([s({ id: 'c', md: MD1, al: 7, last: 9 })]);
    expect(r.moved).toEqual({ p1: 'c', p2: 'c' });
  });

  it('brings every device to the same library whatever order they sync in', () => {
    const phone = side(
      [s({ id: 'p1', md: MD1, last: 10, links: [l('https://a.example/1')] }), s({ id: 'p2', title: 'Phone only', shelf: 'plan' }), s({ id: 'k', last: 3 })],
      { changed: { k: { last: 70 } }, removed: { gone: 60 } },
    );
    const computer = side([s({ id: 'c1', md: MD1, last: 4, shelf: 'done' }), s({ id: 'gone', title: 'Gone' }), s({ id: 'k', last: 5, shelf: 'drop' })], {
      changed: { k: { last: 40, shelf: 80 } },
    });
    const tablet = side([s({ id: 't1', title: 'Phone only!', last: 2 }), s({ id: 'k', last: 1 })], { removed: { k: 20 } });

    // The phone turns sync on, the computer joins, then the tablet, and each syncs once more.
    let synced: Synced = phone;
    const devices = [computer, tablet, phone, computer, tablet].map((d) => (synced = mergeSynced(d, synced, 100)));
    const [, , p, c, t] = devices;
    for (const d of [p!, c!, t!]) {
      expect(byId(d.lib)).toEqual(byId(t!.lib));
      expect(d.log).toEqual(t!.log);
    }
    expect(byId(t!.lib)).toEqual([
      s({ id: 'k', last: 3, shelf: 'drop' }),
      s({ id: 'p1', md: MD1, last: 10, links: [l('https://a.example/1')] }),
      s({ id: 'p2', title: 'Phone only', shelf: 'plan', last: 2 }),
    ]);
    // Merging again changes nothing.
    expect(mergeSynced(t!, t!, 100)).toEqual({ ...t!, moved: {} });
  });
});
