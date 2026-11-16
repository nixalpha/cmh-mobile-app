import { Vector3 } from "three";

export const EARTH_RADIUS = 6378137;
export const DEG = Math.PI / 180;
export const EARTH_CIRCUMFERENCE = 2 * Math.PI * EARTH_RADIUS;

export function lonToMercX(lon: number): number {
  return (lon + 180) / 360;
}

export function latToMercY(lat: number): number {
  const s = Math.sin(Math.max(-89.9999, Math.min(89.9999, lat)) * DEG);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export function mercXToLon(x: number): number {
  return x * 360 - 180;
}

export function mercYToLat(y: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / DEG;
}

export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function toECEF(lat: number, lon: number, height: number, out: Vector3): Vector3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  const r = EARTH_RADIUS + height;
  const c = Math.cos(la);
  return out.set(r * c * Math.sin(lo), r * Math.sin(la), r * c * Math.cos(lo));
}

export function fromECEF(v: Vector3): { lat: number; lon: number; height: number } {
  const r = v.length();
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, v.y / r))) / DEG,
    lon: Math.atan2(v.x, v.z) / DEG,
    height: r - EARTH_RADIUS,
  };
}

const NORTH_POLE = new Vector3(0, 1, 0);

export function enuFrame(up: Vector3, east: Vector3, north: Vector3): void {
  east.crossVectors(NORTH_POLE, up);
  if (east.lengthSq() < 1e-18) east.set(1, 0, 0);
  east.normalize();
  north.crossVectors(up, east).normalize();
}

export function metersPerTile(z: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)) / 2 ** z;
}

export function clipRing(ring: number[], x0: number, y0: number, x1: number, y1: number): number[] {
  let pts = ring;
  for (let edge = 0; edge < 4 && pts.length >= 6; edge++) {
    const out: number[] = [];
    const axis = edge < 2 ? 0 : 1;
    const bound = edge === 0 ? x0 : edge === 1 ? x1 : edge === 2 ? y0 : y1;
    const keepGreater = edge % 2 === 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2];
      const ay = pts[i * 2 + 1];
      const bx = pts[((i + 1) % n) * 2];
      const by = pts[((i + 1) % n) * 2 + 1];
      const a = axis === 0 ? ax : ay;
      const b = axis === 0 ? bx : by;
      const aIn = keepGreater ? a >= bound : a <= bound;
      const bIn = keepGreater ? b >= bound : b <= bound;
      if (aIn) out.push(ax, ay);
      if (aIn !== bIn) {
        const t = (bound - a) / (b - a);
        if (axis === 0) out.push(bound, ay + (by - ay) * t);
        else out.push(ax + (bx - ax) * t, bound);
      }
    }
    pts = out;
  }
  return pts.length >= 6 ? pts : [];
}

export function ringArea(ring: ArrayLike<number>): number {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return a / 2;
}
