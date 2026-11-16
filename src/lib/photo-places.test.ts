import { describe, expect, test } from 'vitest';

import { photoSpots, placeLabel } from './photo-places';

describe('photoSpots', () => {
  test('groups nearby photos and keeps the earliest capture time', () => {
    const spots = photoSpots([
      { lat: 48.85, lng: 2.35, takenAt: 300 },
      { lat: 48.86, lng: 2.36, takenAt: 100 },
      { lat: 35.68, lng: 139.69, takenAt: 200 },
    ], 10);
    expect(spots).toEqual([
      { lat: 48.85, lng: 2.35, count: 2, takenAt: 100 },
      { lat: 35.68, lng: 139.69, count: 1, takenAt: 200 },
    ]);
  });

  test('drops impossible and null-island points and respects the limit', () => {
    const spots = photoSpots([
      { lat: 0, lng: 0, takenAt: 1 },
      { lat: 91, lng: 0, takenAt: 1 },
      { lat: Number.NaN, lng: 0, takenAt: 1 },
      { lat: 10, lng: 10, takenAt: 1 },
      { lat: 20, lng: 20, takenAt: 1 },
    ], 1);
    expect(spots).toHaveLength(1);
  });
});

test('placeLabel treats same-name places in one country as the same', () => {
  expect(placeLabel({ name: 'Granada ', countryCode: 'ES' })).toBe(placeLabel({ name: 'granada', countryCode: 'ES' }));
  expect(placeLabel({ name: 'Granada', countryCode: 'ES' })).not.toBe(placeLabel({ name: 'Granada', countryCode: 'NI' }));
});
