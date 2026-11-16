import { VectorTile } from "@mapbox/vector-tile";
import earcut from "earcut";
import { PbfReader } from "pbf";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  type IUniform,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Texture,
  Vector3,
} from "three";
import { DemStore, DEM_SIZE, sampleDem } from "./dem";
import { clipRing, DEG, EARTH_CIRCUMFERENCE, EARTH_RADIUS, enuFrame, latToMercY, lonToMercX, mercXToLon, mercYToLat, ringArea, toECEF } from "./geo";
import { disposeTexture, fetchBitmap, imageTexture } from "./imagery";
import { BUILDING_FRAG, BUILDING_VERT } from "./shaders";
import { BUILDINGS_TILEJSON, type ImageryLayer } from "./sources";

const CHUNK_Z = 16;
const VT_Z = 14;
const SPLIT = 2 ** (CHUNK_Z - VT_Z);
const ROOF_Z = 17;
const MAX_RANGE = 12000;
const MAX_BUILDS = 4;
const BURY = 15;
const EPS = 1e-7;

const PALETTE = [0xd8d1c4, 0xc9c2b6, 0xb9b2a6, 0xe2dcd2, 0xaaa49b, 0xc4b5a1, 0xb7a797, 0x9ea6ae, 0x8f99a4, 0xd5cdc6, 0xbfc3c4, 0xcdbfb0].map(
  (hex) => new Color(hex),
);
const SUN = { e: 0.6, n: -0.8 };

interface Polygon {
  outer: number[];
  holes: number[][];
}

interface Footprint {
  polys: Polygon[];
  height: number;
  minHeight: number;
  color: Color;
  seed: number;
  box: [number, number, number, number];
  ground?: number;
}

export interface Chunk {
  key: string;
  x: number;
  y: number;
  state: "loading" | "ready" | "empty";
  mesh: Mesh<BufferGeometry, ShaderMaterial> | null;
  roof: Texture | null;
  wallIndexCount: number;
  lastUsed: number;
  born: number;
}

function parseFootprints(buffer: ArrayBuffer): Footprint[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(buffer))).layers.building;
  if (!layer) return [];
  const out: Footprint[] = [];
  const tmp = new Color();
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 3) continue;
    const props = f.properties;
    if (props.hide_3d) continue;
    const height = Math.min(900, Number(props.render_height) || 6);
    const minHeight = Math.max(0, Number(props.render_min_height) || 0);
    if (height - minHeight < 0.5) continue;
    const polys: Polygon[] = [];
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of f.loadGeometry()) {
      const flat: number[] = [];
      const n = ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y ? ring.length - 1 : ring.length;
      for (let k = 0; k < n; k++) flat.push(ring[k].x / layer.extent, ring[k].y / layer.extent);
      if (flat.length < 6) continue;
      const area = ringArea(flat);
      if (Math.abs(area) < 1e-12) continue;
      if (area > 0) {
        polys.push({ outer: flat, holes: [] });
        for (let k = 0; k < flat.length; k += 2) {
          box[0] = Math.min(box[0], flat[k]);
          box[1] = Math.min(box[1], flat[k + 1]);
          box[2] = Math.max(box[2], flat[k]);
          box[3] = Math.max(box[3], flat[k + 1]);
        }
      } else if (polys.length) {
        polys[polys.length - 1].holes.push(flat);
      }
    }
    if (!polys.length) continue;
    const seed = Math.abs(Math.sin(box[0] * 12989.8 + box[1] * 78233.1 + height) * 43758.5453) % 1;
    let color = PALETTE[Math.floor(seed * PALETTE.length) % PALETTE.length];
    if (typeof props.colour === "string" && /^#[0-9a-f]{6}$/i.test(props.colour)) {
      color = tmp.set(props.colour).lerp(PALETTE[0], 0.45).clone();
    }
    out.push({ polys, height, minHeight, color, seed, box });
  }
  return out;
}

export class Buildings {
  readonly group = new Group();
  busy = false;
  onChange: () => void = () => {};

  private chunks = new Map<string, Chunk>();
  private tiles = new Map<string, Promise<Footprint[]>>();
  private template: Promise<string | null> | null = null;
  private building = 0;
  private enabled = true;
  private generation = 0;

