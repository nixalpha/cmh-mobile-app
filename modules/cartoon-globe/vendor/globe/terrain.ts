import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Frustum,
  Group,
  type IUniform,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Sphere,
  Texture,
  Vector3,
  Vector4,
} from "three";
import { DemStore, DEM_SIZE, sampleDem } from "./dem";
import { DEG, EARTH_CIRCUMFERENCE, EARTH_RADIUS, fromECEF, mercYToLat, toECEF, wrapLon } from "./geo";
import { disposeTexture, fetchBitmap, imageTexture } from "./imagery";
import { TERRAIN_FRAG, TERRAIN_VERT } from "./shaders";
import { DEM_MAX_ZOOM, type ImageryLayer, LABELS_OVERLAY } from "./sources";

export const SEG = 64;
const N = SEG + 1;
const G = SEG + 3;
const VERTS = N * N + 4 * N;
const DEM_LEVEL_OFFSET = Math.log2(DEM_SIZE / SEG);
const ROOT_Z = 2;
const MAX_Z = 19;
const SSE_THRESHOLD = 1.7;
const MAX_INFLIGHT = 18;
const KEEP_FRAMES = 200;
const MAX_ELEVATION = 9000;

const LIGHT = new Vector3(-0.5, 0.5, 0.75).normalize();

function buildIndex(step: number): BufferAttribute {
  const idx: number[] = [];
  for (let j = 0; j < SEG; j += step) {
    for (let i = 0; i < SEG; i += step) {
      const a = j * N + i;
      const c = a + step * N;
      idx.push(a, c, a + step, a + step, c, c + step);
    }
  }
  const base = N * N;
  const edge = (g: (k: number) => number, s: number) => {
    for (let k = 0; k < SEG; k += step) idx.push(g(k), s + k, g(k + step), g(k + step), s + k, s + k + step);
  };
  edge((k) => k, base);
  edge((k) => SEG * N + k, base + N);
  edge((k) => k * N, base + 2 * N);
  edge((k) => k * N + SEG, base + 3 * N);
  return new BufferAttribute(new Uint16Array(idx), 1);
}

function buildUv(): Float32Array {
  const uv = new Float32Array(VERTS * 2);
  let o = 0;
  const put = (i: number, j: number) => {
    uv[o++] = i / SEG;
    uv[o++] = j / SEG;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) put(i, j);
  for (let k = 0; k < N; k++) put(k, 0);
  for (let k = 0; k < N; k++) put(k, SEG);
  for (let k = 0; k < N; k++) put(0, k);
  for (let k = 0; k < N; k++) put(SEG, k);
  return uv;
}

const SHARED_INDEX = [1, 2, 4, 8].map(buildIndex);
const SHARED_UV = new BufferAttribute(buildUv(), 2);

type LoadState = "idle" | "loading" | "ready";

function disposeGeometry(geometry: BufferGeometry): void {
  geometry.deleteAttribute("uv");
  geometry.setIndex(null);
  geometry.dispose();
}

export class Tile {
  readonly key: string;
  readonly lonW: number;
  readonly lonE: number;
  readonly latN: number;
  readonly latS: number;
  readonly centerLat: number;
  readonly centerLon: number;
  readonly center = new Vector3();
  readonly centerDir = new Vector3();
  readonly angRadius: number;
  readonly flatRadius: number;
  readonly bound = new Sphere();
  children: Tile[] | null = null;
  state: LoadState = "idle";
  mesh: Mesh<BufferGeometry, ShaderMaterial> | null = null;
  texture: Texture | null = null;
  ownsTexture = false;
  uv = new Vector4(0, 0, 1, 1);
  overlay: Texture | null = null;
  ownsOverlay = false;
  overlayState: LoadState = "idle";
  ov = new Vector4(0, 0, 1, 1);
  dem: Int16Array | null = null;
  demZ = 0;
  demX = 0;
  demY = 0;
  maxH = 0;
  noImagery = false;
  deferred = false;
  lastUsed = 0;
  priority = 0;
  sse = 0;
  abort: AbortController | null = null;

