import earcut from "earcut";
import { KIND_FLAT, KIND_LATTICE, type Writer } from "./buildings";
import { hex, type RGB } from "./style";

export interface Landmark {
  name: string;
  lat: number;
  lon: number;
  radius: number;
  minHeight: number;
  build: (w: Writer, x: number, y: number, z: number) => void;
}

const IRON = hex(0xa98f70);
const IRON_DARK = hex(0x8c7459);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ring(cx: number, cy: number, half: number): number[] {
  return [cx, cy + half, cx + half, cy, cx, cy - half, cx - half, cy];
}

function sweep(w: Writer, levels: Array<{ ring: number[]; z: number }>, colour: RGB, kind: number): void {
  for (let l = 0; l + 1 < levels.length; l++) {
    const a = levels[l];
    const b = levels[l + 1];
    const n = a.ring.length / 2;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const dx = a.ring[j * 2] - a.ring[k * 2];
      const dy = a.ring[j * 2 + 1] - a.ring[k * 2 + 1];
      const len = Math.hypot(dx, dy);
      const top = Math.hypot(b.ring[j * 2] - b.ring[k * 2], b.ring[j * 2 + 1] - b.ring[k * 2 + 1]);
      const nx = -dy / len;
      const ny = dx / len;
      const height = levels[levels.length - 1].z - levels[0].z;
      const v0 = a.z - levels[0].z;
      const v1 = b.z - levels[0].z;
      const p = w.vertex(a.ring[k * 2], a.ring[k * 2 + 1], a.z, nx, ny, 0, colour, kind, 0, 0, len, v0, height);
      const q = w.vertex(a.ring[j * 2], a.ring[j * 2 + 1], a.z, nx, ny, 0, colour, kind, 0, len, len, v0, height);
      const r = w.vertex(b.ring[j * 2], b.ring[j * 2 + 1], b.z, nx, ny, 0, colour, kind, 0, top, top, v1, height);
      const s = w.vertex(b.ring[k * 2], b.ring[k * 2 + 1], b.z, nx, ny, 0, colour, kind, 0, 0, top, v1, height);
      w.quad(w.core, p, q, r, s);
    }
  }
}

function slab(w: Writer, outer: number[], hole: number[] | null, z0: number, z1: number, colour: RGB): void {
  sweep(w, [{ ring: outer, z: z0 }, { ring: outer, z: z1 }], colour, KIND_FLAT);
  if (hole) {
    const inner: number[] = [];
    for (let k = hole.length - 2; k >= 0; k -= 2) inner.push(hole[k], hole[k + 1]);
    sweep(w, [{ ring: inner, z: z0 }, { ring: inner, z: z1 }], colour, KIND_FLAT);
  }
  const flat = hole ? outer.concat(hole) : outer;
  const tris = earcut(flat, hole ? [outer.length / 2] : [], 2);
  for (const [z, nz] of [
    [z1, 1],
    [z0, -1],
  ]) {
    const first = w.count;
    for (let k = 0; k < flat.length; k += 2) w.vertex(flat[k], flat[k + 1], z, 0, 0, nz, colour, KIND_FLAT, 0);
    for (const t of tris) w.core.push(first + t);
  }
}

function eiffel(w: Writer, x: number, y: number, z: number): void {
  const legOffset = (h: number) => (h < 57 ? lerp(34.5, 70.5, (1 - h / 57) ** 1.3) : lerp(16.5, 34.5, (1 - (h - 57) / 58) ** 1.15));
  const legHalf = (h: number) => (h < 57 ? lerp(17, 8.5, h / 57) : lerp(8.5, 7.5, (h - 57) / 58));
  const shaftHalf = (h: number) => 11.5 + 12.5 * ((276 - h) / 161) ** 1.7;
  const steps = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));

  for (const [ex, ey] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    for (const [a, b] of [
      [0, 57],
      [61, 115],
    ]) {
      sweep(
        w,
        steps(a, b, 6).map((h) => ({ ring: ring(x + ex * legOffset(h), y + ey * legOffset(h), legHalf(h)), z: z + h })),
        IRON,
        KIND_LATTICE,
      );
    }
    const tx = ey;
    const ty = -ex;
    const fx = (ex + tx) / Math.SQRT2;
    const fy = (ey + ty) / Math.SQRT2;
    const sx = (tx - ex) / Math.SQRT2;
    const sy = (ty - ey) / Math.SQRT2;
    const N = 14;
    let prev: [number, number] | null = null;
    for (let i = 0; i <= N; i++) {
      const s = -1 + (2 * i) / N;
      const arch = 22 + 20 * Math.sqrt(Math.max(0, 1 - s * s));
      const point = (h: number, span: number) => {
        const d = legOffset(h) / Math.SQRT2;
        return [x + fx * d + sx * s * d * span, y + fy * d + sy * s * d * span, z + h] as const;
      };
      const top = point(57, 0.78);
      const rim = point(arch, 0.82);
      const low = point(arch - 2.2, 0.82);
      const a = w.vertex(top[0], top[1], top[2], fx, fy, 0, IRON, KIND_LATTICE, 0, (i / N) * 60, 60, 57 - arch, 35);
      w.vertex(rim[0], rim[1], rim[2], fx, fy, 0, IRON, KIND_LATTICE, 0, (i / N) * 60, 60, 0, 35);
      const c = w.vertex(rim[0], rim[1], rim[2], fx, fy, 0, IRON_DARK, KIND_FLAT, 0);
      w.vertex(low[0], low[1], low[2], fx, fy, 0, IRON_DARK, KIND_FLAT, 0);
      if (prev) {
        w.quad(w.core, prev[0], prev[0] + 1, a + 1, a);
        w.quad(w.core, prev[1], prev[1] + 1, c + 1, c);
      }
      prev = [a, c];
    }
  }
  sweep(
    w,
    steps(119, 276, 10).map((h) => ({ ring: ring(x, y, shaftHalf(h)), z: z + h })),
    IRON,
    KIND_LATTICE,
  );
  slab(w, ring(x, y, 51), ring(x, y, 20), z + 57, z + 61.5, IRON_DARK);
  slab(w, ring(x, y, 27.5), null, z + 115, z + 119.5, IRON_DARK);
  slab(w, ring(x, y, 13.5), null, z + 276, z + 280, IRON_DARK);
  sweep(
    w,
    [
      { ring: ring(x, y, 8), z: z + 280 },
      { ring: ring(x, y, 6.5), z: z + 292 },
      { ring: ring(x, y, 2.2), z: z + 301 },
      { ring: ring(x, y, 1.2), z: z + 330 },
    ],
    IRON,
    KIND_FLAT,
  );
}

export const LANDMARKS: Landmark[] = [{ name: "Eiffel Tower", lat: 48.85826, lon: 2.2945, radius: 86, minHeight: 10, build: eiffel }];
