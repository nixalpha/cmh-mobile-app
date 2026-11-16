import earcut from "earcut";
import { hash32, unit } from "./hash";
import { type Building, pointInPolygon } from "./model";
import { COLORS, KIND_HOUSE, KIND_TOWER, type RGB } from "./style";

export const KIND_FLAT = 255;
export const KIND_LATTICE = 4;
const BURY = 15;
const EDGE_EPS = 1e-7;

export interface Frame {
  uc: number;
  vc: number;
  scale: number;
  h0: number;
  groundAt: (u: number, v: number) => number;
}

export interface MeshData {
  position: Float32Array;
  normal: Int8Array;
  color: Uint8Array;
  wall: Float32Array;
  index: Uint32Array;
  coreCount: number;
}

export class Writer {
  position: number[] = [];
  normal: number[] = [];
  color: number[] = [];
  wall: number[] = [];
  core: number[] = [];
  detail: number[] = [];
  count = 0;

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB, kind: number, seed: number, u = 0, len = 0, v = 0, h = 0): number {
    this.position.push(x, y, z);
    this.normal.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127), seed & 127);
    this.color.push(c[0], c[1], c[2], kind);
    this.wall.push(u, len, v, h);
    return this.count++;
  }

  quad(into: number[], a: number, b: number, c: number, d: number): void {
    into.push(a, b, c, a, c, d);
  }

  finish(): MeshData {
    const index = new Uint32Array(this.core.length + this.detail.length);
    index.set(this.core);
    index.set(this.detail, this.core.length);
    return {
      position: new Float32Array(this.position),
      normal: new Int8Array(this.normal),
      color: new Uint8Array(this.color),
      wall: new Float32Array(this.wall),
      index,
      coreCount: this.core.length,
    };
  }
}

export function insetRing(ring: number[], distance: number): number[] {
  const n = ring.length / 2;
  const out: number[] = new Array(ring.length);
  for (let i = 0; i < n; i++) {
    const p = ((i + n - 1) % n) * 2;
    const c = i * 2;
    const q = ((i + 1) % n) * 2;
    let ax = ring[c] - ring[p];
    let ay = ring[c + 1] - ring[p + 1];
    let bx = ring[q] - ring[c];
    let by = ring[q + 1] - ring[c + 1];
    const al = Math.hypot(ax, ay) || 1;
    const bl = Math.hypot(bx, by) || 1;
    ax /= al;
    ay /= al;
    bx /= bl;
    by /= bl;
    const mx = ay + by;
    const my = -ax - bx;
    const k = distance / Math.max(0.4, 1 + ax * bx + ay * by);
    out[c] = ring[c] + mx * k;
    out[c + 1] = ring[c + 1] + my * k;
  }
  return out;
}

function ringLocal(ring: number[], f: Frame): number[] {
  const out: number[] = new Array(ring.length);
  for (let k = 0; k < ring.length; k += 2) {
    out[k] = (ring[k] - f.uc) * f.scale;
    out[k + 1] = (f.vc - ring[k + 1]) * f.scale;
  }
  return out;
}

function onTileEdge(ring: number[], k: number, n: number): boolean {
  const au = ring[k * 2];
  const av = ring[k * 2 + 1];
  const bu = ring[((k + 1) % n) * 2];
  const bv = ring[((k + 1) % n) * 2 + 1];
  return (
    (Math.abs(au - bu) < EDGE_EPS && (Math.abs(au) < EDGE_EPS || Math.abs(au - 1) < EDGE_EPS)) ||
    (Math.abs(av - bv) < EDGE_EPS && (Math.abs(av) < EDGE_EPS || Math.abs(av - 1) < EDGE_EPS))
  );
}

