const EARTH_RADIUS_KM = 6371;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A usable point from optional coordinates, or null when either is missing or out of range. */
export function toPoint(lat: number | undefined, lng: number | undefined) {
  if (lat === undefined || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