  constructor(
    readonly z: number,
    readonly x: number,
    readonly y: number,
    readonly parent: Tile | null,
  ) {
    this.key = `${z}/${x}/${y}`;
    const n = 2 ** z;
    this.lonW = (x / n) * 360 - 180;
    this.lonE = ((x + 1) / n) * 360 - 180;
    this.latN = y === 0 ? 90 : mercYToLat(y / n);
    this.latS = y === n - 1 ? -90 : mercYToLat((y + 1) / n);
    this.centerLat = mercYToLat((y + 0.5) / n);
    this.centerLon = (this.lonW + this.lonE) / 2;
    toECEF(this.centerLat, this.centerLon, 0, this.center);
    this.centerDir.copy(this.center).normalize();
    const p = new Vector3();
    let maxD = 0;
    let minDot = 1;
    for (const lat of [this.latN, this.centerLat, this.latS]) {
      for (const lon of [this.lonW, this.centerLon, this.lonE]) {
        toECEF(lat, lon, 0, p);
        maxD = Math.max(maxD, p.distanceTo(this.center));
        minDot = Math.min(minDot, p.normalize().dot(this.centerDir));
      }
    }
    this.flatRadius = maxD;
    this.angRadius = Math.acos(Math.max(-1, Math.min(1, minDot)));
    this.bound.set(this.center, maxD + MAX_ELEVATION);
  }
}

export interface TerrainUniforms {
  uCamPos: IUniform<Vector3>;
  uAtmo: IUniform<Vector4>;
  uShade: IUniform<number>;
}

export class Terrain {
  readonly group = new Group();
  renderList: Tile[] = [];
  busy = false;
  exaggeration = 1;
  onChange: () => void = () => {};

  private roots: Tile[] = [];
  private stale: { roots: Tile[]; list: Tile[] } | null = null;
  private generation = 0;
  private frame = 0;
  private inflight = 0;
  private wanted: Tile[] = [];
  private overlayOn = false;
  private fallback: Texture;
  private heights = new Float32Array(G * G);
  private frustum = new Frustum();
  private camPos = new Vector3();
  private camDir = new Vector3();
  private camDist = 0;
  private camLat = 0;
  private camLon = 0;
  private sseScale = 1;
  private sseThreshold = SSE_THRESHOLD;
  private tmp = new Vector3();

  constructor(
    private dem: DemStore,
    private layer: ImageryLayer,
    private uniforms: TerrainUniforms,
    private anisotropy: number,
  ) {
    this.fallback = new DataTexture(new Uint8Array([40, 60, 80, 255]), 1, 1);
    this.fallback.needsUpdate = true;
    this.roots = this.makeRoots();
  }

