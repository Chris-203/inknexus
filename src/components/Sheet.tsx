import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Closing state for a Sheet: close() plays its slide-out, then calls onClose. Call close() wherever the sheet closes so every way out animates. */
export function useSheet(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  return { closing, close: () => setClosing(true), onClose };
}

/** For a dialog: focus moves into `ref` when it opens and back to what opened it when it closes, and Escape calls `onClose`. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

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
}

/** Bottom sheet dialog, with `full` one that fills the screen, or with `drawer` a panel from the right edge: it slides in, focus moves into it, Escape or a tap outside closes it, and focus returns to what opened it. */
export function Sheet({
  label,
  sheet,
  drawer,
  full,
  children,
}: {
  label: string;
  sheet: ReturnType<typeof useSheet>;
  drawer?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, sheet.close);

  return (
    <div id="modal" className={`on${drawer ? ' side' : ''}${sheet.closing ? ' closing' : ''}`} onClick={(e) => e.target === e.currentTarget && sheet.close()}>
      <div
        ref={ref}
        className={`sheet${drawer ? ' drawer' : ''}${full ? ' full' : ''}`}
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
