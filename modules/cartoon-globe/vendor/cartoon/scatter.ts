import { hash32, unit } from "./hash";
import { Mask } from "./mask";
import type { Building } from "./model";
import type { Feature, TileData } from "./vt";

export const TREE_STRIDE = 5;
export const TREE_ROUND = 0;
export const TREE_CONIFER = 1;

const BUILDING = 1;
const NEAR = 2;
const ROAD = 4;
const WATER = 8;
const WOOD = 16;
const PARK = 32;
const GRASS = 64;
const BARE = 128;
const CELL_M = 1.5;
const MARGIN_M = 16;
const LATTICE_M = 8;
const STREET_SPACING_M = 13;

const HALF_WIDTH: Record<string, number> = { motorway: 8, trunk: 7.5, primary: 6.5, secondary: 6, tertiary: 5, minor: 4.5, busway: 3.5, service: 2.5, track: 1.8, path: 1.3, rail: 3, transit: 3 };
const STREET_CLASSES = new Set(["primary", "secondary", "tertiary", "minor"]);

export interface Rect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

function roadHalfWidth(f: Feature): number {
  return HALF_WIDTH[String(f.props.class)] ?? 2.5;
}

function touches(box: [number, number, number, number], r: Rect, pad: number): boolean {
  return box[2] >= r.u0 - pad && box[0] <= r.u1 + pad && box[3] >= r.v0 - pad && box[1] <= r.v1 + pad;
}

function lineBox(line: number[]): [number, number, number, number] {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < line.length; k += 2) {
    box[0] = Math.min(box[0], line[k]);
    box[1] = Math.min(box[1], line[k + 1]);
    box[2] = Math.max(box[2], line[k]);
    box[3] = Math.max(box[3], line[k + 1]);
  }
  return box;
}

export function buildMask(tile: TileData, buildings: Building[], rect: Rect, metersPerUnit: number): Mask {
  const cell = CELL_M / metersPerUnit;
  const pad = MARGIN_M / metersPerUnit;
  const mask = new Mask(rect.u0 - pad, rect.v0 - pad, cell, Math.ceil((rect.u1 - rect.u0 + 2 * pad) / cell), Math.ceil((rect.v1 - rect.v0 + 2 * pad) / cell));
  const m = (meters: number) => meters / metersPerUnit;
  const polygons = (features: Feature[], bitOf: (f: Feature) => number) => {
    for (const f of features) {
      const bit = bitOf(f);
      if (!bit) continue;
      for (const p of f.polys) if (touches(lineBox(p.outer), rect, pad)) mask.fill([p.outer, ...p.holes], bit);
    }
  };
  polygons(tile.layers.landcover, (f) => {
    const c = f.props.class;
    const s = f.props.subclass;
    if (c === "wood") return WOOD;
    if (c === "grass") return s === "park" || s === "garden" || s === "village_green" || s === "recreation_ground" ? PARK : s === "scrub" || s === "heath" ? GRASS | PARK : GRASS;
    return BARE;
  });
  polygons(tile.layers.landuse, (f) => {
    const c = f.props.class;
    if (c === "cemetery") return PARK;
    if (c === "pitch" || c === "playground" || c === "track" || c === "stadium" || c === "railway" || c === "quarry") return BARE;
    return 0;
  });
  polygons(tile.layers.aeroway, () => BARE);
  for (const f of tile.layers.water) {
    for (const p of f.polys) {
      if (!touches(lineBox(p.outer), rect, pad)) continue;
      mask.fill([p.outer, ...p.holes], WATER);
      mask.stroke(p.outer, m(2), WATER, true);
    }
  }
  for (const f of tile.layers.waterway) for (const line of f.lines) if (touches(lineBox(line), rect, pad)) mask.stroke(line, m(4), WATER);
  for (const f of tile.layers.transportation) {
    if (f.props.brunnel === "tunnel") continue;
    for (const p of f.polys) if (touches(lineBox(p.outer), rect, pad)) mask.fill([p.outer, ...p.holes], ROAD);
    const radius = m(roadHalfWidth(f) + 0.8);
    for (const line of f.lines) if (touches(lineBox(line), rect, pad + radius)) mask.stroke(line, radius, ROAD);
  }
  for (const b of buildings) {
    if (b.minHeight > 3 || !touches(b.box, rect, pad + m(12))) continue;
    mask.fill([b.outer, ...b.holes], BUILDING);
    mask.stroke(b.outer, m(2), BUILDING, true);
    mask.stroke(b.outer, m(11), NEAR, true);
  }
  return mask;
}

