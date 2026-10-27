import type { FormEvent } from 'react';
import { useApp } from '../context';
import { LinkFields } from './LinkFields';
import { Sheet, useSheet } from './Sheet';
import { fmt } from '../lib/format';
import { linkFrom, NOT_WEB } from '../lib/links';
import { addSeries } from '../lib/store';

/** Add a series from any other site by its link: from the My Series header, or from Browse when a link is pasted or nothing matches. `url` fills the link field. */
export function AddByLinkSheet({ url, onClose }: { url?: string; onClose: () => void }) {
  const { navigate, toast } = useApp();
  const sheet = useSheet(onClose);

  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const field = (k: string) => String(d.get(k) || '').trim();
    const made = linkFrom(field('url'), field('label'));
    if (!made) return toast(NOT_WEB);
    const given = parseFloat(field('ch'));
    const n = addSeries({ title: field('title'), links: [made.link], last: given || made.r?.num || 0 });
    toast(made.r && !given ? `Added. Detected chapter ${fmt(made.r.num)} from the link` : 'Added to My Series');
    navigate({ name: 'series', id: n.id });
  };

  return (
    <Sheet label="Add by link" sheet={sheet}>
      <h2>Add by link</h2>
      <p className="hint">For any site besides MangaDex and AniList: paste a series or chapter link.</p>
      <form className="stack" onSubmit={onAdd}>
        <input name="title" aria-label="Title" placeholder="Title" required />
        <LinkFields urlPlaceholder="https://…" url={url} />
        <input name="ch" type="number" step="any" min="0" aria-label="Chapter you're on" placeholder="Chapter you're on (optional if the link has one)" />
        <button className="btn">Add to My Series</button>
      </form>
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}
