import { readProgress } from './progress';

describe('readProgress', () => {
  it('is 0 before the pages have a height', () => {
    expect(readProgress(0, 0, 800)).toBe(0);
  });

  it('counts the part of the pages above the bottom of the screen', () => {
    expect(readProgress(0, 8000, 800)).toBe(0.1);
    expect(readProgress(-3200, 8000, 800)).toBe(0.5);
  });

  it('is 0 while the pages start below the screen', () => {
    expect(readProgress(900, 8000, 800)).toBe(0);
  });

  it('stops at 1 once the end of the pages is on screen', () => {
    expect(readProgress(-7200, 8000, 800)).toBe(1);
    expect(readProgress(-7500, 8000, 800)).toBe(1);
  });

  it('is 1 when a short chapter fits on one screen', () => {
    expect(readProgress(60, 500, 800)).toBe(1);
  });
});
