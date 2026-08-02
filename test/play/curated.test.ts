import { describe, expect, it } from 'vitest';
import { CURATED_PHOTOS, curatedPhotoById } from '@/play/curated';

describe('CURATED_PHOTOS', () => {
  it('has at least four entries', () => {
    expect(CURATED_PHOTOS.length).toBeGreaterThanOrEqual(4);
  });

  it('has unique ids', () => {
    const ids = CURATED_PHOTOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry positive dimensions and a non-empty name', () => {
    for (const photo of CURATED_PHOTOS) {
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
      expect(photo.name.length).toBeGreaterThan(0);
    }
  });
});

describe('curatedPhotoById', () => {
  it('finds an entry that exists', () => {
    const first = CURATED_PHOTOS[0]!;
    expect(curatedPhotoById(first.id)).toEqual(first);
  });

  it('returns undefined for an id that does not exist', () => {
    expect(curatedPhotoById('not-a-real-id')).toBeUndefined();
  });
});
