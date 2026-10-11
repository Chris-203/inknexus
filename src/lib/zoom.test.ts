import { zoomable } from './zoom';

const rect = { top: 0, left: 0 };
let wrap: EventTarget & { scrollLeft: number; getBoundingClientRect: () => typeof rect };
let pages: { style: Map<string, string> & { setProperty: (k: string, v: string) => void }; getBoundingClientRect: () => typeof rect };

function touch(type: string, touches: { clientX: number; clientY: number }[]) {
  wrap.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { touches }));
}

function tap(x = 100, y = 100) {
  touch('touchstart', [{ clientX: x, clientY: y }]);
  touch('touchend', []);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('scrollY', 0);
  vi.stubGlobal('innerWidth', 400);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  wrap = Object.assign(new EventTarget(), { scrollLeft: 0, getBoundingClientRect: () => rect });
  const style = new Map<string, string>();
  pages = { style: Object.assign(style, { setProperty: (k: string, v: string) => void style.set(k, v) }), getBoundingClientRect: () => rect };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const onTap = vi.fn();
  const z = zoomable(wrap as unknown as HTMLElement, pages as unknown as HTMLElement, onTap);
  return { onTap, ...z };
}

describe('zoomable', () => {
  it('calls onTap for a single tap once a double tap is ruled out', () => {
    const { onTap } = setup();
    tap();
    expect(onTap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onTap).toHaveBeenCalledTimes(1);
  });
  it('zooms on a double tap without calling onTap', () => {
    const { onTap } = setup();
    tap();
    vi.advanceTimersByTime(100);
    tap();
    vi.advanceTimersByTime(400);
    expect(onTap).not.toHaveBeenCalled();
    expect(pages.style.get('--z')).toBe('2.5');
  });
  it('does not count a scroll as a tap', () => {
    const { onTap } = setup();
    touch('touchstart', [{ clientX: 100, clientY: 100 }]);
    touch('touchmove', [{ clientX: 100, clientY: 160 }]);
    touch('touchend', []);
    vi.advanceTimersByTime(400);
    expect(onTap).not.toHaveBeenCalled();
  });
  it('calls onTap for a mouse click, but not again for the click a tap fires', () => {
    const { onTap } = setup();
    wrap.dispatchEvent(new Event('click'));
    expect(onTap).toHaveBeenCalledTimes(1);
    tap();
    wrap.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(400);
    expect(onTap).toHaveBeenCalledTimes(2);
  });
  it('zoomBy steps the zoom and keeps it within 1x to 4x', () => {
    const { zoomBy } = setup();
    expect(zoomBy(0.5)).toBe(1.5);
    expect(pages.style.get('--z')).toBe('1.5');
    expect(zoomBy(-1)).toBe(1);
    expect(zoomBy(-0.5)).toBe(1);
    expect(zoomBy(10)).toBe(4);
  });
  it('stop removes the listeners and drops a waiting tap', () => {
    const { onTap, stop } = setup();
    tap();
    stop();
    vi.advanceTimersByTime(400);
    wrap.dispatchEvent(new Event('click'));
    expect(onTap).not.toHaveBeenCalled();
  });
});
