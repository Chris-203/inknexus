import { pastSlop, swipeEnd, swipeFollow, swipeStarts } from './swipe';

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

  it('stays still on a view that closes, swiped the way with nothing beside it', () => {
    expect(swipeFollow(-90, false, true)).toBe(0);
    expect(swipeFollow(90, true, true)).toBe(90);
  });
});

describe('swipeStarts', () => {
  it('closes a view only from the left side of the screen', () => {
    expect(swipeStarts(10, true)).toBe(true);
    expect(swipeStarts(39, true)).toBe(true);
    expect(swipeStarts(40, true)).toBe(false);
    expect(swipeStarts(195, true)).toBe(false);
    expect(swipeStarts(380, true)).toBe(false);
  });

  it('moves between shelves from anywhere', () => {
    expect(swipeStarts(195, false)).toBe(true);
  });
});

describe('pastSlop', () => {
  it('keeps a finger that barely moves a tap or a hold', () => {
    expect(pastSlop(0, 0)).toBe(false);
    expect(pastSlop(6, -6)).toBe(false);
  });

  it('ends it once the finger moves 10px in any direction', () => {
    expect(pastSlop(10, 0)).toBe(true);
    expect(pastSlop(-10, 0)).toBe(true);
    expect(pastSlop(0, 12)).toBe(true);
    expect(pastSlop(8, 8)).toBe(true);
  });
});
