import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

/* Safari tabs can still pinch the whole page despite touch-action. Blocking its gesture events stops that;
   the reader's own pinch uses touch events, which still arrive. */
for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, (e) => e.preventDefault(), { passive: false });

try {
  void navigator.storage?.persist?.();
} catch {
  /* not supported: the library still saves, the browser may just clear it under storage pressure */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
