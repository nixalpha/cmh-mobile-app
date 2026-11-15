import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  InstancedMesh,
  type IUniform,
  Matrix4,
  Mesh,
  Scene,
  ShaderMaterial,
  Vector3,
} from "three";
import type { DemStore } from "../globe/dem";
import { DEG, EARTH_CIRCUMFERENCE, enuFrame, latToMercY, lonToMercX, toECEF } from "../globe/geo";
import { CHUNK_Z, type ChunkData } from "./chunk";
import type { CartoonWorker } from "./client";
import { CHUNK_SPLIT } from "./model";
import { TREE_CONIFER } from "./scatter";
import { BUILDING_FRAG, BUILDING_VERT, TREE_FRAG, TREE_VERT } from "./shaders";
import { treeModels } from "./trees";
import { VT_MAX_ZOOM } from "./vt";

export const CITY_MAX_RANGE = 12000;
const MAX_BUILDS = 2;
const DETAIL_DISTANCE = 1100;
const TREE_LOD = [420, 1300];
const FAR_TREE_SHARE = 0.6;

export interface CityChunk {
  key: string;
  x: number;
  y: number;
  state: "loading" | "ready" | "empty";
  buildings: Mesh<BufferGeometry, ShaderMaterial> | null;
  coreCount: number;
  trees: InstancedMesh<BufferGeometry, ShaderMaterial>[];
  treeKinds: number[];
  center: Vector3;
  lastUsed: number;
}

export class City {
  readonly scene = new Scene();
  busy = false;
  version = 0;
  onChange: () => void = () => {};

  private chunks = new Map<string, CityChunk>();
  private building = 0;
  private generation = 0;
  private exaggeration = 1;
  private models = treeModels();
  private buildingMaterial: ShaderMaterial;
  private treeMaterial: ShaderMaterial;

  constructor(
    private dem: DemStore,
    private worker: CartoonWorker,
    uniforms: Record<string, IUniform>,
  ) {
    this.buildingMaterial = new ShaderMaterial({ vertexShader: BUILDING_VERT, fragmentShader: BUILDING_FRAG, side: DoubleSide, uniforms });
    this.treeMaterial = new ShaderMaterial({ vertexShader: TREE_VERT, fragmentShader: TREE_FRAG, uniforms });
    this.scene.matrixWorldAutoUpdate = false;
  }

  get readyChunks(): CityChunk[] {
    return [...this.chunks.values()].filter((c) => c.state === "ready");
  }

  treeModel(kind: number): BufferGeometry {
    return (kind === TREE_CONIFER ? this.models.conifer : this.models.round)[1];
  }

  setExaggeration(value: number): void {
    if (value === this.exaggeration) return;
    this.exaggeration = value;
    this.clear();
  }

