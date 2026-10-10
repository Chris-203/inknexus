import { useEffect, useRef, type ReactNode } from 'react';

/** Bottom sheet dialog: focus moves into it, Escape or a tap outside closes it, and focus returns to what opened it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div id="modal" className="on" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
