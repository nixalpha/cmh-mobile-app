import { describe, expect, test } from 'vitest';

import { distanceKm, groupByLandmark, photoSpots, placeLabel, spread } from './photo-places';

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

describe('groupByLandmark', () => {
  const shrine = { _id: 'shrine', lat: 34.9671, lng: 135.7727 };
  const temple = { _id: 'temple', lat: 34.9685, lng: 135.7727 };

  test('assigns each photo to the nearest landmark within 300 m and leaves the rest over', () => {
    const atShrine = { lat: 34.9672, lng: 135.7727 };
    const atTemple = { lat: 34.9684, lng: 135.7727 };
    const downtown = { lat: 35.0, lng: 135.76 };
    const { byLandmark, leftover } = groupByLandmark([atShrine, atTemple, downtown], [shrine, temple]);
    expect(byLandmark.get('shrine')).toEqual([atShrine]);
    expect(byLandmark.get('temple')).toEqual([atTemple]);
    expect(leftover).toEqual([downtown]);
  });
});

describe('spread', () => {
  test('keeps everything, oldest first, when under the count', () => {
    expect(spread([{ takenAt: 3 }, { takenAt: 1 }], 10)).toEqual([{ takenAt: 1 }, { takenAt: 3 }]);
  });

  test('samples evenly across time when over the count', () => {
    const photos = Array.from({ length: 100 }, (_, i) => ({ takenAt: i }));
    expect(spread(photos, 4).map((p) => p.takenAt)).toEqual([0, 25, 50, 75]);
  });
});

test('distanceKm measures about 111 km per degree of latitude', () => {
  expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
});
