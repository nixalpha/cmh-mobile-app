import earcut from "earcut";
import { clipRing } from "../globe/geo";
import { hash32 } from "./hash";
import { type BuildingStyle, buildingStyle, parseColour, type RGB } from "./style";
import type { Polygon, TileData } from "./vt";

export const TILE_BUFFER = 64 / 4096;
const LATTICE = 4096;
const EPS = 1e-6;

export interface Building extends Polygon {
  height: number;
  minHeight: number;
  seed: number;
  style: BuildingStyle;
  colour: RGB | null;
  box: [number, number, number, number];
  anchor: [number, number];
  clipped: boolean;
  owned: boolean;
  stacked: boolean;
  outline: boolean;
  group: number;
}

export function pointInRing(ring: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const yi = ring[i + 1];
    const yj = ring[j + 1];
    if (yi > y !== yj > y && x < ((ring[j] - ring[i]) * (y - yi)) / (yj - yi) + ring[i]) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(poly: Polygon, x: number, y: number): boolean {
  if (!pointInRing(poly.outer, x, y)) return false;
  for (const hole of poly.holes) if (pointInRing(hole, x, y)) return false;
  return true;
}

function ringBox(ring: number[]): [number, number, number, number] {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < ring.length; k += 2) {
    box[0] = Math.min(box[0], ring[k]);
    box[1] = Math.min(box[1], ring[k + 1]);
    box[2] = Math.max(box[2], ring[k]);
    box[3] = Math.max(box[3], ring[k + 1]);
  }
  return box;
}

function ringAnchor(ring: number[]): [number, number] {
  let ax = Infinity;
  let ay = Infinity;
  for (let k = 0; k < ring.length; k += 2) {
    if (ring[k] < ax || (ring[k] === ax && ring[k + 1] < ay)) {
      ax = ring[k];
      ay = ring[k + 1];
    }
  }
  return [ax, ay];
}

export function interiorPoint(poly: Polygon): [number, number] {
  let cx = 0;
  let cy = 0;
  const n = poly.outer.length / 2;
  for (let k = 0; k < poly.outer.length; k += 2) {
    cx += poly.outer[k] / n;
    cy += poly.outer[k + 1] / n;
  }
  if (pointInPolygon(poly, cx, cy)) return [cx, cy];
  const flat = poly.outer.slice();
  const holes: number[] = [];
  for (const hole of poly.holes) {
    holes.push(flat.length / 2);
    for (const v of hole) flat.push(v);
  }
  const tris = earcut(flat, holes, 2);
  let best = 0;
  let out: [number, number] = [cx, cy];
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t] * 2, tris[t + 1] * 2, tris[t + 2] * 2];
    const area = Math.abs((flat[b] - flat[a]) * (flat[c + 1] - flat[a + 1]) - (flat[c] - flat[a]) * (flat[b + 1] - flat[a + 1]));
    if (area > best) {
      best = area;
      out = [(flat[a] + flat[b] + flat[c]) / 3, (flat[a + 1] + flat[b + 1] + flat[c + 1]) / 3];
    }
  }
  return out;
}

function crossesWithinBuffer(box: [number, number, number, number]): boolean {
  for (const axis of [0, 1]) {
    const lo = box[axis];
    const hi = box[axis + 2];
    for (const line of [0, 1]) {
      if (lo < line && hi > line && (lo < line - TILE_BUFFER - EPS || hi > line + TILE_BUFFER + EPS)) return false;
    }
  }
  return true;
}

export const CHUNK_SPLIT = 4;

export interface ChunkBuildings {
  list: Building[];
  members: Map<number, Building[]>;
}

const chunkCache = new WeakMap<TileData, Map<number, ChunkBuildings>>();

export function chunkBuildings(tile: TileData, cx: number, cy: number): ChunkBuildings {
  let chunks = chunkCache.get(tile);
  if (!chunks) {
    chunkCache.set(tile, (chunks = new Map()));
    const all = tileBuildings(tile);
    const groups = new Map<number, Building[]>();
    for (const b of all) {
      if (b.outline) continue;
      let g = groups.get(b.group);
      if (!g) groups.set(b.group, (g = []));
      g.push(b);
    }
    const slot = (v: number) => Math.max(0, Math.min(CHUNK_SPLIT - 1, Math.floor(v * CHUNK_SPLIT)));
    for (const [root, group] of groups) {
      const lead = all[root].outline ? group[0] : all[root];
      if (!lead.owned) continue;
      const key = slot(lead.anchor[1]) * CHUNK_SPLIT + slot(lead.anchor[0]);
      let chunk = chunks.get(key);
      if (!chunk) chunks.set(key, (chunk = { list: [], members: new Map() }));
      for (const b of group) chunk.list.push(b);
      if (group.length > 1) chunk.members.set(root, group);
    }
  }
  return chunks.get(cy * CHUNK_SPLIT + cx) ?? { list: [], members: new Map() };
}

