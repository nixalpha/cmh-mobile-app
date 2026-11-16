import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

import { photoSpots, type PhotoSpot } from '@/lib/photo-places';

export type ScannedSpot = PhotoSpot & { city?: string; countryCode?: string };
export type ScanResult = { status: 'denied' } | { status: 'done'; photos: number; spots: ScannedSpot[] };

// iOS returns GPS with every page of assets. Android reads EXIF per photo, which is ~5x
// slower, so it scans fewer photos.
const MAX_PHOTOS = Platform.OS === 'ios' ? 5000 : 1000;
const PAGE = Platform.OS === 'ios' ? 500 : 200;
const MAX_SPOTS = 30;
const TIME_BUDGET_MS = 20000;

export const photoScanSupported = Platform.OS === 'ios' || Platform.OS === 'android';

/** Reads photo locations from the camera roll and groups them into places. Nothing is uploaded. */
export async function scanPhotos(): Promise<ScanResult> {
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!permission.granted) return { status: 'denied' };

  const deadline = Date.now() + TIME_BUDGET_MS;
  const photos: { lat: number; lng: number; takenAt: number }[] = [];
  let after: string | undefined;
  let read = 0;
  while (read < MAX_PHOTOS && Date.now() < deadline) {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE,
      after,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      resolveWithFullInfo: Platform.OS === 'android',
    });
    for (const asset of page.assets) {
      const location = (asset as MediaLibrary.Asset & { location?: MediaLibrary.Location }).location;
      if (location) photos.push({ lat: location.latitude, lng: location.longitude, takenAt: asset.creationTime });
    }
    read += page.assets.length;
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }

  const spots: ScannedSpot[] = photoSpots(photos, MAX_SPOTS);
  // Reverse geocoding gives the server a city name to match. It is optional: the server
  // falls back to the nearest landmark. Android needs location permission for it.
  const canGeocode = Platform.OS === 'ios' || (await Location.getForegroundPermissionsAsync()).granted;
  if (canGeocode) {
    for (const spot of spots) {
      if (Date.now() > deadline + 10000) break;
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude: spot.lat, longitude: spot.lng });
        spot.city = address?.city ?? address?.subregion ?? undefined;
        spot.countryCode = address?.isoCountryCode ?? undefined;
      } catch {
        // Geocoding is rate limited; skip and let the server match by distance.
      }
    }
  }
  return { status: 'done', photos: read, spots };
}
