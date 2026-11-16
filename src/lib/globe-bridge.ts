export type GlobePlace = { _id: string; name: string; lat: number; lng: number; countryCode?: string; markerKind?: 'self' | 'friend'; initials?: string; accuracy?: number };
export type GlobeLandmark = { _id: string; name: string; lat: number; lng: number };
export const MAX_GLOBE_LANDMARKS = 50;
export type GlobeSync = {
  type: 'sync';
  places: readonly GlobePlace[];
  /** Landmarks of the selected place, pinned once the camera is at city scale. */
  landmarks?: readonly GlobeLandmark[];
  /** One of `landmarks` to fly to and highlight instead of framing the whole city. */
  landmarkId?: string;
  selectedId?: string;
  focusRevision: number;
  zoomOutRevision?: number;
  active: boolean;
};
export type GlobeEvent =
  | { type: 'ready' }
  | { type: 'select'; id: string }
  | { type: 'landmark'; id: string }
  | { type: 'interact' }
  | { type: 'error'; message: string };

export function isGlobeSync(value: unknown): value is GlobeSync {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return data.type === 'sync' && typeof data.active === 'boolean' && typeof data.focusRevision === 'number'
    && Number.isFinite(data.focusRevision) && (data.selectedId === undefined || typeof data.selectedId === 'string')
    && (data.landmarkId === undefined || typeof data.landmarkId === 'string')
    && (data.zoomOutRevision === undefined || (typeof data.zoomOutRevision === 'number' && Number.isSafeInteger(data.zoomOutRevision) && data.zoomOutRevision >= 0))
    && Array.isArray(data.places) && data.places.length <= 1024 && data.places.every(isPlace)
    && (data.landmarks === undefined
      || (Array.isArray(data.landmarks) && data.landmarks.length <= MAX_GLOBE_LANDMARKS && data.landmarks.every(isMarker)));
}

function isMarker(marker: Record<string, unknown> | null) {
  return !!marker && typeof marker._id === 'string' && typeof marker.name === 'string'
    && typeof marker.lat === 'number' && Number.isFinite(marker.lat) && Math.abs(marker.lat) <= 90
    && typeof marker.lng === 'number' && Number.isFinite(marker.lng) && Math.abs(marker.lng) <= 180;
}

function isPlace(place: Record<string, unknown> | null) {
  return isMarker(place) && !!place
    && (place.markerKind === undefined || place.markerKind === 'self' || place.markerKind === 'friend')
    && (place.initials === undefined || (typeof place.initials === 'string' && place.initials.length <= 8))
    && (place.accuracy === undefined || (typeof place.accuracy === 'number' && Number.isFinite(place.accuracy) && place.accuracy >= 0 && place.accuracy <= 100000));
}

/** Globe id of the viewer's own marker. Never collides with Convex ids. */
export const SELF_PLACE_ID = 'me';
export type DevicePosition = { lat: number; lng: number; accuracy?: number | null };

/**
 * The viewer's own marker. Returns undefined for a position the bridge would reject,
 * because one invalid place makes the globe drop the whole sync.
 */
export function selfPlace(position: DevicePosition | null | undefined): GlobePlace | undefined {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)
    || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) return undefined;
  const accuracy = typeof position.accuracy === 'number' && Number.isFinite(position.accuracy) && position.accuracy >= 0
    ? Math.min(position.accuracy, 100000) : undefined;
  return { _id: SELF_PLACE_ID, name: 'You', lat: position.lat, lng: position.lng, markerKind: 'self', initials: 'You', accuracy };
}

const EARTH_RADIUS = 6371000;
/**
 * Camera range (metres) that frames most of a city's landmarks around its centre.
 * Uses the 75th-percentile distance so one far-flung landmark doesn't zoom the city away.
 */
export function landmarkRange(center: { lat: number; lng: number }, landmarks: readonly GlobeLandmark[], min = 1800, max = 15000) {
  if (landmarks.length === 0) return min;
  const rad = Math.PI / 180;
  const distances = landmarks.map((landmark) => {
    const dLng = (((landmark.lng - center.lng + 540) % 360) - 180) * rad * Math.cos(center.lat * rad);
    return Math.hypot((landmark.lat - center.lat) * rad, dLng) * EARTH_RADIUS;
  }).sort((a, b) => a - b);
  const typical = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.75))];
  return Math.max(min, Math.min(max, typical * 3.5));
}

export function parseGlobeEvent(value: unknown): GlobeEvent | null {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || typeof data !== 'object') return null;
    if (data.type === 'ready' || data.type === 'interact') return { type: data.type };
    if ((data.type === 'select' || data.type === 'landmark') && typeof data.id === 'string') return { type: data.type, id: data.id };
    if (data.type === 'error' && typeof data.message === 'string') return { type: 'error', message: data.message };
  } catch { /* Ignore malformed messages from the embedded document. */ }
  return null;
}
