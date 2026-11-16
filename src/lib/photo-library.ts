import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

import type { Id } from '@/lib/backend';
import { distanceKm } from '@/lib/photo-places';
import { preparePhoto, uploadPhoto } from '@/lib/photo-upload';

export type LibraryPhoto = { id: string; uri: string; width: number; height: number; lat: number; lng: number; takenAt: number };
export type Near = { lat: number; lng: number; radiusKm: number };
/** Reported after each page: photos read so far, how many kept, and every photo URI on the page. */
export type PhotoPage = { checked: number; located: number; uris: string[] };

// iOS returns GPS with every page of assets. Android reads EXIF per photo, which is ~5x
// slower, so it reads fewer photos.
const MAX_PHOTOS = Platform.OS === 'ios' ? 5000 : 1000;
const PAGE = Platform.OS === 'ios' ? 500 : 200;

export const photoLibrarySupported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Reads geotagged photos from the camera roll, newest first. With `near`, keeps only photos
 * taken within that radius. Returns null when photo access is denied. Nothing is uploaded.
 */
export async function readLocatedPhotos(options: { near?: Near; limit?: number; budgetMs?: number; onPage?: (page: PhotoPage) => void } = {}): Promise<LibraryPhoto[] | null> {
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!permission.granted) return null;
  const deadline = Date.now() + (options.budgetMs ?? 20000);
  const limit = options.limit ?? Infinity;
  const photos: LibraryPhoto[] = [];
  let after: string | undefined;
  let read = 0;
  while (read < MAX_PHOTOS && photos.length < limit && Date.now() < deadline) {
    const page = await MediaLibrary.getAssetsAsync({
      first: PAGE,
      after,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      resolveWithFullInfo: Platform.OS === 'android',
    });
    for (const asset of page.assets) {
      const location = asset.location;
      if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
      const point = { lat: location.latitude, lng: location.longitude };
      if (options.near && distanceKm(point, options.near) > options.near.radiusKm) continue;
      photos.push({ id: asset.id, uri: asset.uri, width: asset.width, height: asset.height, ...point, takenAt: asset.creationTime });
      if (photos.length >= limit) break;
    }
    read += page.assets.length;
    options.onPage?.({ checked: read, located: photos.length, uris: page.assets.map((asset) => asset.uri) });
    if (!page.hasNextPage) break;
    after = page.endCursor;
  }
  return photos;
}

/** A stable, non-identifying key for a camera-roll photo, so imports can skip repeats. */
export async function assetKey(photo: { id: string }) {
  return await digestStringAsync(CryptoDigestAlgorithm.SHA256, photo.id);
}

/** Resizes a camera-roll photo, strips its metadata, and uploads it. */
export async function uploadLibraryPhoto(photo: LibraryPhoto, uploadUrl: string): Promise<{ storageId: Id<'_storage'>; width: number; height: number }> {
  const info = await MediaLibrary.getAssetInfoAsync(photo.id);
  const prepared = await preparePhoto({ uri: info.localUri ?? info.uri, width: info.width, height: info.height });
  const storageId = await uploadPhoto(uploadUrl, prepared.uri);
  return { storageId, width: prepared.width, height: prepared.height };
}
