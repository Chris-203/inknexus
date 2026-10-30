import { freshRanking, RANKING_TTL } from './ranking';
import { newSeries } from './storage';

describe('freshRanking', () => {
  const info = { al: 7, at: 1000, score: 84, lists: 10, ranks: [] };
  const x = { ...newSeries({ title: 'T' }), info };
  it('gives the saved ranking for the same AniList id while it is under a week old', () => {
    expect(freshRanking(x, 7, 1000 + RANKING_TTL - 1)).toBe(info);
  });
  it('gives nothing once it is a week old, for another AniList id, or without a saved one', () => {
    expect(freshRanking(x, 7, 1000 + RANKING_TTL)).toBeUndefined();
    expect(freshRanking(x, 8, 1000)).toBeUndefined();
    expect(freshRanking(undefined, 7, 1000)).toBeUndefined();
    expect(freshRanking(newSeries({ title: 'T' }), 7, 1000)).toBeUndefined();
  });
});
