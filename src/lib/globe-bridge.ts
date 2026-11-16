export type GlobePlace = { _id: string; name: string; lat: number; lng: number; countryCode?: string; markerKind?: 'self' | 'friend'; initials?: string; accuracy?: number };
export type GlobeSync = {
  type: 'sync';
  places: readonly GlobePlace[];
  selectedId?: string;
  focusRevision: number;
  zoomOutRevision?: number;
  active: boolean;
};
export type GlobeEvent =
  | { type: 'ready' }
  | { type: 'select'; id: string }
  | { type: 'interact' }
  | { type: 'error'; message: string };

export function isGlobeSync(value: unknown): value is GlobeSync {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return data.type === 'sync' && typeof data.active === 'boolean' && typeof data.focusRevision === 'number'
    && Number.isFinite(data.focusRevision) && (data.selectedId === undefined || typeof data.selectedId === 'string')
    && (data.zoomOutRevision === undefined || (typeof data.zoomOutRevision === 'number' && Number.isSafeInteger(data.zoomOutRevision) && data.zoomOutRevision >= 0))
    && Array.isArray(data.places) && data.places.length <= 1024
    && data.places.every((place: Record<string, unknown>) => place && typeof place._id === 'string' && typeof place.name === 'string'
      && typeof place.lat === 'number' && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90
      && typeof place.lng === 'number' && Number.isFinite(place.lng) && Math.abs(place.lng) <= 180
      && (place.markerKind === undefined || place.markerKind === 'self' || place.markerKind === 'friend')
      && (place.initials === undefined || (typeof place.initials === 'string' && place.initials.length <= 8))
      && (place.accuracy === undefined || (typeof place.accuracy === 'number' && Number.isFinite(place.accuracy) && place.accuracy >= 0 && place.accuracy <= 100000)));
}

export function parseGlobeEvent(value: unknown): GlobeEvent | null {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || typeof data !== 'object') return null;
    if (data.type === 'ready' || data.type === 'interact') return { type: data.type };
    if (data.type === 'select' && typeof data.id === 'string') return { type: 'select', id: data.id };
    if (data.type === 'error' && typeof data.message === 'string') return { type: 'error', message: data.message };
  } catch { /* Ignore malformed messages from the embedded document. */ }
  return null;
}
