import { codeFrom, exchange, newCode, syncStatus, type Answer } from './deviceSync';
import { noteChanges, toLog, type Merged, type Synced } from './sync';
import type { Series } from './types';

// Each series has its own name, so only the ones named alike on purpose are paired by name.
const s = (o: Partial<Series> & { id: string }): Series => ({ title: `Series ${o.id}`, cover: '', md: null, al: null, links: [], last: 0, t: 0, ...o });
type Save = { version: number; library: Synced };

/** The sync function as api/sync.js answers: a save based on an older version is refused with the current copy. */
function server() {
  const kept = { version: 0, library: null as unknown, saves: 0 };
  const call = async (save?: Save): Promise<Answer> => {
    if (!save) return { version: kept.version, library: kept.library };
    if (save.version !== kept.version) return { version: kept.version, library: kept.library, stale: true };
    kept.saves++;
    kept.library = JSON.parse(JSON.stringify(save.library));
    return { version: ++kept.version, library: undefined };
  };
  return { kept, call };
}

/** A device: its library and sync log, changed like the app changes them. */
function device(lib: Series[]) {
  const d = {
    lib,
    log: toLog(null),
    moved: {} as Record<string, string>,
    local: (): Synced => ({ lib: d.lib, log: d.log }),
    apply(m: Merged) {
      d.lib = m.lib;
      d.log = m.log;
      d.moved = m.moved;
    },
    change(at: number, next: (lib: Series[]) => Series[]) {
      const after = next(d.lib);
      d.log = noteChanges(d.log, d.lib, after, at);
      d.lib = after;
    },
    sync: (call: (save?: Save) => Promise<Answer>, now = 1000) => exchange(call, d.local, d.apply, () => now),
  };
  return d;
}

const byId = (lib: Series[]) => [...lib].sort((a, b) => a.id.localeCompare(b.id));
const edit = (id: string, o: Partial<Series>) => (lib: Series[]) => lib.map((x) => (x.id === id ? { ...x, ...o } : x));

describe('codeFrom', () => {
  it('reads a code however it is typed', () => {
    expect(codeFrom('abcde-fghjk-lmnpq-rstuv')).toBe('ABCDE-FGHJK-LMNPQ-RSTUV');
    expect(codeFrom('  ABCDE FGHJK\nLMNPQ RSTUV ')).toBe('ABCDE-FGHJK-LMNPQ-RSTUV');
    expect(codeFrom('abcdefghjklmnpqrstuv')).toBe('ABCDE-FGHJK-LMNPQ-RSTUV');
  });

  it('is null for text that is not a code', () => {
    for (const text of ['', 'ABCDE-FGHJK-LMNPQ-RSTU', 'ABCDE-FGHJK-LMNPQ-RSTUVW', 'https://example.com/']) expect(codeFrom(text)).toBeNull();
  });
});

describe('newCode', () => {
  it('makes a different code each time, in the form the sync function accepts and codeFrom reads back', () => {
    const codes = Array.from({ length: 50 }, newCode);
    expect(new Set(codes).size).toBe(50);
    for (const c of codes) {
      expect(c).toMatch(/^[2-9A-HJ-NP-Z]{5}(-[2-9A-HJ-NP-Z]{5}){3}$/);
      expect(c).toMatch(/^[\w-]{20,128}$/);
      expect(codeFrom(c)).toBe(c);
    }
  });
});

describe('syncStatus', () => {
  const now = 10 * 60e3;
  it('says when it last synced, or that the first sync is under way', () => {
    expect(syncStatus({ at: 0, error: '' }, now)).toBe('Syncing…');
    expect(syncStatus({ at: now - 5 * 60e3, error: '' }, now)).toBe('Synced 5 min ago.');
  });

  it('says why a sync failed, with the last one that worked', () => {
    expect(syncStatus({ at: 0, error: 'no connection' }, now)).toBe('Sync failed: no connection.');
    expect(syncStatus({ at: now - 5 * 60e3, error: 'no connection' }, now)).toBe('Sync failed: no connection. Last synced 5 min ago.');
  });
});

