import { findSeries, replaceState, setHidden } from './store';
import type { Series } from './types';

const x: Series = {
  id: 's',
  title: 'T',
  cover: '',
  md: '11111111-2222-3333-4444-555555555555',
  al: null,
  links: [{ label: 'A', url: 'https://a.example' }],
  last: 0,
  t: 0,
};

describe('setHidden', () => {
  it('hides a selected source and clears the selection', () => {
    replaceState({ lib: [{ ...x, src: 'l0' }] });
    setHidden('s', 'l0', true);
    expect(findSeries('s')).toMatchObject({ src: '', links: [{ h: true }] });
  });
  it('keeps the selection when hiding a source that is not selected', () => {
    replaceState({ lib: [{ ...x, src: 'l0' }] });
    setHidden('s', 'md', true);
    expect(findSeries('s')).toMatchObject({ src: 'l0', mdh: true });
  });
  it('shows a hidden source and selects it', () => {
    replaceState({ lib: [{ ...x, mdh: true, src: 'l0' }] });
    setHidden('s', 'md', false);
    expect(findSeries('s')).toMatchObject({ src: 'md', mdh: false });
  });
});
