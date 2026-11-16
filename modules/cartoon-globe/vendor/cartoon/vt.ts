import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { ringArea } from "../globe/geo";
import { CARTOON_TILEJSON } from "./sources";

export const VT_MAX_ZOOM = 14;
const LAYERS = ["water", "waterway", "landcover", "landuse", "park", "aeroway", "transportation", "building"] as const;
const CACHE_BYTES = 28e6;
const CACHE_MIN = 24;

export type LayerName = (typeof LAYERS)[number];
export type Props = Record<string, string | number | boolean>;

export interface Polygon {
  outer: number[];
  holes: number[][];
}

export interface Feature {
  props: Props;
  lines: number[][];
  polys: Polygon[];
}

export interface TileData {
  z: number;
  x: number;
  y: number;
  layers: Record<LayerName, Feature[]>;
}

export function decodeTile(buffer: ArrayBuffer, z: number, x: number, y: number): TileData {
  const vt = new VectorTile(new PbfReader(new Uint8Array(buffer)));
  const layers = {} as Record<LayerName, Feature[]>;
  for (const name of LAYERS) {
    const out: Feature[] = (layers[name] = []);
    const layer = vt.layers[name];
    if (!layer) continue;
    const scale = 1 / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 2 && f.type !== 3) continue;
      const feature: Feature = { props: f.properties as Props, lines: [], polys: [] };
      for (const ring of f.loadGeometry()) {
        const closed = f.type === 3 && ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y;
        const n = closed ? ring.length - 1 : ring.length;
        const flat: number[] = new Array(n * 2);
        for (let k = 0; k < n; k++) {
          flat[k * 2] = ring[k].x * scale;
          flat[k * 2 + 1] = ring[k].y * scale;
        }
        if (f.type === 2) {
          if (n >= 2) feature.lines.push(flat);
          continue;
        }
        if (n < 3) continue;
        const area = ringArea(flat);
        if (area > 0) feature.polys.push({ outer: flat, holes: [] });
        else if (area < 0 && feature.polys.length) feature.polys[feature.polys.length - 1].holes.push(flat);
      }
      if (feature.lines.length || feature.polys.length) out.push(feature);
    }
  }
  return { z, x, y, layers };
}

interface Entry {
  tile: Promise<TileData | null>;
  bytes: number;
}

export class VectorTiles {
  private cache = new Map<string, Entry>();
  private bytes = 0;
  private template: Promise<string | null> | null = null;

  load(z: number, x: number, y: number): Promise<TileData | null> {
    const key = `${z}/${x}/${y}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit.tile;
    }
    const entry: Entry = { tile: Promise.resolve(null), bytes: 0 };
    entry.tile = this.fetchTile(z, x, y, entry).catch(() => {
      if (this.cache.get(key) === entry) this.cache.delete(key);
      return null;
    });
    this.cache.set(key, entry);
    return entry.tile;
  }

  private trim(): void {
    for (const [key, entry] of this.cache) {
      if (this.bytes <= CACHE_BYTES || this.cache.size <= CACHE_MIN) break;
      this.cache.delete(key);
      this.bytes -= entry.bytes;
    }
  }

  private async fetchTile(z: number, x: number, y: number, entry: Entry): Promise<TileData | null> {
    this.template ??= fetch(CARTOON_TILEJSON)
      .then((r) => r.json())
      .then((j: { tiles?: string[] }) => j.tiles?.[0] ?? null)
      .catch(() => {
        this.template = null;
        return null;
      });
    const template = await this.template;
    if (!template) throw new Error("no vector tiles");
    const res = await fetch(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
    if (res.status === 204 || res.status === 404) return { z, x, y, layers: decodeTile(new ArrayBuffer(0), z, x, y).layers };
    if (!res.ok) throw new Error(`vector tile ${res.status}`);
    const buffer = await res.arrayBuffer();
    entry.bytes = buffer.byteLength;
    this.bytes += entry.bytes;
    this.trim();
    return decodeTile(buffer, z, x, y);
  }
}
