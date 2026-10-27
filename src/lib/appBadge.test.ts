import { badgesIcon, setBadgesIcon, showBadge } from './appBadge';

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('app badge', () => {
  it('is off until turned on, and a bad saved value leaves it off', () => {
    expect(badgesIcon()).toBe(false);
    memory.set('inknexus-app-badge', 'not json');
    expect(badgesIcon()).toBe(false);
  });
  it('turns on once notifications are allowed', async () => {
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    expect(await setBadgesIcon(true)).toBeNull();
    expect(badgesIcon()).toBe(true);
    expect(await setBadgesIcon(false)).toBeNull();
    expect(badgesIcon()).toBe(false);
  });
  it('stays off and says what to do when notifications are not allowed', async () => {
    vi.stubGlobal('Notification', { requestPermission: async () => 'denied' });
    expect(await setBadgesIcon(true)).toMatch(/Allow notifications/);
    expect(badgesIcon()).toBe(false);
  });
  it('sets the count, clears it at 0, and does nothing where badges are not supported', () => {
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge });
    showBadge(3);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    showBadge(0);
    expect(clearAppBadge).toHaveBeenCalled();
    vi.stubGlobal('navigator', {});
    expect(() => showBadge(2)).not.toThrow();
  });
});
