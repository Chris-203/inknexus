import { useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { why } from '../lib/api';
import { joinSync, startSync, stopSync, syncNow, syncStatus, useSync } from '../lib/deviceSync';

/**
 * Sync in the Settings drawer. While it is off: turn it on, or enter the code another device shows. While it is on: how
 * the last sync went, the code to enter on the other devices, and a new code or turning it off.
 */
export function SyncSettings() {
  const { toast } = useApp();
  const sync = useSync();
  const [entering, setEntering] = useState(false);
  const [text, setText] = useState('');
  const [checking, setChecking] = useState(false);
  // Why the code was not taken. It stays under the field, where a toast would be gone before the code is fixed.
  const [problem, setProblem] = useState('');

  const join = (e: FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setProblem('');
    joinSync(text)
      .then(() => {
        setEntering(false);
        setText('');
        toast('Sync is on');
      })
      .catch((e) => setProblem(why(e)))
      .finally(() => setChecking(false));
  };

  const copy = () =>
    navigator.clipboard.writeText(sync.code).then(
      () => toast('Copied the sync code'),
      () => toast('Could not copy. Allow clipboard access for InkNexus, or type the code on the other device'),
    );

  if (!sync.code)
    return (
      <>
        <p className="hint">Sync</p>
        <p className="credit">Keep My Series the same on your phone and computer. Turn sync on here, then enter its code on the other device.</p>
        <button className="btn" onClick={startSync}>
          Turn on sync
        </button>
        {entering ? (
          <form className="stack" onSubmit={join}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              autoFocus
              aria-label="Sync code"
              placeholder="Sync code"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {problem && (
              <p className="hint" role="alert">
                {problem}
              </p>
            )}
            <button className="btn ghost" disabled={checking}>
              {checking ? 'Checking…' : 'Sync with this code'}
            </button>
          </form>
        ) : (
          <button className="btn ghost" onClick={() => setEntering(true)}>
            Use a sync code
          </button>
        )}
      </>
    );

  return (
    <>
      <p className="hint">Sync</p>
      <p className="credit" aria-live="polite">
        {syncStatus(sync)}
      </p>
      <p className="code">{sync.code}</p>
      <p className="credit">
        Enter this code on your other devices. A copy of your library is kept online under it, and anyone with the code can read and change it, so keep it to
        yourself.
      </p>
      <button className="btn" onClick={copy}>
        Copy code
      </button>
      <button className="btn ghost" disabled={sync.busy} onClick={syncNow}>
        {sync.busy ? 'Syncing…' : 'Sync now'}
      </button>
      <button
        className="btn ghost"
        onClick={() => confirm('Change the sync code? Your other devices stop syncing until you enter the new code on them.') && startSync()}
      >
        New code
      </button>
      <button
        className="btn danger"
        onClick={() => confirm('Turn sync off on this device? Your library stays here, and your other devices keep syncing.') && stopSync()}
      >
        Turn off sync
      </button>
    </>
  );
}
