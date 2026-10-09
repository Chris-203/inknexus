import { useRef, useState } from 'react';
import { PRESETS } from '../lib/links';

/**
 * Site-name and link fields with the preset site buttons. A preset fills its name and main address,
 * unless a real link was already pasted, in which case only the name changes.
 */
export function LinkFields({ urlPlaceholder }: { urlPlaceholder: string }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const urlRef = useRef<HTMLInputElement>(null);
  const pick = (name: string, addr: string) => {
    setLabel(name);
    const cur = url.trim();
    if (!cur || PRESETS.some((p) => p[1] === cur)) {
      setUrl(addr);
      const el = urlRef.current;
      if (el) {
        el.value = addr;
        el.focus();
        try {
          el.setSelectionRange(addr.length, addr.length);
        } catch {
          /* type=url does not support selection in some browsers */
        }
      }
    }
  };
  return (
    <>
      <div className="presets">
        {PRESETS.map(([n, u]) => (
          <button key={n} type="button" className="chip" onClick={() => pick(n, u)}>
            {n}
          </button>
        ))}
      </div>
      <input name="label" placeholder="Site name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input ref={urlRef} name="url" type="url" required placeholder={urlPlaceholder} value={url} onChange={(e) => setUrl(e.target.value)} />
    </>
  );
}
