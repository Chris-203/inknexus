/** An element the page always has, or that the current view just rendered. */
export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const hint = (html: string) => `<p class="hint">${html}</p>`;

let toastTimer = 0;
export function toast(m: string) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), 3200);
}

/* Bottom sheet: focus moves into it, Escape or a tap outside closes it, and focus returns to what opened it. */
let opener: HTMLElement | null = null;
export function openSheet(html: string) {
  const sheet = $('#sheet');
  sheet.innerHTML = html;
  if (!sheetOpen()) opener = document.activeElement as HTMLElement | null;
  $('#modal').classList.add('on');
  sheet.focus();
}
export function closeSheet() {
  if (!sheetOpen()) return;
  $('#modal').classList.remove('on');
  opener?.focus();
  opener = null;
}
export const sheetOpen = () => $('#modal').classList.contains('on');
