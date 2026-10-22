import { followPageZoom, lockPageZoom, pageZoom, zoomable, type PageZoom } from './zoom';

const rect = { top: 0, left: 0 };
let wrap: EventTarget & { scrollLeft: number; getBoundingClientRect: () => typeof rect; classList: { toggle: () => void } };
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
  wrap = Object.assign(new EventTarget(), { scrollLeft: 0, getBoundingClientRect: () => rect, classList: { toggle: () => {} } });
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
    tap(100, 700);
    expect(onTap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith(700);
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

function fakeViewport(scale: number) {
  return Object.assign(new EventTarget(), { scale, offsetLeft: 30, offsetTop: 120, width: 195, height: 422 });
}

describe('pageZoom', () => {
  it('is null at about 100%', () => {
    expect(pageZoom(fakeViewport(1) as unknown as VisualViewport, false)).toBeNull();
    expect(pageZoom(fakeViewport(1.04) as unknown as VisualViewport, false)).toBeNull();
    expect(pageZoom(fakeViewport(0.96) as unknown as VisualViewport, false)).toBeNull();
  });
  it('counts zooming out as zoomed too', () => {
    expect(pageZoom(fakeViewport(0.6) as unknown as VisualViewport, true)).toMatchObject({ scale: 0.6, moving: true });
  });
  it('gives the scale and the part on screen when zoomed in', () => {
    expect(pageZoom(fakeViewport(2) as unknown as VisualViewport, true)).toEqual({ scale: 2, left: 30, top: 120, width: 195, height: 422, moving: true });
  });
});

describe('followPageZoom', () => {
  it('reports moving once while the zoom changes, then the settled zoom after it stops', () => {
    vi.useFakeTimers();
    const vv = fakeViewport(1);
    const seen: (PageZoom | null)[] = [];
    followPageZoom(vv as unknown as VisualViewport, (z) => seen.push(z));
    expect(seen).toEqual([null]);
    vv.scale = 1.5;
    vv.dispatchEvent(new Event('resize'));
    vv.scale = 2;
    vv.dispatchEvent(new Event('resize'));
    vv.offsetTop = 300;
    vi.advanceTimersByTime(150);
    vv.dispatchEvent(new Event('scroll'));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ scale: 1.5, moving: true });
    vi.advanceTimersByTime(200);
    expect(seen).toHaveLength(3);
    expect(seen[2]).toMatchObject({ scale: 2, top: 300, moving: false });
  });
  it('reports null straight away when zoomed back to 100%', () => {
    vi.useFakeTimers();
    const vv = fakeViewport(2);
    const seen: (PageZoom | null)[] = [];
    followPageZoom(vv as unknown as VisualViewport, (z) => seen.push(z));
    vv.scale = 1;
    vv.dispatchEvent(new Event('resize'));
    expect(seen.at(-1)).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(seen.at(-1)).toBeNull();
  });
  it('stops listening when stopped', () => {
    vi.useFakeTimers();
    const vv = fakeViewport(1);
    const seen: (PageZoom | null)[] = [];
    const stop = followPageZoom(vv as unknown as VisualViewport, (z) => seen.push(z));
    stop();
    vv.scale = 2;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([null]);
  });
});

