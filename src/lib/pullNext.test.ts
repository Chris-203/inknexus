import { PULL, pullBy } from './pullNext';

describe('pullBy', () => {
  it('rises half as far as the finger moved up', () => {
    expect(pullBy(600, 600)).toBe(0);
    expect(pullBy(600, 540)).toBe(30);
  });
  it('stays put when the finger moves down', () => {
    expect(pullBy(600, 700)).toBe(0);
  });
  it('stops at a full pull', () => {
    expect(pullBy(600, 600 - 2 * PULL)).toBe(PULL);
    expect(pullBy(600, 0)).toBe(PULL);
  });
});
