import { geoDistance, geoOrthographic } from 'd3-geo';

export type GlobePosition = { longitude: number; latitude: number };
export type GlobeCamera = GlobePosition & { zoom: number };
export type GlobePlace = { _id: string; name: string; lat: number; lng: number; countryCode?: string };

export const INITIAL_POSITION: GlobePosition = { longitude: 10, latitude: 20 };
export const MAX_GLOBE_ZOOM = 32;

export function clampGlobeZoom(zoom: number) {
  return Math.max(1, Math.min(MAX_GLOBE_ZOOM, zoom));
}

export function panGlobe(camera: GlobeCamera, dx: number, dy: number, size: number): GlobeCamera {
  const sensitivity = 180 / (size * camera.zoom);
  return { ...rotateGlobe(camera, -dx * sensitivity, dy * sensitivity), zoom: camera.zoom };
}

export function rotateGlobe(position: GlobePosition, longitude: number, latitude: number): GlobePosition {
  return {
    longitude: ((position.longitude + longitude + 180) % 360 + 360) % 360 - 180,
    latitude: Math.max(-75, Math.min(75, position.latitude + latitude)),
  };
}

export function globeProjection(position: GlobePosition, size: number, zoom = 1) {
  return geoOrthographic()
    .translate([size / 2, size / 2])
    .scale(size * 0.43 * clampGlobeZoom(zoom))
    .rotate([-position.longitude, -position.latitude, 0])
    .clipAngle(90)
    .clipExtent([[0, 0], [size, size]])
    .precision(0.6);
}

export function projectGlobePlaces(places: readonly GlobePlace[], position: GlobePosition, size: number, zoom = 1) {
  const projection = globeProjection(position, size, zoom);
  return places.flatMap((place) => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng) || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return [];
    const coordinates: [number, number] = [place.lng, place.lat];
    // Projection(point) alone doesn't clip points on the back of the sphere.
    const distance = geoDistance([position.longitude, position.latitude], coordinates);
    if (distance >= Math.PI / 2 - 0.03) return [];
    const point = projection(coordinates);
    return point && point[0] >= 16 && point[0] <= size - 16 && point[1] >= 16 && point[1] <= size - 16
      ? [{ place, x: point[0], y: point[1] }] : [];
  });
}