describe('zoomable while the browser has zoomed the whole page', () => {
  function setup(pageScale: number) {
    const vv = fakeViewport(pageScale);
    vi.stubGlobal('window', { visualViewport: vv, scrollTo: vi.fn() });
    vi.stubGlobal('scrollY', 0);
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => {
      f();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const classes = new Set<string>();
    const rect = () => ({ left: 0, top: 0 });
    const wrap = Object.assign(new EventTarget(), {
      scrollLeft: 0,
      getBoundingClientRect: rect,
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    });
    const pages = { getBoundingClientRect: rect, style: { setProperty: vi.fn() } };
    zoomable(wrap as unknown as HTMLElement, pages as unknown as HTMLElement, () => {});
    return { vv, wrap, pages, classes };
  }
  function touch(type: string, points: [number, number][]) {
    return Object.assign(new Event(type, { cancelable: true }), { touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
  }
  function pinch(wrap: EventTarget) {
    wrap.dispatchEvent(
      touch('touchstart', [
        [100, 300],
        [200, 300],
      ]),
    );
    const move = touch('touchmove', [
      [50, 300],
      [250, 300],
    ]);
    wrap.dispatchEvent(move);
    return move;
  }

  it('has no touchmove listener that can cancel until two fingers are down, so iPhone never waits on one to scroll', () => {
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const { wrap } = setup(1);
    const blocking = () => add.mock.calls.filter(([type, , o]) => type === 'touchmove' && !(o as AddEventListenerOptions | undefined)?.passive);
    expect(blocking()).toHaveLength(0);
    pinch(wrap);
    expect(blocking()).toHaveLength(1);
    add.mockRestore();
  });
  it('stops cancelling touchmove once the pinch ends', () => {
    const { wrap } = setup(1);
    pinch(wrap);
    wrap.dispatchEvent(touch('touchend', []));
    wrap.dispatchEvent(touch('touchstart', [[100, 300]]));
    const move = touch('touchmove', [[100, 200]]);
    wrap.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
  });
  it('zooms the pages on a pinch and keeps the browser from zooming the page', () => {
    const { wrap, pages, classes } = setup(1);
    expect(pinch(wrap).defaultPrevented).toBe(true);
    expect(pages.style.setProperty).toHaveBeenCalledWith('--z', '2');
    expect(classes.has('pagezoom')).toBe(false);
  });
  it('leaves pinches to the browser while it has zoomed the whole page, so it can return to 100%', () => {
    const { wrap, pages, classes } = setup(2);
    expect(pinch(wrap).defaultPrevented).toBe(false);
    expect(pages.style.setProperty).not.toHaveBeenCalled();
    expect(classes.has('pagezoom')).toBe(true);
  });
  it('leaves pinches to the browser while it has zoomed the whole page out', () => {
    const { wrap, classes } = setup(0.7);
    expect(pinch(wrap).defaultPrevented).toBe(false);
    expect(classes.has('pagezoom')).toBe(true);
  });
  it('takes pinches back once the browser is at 100% again', () => {
    const { vv, wrap, classes } = setup(2);
    vv.scale = 1;
    vv.dispatchEvent(new Event('resize'));
    expect(classes.has('pagezoom')).toBe(false);
    expect(pinch(wrap).defaultPrevented).toBe(true);
  });
});

describe('lockPageZoom', () => {
  function setup(pageScale: number) {
    const vv = fakeViewport(pageScale);
    const classes = new Set<string>();
    const toggle = (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c));
    const doc = Object.assign(new EventTarget(), { documentElement: { classList: { toggle } } });
    vi.stubGlobal('window', { visualViewport: vv });
    vi.stubGlobal('document', doc);
    lockPageZoom();
    return { vv, doc, classes };
  }
  function gesturePrevented(doc: EventTarget) {
    const e = new Event('gesturestart', { cancelable: true });
    doc.dispatchEvent(e);
    return e.defaultPrevented;
  }

  it('stops the browser zooming the app at 100%', () => {
    const { doc, classes } = setup(1);
    expect(gesturePrevented(doc)).toBe(true);
    expect(classes.has('pagezoom')).toBe(false);
  });
  it('lifts the lock while the browser has zoomed the page anyway, so it can get back to 100%', () => {
    const { vv, doc, classes } = setup(2);
    expect(gesturePrevented(doc)).toBe(false);
    expect(classes.has('pagezoom')).toBe(true);
    vv.scale = 1;
    vv.dispatchEvent(new Event('resize'));
    expect(classes.has('pagezoom')).toBe(false);
    expect(gesturePrevented(doc)).toBe(true);
  });
});
