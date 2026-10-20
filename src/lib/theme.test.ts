import { getTheme, setTheme } from './theme';

const memory = new Map<string, string>();
const root = { dataset: {} as Record<string, string> };
const body = { style: { setProperty: vi.fn() } };
const meta = { content: '', setAttribute: (_: string, v: string) => void (meta.content = v) };
// What getComputedStyle gives for --bg in each theme.
const BG: Record<string, string> = { sumi: '#0D0D14', eink: '#f4f4f0' };
const frame = vi.fn();

beforeEach(() => {
  memory.clear();
  root.dataset = {};
  frame.mockClear();
  body.style.setProperty.mockClear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
  vi.stubGlobal('document', { documentElement: root, body, querySelector: () => meta });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ` ${BG[root.dataset.theme ?? ''] ?? '#0D0D14'}` }));
  vi.stubGlobal('requestAnimationFrame', frame);
});
afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('is Sumi Ink until one is chosen, and ignores bad saved values', () => {
    expect(getTheme()).toBe('sumi');
    memory.set('inknexus-theme', JSON.stringify('bogus'));
    expect(getTheme()).toBe('sumi');
  });
  it('falls back to Sumi Ink for the removed Deep Canvas and Vintage Pulp themes', () => {
    memory.set('inknexus-theme', JSON.stringify('canvas'));
    expect(getTheme()).toBe('sumi');
    memory.set('inknexus-theme', JSON.stringify('pulp'));
    expect(getTheme()).toBe('sumi');
  });
  it('saves the chosen theme, sets it on the page, and colors the browser bar', () => {
    setTheme('eink');
    expect(getTheme()).toBe('eink');
    expect(root.dataset.theme).toBe('eink');
    expect(meta.content).toBe('#f4f4f0');
  });
  it('switches every color at once, with no fade left for Safari to read an in-between color from', () => {
    root.dataset.theme = 'sumi';
    setTheme('eink');
    expect(root.dataset.theme).toBe('eink');
    expect(body.style.setProperty).not.toHaveBeenCalled();
    expect(frame).not.toHaveBeenCalled();
    setTheme('sumi');
    expect(meta.content).toBe('#0D0D14');
  });
});
