/**
 * Sites to open in the browser instead of in the app, kept on this device only (not in the library or backups).
 * For sites that block being shown in the app, or that iPhone Safari zooms the whole app over.
 */
const KEY = 'inknexus-open-in-browser';

const list = (): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
};

export const opensInBrowser = (host: string): boolean => list().includes(host);

export function setOpensInBrowser(host: string, on: boolean) {
  try {
    const l = list().filter((h) => h !== host);
    if (on) l.push(host);
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage blocked: the switch resets next visit */
  }
}
