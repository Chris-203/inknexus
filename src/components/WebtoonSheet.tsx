import { useApp } from '../context';
import { Sheet, useSheet } from './Sheet';
import { pastedText } from '../lib/pasteLink';
import { bookmarklet, importWebtoon } from '../lib/webtoon';

/** How to bring a Webtoon reading list in with the bookmarklet, and Paste for when the list was copied into a Home Screen app. */
export function WebtoonSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const sheet = useSheet(onClose);

  const copy = () =>
    navigator.clipboard.writeText(bookmarklet(location.origin)).then(
      () => toast('Bookmarklet copied'),
      () => toast('Could not copy. Allow clipboard access for InkNexus, then tap Copy again'),
    );

  const paste = async () => toast(importWebtoon(await pastedText('Paste the list copied from webtoons.com')));

  return (
    <Sheet label="Import from Webtoon" sheet={sheet}>
      <h2>Import from Webtoon</h2>
      <p className="hint">
        Webtoon has no way for other apps to read your list, so a bookmarklet copies it from webtoons.com. Every title comes in, with no cap.
      </p>
      <ol className="steps">
        <li>
          Copy the bookmarklet.
          <button className="btn ghost sm" onClick={() => void copy()}>
            Copy bookmarklet
          </button>
        </li>
        <li>In Safari, bookmark any page. Edit the bookmark: name it Send to InkNexus and paste over its address.</li>
        <li>Sign in on webtoons.com in Safari, open your Recent list, and tap the bookmark. It scrolls until every title has loaded.</li>
        <li>Tap Send to InkNexus on the bar that appears. InkNexus opens with your list.</li>
      </ol>
      <p className="hint">Using InkNexus from your Home Screen? The list is copied too: open InkNexus there and tap Paste list.</p>
      <div className="stack">
        <button className="btn" onClick={() => void paste()}>
          Paste list
        </button>
        <button className="btn ghost" onClick={sheet.close}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