function prism(w: Writer, cx: number, cy: number, z0: number, z1: number, r0: number, r1: number, sides: number, turn: number, c: RGB, top: RGB): void {
  const ring: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = turn + (i / sides) * Math.PI * 2;
    ring.push(Math.cos(a), Math.sin(a));
  }
  const cap: number[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const nx = ring[i * 2] + ring[j * 2];
    const ny = ring[i * 2 + 1] + ring[j * 2 + 1];
    const nl = Math.hypot(nx, ny);
    const a = w.vertex(cx + ring[i * 2] * r0, cy + ring[i * 2 + 1] * r0, z0, nx / nl, ny / nl, 0, c, KIND_FLAT, 0);
    const b = w.vertex(cx + ring[j * 2] * r0, cy + ring[j * 2 + 1] * r0, z0, nx / nl, ny / nl, 0, c, KIND_FLAT, 0);
    const d = w.vertex(cx + ring[j * 2] * r1, cy + ring[j * 2 + 1] * r1, z1, nx / nl, ny / nl, 0, c, KIND_FLAT, 0);
    const e = w.vertex(cx + ring[i * 2] * r1, cy + ring[i * 2 + 1] * r1, z1, nx / nl, ny / nl, 0, c, KIND_FLAT, 0);
    w.quad(w.detail, a, b, d, e);
    cap.push(w.vertex(cx + ring[i * 2] * r1, cy + ring[i * 2 + 1] * r1, z1, 0, 0, 1, top, KIND_FLAT, 0));
  }
  for (let i = 1; i + 1 < sides; i++) w.detail.push(cap[0], cap[i], cap[i + 1]);
}

function volume(w: Writer, b: Building, outer: number[], holes: number[][], srcOuter: number[] | null, z0: number, zBase: number, z1: number, v0: number, height: number, roof: RGB, parapet: number, bottom: boolean, into: number[]): void {
  const { wall, kind } = b.style;
  const seed = b.seed;
  const rings = [outer, ...holes];
  const narrow = ringSpan(outer) < 5;
  const wallKind = narrow || height < 2.6 ? KIND_FLAT : kind;
  rings.forEach((ring, r) => {
    const n = ring.length / 2;
    const src = r === 0 ? srcOuter : null;
    const inner = parapet > 0 ? insetRing(ring, 0.65) : null;
    for (let k = 0; k < n; k++) {
      if (b.clipped && src && onTileEdge(src, k, n)) continue;
      if (b.clipped && !src && r > 0 && onTileEdge(b.holes[r - 1], k, n)) continue;
      const j = (k + 1) % n;
      const ax = ring[k * 2];
      const ay = ring[k * 2 + 1];
      const bx = ring[j * 2];
      const by = ring[j * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 0.02) continue;
      const nx = -dy / len;
      const ny = dx / len;
      const top = z1 + parapet;
      const vTop = v0 + (top - zBase);
      const a = w.vertex(ax, ay, z0, nx, ny, 0, wall, wallKind, seed, 0, len, v0 - (zBase - z0), height);
      const c = w.vertex(bx, by, z0, nx, ny, 0, wall, wallKind, seed, len, len, v0 - (zBase - z0), height);
      const d = w.vertex(bx, by, top, nx, ny, 0, wall, wallKind, seed, len, len, vTop, height);
      const e = w.vertex(ax, ay, top, nx, ny, 0, wall, wallKind, seed, 0, len, vTop, height);
      w.quad(into, a, c, d, e);
      if (!inner) continue;
      const ix = inner[k * 2];
      const iy = inner[k * 2 + 1];
      const jx = inner[j * 2];
      const jy = inner[j * 2 + 1];
      const t0 = w.vertex(ax, ay, top, 0, 0, 1, COLORS.trim, KIND_FLAT, seed);
      const t1 = w.vertex(bx, by, top, 0, 0, 1, COLORS.trim, KIND_FLAT, seed);
      const t2 = w.vertex(jx, jy, top, 0, 0, 1, COLORS.trim, KIND_FLAT, seed);
      const t3 = w.vertex(ix, iy, top, 0, 0, 1, COLORS.trim, KIND_FLAT, seed);
      w.quad(w.detail, t0, t1, t2, t3);
      const s0 = w.vertex(ix, iy, top, -nx, -ny, 0, COLORS.trim, KIND_FLAT, seed);
      const s1 = w.vertex(jx, jy, top, -nx, -ny, 0, COLORS.trim, KIND_FLAT, seed);
      const s2 = w.vertex(jx, jy, z1, -nx, -ny, 0, COLORS.trim, KIND_FLAT, seed);
      const s3 = w.vertex(ix, iy, z1, -nx, -ny, 0, COLORS.trim, KIND_FLAT, seed);
      w.quad(w.detail, s0, s1, s2, s3);
    }
  });

  const flat = outer.slice();
  const holeIdx: number[] = [];
  for (const hole of holes) {
    holeIdx.push(flat.length / 2);
    for (const value of hole) flat.push(value);
  }
  const tris = earcut(flat, holeIdx, 2);
  if (!tris.length) return;
  const first = w.count;
  for (let k = 0; k < flat.length; k += 2) w.vertex(flat[k], flat[k + 1], z1, 0, 0, 1, roof, KIND_FLAT, seed);
  for (const t of tris) into.push(first + t);
  if (!bottom) return;
  const under = w.count;
  for (let k = 0; k < flat.length; k += 2) w.vertex(flat[k], flat[k + 1], zBase, 0, 0, -1, wall, KIND_FLAT, seed);
  for (const t of tris) into.push(under + t);
}

