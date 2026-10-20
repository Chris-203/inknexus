import { saveTheme, setTheme, THEMES, useDefaultTheme, useTheme } from '../lib/theme';

/** A card per color theme with a small preview drawn in its colors, dark themes in the left column and light in the right; the one on show is outlined.
 * A tapped theme is only tried until Make default is checked. */
export function ThemePicker() {
  const theme = useTheme();
  const saved = useDefaultTheme();
  return (
    <>
      <p className="hint">Theme</p>
      <div className="themes">
        {[true, false].map((dark) => (
          <div key={String(dark)} className="tcol">
            {THEMES.filter((t) => t.dark === dark).map((t) => (
              <button key={t.id} className="theme" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
                <span className="tprev" data-theme={t.id} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t.name}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="pad">
        <label className="opt">
          <input type="checkbox" checked={theme === saved} disabled={theme === saved} onChange={saveTheme} />
          Make default
        </label>
      </div>
    </>
  );
}
