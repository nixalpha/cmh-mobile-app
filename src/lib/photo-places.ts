/** A spot where photos were taken: one per ~20 km grid cell. */
export type PhotoSpot = { lat: number; lng: number; count: number; takenAt: number };

const CELL_DEGREES = 0.2;

/**
 * Groups photo locations into grid cells so a camera roll of thousands of photos becomes a
 * few dozen places to look up. Each spot keeps its first photo's position and the earliest
 * capture time. Spots are ordered by photo count, most photographed first.
 */
export function photoSpots(
  photos: readonly { lat: number; lng: number; takenAt: number }[],
  limit: number,
): PhotoSpot[] {
  const cells = new Map<string, PhotoSpot>();
  for (const photo of photos) {
    if (!Number.isFinite(photo.lat) || !Number.isFinite(photo.lng)) continue;
    if (Math.abs(photo.lat) > 90 || Math.abs(photo.lng) > 180 || (photo.lat === 0 && photo.lng === 0)) continue;
    const key = `${Math.floor(photo.lat / CELL_DEGREES)}:${Math.floor(photo.lng / CELL_DEGREES)}`;
    const spot = cells.get(key);
    if (spot) {
      spot.count += 1;
      spot.takenAt = Math.min(spot.takenAt, photo.takenAt);
    } else {
      cells.set(key, { lat: photo.lat, lng: photo.lng, count: 1, takenAt: photo.takenAt });
    }
  }
  return [...cells.values()].sort((a, b) => b.count - a.count || a.takenAt - b.takenAt).slice(0, limit);
}

/** Label used to treat two catalog places with the same name and country as one. */
export function placeLabel(place: { name: string; countryCode: string }) {
  return `${place.name.trim().toLocaleLowerCase()}|${place.countryCode}`;
}

/** Great-circle distance between two points, in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Up to `count` photos spread evenly across the list by capture time, oldest first. */
export function spread<T extends { takenAt: number }>(photos: readonly T[], count: number): T[] {
  const sorted = [...photos].sort((a, b) => a.takenAt - b.takenAt);
  if (sorted.length <= count) return sorted;
  return Array.from({ length: count }, (_, i) => sorted[Math.floor((i * sorted.length) / count)]);
}

/** Within this distance of a landmark, a past photo counts as taken there. Matches the server. */
export const LANDMARK_RADIUS_KM = 0.3;

/**
 * Splits a city's photos into the nearest landmark each was taken at, and the rest.
 * Photos further than `LANDMARK_RADIUS_KM` from every landmark are left over.
 */
export function groupByLandmark<P extends { lat: number; lng: number }, L extends { _id: string; lat: number; lng: number }>(
  photos: readonly P[],
  landmarks: readonly L[],
) {
  const byLandmark = new Map<L['_id'], P[]>();
  const leftover: P[] = [];
  for (const photo of photos) {
    let best: L | null = null;
    let bestKm = LANDMARK_RADIUS_KM;
    for (const landmark of landmarks) {
      const km = distanceKm(photo, landmark);
      if (km <= bestKm) { best = landmark; bestKm = km; }
    }
    if (best === null) leftover.push(photo);
    else byLandmark.set(best._id, [...(byLandmark.get(best._id) ?? []), photo]);
  }
  return { byLandmark, leftover };
}
