import { swipeEnd, swipeFollow } from './swipe';

describe('swipeEnd', () => {
  it('goes the way the finger moved past a quarter of the screen', () => {
    expect(swipeEnd(120, 0, 390)).toBe(1);
    expect(swipeEnd(-120, 0, 390)).toBe(-1);
  });

  it('goes on a fast flick, however short', () => {
    expect(swipeEnd(30, 0.8, 390)).toBe(1);
    expect(swipeEnd(-30, -0.8, 390)).toBe(-1);
  });

  it('stays on a short, slow swipe', () => {
    expect(swipeEnd(60, 0.2, 390)).toBe(0);
    expect(swipeEnd(-60, -0.2, 390)).toBe(0);
  });

  it('stays when the finger flicks back the other way at the end', () => {
    expect(swipeEnd(60, -0.8, 390)).toBe(0);
  });
});

describe('swipeFollow', () => {
  it('follows the finger where there is something to swipe to', () => {
    expect(swipeFollow(90, true)).toBe(90);
  });

  it('gives a third as much at the first or last shelf, to bounce back', () => {
    expect(swipeFollow(90, false)).toBe(30);
    expect(swipeFollow(-90, false)).toBe(-30);
  });
});