  prefetch(lat: number, lon: number): void {
    if (Math.abs(lat) >= 84) return;
    const n = 2 ** CHUNK_Z;
    const fx = lonToMercX(lon) * n;
    const fy = latToMercY(lat) * n;
    const nearby: Array<{ x: number; y: number; distance: number }> = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = ((Math.floor(fx) + dx) % n + n) % n;
      const y = Math.floor(fy) + dy;
      if (y < 0 || y >= n || this.chunks.has(`${x}/${y}`)) continue;
      nearby.push({ x, y, distance: Math.hypot(dx + 0.5 - (fx % 1), dy + 0.5 - (fy % 1)) });
    }
    nearby.sort((a, b) => a.distance - b.distance);
    for (const chunk of nearby) {
      if (this.building >= MAX_BUILDS) break;
      void this.buildChunk(chunk.x, chunk.y, performance.now());
    }
  }

  clear(): void {
    this.generation++;
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.version++;
    this.onChange();
  }

  update(lat: number, lon: number, range: number, camera: Vector3, showBuildings: boolean, showTrees: boolean): void {
    const show = range < CITY_MAX_RANGE && Math.abs(lat) < 84;
    this.scene.visible = show;
    this.busy = false;
    if (!show) return;

    const now = performance.now();
    const n = 2 ** CHUNK_Z;
    const size = (EARTH_CIRCUMFERENCE * Math.cos(lat * DEG)) / n;
    const radius = Math.max(1200, Math.min(3200, range * 1.5));
    const reach = Math.min(7, Math.ceil(radius / size));
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
      if (this.chunks.size > 200 && now - c.lastUsed > 20000 && c.state !== "loading") {
        this.disposeChunk(c);
        this.chunks.delete(c.key);
        this.version++;
        continue;
      }
      if (c.state !== "ready") continue;
      const d = c.center.distanceTo(camera);
      if (c.buildings) {
        c.buildings.visible = showBuildings;
        const count = d < DETAIL_DISTANCE ? Infinity : c.coreCount;
        if (c.buildings.geometry.drawRange.count !== count) {
          c.buildings.geometry.setDrawRange(0, count);
          this.version++;
        }
      }
      const level = d < TREE_LOD[0] ? 0 : d < TREE_LOD[1] ? 1 : 2;
      c.trees.forEach((mesh, i) => {
        mesh.visible = showTrees;
        const model = (c.treeKinds[i] === TREE_CONIFER ? this.models.conifer : this.models.round)[level];
        if (mesh.geometry !== model) {
          mesh.geometry = model;
          mesh.count = level === 2 ? Math.ceil(mesh.instanceMatrix.count * FAR_TREE_SHARE) : mesh.instanceMatrix.count;
          this.version++;
        }
      });
    }
  }

  private async buildChunk(x: number, y: number, now: number): Promise<void> {
    const chunk: CityChunk = { key: `${x}/${y}`, x, y, state: "loading", buildings: null, coreCount: 0, trees: [], treeKinds: [], center: new Vector3(), lastUsed: now };
    this.chunks.set(chunk.key, chunk);
    this.building++;
    const gen = this.generation;
    try {
      const split = Math.log2(CHUNK_SPLIT);
      const dem = await this.dem.load(VT_MAX_ZOOM, x >> split, y >> split);
      const data = await this.worker.chunk(x, y, dem, this.exaggeration, split).catch(() => null);
      if (gen !== this.generation || !data) return;
      this.assemble(chunk, data);
      chunk.state = chunk.buildings || chunk.trees.length ? "ready" : "empty";
      this.version++;
      this.onChange();
    } finally {
      this.building--;
      if (chunk.state === "loading") this.chunks.delete(chunk.key);
      this.onChange();
    }
  }

  private assemble(chunk: CityChunk, data: ChunkData): void {
    const origin = toECEF(data.lat, data.lon, data.height, chunk.center);
    const up = origin.clone().normalize();
    const east = new Vector3();
    const north = new Vector3();
    enuFrame(up, east, north);
    const matrix = new Matrix4().makeBasis(east, north, up).setPosition(origin);
    const place = <T extends Mesh>(mesh: T): T => {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
      mesh.matrixWorld.copy(matrix);
      this.scene.add(mesh);
      return mesh;
    };
    if (data.buildings) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(data.buildings.position, 3));
      geometry.setAttribute("normal4", new BufferAttribute(data.buildings.normal, 4, true));
      geometry.setAttribute("color", new BufferAttribute(data.buildings.color, 4, true));
      geometry.setAttribute("wall", new BufferAttribute(data.buildings.wall, 4));
      geometry.setIndex(new BufferAttribute(data.buildings.index, 1));
      geometry.setDrawRange(0, data.buildings.coreCount);
      geometry.computeBoundingSphere();
      chunk.buildings = place(new Mesh(geometry, this.buildingMaterial));
      chunk.coreCount = data.buildings.coreCount;
    }
    for (const { kind, matrices } of data.trees) {
      const count = matrices.length / 16;
      const mesh = new InstancedMesh(this.models[kind === TREE_CONIFER ? "conifer" : "round"][2], this.treeMaterial, count);
      (mesh.instanceMatrix.array as Float32Array).set(matrices);
      mesh.computeBoundingSphere();
      mesh.count = Math.ceil(count * FAR_TREE_SHARE);
      chunk.trees.push(place(mesh));
      chunk.treeKinds.push(kind);
    }
  }

  private disposeChunk(chunk: CityChunk): void {
    if (chunk.buildings) {
      this.scene.remove(chunk.buildings);
      chunk.buildings.geometry.dispose();
      chunk.buildings = null;
    }
    for (const mesh of chunk.trees) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    chunk.trees = [];
  }

  dispose(): void {
    this.clear();
    this.buildingMaterial.dispose();
    this.treeMaterial.dispose();
    for (const g of [...this.models.round, ...this.models.conifer]) g.dispose();
  }
}
