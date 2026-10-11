import { mergeImport, planImport } from './importBackup';
import type { Series } from './types';

const s = (o: Partial<Series>): Series => ({ id: 'x', title: 'T', cover: '', md: null, al: null, links: [], last: 0, t: 0, ...o });

describe('planImport', () => {
  // Every fixture shares the title 'T', so these also check that an id match wins over a title match.
  it('finds series already in the library by id, MangaDex id, AniList id or title', () => {
    const lib = [s({ id: 'a' }), s({ id: 'b', md: 'm1' }), s({ id: 'c', al: 7 }), s({ id: 'd', title: 'Solo Leveling' })];
    const incoming = [
      s({ id: 'a', title: 'Other' }),
      s({ id: 'z1', md: 'm1' }),
      s({ id: 'z2', al: 7 }),
      s({ id: 'z3', title: 'solo leveling!' }),
      s({ id: 'z4', title: 'New one' }),
    ];
    const { fresh, dupes } = planImport(lib, incoming);
    expect(dupes.map((d) => [d.mine.id, d.theirs.id])).toEqual([
      ['a', 'a'],
      ['b', 'z1'],
      ['c', 'z2'],
      ['d', 'z3'],
    ]);
    expect(fresh.map((x) => x.id)).toEqual(['z4']);
  });

  it('does not match titles that have no letters or digits to compare, or missing ids', () => {
    const lib = [s({ id: 'a', title: '전지적 독자 시점' })];
    const { fresh, dupes } = planImport(lib, [s({ id: 'b', title: '나 혼자만 레벨업' })]);
    expect(dupes).toEqual([]);
    expect(fresh.map((x) => x.id)).toEqual(['b']);
  });
});

describe('mergeImport', () => {
  it('swaps in chosen backup versions under the library id, keeps the rest, and adds new series', () => {
    const lib = [s({ id: 'a', last: 3 }), s({ id: 'b', last: 5 }), s({ id: 'c', last: 1 })];
    const dupes = [
      { mine: lib[0]!, theirs: s({ id: 'a2', last: 9 }) },
      { mine: lib[1]!, theirs: s({ id: 'b2', last: 2 }) },
    ];
    const out = mergeImport(lib, [s({ id: 'n', last: 4 })], dupes, [true, false]);
    expect(out.map((x) => [x.id, x.last])).toEqual([
      ['a', 9],
      ['b', 5],
      ['c', 1],
      ['n', 4],
    ]);
  });
});