  constructor(
    private dem: DemStore,
    private layer: ImageryLayer,
    private uniforms: Record<string, IUniform>,
    private anisotropy: number,
    private exaggeration: number,
  ) {}

  get visibleChunks(): Chunk[] {
    return this.group.visible ? [...this.chunks.values()].filter((c) => c.mesh) : [];
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.onChange();
  }

  setLayer(layer: ImageryLayer): void {
    this.layer = layer;
    for (const c of this.chunks.values()) {
      if (c.state === "ready") void this.loadRoof(c);
    }
  }

  setExaggeration(value: number): void {
    if (value === this.exaggeration) return;
    this.exaggeration = value;
    this.clear();
  }

  private clear(): void {
    this.generation++;
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.onChange();
  }

  update(lat: number, lon: number, range: number): void {
    const show = this.enabled && range < MAX_RANGE && Math.abs(lat) < 84;
    this.group.visible = show;
    this.busy = false;
    if (!show) return;

    const now = performance.now();
    const n = 2 ** CHUNK_Z;
    const size = (EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)) / n;
    const radius = Math.max(1000, Math.min(3200, range * 1.5));
    const reach = Math.min(6, Math.ceil(radius / size));
    const fx = lonToMercX(lon) * n;
    const fy = latToMercY(lat) * n;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const todo: Array<{ x: number; y: number; d: number }> = [];
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const y = cy + dy;
        if (y < 0 || y >= n) continue;
        const x = (((cx + dx) % n) + n) % n;
        const d = Math.hypot(cx + dx + 0.5 - fx, y + 0.5 - fy);
        if (d > reach + 0.5) continue;
        const chunk = this.chunks.get(`${x}/${y}`);
        if (chunk) chunk.lastUsed = now;
        else todo.push({ x, y, d });
      }
    }
    todo.sort((a, b) => a.d - b.d);
    for (const t of todo) {
      if (this.building >= MAX_BUILDS) break;
      void this.buildChunk(t.x, t.y, now);
    }
    this.busy = todo.length > 0 || this.building > 0;

    for (const c of this.chunks.values()) {
      if (c.mesh) {
        const fade = Math.min(1, (now - c.born) / 450);
        c.mesh.material.uniforms.uFade.value = fade;
        c.mesh.material.transparent = fade < 1;
        if (fade < 1) this.busy = true;
      }
      if (this.chunks.size > 180 && now - c.lastUsed > 20000 && c.state !== "loading") {
        this.disposeChunk(c);
        this.chunks.delete(c.key);
      }
    }
  }

  private tileTemplate(): Promise<string | null> {
    this.template ??= fetch(BUILDINGS_TILEJSON)
      .then((r) => r.json())
      .then((j: { tiles?: string[] }) => j.tiles?.[0] ?? null)
      .catch(() => {
        this.template = null;
        return null;
      });
    return this.template;
  }

  private footprints(x: number, y: number): Promise<Footprint[]> {
    const key = `${x}/${y}`;
    let p = this.tiles.get(key);
    if (!p) {
      p = this.tileTemplate()
        .then(async (template) => {
          if (!template) throw new Error("no building tiles");
          const url = template.replace("{z}", String(VT_Z)).replace("{x}", String(x)).replace("{y}", String(y));
          const res = await fetch(url);
          if (res.status === 204 || res.status === 404) return [];
          if (!res.ok) throw new Error(`buildings ${res.status}`);
          return parseFootprints(await res.arrayBuffer());
        })
        .catch(() => {
          this.tiles.delete(key);
          return [];
        });
      this.tiles.set(key, p);
      if (this.tiles.size > 24) this.tiles.delete(this.tiles.keys().next().value!);
    }
    return p;
  }

  private async buildChunk(x: number, y: number, now: number): Promise<void> {
    const chunk: Chunk = {
      key: `${x}/${y}`,
      x,
      y,
      state: "loading",
      mesh: null,
      roof: null,
      wallIndexCount: 0,
      lastUsed: now,
      born: now,
    };
    this.chunks.set(chunk.key, chunk);
    this.building++;
    const gen = this.generation;
    try {
      const vx = Math.floor(x / SPLIT);
      const vy = Math.floor(y / SPLIT);
      const [features, dem] = await Promise.all([this.footprints(vx, vy), this.dem.load(VT_Z, vx, vy)]);
      if (gen !== this.generation) return;
      const mesh = this.extrude(chunk, features, dem);
      if (!mesh) {
        chunk.state = "empty";
        return;
      }
      chunk.mesh = mesh;
      chunk.state = "ready";
      chunk.born = performance.now();
      this.group.add(mesh);
      void this.loadRoof(chunk);
      this.onChange();
    } finally {
      this.building--;
      if (chunk.state === "loading") this.chunks.delete(chunk.key);
    }
  }

  private extrude(chunk: Chunk, features: Footprint[], dem: Int16Array | null): Mesh<BufferGeometry, ShaderMaterial> | null {
    const u0 = (chunk.x % SPLIT) / SPLIT;
    const v0 = (chunk.y % SPLIT) / SPLIT;
    const u1 = u0 + 1 / SPLIT;
    const v1 = v0 + 1 / SPLIT;
    const uc = (u0 + u1) / 2;
    const vc = (v0 + v1) / 2;
    const n = 2 ** CHUNK_Z;
    const lat0 = mercYToLat((chunk.y + 0.5) / n);
    const lon0 = mercXToLon((chunk.x + 0.5) / n);
    const exag = this.exaggeration;
    const groundAt = (u: number, v: number) => (dem ? sampleDem(dem, u * DEM_SIZE, v * DEM_SIZE) : 0);
    const h0 = groundAt(uc, vc) * exag;
    const scale = ((EARTH_CIRCUMFERENCE * Math.cos(lat0 * DEG)) / 2 ** VT_Z) * ((EARTH_RADIUS + h0) / EARTH_RADIUS);

    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const info: number[] = [];
    const walls: number[] = [];
    const roofs: number[] = [];
    let count = 0;
    const vertex = (u: number, v: number, z: number, s: number, t: number, c: Color, shade: number, kind: number, h: number, seed: number) => {
      pos.push((u - uc) * scale, (vc - v) * scale, z);
      uv.push(s, t);
      col.push(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255));
      info.push(shade, kind, h, seed);
      return count++;
    };

    for (const f of features) {
      if (f.box[2] < u0 || f.box[0] > u1 || f.box[3] < v0 || f.box[1] > v1) continue;
      if (f.ground === undefined) {
        let g = Infinity;
        for (const p of f.polys) {
          for (let k = 0; k < p.outer.length; k += 2) g = Math.min(g, groundAt(p.outer[k], p.outer[k + 1]));
        }
        f.ground = g;
      }
      const groundZ = f.ground * exag - h0;
      const roofZ = groundZ + f.height;
      const floating = f.minHeight > 0;
      const baseZ = floating ? groundZ + f.minHeight : groundZ - BURY;
      const baseT = floating ? 0 : -BURY;
      const wallH = floating ? f.height - f.minHeight : f.height;

      for (const poly of f.polys) {
        const outer = clipRing(poly.outer, u0, v0, u1, v1);
        if (!outer.length) continue;
        const rings = [outer];
        for (const hole of poly.holes) {
          const clipped = clipRing(hole, u0, v0, u1, v1);
          if (clipped.length) rings.push(clipped);
        }
        const flat: number[] = [];
        const holeIdx: number[] = [];
        for (let r = 0; r < rings.length; r++) {
          if (r > 0) holeIdx.push(flat.length / 2);
          for (const value of rings[r]) flat.push(value);
        }
        const tris = earcut(flat, holeIdx, 2);
        if (tris.length) {
          const first = count;
          for (let k = 0; k < flat.length; k += 2) {
            vertex(flat[k], flat[k + 1], roofZ, (flat[k] - u0) * SPLIT, (flat[k + 1] - v0) * SPLIT, f.color, 1, 0, f.height, f.seed);
          }
          for (const t of tris) roofs.push(first + t);
        }

        for (const ring of rings) {
          const m = ring.length / 2;
          let run = 0;
          for (let k = 0; k < m; k++) {
            const au = ring[k * 2];
            const av = ring[k * 2 + 1];
            const bu = ring[((k + 1) % m) * 2];
            const bv = ring[((k + 1) % m) * 2 + 1];
            const de = (bu - au) * scale;
            const dn = (av - bv) * scale;
            const len = Math.hypot(de, dn);
            const start = run;
            run += len;
            if (len < 0.01) continue;
            const onEdge =
              (Math.abs(au - bu) < EPS && (Math.abs(au - u0) < EPS || Math.abs(au - u1) < EPS)) ||
              (Math.abs(av - bv) < EPS && (Math.abs(av - v0) < EPS || Math.abs(av - v1) < EPS));
            if (onEdge) continue;
            const lit = (-dn * SUN.e + de * SUN.n) / len;
            const shade = 0.74 + 0.22 * lit;
            const a = vertex(au, av, baseZ, start, baseT, f.color, shade, 1, wallH, f.seed);
            const b = vertex(bu, bv, baseZ, run, baseT, f.color, shade, 1, wallH, f.seed);
            const c = vertex(bu, bv, roofZ, run, wallH, f.color, shade, 1, wallH, f.seed);
            const d = vertex(au, av, roofZ, start, wallH, f.color, shade, 1, wallH, f.seed);
            walls.push(a, b, c, a, c, d);
          }
        }
      }
    }
    if (!count) return null;

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
    geometry.setAttribute("color", new BufferAttribute(new Uint8Array(col), 3, true));
    geometry.setAttribute("info", new BufferAttribute(new Float32Array(info), 4));
    const index = walls.concat(roofs);
    geometry.setIndex(new BufferAttribute(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), 1));
    geometry.computeBoundingSphere();
    chunk.wallIndexCount = walls.length;

    const material = new ShaderMaterial({
      vertexShader: BUILDING_VERT,
      fragmentShader: BUILDING_FRAG,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        ...this.uniforms,
        uRoof: { value: null },
        uHasRoof: { value: 0 },
        uFade: { value: 0 },
      },
    });
    const mesh = new Mesh(geometry, material);
    const origin = toECEF(lat0, lon0, h0, new Vector3());
    const up = origin.clone().normalize();
    const east = new Vector3();
    const north = new Vector3();
    enuFrame(up, east, north);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(new Matrix4().makeBasis(east, north, up).setPosition(origin));
    mesh.matrixWorld.copy(mesh.matrix);
    return mesh;
  }

  private async loadRoof(chunk: Chunk): Promise<void> {
    const layer = this.layer;
    const z = Math.min(ROOF_Z, layer.maxZoom);
    const canvas = new OffscreenCanvas(512, 512);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#77736c";
    ctx.fillRect(0, 0, 512, 512);
    try {
      if (z >= CHUNK_Z) {
        const k = 2 ** (z - CHUNK_Z);
        const size = 512 / k;
        const jobs: Promise<void>[] = [];
        for (let j = 0; j < k; j++) {
          for (let i = 0; i < k; i++) {
            jobs.push(
              fetchBitmap(layer.url(z, chunk.x * k + i, chunk.y * k + j)).then((bmp) => {
                ctx.drawImage(bmp, i * size, j * size, size, size);
                bmp.close();
              }),
            );
          }
        }
        const results = await Promise.allSettled(jobs);
        if (results.every((r) => r.status === "rejected")) return;
      } else {
        const k = 2 ** (CHUNK_Z - z);
        const bmp = await fetchBitmap(layer.url(z, Math.floor(chunk.x / k), Math.floor(chunk.y / k)));
        const s = 256 / k;
        ctx.drawImage(bmp, (chunk.x % k) * s, (chunk.y % k) * s, s, s, 0, 0, 512, 512);
        bmp.close();
      }
    } catch {
      return;
    }
    if (!chunk.mesh || layer !== this.layer) return;
    if (chunk.roof) disposeTexture(chunk.roof);
    chunk.roof = imageTexture(canvas, this.anisotropy);
    chunk.mesh.material.uniforms.uRoof.value = chunk.roof;
    chunk.mesh.material.uniforms.uHasRoof.value = 1;
    this.onChange();
  }

  private disposeChunk(chunk: Chunk): void {
    if (chunk.mesh) {
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh.material.dispose();
      chunk.mesh = null;
    }
    if (chunk.roof) disposeTexture(chunk.roof);
    chunk.roof = null;
  }
}
