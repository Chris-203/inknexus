import { followPageZoom, pageZoom, type PageZoom } from './zoom';

afterEach(() => vi.useRealTimers());

function fakeViewport(scale: number) {
  return Object.assign(new EventTarget(), { scale, offsetLeft: 30, offsetTop: 120, width: 195, height: 422 });
}

describe('pageZoom', () => {
  it('is null at about 100%', () => {
    expect(pageZoom(fakeViewport(1) as unknown as VisualViewport, false)).toBeNull();
    expect(pageZoom(fakeViewport(1.04) as unknown as VisualViewport, false)).toBeNull();
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
