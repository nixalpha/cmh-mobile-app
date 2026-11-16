import { expect, test } from 'vitest';

import { daysAgo, localDay, photoLocation, photoTakenAt } from './exif';

test('reads the capture date from nested iOS EXIF', () => {
  const taken = photoTakenAt({ '{Exif}': { DateTimeOriginal: '2026:11:03 06:42:10' }, '{TIFF}': { DateTime: '2026:11:05 10:00:00' } });
  expect(taken?.day).toBe('2026-11-03');
  expect(new Date(taken!.timestamp).getHours()).toBe(6);
});

test('reads the capture date from flat Android EXIF, falling back through tags', () => {
  expect(photoTakenAt({ DateTimeOriginal: '2026:11:03 06:42:10' })?.day).toBe('2026-11-03');
  expect(photoTakenAt({ DateTime: '2025:01:31 23:59:59' })?.day).toBe('2025-01-31');
  expect(photoTakenAt({ DateTimeOriginal: '0000:00:00 00:00:00', DateTime: '2025:01:31 12:00:00' })?.day).toBe('2025-01-31');
});

test('returns null without a usable date', () => {
  expect(photoTakenAt(null)).toBeNull();
  expect(photoTakenAt({})).toBeNull();
  expect(photoTakenAt({ DateTimeOriginal: 'yesterday' })).toBeNull();
});

test('reads iOS GPS with hemisphere references', () => {
  expect(photoLocation({ '{GPS}': { Latitude: 33.8688, LatitudeRef: 'S', Longitude: 151.2093, LongitudeRef: 'E' } })).toEqual({
    lat: -33.8688,
    lng: 151.2093,
  });
  expect(photoLocation({ '{GPS}': { Latitude: 40.7128, LatitudeRef: 'N', Longitude: 74.006, LongitudeRef: 'W' } })).toEqual({
    lat: 40.7128,
    lng: -74.006,
  });
});

test('reads Android GPS whether or not it is already signed', () => {
  expect(photoLocation({ GPSLatitude: -33.8688, GPSLongitude: 151.2093 })).toEqual({ lat: -33.8688, lng: 151.2093 });
  expect(photoLocation({ GPSLatitude: -33.8688, GPSLatitudeRef: 'S', GPSLongitude: 151.2093, GPSLongitudeRef: 'E' })).toEqual({
    lat: -33.8688,
    lng: 151.2093,
  });
  expect(photoLocation({ GPSLatitude: '34/1,58/1,1.56/1', GPSLatitudeRef: 'N', GPSLongitude: '135/1,46/1,21.72/1', GPSLongitudeRef: 'E' })).toEqual({
    lat: expect.closeTo(34.96710, 4),
    lng: expect.closeTo(135.77270, 4),
  });
});

test('ignores missing, out-of-range, and null-island GPS', () => {
  expect(photoLocation({})).toBeNull();
  expect(photoLocation({ GPSLatitude: 120, GPSLongitude: 10 })).toBeNull();
  expect(photoLocation({ GPSLatitude: 0, GPSLongitude: 0 })).toBeNull();
});

test('formats local days for the date chips', () => {
  const from = new Date(2026, 2, 1, 9);
  expect(localDay(from)).toBe('2026-03-01');
  expect(daysAgo(1, from)).toBe('2026-02-28');
});
