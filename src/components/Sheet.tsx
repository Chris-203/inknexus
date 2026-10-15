import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Closing state for a Sheet: close() plays its slide-out, then calls onClose. Call close() wherever the sheet closes so every way out animates. */
export function useSheet(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  return { closing, close: () => setClosing(true), onClose };
}

/** Bottom sheet dialog, or with `drawer` a panel from the right edge: it slides in, focus moves into it, Escape or a tap outside closes it, and focus returns to what opened it. */
export function Sheet({ label, sheet, drawer, children }: { label: string; sheet: ReturnType<typeof useSheet>; drawer?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(sheet.close);
  close.current = sheet.close;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    addEventListener('keydown', k);
    return () => {
      removeEventListener('keydown', k);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div id="modal" className={`on${drawer ? ' side' : ''}${sheet.closing ? ' closing' : ''}`} onClick={(e) => e.target === e.currentTarget && sheet.close()}>
      <i className="tint tint-top" aria-hidden="true" />
      <i className="tint tint-bottom" aria-hidden="true" />
      <div
        ref={ref}
        className={drawer ? 'sheet drawer' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        // the sheet's own slide-out has ended, not an animation inside it
        onAnimationEnd={(e) => sheet.closing && e.target === e.currentTarget && sheet.onClose()}
      >
        {children}
      </div>
    </div>
  );
}
