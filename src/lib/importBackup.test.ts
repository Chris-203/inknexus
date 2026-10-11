import { chaptersDiffer, mergeImport, mergeSeries, planImport } from './importBackup';
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

describe('chaptersDiffer', () => {
  it('asks only when the last chapter read differs, decimals included', () => {
    expect(chaptersDiffer({ mine: s({ last: 12 }), theirs: s({ last: 12 }) })).toBe(false);
    expect(chaptersDiffer({ mine: s({ last: 12 }), theirs: s({ last: 12.5 }) })).toBe(true);
    expect(chaptersDiffer({ mine: s({ last: 0 }), theirs: s({ last: 3 }) })).toBe(true);
  });
});

describe('mergeSeries', () => {
  const site = (n: number) => ({ label: `S${n}`, url: `https://s${n}.example/` });
  it('takes reading progress from the chosen version and keeps the library id', () => {
    const mine = s({ id: 'a', title: 'Mine', last: 3 });
    const theirs = s({ id: 'b', title: 'Theirs', last: 9 });
    expect(mergeSeries(mine, theirs, true)).toMatchObject({ id: 'a', title: 'Theirs', last: 9 });
    expect(mergeSeries(mine, theirs, false)).toMatchObject({ id: 'a', title: 'Mine', last: 3 });
  });
  it('keeps the sources of whichever version has more, whichever version is chosen', () => {
    const mine = s({ last: 3, links: [site(1)] });
    const theirs = s({ last: 9, md: 'm1', links: [site(2)], src: 'md' });
    for (const useBackup of [true, false]) expect(mergeSeries(mine, theirs, useBackup)).toMatchObject({ md: 'm1', links: [site(2)], src: 'md' });
    expect(mergeSeries(theirs, mine, false)).toMatchObject({ md: 'm1', links: [site(2)] });
  });
  it("keeps the library's sources on a tie", () => {
    const mine = s({ links: [site(1)] });
    const theirs = s({ links: [site(2)] });
    expect(mergeSeries(mine, theirs, true).links).toEqual([site(1)]);
  });
});

describe('mergeImport', () => {
  it('merges every duplicate, takes backup progress only where chosen, keeps the rest, and adds new series', () => {
    const lib = [s({ id: 'a', last: 3 }), s({ id: 'b', last: 5 }), s({ id: 'c', last: 1 })];
    const dupes = [
      { mine: lib[0]!, theirs: s({ id: 'a2', last: 9 }) },
      { mine: lib[1]!, theirs: s({ id: 'b2', last: 2 }) },
    ];
    const out = mergeImport(lib, [s({ id: 'n', last: 4 })], dupes, [dupes[0]!]);
    expect(out.map((x) => [x.id, x.last])).toEqual([
      ['a', 9],
      ['b', 5],
      ['c', 1],
      ['n', 4],
    ]);
  });
});
