import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

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
