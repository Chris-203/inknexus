import { getScrollSpeed, scrollDistance, setScrollSpeed, stepSpeed } from './autoScroll';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('auto scroll', () => {
  it('starts at 1×, remembers the speed and ignores bad saved values', () => {
    expect(getScrollSpeed()).toBe(1);
    setScrollSpeed(1.5);
    expect(getScrollSpeed()).toBe(1.5);
    memory.set('inknexus-scroll-speed', '7');
    expect(getScrollSpeed()).toBe(1);
  });
  it('stepSpeed steps through 0.25×–3× and stops at either end', () => {
    expect(stepSpeed(1, 1)).toBe(1.25);
    expect(stepSpeed(1, -1)).toBe(0.75);
    expect(stepSpeed(3, 1)).toBe(3);
    expect(stepSpeed(0.5, -1)).toBe(0.25);
    expect(stepSpeed(0.25, -1)).toBe(0.25);
  });
  it('scrolls 175px a second at 1×, carrying the fraction between frames so slow speeds lose nothing', () => {
    expect(scrollDistance(1, 1000 / 60, 0)[0]).toBe(2);
    expect(scrollDistance(1, 1000 / 60, 0)[1]).toBeCloseTo(0.917);
    let px = 0;
    let carry = 0;
    for (let i = 0; i < 120; i++) {
      const [p, c] = scrollDistance(0.25, 1000 / 120, carry);
      px += p;
      carry = c;
    }
    expect(px + carry).toBeCloseTo(43.75);
  });
  it('never jumps after a long gap', () => {
    expect(scrollDistance(1, 5000, 0)[0]).toBe(17);
  });
});
