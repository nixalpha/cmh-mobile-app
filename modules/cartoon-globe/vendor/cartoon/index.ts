import { type IUniform, type Mesh, type PerspectiveCamera, Vector3, type WebGLRenderer } from "three";
import type { ViewState } from "../globe/controls";
import type { DemStore } from "../globe/dem";
import type { ImageryLayer } from "../globe/sources";
import { City, CITY_MAX_RANGE } from "./city";
import { cityMeshes } from "./export";
import { CartoonWorker } from "./client";
import { cartoonLayer } from "./layer";
import { SunShadow } from "./light";
import { CartoonPass } from "./pass";

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const CITY_SHADE = 0.22;

export interface CartoonStats {
  triangles: number;
  calls: number;
  cityTriangles: number;
  cityCalls: number;
  cpuMs: number;
  chunks: number;
  textures: number;
  geometries: number;
  worker: CartoonWorker["stats"];
}

export class Cartoon {
  readonly city: City;
  stats: CartoonStats | null = null;

  private worker = new CartoonWorker();
  private shadow = new SunShadow();
  private pass: CartoonPass;
  private layers = new Map<string, ImageryLayer>();
  private uniforms: Record<string, IUniform>;
  private shade: IUniform<number>;
  private sunView = new Vector3();
  private upView = new Vector3();
  private range = Infinity;
  private updateMs = 0;

  constructor(dem: DemStore, shared: Record<string, IUniform>) {
    this.pass = new CartoonPass(this.shadow.target.depthTexture!, 2);
    this.uniforms = { uCamPos: shared.uCamPos, uAtmo: shared.uAtmo, uSunView: { value: this.sunView } };
    this.shade = shared.uShade;
    this.city = new City(dem, this.worker, this.uniforms);
  }

  get busy(): boolean {
    return this.city.busy;
  }

  set onChange(fn: () => void) {
    this.city.onChange = fn;
  }

  layer(base: ImageryLayer): ImageryLayer {
    let layer = this.layers.get(base.id);
    if (!layer) this.layers.set(base.id, (layer = cartoonLayer(base, this.worker)));
    return layer;
  }

  update(view: ViewState, target: Vector3, camera: PerspectiveCamera, buildings: boolean, exaggeration: number, farShade: number): void {
    const t0 = performance.now();
    this.range = view.range;
    this.shade.value = CITY_SHADE + (farShade - CITY_SHADE) * smoothstep(CITY_MAX_RANGE, 1.5e5, view.range);
    this.city.setExaggeration(exaggeration);
    this.city.update(view.lat, view.lon, view.range, camera.position, buildings, true);
    this.shadow.frame(target, view.range, view.lat < 0);
    this.updateMs = performance.now() - t0;
  }

  render(renderer: WebGLRenderer, camera: PerspectiveCamera, draw: () => void): void {
    const t0 = performance.now();
    const info = renderer.info;
    info.autoReset = false;
    info.reset();
    const city = this.city.scene.visible ? 1 - smoothstep(CITY_MAX_RANGE * 0.6, CITY_MAX_RANGE, this.range) : 0;
    const paint = smoothstep(3e4, 1.5e5, this.range);
    this.sunView.copy(this.shadow.sun).transformDirection(camera.matrixWorldInverse);
    this.upView.copy(this.shadow.up).transformDirection(camera.matrixWorldInverse);
    if (city > 0) this.shadow.render(renderer, this.city.scene, this.city.version, camera);
    this.pass.begin(renderer);
    draw();
    const before = { triangles: info.render.triangles, calls: info.render.calls };
    if (city > 0) renderer.render(this.city.scene, camera);
    const cityTriangles = info.render.triangles - before.triangles;
    const cityCalls = info.render.calls - before.calls;
    this.pass.end(renderer, camera, paint, city, this.shadow.fromView, this.shadow.texel, this.sunView, this.upView);
    this.stats = {
      triangles: info.render.triangles,
      calls: info.render.calls,
      cityTriangles,
      cityCalls,
      cpuMs: this.updateMs + performance.now() - t0,
      chunks: this.city.readyChunks.length,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      worker: this.worker.stats,
    };
    info.autoReset = true;
    if (import.meta.env.DEV) (globalThis as { __cartoonStats?: CartoonStats }).__cartoonStats = this.stats;
  }

  exportMeshes(origin: Vector3, radius: number): Mesh[] {
    return this.city.scene.visible ? cityMeshes(this.city.readyChunks, (kind) => this.city.treeModel(kind), origin, radius) : [];
  }

  dispose(): void {
    this.city.dispose();
    this.shadow.dispose();
    this.pass.dispose();
    this.worker.dispose();
  }
}