function ringSpan(ring: number[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < ring.length; k += 2) {
    x0 = Math.min(x0, ring[k]);
    y0 = Math.min(y0, ring[k + 1]);
    x1 = Math.max(x1, ring[k]);
    y1 = Math.max(y1, ring[k + 1]);
  }
  return Math.min(x1 - x0, y1 - y0);
}

function ringAreaAbs(ring: number[]): number {
  let a = 0;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return Math.abs(a / 2);
}

function scaledRing(ring: number[], cx: number, cy: number, s: number): number[] {
  const out: number[] = new Array(ring.length);
  for (let k = 0; k < ring.length; k += 2) {
    out[k] = cx + (ring[k] - cx) * s;
    out[k + 1] = cy + (ring[k + 1] - cy) * s;
  }
  return out;
}

function ringInside(ring: number[], poly: { outer: number[]; holes: number[][] }): boolean {
  const n = ring.length / 2;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    if (!pointInPolygon(poly, ring[k * 2], ring[k * 2 + 1])) return false;
    if (!pointInPolygon(poly, (ring[k * 2] + ring[j * 2]) / 2, (ring[k * 2 + 1] + ring[j * 2 + 1]) / 2)) return false;
  }
  return true;
}

function centroid(ring: number[]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    const cross = ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
    a += cross;
    cx += (ring[i * 2] + ring[j * 2]) * cross;
    cy += (ring[i * 2 + 1] + ring[j * 2 + 1]) * cross;
  }
  return Math.abs(a) < 1e-9 ? [ring[0], ring[1]] : [cx / (3 * a), cy / (3 * a)];
}

