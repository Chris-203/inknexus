import { getTheme, setTheme } from './theme';

const memory = new Map<string, string>();
const root = { dataset: {} as Record<string, string> };
const meta = { content: '', setAttribute: (_: string, v: string) => void (meta.content = v) };
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
  vi.stubGlobal('document', { documentElement: root, querySelector: () => meta });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #f4f4f0' }));
});
afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('is Deep Canvas until one is chosen, and ignores bad saved values', () => {
    expect(getTheme()).toBe('canvas');
    memory.set('inknexus-theme', JSON.stringify('neon'));
    expect(getTheme()).toBe('canvas');
  });
  it('saves the chosen theme, sets it on the page, and colors the browser bar', () => {
    setTheme('eink');
    expect(getTheme()).toBe('eink');
    expect(root.dataset.theme).toBe('eink');
    expect(meta.content).toBe('#f4f4f0');
  });
  it('fades into the theme with a view transition where the browser has one', () => {
    const fade = vi.fn((show: () => void) => show());
    vi.stubGlobal('document', { documentElement: root, querySelector: () => meta, startViewTransition: fade });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    setTheme('pulp');
    expect(fade).toHaveBeenCalledOnce();
    expect(root.dataset.theme).toBe('pulp');
  });
  it('switches at once when reduced motion is on', () => {
    const fade = vi.fn();
    vi.stubGlobal('document', { documentElement: root, querySelector: () => meta, startViewTransition: fade });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    setTheme('midnight');
    expect(fade).not.toHaveBeenCalled();
    expect(root.dataset.theme).toBe('midnight');
  });
});