const cache = new WeakMap<TileData, Building[]>();

export function tileBuildings(tile: TileData): Building[] {
  let out = cache.get(tile);
  if (!out) cache.set(tile, (out = extract(tile)));
  return out;
}

function extract(tile: TileData): Building[] {
  const out: Building[] = [];
  const lo = -TILE_BUFFER + EPS;
  const hi = 1 + TILE_BUFFER - EPS;
  for (const f of tile.layers.building) {
    const outline = f.props.hide_3d === true;
    const height = Math.min(900, Number(f.props.render_height) || 6);
    const minHeight = Math.max(0, Number(f.props.render_min_height) || 0);
    if (!outline && height - minHeight < 0.5) continue;
    const colour = parseColour(f.props.colour);
    for (const poly of f.polys) {
      let box = ringBox(poly.outer);
      const inCore = box[0] >= 0 && box[1] >= 0 && box[2] <= 1 && box[3] <= 1;
      const cut = box[0] <= lo || box[1] <= lo || box[2] >= hi || box[3] >= hi;
      const clipped = !inCore && (cut || !crossesWithinBuffer(box));
      let { outer, holes } = poly;
      let seed: number;
      if (clipped) {
        outer = clipRing(poly.outer, 0, 0, 1, 1);
        if (!outer.length) continue;
        holes = poly.holes.map((h) => clipRing(h, 0, 0, 1, 1)).filter((h) => h.length);
        box = ringBox(outer);
        seed = hash32(Math.round(height * 16), Math.round(minHeight * 16) + 977);
      } else {
        const a = ringAnchor(outer);
        seed = hash32(tile.x * LATTICE + Math.round(a[0] * LATTICE), tile.y * LATTICE + Math.round(a[1] * LATTICE));
      }
      const anchor = ringAnchor(outer);
      out.push({
        outer,
        holes,
        height,
        minHeight,
        seed,
        style: buildingStyle(seed, height, colour),
        colour,
        box,
        anchor,
        clipped,
        owned: clipped || (anchor[0] >= 0 && anchor[0] < 1 && anchor[1] >= 0 && anchor[1] < 1),
        stacked: false,
        outline,
        group: out.length,
      });
    }
  }
  group(out);
  return out;
}

function group(all: Building[]): void {
  const GRID = 24;
  const cell = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(((v + TILE_BUFFER) / (1 + 2 * TILE_BUFFER)) * GRID)));
  const grid: number[][] = Array.from({ length: GRID * GRID }, () => []);
  all.forEach((b, i) => {
    for (let gy = cell(b.box[1]); gy <= cell(b.box[3]); gy++) for (let gx = cell(b.box[0]); gx <= cell(b.box[2]); gx++) grid[gy * GRID + gx].push(i);
  });
  const order = all.map((_, i) => i).sort((a, b) => all[a].minHeight - all[b].minHeight);
  const root = all.map((_, i) => i);
  const top = all.map((b) => b.height);
  for (const i of order) {
    const b = all[i];
    if (b.outline) continue;
    const [px, py] = interiorPoint(b);
    let support = -1;
    for (const j of grid[cell(py) * GRID + cell(px)]) {
      const c = all[j];
      if (j === i || px < c.box[0] || px > c.box[2] || py < c.box[1] || py > c.box[3]) continue;
      if (!c.outline && (b.minHeight <= 0 || c.minHeight >= b.minHeight)) continue;
      if (!pointInPolygon(c, px, py)) continue;
      const s = support < 0 ? null : all[support];
      if (!s || (c.outline && !s.outline) || (c.outline === s.outline && c.minHeight < s.minHeight)) support = j;
    }
    if (support < 0) continue;
    root[i] = root[support];
    top[root[i]] = Math.max(top[root[i]], b.height);
    b.stacked = all[support].stacked = true;
  }
  all.forEach((b, i) => {
    b.group = root[i];
    if (root[i] === i && !b.stacked) return;
    b.seed = all[root[i]].seed;
    b.style = buildingStyle(b.seed, top[root[i]], b.colour ?? all[root[i]].colour);
  });
}
