import { pageZoom } from './zoom';

function vv(scale: number) {
  return { scale, offsetLeft: 30, offsetTop: 120, width: 195, height: 422 } as VisualViewport;
}

describe('pageZoom', () => {
  it('is null at about 100%', () => {
    expect(pageZoom(vv(1))).toBeNull();
    expect(pageZoom(vv(1.04))).toBeNull();
  });
  it('gives the scale and the part on screen when zoomed in', () => {
    expect(pageZoom(vv(2))).toEqual({ scale: 2, left: 30, top: 120, width: 195, height: 422 });
  });
});
