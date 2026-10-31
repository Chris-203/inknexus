import { coverUrls } from './covers';
import { newSeries } from './storage';

describe('coverUrls', () => {
  it('gives the relay address of each MangaDex cover once, and leaves out covers from other sites and series without one', () => {
    const md = 'https://uploads.mangadex.org/covers/0b9c1b47-2e8a-4f0c-9a1d-3c5e7f9a1b2c/a.jpg.256.jpg';
    const lib = [md, md, 'https://s4.anilist.co/file/cover.jpg', ''].map((cover) => newSeries({ title: 'S', cover }));
    expect(coverUrls(lib, 'https://app.example/')).toEqual([`https://app.example/api/mdimage?url=${encodeURIComponent(md)}`]);
  });
});
