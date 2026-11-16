import type { ConvexReactClient } from 'convex/react';

import { api, type Id } from '@/lib/backend';
import { localDay } from '@/lib/exif';
import { assetKey, readLocatedPhotos, uploadLibraryPhoto, type LibraryPhoto } from '@/lib/photo-library';
import { groupByLandmark, spread } from '@/lib/photo-places';

/** Photos within this distance of the city's center count as taken there. */
export const CITY_RADIUS_KM = 25;
const MAX_CITY_PHOTOS = 1000;
const PER_POST = 10;

export type ImportResult = { photos: number; landmarks: number };

// One import per place at a time, even if its screen is opened twice.
const running = new Map<string, Promise<ImportResult | null>>();

/**
 * Imports the camera roll's past photos from a visited place, once. Photos taken at a landmark
 * collect it with the photos and their date. The rest become one post from the city.
 * Returns null when photo access is denied, leaving the place to try again next time.
 */
export function importCityPhotos(
  client: ConvexReactClient,
  destination: { _id: Id<'destinations'>; lat: number; lng: number },
  landmarks: readonly { _id: Id<'landmarks'>; lat: number; lng: number }[],
): Promise<ImportResult | null> {
  const current = running.get(destination._id);
  if (current) return current;
  const work = run(client, destination, landmarks).finally(() => running.delete(destination._id));
  running.set(destination._id, work);
  return work;
}

async function run(
  client: ConvexReactClient,
  destination: { _id: Id<'destinations'>; lat: number; lng: number },
  landmarks: readonly { _id: Id<'landmarks'>; lat: number; lng: number }[],
): Promise<ImportResult | null> {
  const photos = await readLocatedPhotos({
    near: { lat: destination.lat, lng: destination.lng, radiusKm: CITY_RADIUS_KM },
    limit: MAX_CITY_PHOTOS,
  });
  if (photos === null) return null;

  const keyed = await Promise.all(photos.map(async (photo) => ({ ...photo, assetKey: await assetKey(photo) })));
  const seen = new Set(keyed.length ? await client.query(api.photoImport.seen, { assetKeys: keyed.map((p) => p.assetKey) }) : []);
  const fresh = keyed.filter((photo) => !seen.has(photo.assetKey));
  const { byLandmark, leftover } = groupByLandmark(fresh, landmarks);

  const result: ImportResult = { photos: 0, landmarks: 0 };
  for (const [landmarkId, group] of byLandmark) {
    const uploaded = await uploadAll(client, spread(group, PER_POST));
    if (uploaded.length === 0) continue;
    const attached = await client.mutation(api.photoImport.importLandmark, {
      landmarkId,
      photos: uploaded.map(({ photo, upload }) => ({
        ...upload, takenAt: photo.takenAt, day: localDay(new Date(photo.takenAt)),
        lat: photo.lat, lng: photo.lng, assetKey: photo.assetKey,
      })),
    });
    if (attached > 0) { result.photos += attached; result.landmarks += 1; }
  }

  const rest = await uploadAll(client, spread(leftover, PER_POST));
  if (rest.length > 0) {
    result.photos += await client.mutation(api.photoImport.importCityPhotos, {
      destinationId: destination._id,
      takenOn: localDay(new Date(rest[0].photo.takenAt)),
      photos: rest.map(({ photo, upload }) => ({ ...upload, takenAt: photo.takenAt, assetKey: photo.assetKey })),
    });
  }
  await client.mutation(api.photoImport.finish, { destinationId: destination._id });
  return result;
}

/** Uploads each photo, oldest first. A photo that fails to upload is skipped. */
async function uploadAll<P extends LibraryPhoto>(client: ConvexReactClient, photos: P[]) {
  const done: { photo: P; upload: Awaited<ReturnType<typeof uploadLibraryPhoto>> }[] = [];
  for (const photo of photos) {
    try {
      const url = await client.mutation(api.landmarkVisits.generateUploadUrl, {});
      done.push({ photo, upload: await uploadLibraryPhoto(photo, url) });
    } catch {
      // iCloud-only or unreadable photos are skipped; the rest still import.
    }
  }
  return done;
}