function coniferShare(lat: number, elevation: number, gx: number, gy: number): number {
  const a = Math.abs(lat);
  const base = a < 23 ? 0.04 : 0.22 + Math.max(0, a - 42) / 28 + Math.max(0, elevation - 700) / 1400;
  const patch = unit(hash32(Math.floor(gx / 9), Math.floor(gy / 9)), 5) - 0.5;
  return Math.max(0.03, Math.min(0.92, base + patch * 0.5));
}

export function placeTrees(tile: TileData, buildings: Building[], rect: Rect, metersPerUnit: number, lat: number, elevation: number): Float32Array {
  const mask = buildMask(tile, buildings, rect, metersPerUnit);
  const out: number[] = [];
  const cells = Math.max(1, Math.round(metersPerUnit / LATTICE_M));
  const add = (u: number, v: number, size: number, kind: number, seed: number) => out.push(u, v, size, kind, unit(seed, 9));

  for (let j = Math.floor(rect.v0 * cells); j < Math.ceil(rect.v1 * cells); j++) {
    for (let i = Math.floor(rect.u0 * cells); i < Math.ceil(rect.u1 * cells); i++) {
      const gx = tile.x * cells + i;
      const gy = tile.y * cells + j;
      const seed = hash32(gx, gy);
      const u = (i + 0.15 + 0.7 * unit(seed, 1)) / cells;
      const v = (j + 0.15 + 0.7 * unit(seed, 2)) / cells;
      if (u < rect.u0 || u >= rect.u1 || v < rect.v0 || v >= rect.v1) continue;
      const here = mask.get(u, v);
      if (here & (BUILDING | WATER | BARE) || mask.near(u, v) & ROAD) continue;
      const wood = (here & WOOD) !== 0;
      const chance = wood ? 0.6 : here & PARK ? 0.2 : here & GRASS ? 0.08 : here & NEAR ? 0.42 : 0;
      if (unit(seed, 3) >= chance) continue;
      const conifer = unit(seed, 4) < coniferShare(lat, elevation, gx, gy);
      const grow = unit(seed, 6);
      const size = conifer ? (wood ? 11 : 9.5) + 5 * grow : (wood ? 10 : 8) + 4.5 * grow;
      add(u, v, size, conifer ? TREE_CONIFER : TREE_ROUND, seed);
    }
  }

  const spacing = STREET_SPACING_M / metersPerUnit;
  for (const f of tile.layers.transportation) {
    if (!STREET_CLASSES.has(String(f.props.class)) || f.props.brunnel) continue;
    const offset = (roadHalfWidth(f) + 2.1) / metersPerUnit;
    for (const line of f.lines) {
      if (!touches(lineBox(line), rect, offset)) continue;
      let carry = spacing * 0.5;
      for (let k = 0; k + 3 < line.length; k += 2) {
        const dx = line[k + 2] - line[k];
        const dy = line[k + 3] - line[k + 1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        let t = carry;
        for (; t < len; t += spacing) {
          for (const side of [-1, 1]) {
            const u = line[k] + (dx * t) / len + ((-dy * side) / len) * offset;
            const v = line[k + 1] + (dy * t) / len + ((dx * side) / len) * offset;
            if (u < rect.u0 || u >= rect.u1 || v < rect.v0 || v >= rect.v1) continue;
            const seed = hash32(Math.round((tile.x + u) * 65536), Math.round((tile.y + v) * 65536));
            if (unit(seed, 3) >= 0.5) continue;
            const here = mask.get(u, v);
            if (!(here & NEAR) || here & (BUILDING | WATER | ROAD | BARE)) continue;
            const conifer = unit(seed, 4) < coniferShare(lat, elevation, 0, 0) * 0.6;
            add(u, v, (conifer ? 7 : 5.2) + 2.4 * unit(seed, 6), conifer ? TREE_CONIFER : TREE_ROUND, seed);
          }
        }
        carry = t - len;
      }
    }
  }

  const order = Array.from({ length: out.length / TREE_STRIDE }, (_, i) => i).sort((a, b) => out[a * TREE_STRIDE + 4] - out[b * TREE_STRIDE + 4]);
  const sorted = new Float32Array(out.length);
  order.forEach((src, dst) => {
    for (let k = 0; k < TREE_STRIDE; k++) sorted[dst * TREE_STRIDE + k] = out[src * TREE_STRIDE + k];
  });
  return sorted;
}
