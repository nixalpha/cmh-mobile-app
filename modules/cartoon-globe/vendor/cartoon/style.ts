import { hash32, unit } from "./hash";

export type RGB = [number, number, number];

export const hex = (value: number): RGB => [(value >> 16) & 255, (value >> 8) & 255, value & 255];
export const css = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

export const COLORS = {
  land: hex(0xe9e4d6),
  lawn: hex(0x7cc655),
  park: hex(0x86cc5e),
  wood: hex(0x6fb556),
  scrub: hex(0x9ccf78),
  farmland: hex(0xd9e3a6),
  sand: hex(0xf2e3b3),
  rock: hex(0xcfc8bc),
  ice: hex(0xf3f8fb),
  wetland: hex(0xa9d6b4),
  water: hex(0x8fcdf2),
  waterEdge: hex(0xb9e2f8),
  pavement: hex(0xe0d1c8),
  plaza: hex(0xe6ddd2),
  asphalt: hex(0x9298a2),
  asphaltMinor: hex(0x9aa0aa),
  footpath: hex(0xecd5c0),
  brick: hex(0xc98078),
  brickRoad: hex(0xcf7f72),
  rail: hex(0x8a8f99),
  laneYellow: hex(0xf2cf4a),
  laneWhite: hex(0xf6f6f2),
  pitch: hex(0x6dbb5a),
  school: hex(0xefe6d2),
  roof: hex(0xe8e5e0),
  trim: hex(0xf8f6f1),
  glass: hex(0x6aa5dc),
  kerb: hex(0xf4eee4),
  yard: hex(0x8bcf64),
  flowerbed: hex(0x63b24c),
  hedge: hex(0x4f9d42),
  flowerPink: hex(0xf5a3c7),
  flowerPurple: hex(0xb48ee6),
  flowerWhite: hex(0xfdfbf3),
  playground: hex(0xf3dfae),
  cemetery: hex(0xb9d9a4),
  commercial: hex(0xe6dfd6),
  railyard: hex(0xd9d6d2),
  track: hex(0xe0d2b4),
  runway: hex(0x8d929c),
  taxiway: hex(0xa9adb5),
  apron: hex(0xd3d3d6),
  shadow: hex(0x3d4a6b),
};

const WALLS: Array<[RGB, number]> = [
  [hex(0xf3efe6), 5],
  [hex(0xeee6d4), 3.5],
  [hex(0xead3ab), 2],
  [hex(0xecc66b), 2.2],
  [hex(0xd5644f), 1.6],
  [hex(0xe59a8c), 1.2],
  [hex(0xa9cbe9), 1.8],
  [hex(0xa6dcc3), 1.2],
  [hex(0xc2e08c), 0.7],
  [hex(0xd9d6e8), 0.5],
];

const TOWERS: Array<[RGB, number]> = [
  [hex(0xb9d6ee), 2],
  [hex(0xcfe0ea), 1.2],
  [hex(0xf0ece2), 2.4],
  [hex(0xe6dcc8), 2],
  [hex(0xefd9a0), 1.6],
  [hex(0xe9b9a8), 1.4],
  [hex(0xb4dcd2), 1.4],
  [hex(0xd8c3b0), 1.2],
  [hex(0xd6cbe6), 0.8],
  [hex(0xd98a78), 0.8],
];

function pick(table: Array<[RGB, number]>, t: number): RGB {
  let total = 0;
  for (const [, w] of table) total += w;
  let acc = t * total;
  for (const [c, w] of table) {
    acc -= w;
    if (acc <= 0) return c;
  }
  return table[0][0];
}

export const KIND_HOUSE = 0;
export const KIND_BLOCK = 1;
export const KIND_TOWER = 2;

export interface BuildingStyle {
  wall: RGB;
  roof: RGB;
  kind: number;
}

export function parseColour(value: unknown): RGB | null {
  if (typeof value !== "string") return null;
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  return m ? hex(parseInt(m[1], 16)) : null;
}

export function buildingStyle(seed: number, height: number, colour: RGB | null): BuildingStyle {
  if (colour) {
    const wall = mix(colour, [255, 255, 255], 0.22);
    return { wall, roof: mix(wall, COLORS.roof, 0.6), kind: height > 70 ? KIND_TOWER : height > 24 ? KIND_BLOCK : KIND_HOUSE };
  }
  const t = unit(seed, 1);
  if (height > 70) {
    const wall = pick(TOWERS, t);
    return { wall, roof: mix(wall, COLORS.roof, 0.7), kind: KIND_TOWER };
  }
  const wall = pick(WALLS, t);
  const tint = (hash32(seed, 2) % 7) - 3;
  const varied: RGB = [wall[0] + tint, wall[1] + tint, wall[2] + tint].map((v) => Math.max(0, Math.min(255, v))) as RGB;
  return { wall: varied, roof: mix(varied, COLORS.roof, 0.82), kind: height > 24 ? KIND_BLOCK : KIND_HOUSE };
}
