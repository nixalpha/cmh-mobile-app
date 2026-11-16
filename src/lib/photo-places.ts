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