describe('exchange', () => {
  it('saves the first device’s library, then sends nothing while nothing changes', async () => {
    const { kept, call } = server();
    const phone = device([s({ id: 'a', last: 3 })]);
    await phone.sync(call);
    expect(kept).toMatchObject({ version: 1, saves: 1, library: { lib: [s({ id: 'a', last: 3 })] } });
    await phone.sync(call);
    await phone.sync(call);
    expect(kept.saves).toBe(1);
  });

  it('joins a second device’s library, and brings both to the same one', async () => {
    const { kept, call } = server();
    const phone = device([s({ id: 'p1', title: 'Same', last: 3 }), s({ id: 'p2', title: 'Phone only' })]);
    const computer = device([s({ id: 'c1', title: 'Same', last: 9 }), s({ id: 'c2', title: 'Computer only' })]);
    await phone.sync(call);
    await computer.sync(call);
    expect(computer.moved).toEqual({ c1: 'p1' });
    await phone.sync(call);
    expect(byId(phone.lib)).toEqual([s({ id: 'c2', title: 'Computer only' }), s({ id: 'p1', title: 'Same', last: 9 }), s({ id: 'p2', title: 'Phone only' })]);
    expect(byId(computer.lib)).toEqual(byId(phone.lib));
    expect(kept.saves).toBe(2);
  });

  it('passes on a chapter read, a shelf move and a removal between devices', async () => {
    const { call } = server();
    const phone = device([s({ id: 'a' }), s({ id: 'b' })]);
    const computer = device([]);
    await phone.sync(call);
    await computer.sync(call);

    phone.change(2000, edit('a', { last: 12, t: 2000 }));
    computer.change(2100, edit('a', { shelf: 'done' }));
    computer.change(2200, (lib) => lib.filter((x) => x.id !== 'b'));
    await phone.sync(call, 3000);
    await computer.sync(call, 3000);
    await phone.sync(call, 3000);
    expect(phone.lib).toEqual([s({ id: 'a', last: 12, t: 2000, shelf: 'done' })]);
    expect(computer.lib).toEqual(phone.lib);
    expect(computer.log).toEqual(phone.log);
  });

  it('merges with what another device saved in between, and sends again', async () => {
    const { kept, call } = server();
    const phone = device([s({ id: 'a' })]);
    const computer = device([]);
    await phone.sync(call);
    await computer.sync(call);
    phone.change(2000, edit('a', { last: 5 }));
    computer.change(2100, edit('a', { shelf: 'plan' }));

    // The computer saves after the phone has fetched the synced copy and before it saves.
    let first = true;
    await phone.sync(async (save) => {
      if (save && first) {
        first = false;
        await computer.sync(call, 3000);
      }
      return call(save);
    }, 3000);
    expect(phone.lib).toEqual([s({ id: 'a', last: 5, shelf: 'plan' })]);
    expect(kept).toMatchObject({ version: 3, library: { lib: [s({ id: 'a', last: 5, shelf: 'plan' })] } });
  });

  it('keeps a change made here while it was saving, and sends it the next time', async () => {
    const { kept, call } = server();
    const phone = device([s({ id: 'a' })]);
    await phone.sync(call);
    phone.change(2000, edit('a', { last: 5 }));
    await phone.sync(async (save) => {
      if (save) phone.change(2500, edit('a', { shelf: 'done' }));
      return call(save);
    }, 3000);
    expect(phone.lib).toEqual([s({ id: 'a', last: 5, shelf: 'done' })]);
    expect(kept.library).toMatchObject({ lib: [s({ id: 'a', last: 5 })] });
    await phone.sync(call, 3000);
    expect(kept.library).toMatchObject({ lib: [s({ id: 'a', last: 5, shelf: 'done' })] });
  });

  it('stops without saving when the synced copy cannot be read', async () => {
    const { kept, call } = server();
    kept.library = { lib: 'x' };
    const phone = device([s({ id: 'a' })]);
    await expect(phone.sync(call)).rejects.toThrow('cannot be read');
    expect(kept.saves).toBe(0);
    expect(phone.lib).toEqual([s({ id: 'a' })]);
  });

  it('gives up after other devices saved first five times in a row', async () => {
    const phone = device([s({ id: 'a' })]);
    let saves = 0;
    const busy = async (save?: Save): Promise<Answer> => {
      if (save) saves++;
      return { version: saves, library: { lib: [s({ id: 'b', last: saves })] }, stale: !!save };
    };
    await expect(phone.sync(busy)).rejects.toThrow('other devices kept saving');
    expect(saves).toBe(5);
  });

  it('passes a failed request on', async () => {
    const phone = device([s({ id: 'a' })]);
    await expect(phone.sync(() => Promise.reject(new Error('no connection')))).rejects.toThrow('no connection');
  });
});