function rooftop(w: Writer, b: Building, outer: number[], holes: number[][], zRoof: number, height: number): void {
  const area = ringAreaAbs(outer);
  if (area < 45) return;
  const poly = { outer, holes };
  const seed = b.seed;
  let crown: number[] | null = null;
  const wantsCrown = b.style.kind === KIND_HOUSE ? area > 140 && unit(seed, 11) < 0.3 : unit(seed, 11) < 0.8;
  if (wantsCrown && !holes.length && outer.length <= 28) {
    const [cx, cy] = centroid(outer);
    const s = b.style.kind === KIND_HOUSE ? 0.62 : 0.66 + 0.14 * unit(seed, 12);
    const ring = scaledRing(outer, cx + (unit(seed, 13) - 0.5) * 0.08 * Math.sqrt(area), cy + (unit(seed, 14) - 0.5) * 0.08 * Math.sqrt(area), s);
    if (ringInside(ring, poly) && ringSpan(ring) > 4) {
      crown = ring;
      const rise = b.style.kind === KIND_HOUSE ? 2.9 : Math.max(3.2, Math.min(14, height * (0.05 + 0.07 * unit(seed, 15))));
      volume(w, b, ring, [], null, zRoof, zRoof, zRoof + rise, height, height + rise, b.style.roof, b.style.kind === KIND_TOWER ? 0 : 0.4, false, w.detail);
    }
  }
  const stacks = b.style.kind === KIND_HOUSE ? 1 + (hash32(seed, 21) % 3) : 1 + (hash32(seed, 21) % 2);
  const stackColor: RGB = unit(seed, 22) < 0.6 ? [236, 226, 212] : [226, 198, 180];
  for (let i = 0, placed = 0; i < stacks * 6 && placed < stacks; i++) {
    const k = hash32(seed, 30 + i) % (outer.length / 2);
    const j = (k + 1) % (outer.length / 2);
    const t = 0.2 + 0.6 * unit(seed, 60 + i);
    const ex = outer[j * 2] - outer[k * 2];
    const ey = outer[j * 2 + 1] - outer[k * 2 + 1];
    const el = Math.hypot(ex, ey);
    if (el < 2.5) continue;
    const inset = 1.3 + 2.2 * unit(seed, 90 + i);
    const px = outer[k * 2] + ex * t + (ey / el) * inset;
    const py = outer[k * 2 + 1] + ey * t - (ex / el) * inset;
    const r = b.style.kind === KIND_HOUSE ? 0.42 + 0.14 * unit(seed, 120 + i) : 0.9 + 0.6 * unit(seed, 120 + i);
    const clear = r + 0.7;
    if (
      !pointInPolygon(poly, px + clear, py) ||
      !pointInPolygon(poly, px - clear, py) ||
      !pointInPolygon(poly, px, py + clear) ||
      !pointInPolygon(poly, px, py - clear)
    ) {
      continue;
    }
    if (crown && pointInPolygon({ outer: insetRing(crown, -clear), holes: [] }, px, py)) continue;
    const tall = b.style.kind === KIND_HOUSE ? 1.3 + 0.7 * unit(seed, 150 + i) : 1.8 + 1.2 * unit(seed, 150 + i);
    const sides = b.style.kind === KIND_HOUSE ? 6 : 4;
    const turn = Math.atan2(ey, ex) + Math.PI / sides;
    prism(w, px, py, zRoof - 0.05, zRoof + tall, r, r * 0.94, sides, turn, stackColor, stackColor);
    if (b.style.kind === KIND_HOUSE) prism(w, px, py, zRoof + tall, zRoof + tall + 0.22, r * 1.28, r * 1.28, sides, turn, COLORS.trim, COLORS.trim);
    placed++;
  }
}

export function groundRange(b: Building, groundAt: (u: number, v: number) => number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < b.outer.length; k += 2) {
    const g = groundAt(b.outer[k], b.outer[k + 1]);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  return [lo, hi];
}

export function buildingBase(lo: number, hi: number): number {
  return lo + Math.min((hi - lo) * 0.5, 2.5);
}

export function buildBuildings(list: Building[], base: (b: Building) => number, frame: Frame, w = new Writer()): MeshData {
  for (const b of list) {
    if (b.outline) continue;
    const ground = base(b) - frame.h0;
    const outer = ringLocal(b.outer, frame);
    const holes = b.holes.map((h) => ringLocal(h, frame));
    const floating = b.minHeight > 0;
    const zBase = ground + b.minHeight;
    const z1 = ground + b.height;
    const tall = b.height - b.minHeight;
    const small = ringSpan(outer) < 4 || tall < 2.6;
    const parapet = small || b.clipped ? 0 : b.style.kind === KIND_HOUSE ? 0.42 : 0.75;
    volume(w, b, outer, holes, b.outer, floating ? zBase : zBase - BURY, zBase, z1, 0, tall, b.style.roof, parapet, floating, w.core);
    if (!b.stacked && !b.clipped && !small) rooftop(w, b, outer, holes, z1, tall);
  }
  return w.finish();
}
