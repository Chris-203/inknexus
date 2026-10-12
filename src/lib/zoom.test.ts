import { followPageZoom, pageZoom, zoomable, type PageZoom } from './zoom';

afterEach(() => vi.useRealTimers());

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

describe('zoomable', () => {
  afterEach(() => vi.unstubAllGlobals());

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
    zoomable(wrap as unknown as HTMLElement, pages as unknown as HTMLElement);
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
    const gesture = new Event('gesturestart', { cancelable: true });
    wrap.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(false);
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
