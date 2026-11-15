import { DEM_SIZE, sampleDem } from "../globe/dem";
import { DEG, EARTH_CIRCUMFERENCE, EARTH_RADIUS, latToMercY, lonToMercX, mercXToLon, mercYToLat } from "../globe/geo";
import { buildBuildings, buildingBase, groundRange, type MeshData, Writer } from "./buildings";
import { LANDMARKS } from "./landmarks";
import { type Building, CHUNK_SPLIT, chunkBuildings, interiorPoint, tileBuildings } from "./model";
import { placeTrees, TREE_CONIFER, TREE_STRIDE } from "./scatter";
import { type TileData, VT_MAX_ZOOM } from "./vt";

export const CHUNK_Z = VT_MAX_ZOOM + Math.log2(CHUNK_SPLIT);

export interface ChunkData {
  lat: number;
  lon: number;
  height: number;
  buildings: MeshData | null;
  trees: Array<{ kind: number; matrices: Float32Array }>;
}

export function buildChunk(tile: TileData, dem: Int16Array | null, x: number, y: number, exaggeration: number): ChunkData {
  const sx = x % CHUNK_SPLIT;
  const sy = y % CHUNK_SPLIT;
  const rect = { u0: sx / CHUNK_SPLIT, v0: sy / CHUNK_SPLIT, u1: (sx + 1) / CHUNK_SPLIT, v1: (sy + 1) / CHUNK_SPLIT };
  const uc = (rect.u0 + rect.u1) / 2;
  const vc = (rect.v0 + rect.v1) / 2;
  const n = 2 ** CHUNK_Z;
  const lat = mercYToLat((y + 0.5) / n);
  const lon = mercXToLon((x + 0.5) / n);
  const groundAt = (u: number, v: number) => (dem ? sampleDem(dem, u * DEM_SIZE, v * DEM_SIZE) * exaggeration : 0);
  const h0 = groundAt(uc, vc);
  const metersPerUnit = (EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)) / 2 ** VT_MAX_ZOOM;
  const scale = metersPerUnit * ((EARTH_RADIUS + h0) / EARTH_RADIUS);

  const marks = LANDMARKS.map((mark) => ({ mark, u: lonToMercX(mark.lon) * 2 ** VT_MAX_ZOOM - tile.x, v: latToMercY(mark.lat) * 2 ** VT_MAX_ZOOM - tile.y })).filter(
    (m) => m.u > -0.2 && m.u < 1.2 && m.v > -0.2 && m.v < 1.2,
  );
  const writer = new Writer();
  for (const { mark, u, v } of marks) {
    if (u >= rect.u0 && u < rect.u1 && v >= rect.v0 && v < rect.v1) mark.build(writer, (u - uc) * scale, (vc - v) * scale, groundAt(u, v) - h0);
  }
  const { list: all, members } = chunkBuildings(tile, sx, sy);
  const list = marks.length
    ? all.filter((b) => {
        const [px, py] = interiorPoint(b);
        return !marks.some(({ mark, u, v }) => b.height >= mark.minHeight && Math.hypot(px - u, py - v) * metersPerUnit < mark.radius);
      })
    : all;
  const bases = new Map<number, number>();
  const base = (b: Building) => {
    const group = members.get(b.group);
    if (!group) return buildingBase(...groundRange(b, groundAt));
    let value = bases.get(b.group);
    if (value === undefined) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const m of group) {
        if (m.minHeight > 0) continue;
        const r = groundRange(m, groundAt);
        lo = Math.min(lo, r[0]);
        hi = Math.max(hi, r[1]);
      }
      if (lo === Infinity) [lo, hi] = groundRange(group[0], groundAt);
      bases.set(b.group, (value = buildingBase(lo, hi)));
    }
    return value;
  };
  const mesh = buildBuildings(list, base, { uc, vc, scale, h0, groundAt }, writer);

  const placed = placeTrees(tile, tileBuildings(tile), rect, metersPerUnit, lat, h0 / exaggeration);
  const total = placed.length / TREE_STRIDE;
  const trees: ChunkData["trees"] = [];
  for (const kind of [0, 1]) {
    let count = 0;
    for (let i = 0; i < total; i++) if (placed[i * TREE_STRIDE + 3] === kind) count++;
    if (!count) continue;
    const matrices = new Float32Array(count * 16);
    let o = 0;
    for (let i = 0; i < total; i++) {
      const k = i * TREE_STRIDE;
      if (placed[k + 3] !== kind) continue;
      const size = placed[k + 2];
      const rand = placed[k + 4];
      const spread = size * (kind === TREE_CONIFER ? 0.9 + 0.25 * rand : 1.15 + 0.35 * rand);
      const c = Math.cos(rand * 97) * spread;
      const s = Math.sin(rand * 97) * spread;
      matrices.set([c, s, 0, 0, -s, c, 0, 0, 0, 0, size, 0, (placed[k] - uc) * scale, (vc - placed[k + 1]) * scale, groundAt(placed[k], placed[k + 1]) - h0 - 0.25, 1], o);
      o += 16;
    }
    trees.push({ kind, matrices });
  }
  return { lat, lon, height: h0, buildings: mesh.index.length ? mesh : null, trees };
}