  private makeRoots(): Tile[] {
    const roots: Tile[] = [];
    const n = 2 ** ROOT_Z;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) roots.push(new Tile(ROOT_Z, x, y, null));
    return roots;
  }

  dispose(): void {
    this.generation++;
    for (const root of this.roots) this.disposeTree(root);
    if (this.stale) for (const root of this.stale.roots) this.disposeTree(root);
    this.roots = [];
    this.stale = null;
    this.renderList = [];
    this.fallback.dispose();
    this.group.clear();
  }

  setLayer(layer: ImageryLayer): void {
    if (layer.id === this.layer.id) return;
    this.layer = layer;
    this.generation++;
    if (this.stale) {
      for (const t of this.roots) this.disposeTree(t);
    } else if (this.roots.every((t) => t.state === "ready")) {
      this.stale = { roots: this.roots, list: this.renderList };
      for (const t of this.roots) this.abortTree(t);
    } else {
      for (const t of this.roots) this.disposeTree(t);
      this.renderList = [];
    }
    this.roots = this.makeRoots();
    this.onChange();
  }

  setOverlay(on: boolean): void {
    if (on === this.overlayOn) return;
    this.overlayOn = on;
    const walk = (t: Tile) => {
      if (!on) {
        if (t.overlay && t.ownsOverlay) disposeTexture(t.overlay);
        t.overlay = null;
        t.ownsOverlay = false;
        if (t.mesh) t.mesh.material.uniforms.uHasOverlay.value = 0;
      }
      t.overlayState = "idle";
      t.children?.forEach(walk);
    };
    this.roots.forEach(walk);
    this.onChange();
  }

  setExaggeration(value: number): void {
    if (value === this.exaggeration) return;
    this.exaggeration = value;
    const walk = (t: Tile) => {
      if (t.mesh) {
        disposeGeometry(t.mesh.geometry);
        t.mesh.geometry = this.buildGeometry(t);
      }
      t.children?.forEach(walk);
    };
    this.roots.forEach(walk);
    this.stale?.roots.forEach(walk);
    this.onChange();
  }

  update(camera: PerspectiveCamera, viewportHeight: number, sseThreshold = SSE_THRESHOLD): void {
    this.sseThreshold = sseThreshold;
    this.frame++;
    this.camPos.copy(camera.position);
    this.camDist = this.camPos.length();
    this.camDir.copy(this.camPos).divideScalar(this.camDist);
    const ll = fromECEF(this.camPos);
    this.camLat = ll.lat;
    this.camLon = ll.lon;
    this.sseScale = viewportHeight / (2 * Math.tan((camera.fov * DEG) / 2));
    this.frustum.setFromProjectionMatrix(camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse));

    for (const t of this.renderList) if (t.mesh) t.mesh.visible = false;
    this.renderList = [];
    this.wanted.length = 0;
    for (const root of this.roots) this.visit(root, true);

    if (this.stale) {
      if (this.roots.every((t) => t.state === "ready")) {
        for (const t of this.stale.roots) this.disposeTree(t);
        this.stale = null;
      } else {
        this.renderList = this.stale.list;
      }
    }
    for (const t of this.renderList) t.mesh!.visible = true;

    this.wanted.sort((a, b) => b.priority - a.priority);
    for (const t of this.wanted) {
      if (this.inflight >= MAX_INFLIGHT) break;
      void this.loadTile(t);
    }
    if (this.overlayOn && !this.stale) {
      for (const t of this.renderList) {
        if (this.inflight >= MAX_INFLIGHT) break;
        if (t.overlayState === "idle") void this.loadOverlay(t);
      }
    }
    if (this.frame % 30 === 0) for (const root of this.roots) this.prune(root);
    this.busy = this.inflight > 0 || this.wanted.length > 0 || this.stale !== null;
  }

  private visit(tile: Tile, render: boolean): void {
    tile.lastUsed = this.frame;
    const ready = tile.state === "ready";
    if (tile.state === "idle" && this.canLoad(tile)) {
      tile.priority = tile.parent ? tile.parent.sse : 1e9;
      this.wanted.push(tile);
    }
    if (!this.isVisible(tile)) return;
    tile.sse = this.screenError(tile);
    const demMaxed = tile.z - DEM_LEVEL_OFFSET >= DEM_MAX_ZOOM;
    if (tile.sse <= this.sseThreshold || tile.z >= MAX_Z || (tile.noImagery && demMaxed)) {
      if (render && ready) this.renderList.push(tile);
      return;
    }
    if (!tile.children) {
      const { z, x, y } = tile;
      tile.children = [
        new Tile(z + 1, x * 2, y * 2, tile),
        new Tile(z + 1, x * 2 + 1, y * 2, tile),
        new Tile(z + 1, x * 2, y * 2 + 1, tile),
        new Tile(z + 1, x * 2 + 1, y * 2 + 1, tile),
      ];
    }
    const descend = render && ready && tile.children.every((c) => c.state === "ready");
    if (render && ready && !descend) this.renderList.push(tile);
    for (const c of tile.children) this.visit(c, descend);
  }

  private canLoad(tile: Tile): boolean {
    if (!tile.parent || tile.parent.state === "ready") return true;
    return tile.z <= this.layer.maxZoom && !tile.deferred;
  }

  private isVisible(tile: Tile): boolean {
    const horizon = Math.acos(Math.min(1, EARTH_RADIUS / this.camDist));
    const maxH = tile.state === "ready" ? tile.maxH : MAX_ELEVATION * this.exaggeration;
    const lift = Math.acos(EARTH_RADIUS / (EARTH_RADIUS + maxH + 1));
    const angle = Math.acos(Math.max(-1, Math.min(1, this.camDir.dot(tile.centerDir))));
    if (angle - tile.angRadius > horizon + lift) return false;
    return this.frustum.intersectsSphere(tile.bound);
  }

  private screenError(tile: Tile): number {
    const lat = Math.max(tile.latS, Math.min(tile.latN, this.camLat));
    const half = (tile.lonE - tile.lonW) / 2;
    const dLon = Math.max(-half, Math.min(half, wrapLon(this.camLon - tile.centerLon)));
    const lon = tile.centerLon + dLon;
    const h = (this.dem.sample(lat, lon) ?? 0) * this.exaggeration;
    const dist = Math.max(1, toECEF(lat, lon, h, this.tmp).distanceTo(this.camPos));
    const texel = (EARTH_CIRCUMFERENCE * Math.cos(Math.min(85, Math.abs(lat)) * DEG)) / 2 ** tile.z / 256;
    return (texel / dist) * this.sseScale;
  }

  private async loadTile(tile: Tile): Promise<void> {
    const gen = this.generation;
    const layer = this.layer;
    tile.state = "loading";
    tile.abort = new AbortController();
    this.inflight++;
    const { z, x, y } = tile;
    const dz = Math.max(0, Math.min(DEM_MAX_ZOOM, z - DEM_LEVEL_OFFSET));
    const shift = z - dz;
    tile.demZ = dz;
    tile.demX = shift >= 0 ? x >> shift : x;
    tile.demY = shift >= 0 ? y >> shift : y;
    const inherit = z > layer.maxZoom || (tile.parent?.noImagery ?? false);
    const signal = tile.abort.signal;
    try {
      const [dem, bitmap] = await Promise.all([
        this.dem.load(tile.demZ, tile.demX, tile.demY),
        inherit ? null : (layer.load?.(z, x, y, signal) ?? fetchBitmap(layer.url(z, x, y), signal)).catch(() => null),
      ]);
      if (signal.aborted || gen !== this.generation) {
        bitmap?.close();
        if (gen === this.generation) tile.state = "idle";
        return;
      }
      if (!bitmap && tile.parent && tile.parent.state !== "ready") {
        tile.deferred = true;
        tile.state = "idle";
        return;
      }
      tile.dem = dem;
      if (bitmap) {
        tile.texture = imageTexture(bitmap, this.anisotropy);
        tile.ownsTexture = true;
      } else {
        tile.noImagery = true;
        this.inheritTexture(tile);
      }
      if (this.overlayOn && tile.parent?.overlay) this.inheritOverlay(tile);
      const material = new ShaderMaterial({
        vertexShader: TERRAIN_VERT,
        fragmentShader: TERRAIN_FRAG,
        side: DoubleSide,
        uniforms: {
          ...this.uniforms,
          uMap: { value: tile.texture },
          uOverlay: { value: tile.overlay },
          uHasOverlay: { value: tile.overlay ? 1 : 0 },
          uUv: { value: tile.uv },
          uOv: { value: tile.ov },
        },
      });
      const mesh = new Mesh(this.buildGeometry(tile), material);
      mesh.position.copy(tile.center);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.updateMatrixWorld(true);
      mesh.matrixAutoUpdate = false;
      tile.mesh = mesh;
      this.group.add(mesh);
      tile.state = "ready";
      this.onChange();
    } finally {
      this.inflight--;
      tile.abort = null;
      this.onChange();
    }
  }

  private inheritTexture(tile: Tile): void {
    const p = tile.parent;
    if (!p || !p.texture) {
      tile.texture = this.fallback;
      return;
    }
    tile.texture = p.texture;
    tile.ownsTexture = false;
    const sx = p.uv.z / 2;
    const sy = p.uv.w / 2;
    tile.uv.set(p.uv.x + (tile.x & 1) * sx, p.uv.y + (tile.y & 1) * sy, sx, sy);
  }

  private inheritOverlay(tile: Tile): void {
    const p = tile.parent!;
    tile.overlay = p.overlay;
    tile.ownsOverlay = false;
    const sx = p.ov.z / 2;
    const sy = p.ov.w / 2;
    tile.ov.set(p.ov.x + (tile.x & 1) * sx, p.ov.y + (tile.y & 1) * sy, sx, sy);
  }

  private async loadOverlay(tile: Tile): Promise<void> {
    tile.overlayState = "loading";
    if (tile.z > LABELS_OVERLAY.maxZoom) {
      tile.overlayState = "ready";
      return;
    }
    const gen = this.generation;
    this.inflight++;
    try {
      const bitmap = await fetchBitmap(LABELS_OVERLAY.url(tile.z, tile.x, tile.y), undefined, true).catch(() => null);
      if (!bitmap) return;
      if (gen !== this.generation || !this.overlayOn || !tile.mesh || tile.overlayState !== "loading") {
        bitmap.close();
        return;
      }
      if (tile.overlay && tile.ownsOverlay) disposeTexture(tile.overlay);
      tile.overlay = imageTexture(bitmap, this.anisotropy);
      tile.ownsOverlay = true;
      tile.ov.set(0, 0, 1, 1);
      tile.mesh.material.uniforms.uOverlay.value = tile.overlay;
      tile.mesh.material.uniforms.uHasOverlay.value = 1;
      this.onChange();
    } finally {
      if (tile.overlayState === "loading") tile.overlayState = "ready";
      this.inflight--;
    }
  }

  private buildGeometry(tile: Tile): BufferGeometry {
    const { z, x, y, center } = tile;
    const tiles = 2 ** z;
    const hs = this.heights;
    if (tile.dem) {
      const scale = 2 ** (tile.demZ - z) * DEM_SIZE;
      const ox = x * scale - tile.demX * DEM_SIZE;
      const oy = y * scale - tile.demY * DEM_SIZE;
      const step = scale / SEG;
      for (let j = 0; j < G; j++) {
        for (let i = 0; i < G; i++) {
          hs[j * G + i] = sampleDem(tile.dem, ox + (i - 1) * step, oy + (j - 1) * step) * this.exaggeration;
        }
      }
    } else {
      hs.fill(0);
    }

    const sinLon = new Float64Array(N);
    const cosLon = new Float64Array(N);
    const sinLat = new Float64Array(N);
    const cosLat = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const lon = (tile.lonW + ((tile.lonE - tile.lonW) * i) / SEG) * DEG;
      sinLon[i] = Math.sin(lon);
      cosLon[i] = Math.cos(lon);
    }
    for (let j = 0; j < N; j++) {
      let lat = mercYToLat((y + j / SEG) / tiles) * DEG;
      if (y === 0 && j === 0) lat = Math.PI / 2;
      if (y === tiles - 1 && j === SEG) lat = -Math.PI / 2;
      sinLat[j] = Math.sin(lat);
      cosLat[j] = Math.cos(lat);
    }

    const pos = new Float32Array(VERTS * 3);
    const shade = new Float32Array(VERTS);
    const skirt = Math.max(40, (EARTH_CIRCUMFERENCE * Math.cos(tile.centerLat * DEG) * 0.04) / tiles);
    let maxH = 0;
    const put = (o: number, i: number, j: number, drop: number, s: number) => {
      const r = EARTH_RADIUS + hs[(j + 1) * G + i + 1] - drop;
      pos[o * 3] = r * cosLat[j] * sinLon[i] - center.x;
      pos[o * 3 + 1] = r * sinLat[j] - center.y;
      pos[o * 3 + 2] = r * cosLat[j] * cosLon[i] - center.z;
      shade[o] = s;
    };
    for (let j = 0; j < N; j++) {
      const cell = Math.max(1e-3, (EARTH_CIRCUMFERENCE * cosLat[j]) / tiles / SEG);
      for (let i = 0; i < N; i++) {
        const row = (j + 1) * G + i + 1;
        const h = hs[row];
        if (h > maxH) maxH = h;
        const dx = (hs[row + 1] - hs[row - 1]) / (2 * cell);
        const dn = (hs[row - G] - hs[row + G]) / (2 * cell);
        const lit = (-dx * LIGHT.x - dn * LIGHT.y + LIGHT.z) / Math.sqrt(dx * dx + dn * dn + 1);
        put(j * N + i, i, j, 0, Math.max(0.2, Math.min(1.7, lit / LIGHT.z)));
      }
    }
    const base = N * N;
    for (let k = 0; k < N; k++) {
      put(base + k, k, 0, skirt, shade[k]);
      put(base + N + k, k, SEG, skirt, shade[SEG * N + k]);
      put(base + 2 * N + k, 0, k, skirt, shade[k * N]);
      put(base + 3 * N + k, SEG, k, skirt, shade[k * N + SEG]);
    }

    const geometry = new BufferGeometry();
    const oversampled = Math.max(0, z - DEM_LEVEL_OFFSET - DEM_MAX_ZOOM);
    geometry.setIndex(SHARED_INDEX[Math.min(SHARED_INDEX.length - 1, oversampled)]);
    geometry.setAttribute("position", new BufferAttribute(pos, 3));
    geometry.setAttribute("uv", SHARED_UV);
    geometry.setAttribute("shade", new BufferAttribute(shade, 1));
    geometry.computeBoundingSphere();
    tile.maxH = maxH;
    tile.bound.copy(geometry.boundingSphere!);
    tile.bound.center.add(center);
    return geometry;
  }

  private prune(tile: Tile): void {
    if (!tile.children) return;
    let stale = true;
    for (const c of tile.children) {
      this.prune(c);
      if (c.children || c.lastUsed > this.frame - KEEP_FRAMES) stale = false;
    }
    if (stale) {
      for (const c of tile.children) this.disposeTree(c);
      tile.children = null;
    } else {
      for (const c of tile.children) {
        if (c.state === "loading" && c.lastUsed < this.frame - 45) c.abort?.abort();
      }
    }
  }

  private abortTree(tile: Tile): void {
    tile.abort?.abort();
    tile.children?.forEach((c) => this.abortTree(c));
  }

  private disposeTree(tile: Tile): void {
    tile.children?.forEach((c) => this.disposeTree(c));
    tile.children = null;
    tile.abort?.abort();
    if (tile.mesh) {
      this.group.remove(tile.mesh);
      disposeGeometry(tile.mesh.geometry);
      tile.mesh.material.dispose();
      tile.mesh = null;
    }
    if (tile.texture && tile.ownsTexture) disposeTexture(tile.texture);
    if (tile.overlay && tile.ownsOverlay) disposeTexture(tile.overlay);
    tile.texture = null;
    tile.overlay = null;
    tile.state = "idle";
  }
}
