import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { readLocatedPhotos } from '@/lib/photo-library';
import { photoSpots, type PhotoSpot } from '@/lib/photo-places';

export type ScannedSpot = PhotoSpot & { city?: string; countryCode?: string };
export type ScanResult = { status: 'denied' } | { status: 'done'; photos: number; spots: ScannedSpot[] };
/** Sent after each page of the camera roll. `uris` is a small sample for the on-screen preview. */
export type ScanProgress = { checked: number; located: number; uris: string[] };

const MAX_SPOTS = 30;
const TIME_BUDGET_MS = 20000;
// Thumbnails passed to the preview per page. Photos with a location go first.
const PREVIEW_PER_PAGE = 24;
const GEOCODE_BUDGET_MS = 15000;

export const photoScanSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Reads photo locations from the camera roll and groups them into places. Nothing is uploaded. */
export async function scanPhotos(onProgress?: (progress: ScanProgress) => void): Promise<ScanResult> {
  const photos = await readLocatedPhotos({ budgetMs: TIME_BUDGET_MS });
  if (photos === null) return { status: 'denied' };
  const geocodeUntil = Date.now() + GEOCODE_BUDGET_MS;

  const spots: ScannedSpot[] = photoSpots(photos, MAX_SPOTS);
  // Reverse geocoding gives the server a city name to match. It is optional: the server
  // falls back to the nearest landmark. Android needs location permission for it.
  const canGeocode = Platform.OS === 'ios' || (await Location.getForegroundPermissionsAsync()).granted;
  if (canGeocode) {
    for (const spot of spots) {
      if (Date.now() > geocodeUntil) break;
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude: spot.lat, longitude: spot.lng });
        spot.city = address?.city ?? address?.subregion ?? undefined;
        spot.countryCode = address?.isoCountryCode ?? undefined;
      } catch {
        // Geocoding is rate limited; skip and let the server match by distance.
      }
    }
  }
  return { status: 'done', photos: photos.length, spots };
}

// Picks up to `count` items spread evenly across the list, keeping the order.
function sample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)]);
}
