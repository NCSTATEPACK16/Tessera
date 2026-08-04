import { describe, expect, it } from 'vitest';
import {
  CURATED_PHOTOS,
  curatedPhotoById,
  photosByShelf,
  validateManifest,
  type CuratedPhoto,
} from '@/play/curated';

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

const valid: CuratedPhoto = {
  id: 'harbour-june',
  name: 'Harbour, June',
  shelf: 'wide-and-calm',
  width: 2400,
  height: 1600,
  file: 'harbour-june.jpg',
  licence: {
    name: 'Unsplash License',
    attribution: 'Photo: A. Example / Unsplash',
    sourceUrl: 'https://unsplash.com/photos/example',
  },
  dominant: ['#3d6b8c', '#e8c07d', '#0d1b2a'],
  difficulty: 'standard',
  recommendedCounts: [100, 150, 200],
};

describe('validateManifest', () => {
  it('accepts a complete entry', () => {
    expect(validateManifest([valid])).toEqual([]);
  });

  // The whole reason this gate exists: §15 requires attribution on the
  // completion card, and a missing licence must fail the build rather than
  // silently print nothing.
  it('rejects a missing attribution', () => {
    const bad = { ...valid, licence: { ...valid.licence, attribution: '' } };
    expect(validateManifest([bad])).toContain(
      'harbour-june: licence.attribution is empty',
    );
  });

  it('rejects a missing licence name', () => {
    const bad = { ...valid, licence: { ...valid.licence, name: '' } };
    expect(validateManifest([bad])).toContain('harbour-june: licence.name is empty');
  });

  it('rejects a duplicate id, which would make the daily rota land twice', () => {
    expect(validateManifest([valid, valid])).toContain('harbour-june: duplicate id');
  });

  it('rejects a non-positive dimension, which would divide by zero in chooseGrid', () => {
    const bad = { ...valid, width: 0 };
    expect(validateManifest([bad])).toContain('harbour-june: width and height must be positive');
  });
});

describe('photosByShelf', () => {
  it('returns only that shelf, in manifest order', () => {
    const calm = photosByShelf('wide-and-calm');
    expect(calm.length).toBeGreaterThan(0);
    expect(calm.every((p) => p.shelf === 'wide-and-calm')).toBe(true);
    const ids = calm.map((p) => p.id);
    const canonical = CURATED_PHOTOS.filter((p) => p.shelf === 'wide-and-calm').map((p) => p.id);
    expect(ids).toEqual(canonical);
  });
});

describe('the shipped manifest', () => {
  // handoff.md §1g: "it must not ship at six." The daily's photo rota only
  // guarantees no *consecutive-day* repeat, so at six the cycle is visible
  // within a week.
  it('has enough photos that the daily does not visibly cycle', () => {
    expect(CURATED_PHOTOS.length).toBeGreaterThanOrEqual(28);
  });

  it('is valid', () => {
    expect(validateManifest(CURATED_PHOTOS)).toEqual([]);
  });

  it('resolves every id', () => {
    for (const photo of CURATED_PHOTOS) {
      expect(curatedPhotoById(photo.id)).toBe(photo);
    }
  });
});
