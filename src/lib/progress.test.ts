import { readProgress } from './progress';

/** Pages stacked from `top`, one box per height. */
function stack(top: number, heights: number[]) {
  return heights.map((h) => {
    const p = { top, bottom: top + h };
    top += h;
    return p;
  });
}

describe('readProgress', () => {
  it('is 0 before there are pages', () => {
    expect(readProgress([], 800)).toBe(0);
  });

  it('counts the pages above the bottom of the screen and the share of the one crossing it', () => {
    expect(readProgress(stack(0, [1600, 1600, 1600, 1600]), 800)).toBe(0.125);
    expect(readProgress(stack(-2400, [1600, 1600, 1600, 1600]), 800)).toBe(0.5);
  });

  it('is 0 while the pages start below the screen', () => {
    expect(readProgress(stack(900, [1600, 1600]), 800)).toBe(0);
  });

  it('does not move back when pages below the screen load and grow', () => {
    // Three and three quarters of five pages read; the last one is still a 240px placeholder, then loads at 1600px.
    const before = readProgress(stack(-5200, [1600, 1600, 1600, 1600, 240]), 800);
    const after = readProgress(stack(-5200, [1600, 1600, 1600, 1600, 1600]), 800);
    expect(before).toBe(0.75);
    expect(after).toBe(0.75);
  });

  it('stops at the first page still loading, then moves on once it loads', () => {
    // Scrolled past two 240px placeholders into the last of 5 pages, then the third page loads.
    expect(readProgress(stack(-3000, [1600, 1600, 240, 240, 240]), 800, 2)).toBe(0.4);
    expect(readProgress(stack(-3000, [1600, 1600, 1600, 240, 240]), 800, 3)).toBe(0.475);
  });

  it('stops at 1 once the end of the pages is on screen', () => {
    expect(readProgress(stack(-7200, [4000, 4000]), 800)).toBe(1);
    expect(readProgress(stack(-7500, [4000, 4000]), 800)).toBe(1);
  });

  it('is 1 when a short chapter fits on one screen', () => {
    expect(readProgress(stack(60, [250, 250]), 800)).toBe(1);
  });
});
