import {
  ColorManagement,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  Points,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { Cartoon } from "../cartoon";
import { CITY_MAX_RANGE } from "../cartoon/city";
import { Buildings } from "./buildings";
import { Controls, type ViewState } from "./controls";
import { DemStore } from "./dem";
import { EARTH_RADIUS, fromECEF, toECEF } from "./geo";
import { Sky } from "./sky";
import { layerById } from "./sources";
import { Terrain } from "./terrain";

ColorManagement.enabled = false;

export interface GlobeOptions {
  layer: string;
  labels: boolean;
  buildings: boolean;
  atmosphere: boolean;
  cartoon: boolean;
  photoreal: boolean;
  exaggeration: number;
}

export interface Hud {
  view: ViewState;
  elevation: number;
  altitude: number;
  loading: boolean;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Globe {
  readonly controls: Controls;
  onHud: (hud: Hud) => void = () => {};
  onFrame: () => void = () => {};

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(45, 1, 1, 1e8);
  private sky: Sky;
  private dem = new DemStore();
  private terrain: Terrain;
  private buildings: Buildings;
  private uniforms = {
    uCamPos: { value: new Vector3() },
    uAtmo: { value: new Vector4() },
    uShade: { value: 0.3 },
    uToon: { value: 0 },
  };
  private cartoon: Cartoon;
  private options: GlobeOptions;
  private dirty = true;
  private raf = 0;
  private last = 0;
  private lastHud = 0;
  private lastLoading = false;
  private resize: ResizeObserver;
  private pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  private flightQuality = false;
  private markerPoint = new Vector3();
  private markerDirection = new Vector3();
  private targetPoint = new Vector3();
  private width = 1;
  private height = 1;

  constructor(
    private container: HTMLElement,
    view: ViewState,
    options: GlobeOptions,
  ) {
    this.options = { ...options };
    this.renderer = new WebGLRenderer({ antialias: !options.cartoon, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x02040a, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    const layer = layerById(options.layer);
    this.cartoon = new Cartoon(this.dem, this.uniforms);
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.applyStyle();
    this.sky = new Sky(this.uniforms, this.renderer.getPixelRatio());
    this.terrain = new Terrain(this.dem, options.cartoon ? this.cartoon.layer(layer) : layer, this.uniforms, anisotropy);
    this.terrain.exaggeration = options.exaggeration;
    this.terrain.setOverlay(options.labels);
    this.buildings = new Buildings(this.dem, layer, this.uniforms, anisotropy, options.exaggeration);
    this.buildings.setEnabled(options.buildings && !options.cartoon);
    this.terrain.onChange = this.buildings.onChange = this.cartoon.onChange = () => (this.dirty = true);

    this.scene.add(
      new Mesh(new SphereGeometry(EARTH_RADIUS * 0.994, 96, 48), new MeshBasicMaterial({ color: 0x0a1b2e })),
      this.terrain.group,
      this.buildings.group,
    );

    this.controls = new Controls(
      this.renderer.domElement,
      this.camera,
      (lat, lon) => (this.dem.sample(lat, lon) ?? 0) * this.options.exaggeration,
    );
    this.controls.setView(view);

    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(container);
    this.onResize();
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.controls.dispose();
    this.cartoon.dispose();
    this.terrain.dispose();
    for (const scene of [this.scene, this.sky.scene]) scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  setOptions(next: GlobeOptions): void {
    const prev = this.options;
    this.options = { ...next };
    const layer = layerById(next.layer);
    this.terrain.setLayer(next.cartoon ? this.cartoon.layer(layer) : layer);
    if (next.layer !== prev.layer) this.buildings.setLayer(layer);
    this.terrain.setOverlay(next.labels);
    this.buildings.setEnabled(next.buildings && !next.cartoon);
    this.terrain.setExaggeration(next.exaggeration);
    this.buildings.setExaggeration(next.exaggeration);
    this.applyStyle();
    this.dirty = true;
  }

  private applyStyle(): void {
    const cartoon = this.options.cartoon;
    this.uniforms.uToon.value = cartoon ? 1 : 0;
    this.uniforms.uShade.value = Math.min(1, layerById(this.options.layer).shade + (cartoon ? 0.3 : 0));
  }

  projectPlace(lat: number, lon: number): { x: number; y: number } | null {
    const point = this.markerPoint;
    toECEF(lat, lon, (this.dem.sample(lat, lon) ?? 0) + 50, point);
    // A surface normal facing away from the camera is behind the planet.
    if (point.dot(this.markerDirection.copy(this.camera.position).sub(point)) <= 0) return null;
    point.project(this.camera);
    if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 0.95 || Math.abs(point.y) > 0.95) return null;
    return { x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2 };
  }

  setActive(active: boolean): void {
    cancelAnimationFrame(this.raf);
    if (active) { this.last = 0; this.dirty = true; this.raf = requestAnimationFrame(this.tick); }
  }

  private onResize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.dirty = true;
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, (now - this.last) / 1000 || 0.016);
    this.last = now;
    const moved = this.controls.update(dt);
    const cartoon = this.options.cartoon;
    // Tile and worker completions mark the scene dirty. Waiting for the network
    // alone does not require redrawing the same image on every animation frame.
    if (!moved && !this.dirty) return;
    this.dirty = false;

    const destination = this.controls.destination;
    const flightQuality = destination !== null;
    if (flightQuality !== this.flightQuality) {
      this.flightQuality = flightQuality;
      this.renderer.setPixelRatio(flightQuality ? Math.min(this.pixelRatio, 1) : this.pixelRatio);
      this.onResize();
    }
    if (cartoon && destination && destination.range < CITY_MAX_RANGE) {
      this.cartoon.city.prefetch(destination.lat, destination.lon);
    }

    const cam = this.camera;
    const dist = cam.position.length();
    const ll = fromECEF(cam.position);
    const exag = this.options.exaggeration;
    const ground = (this.dem.sample(ll.lat, ll.lon) ?? 0) * exag;
    const above = Math.max(1, dist - EARTH_RADIUS - ground);
    cam.near = Math.max(0.5, Math.min(2e5, Math.min(above, this.controls.range) * 0.08));
    cam.far = Math.max(
      this.controls.range * 1.5,
      Math.sqrt(Math.max(0, dist * dist - EARTH_RADIUS * EARTH_RADIUS)) + Math.sqrt(2 * EARTH_RADIUS * 9000 * exag) + 5e4,
    );
    cam.updateProjectionMatrix();

    const s = smoothstep(2e4, 4e6, dist - EARTH_RADIUS);
    const scaleHeight = 9000 + 31000 * s;
    const on = this.options.atmosphere ? 1 : 0;
    this.uniforms.uCamPos.value.copy(cam.position);
    this.uniforms.uAtmo.value.set(scaleHeight, scaleHeight * 8, (on * (0.11 - 0.065 * s)) / scaleHeight, (on * 1.3) / scaleHeight);

    const view = this.controls.getView();
    const lod = Math.min(this.renderer.getPixelRatio(), 1.4);
    const covered = false;
    this.terrain.update(cam, this.container.clientHeight * lod, flightQuality ? 3.4 : 1.7);
    if (!covered) this.buildings.update(view.lat, view.lon, view.range);
    if (cartoon) {
      const target = this.targetPoint.copy(this.controls.target).multiplyScalar(EARTH_RADIUS + this.controls.targetHeight);
      this.cartoon.update(view, target, cam, this.options.buildings, exag, Math.min(1, layerById(this.options.layer).shade + 0.3));
    }

    this.sky.sync(cam);
    const draw = () => {
      this.renderer.info.reset();
      this.renderer.clear();
      this.renderer.render(this.sky.scene, this.sky.camera);
      this.renderer.clearDepth();
      if (!covered) this.renderer.render(this.scene, cam);
    };
    if (cartoon) this.cartoon.render(this.renderer, cam, draw);
    else draw();
    this.onFrame();

    const loading =
      (this.terrain.busy && !covered) || (this.buildings.busy && !covered) || (cartoon && this.cartoon.busy);
    if (now - this.lastHud > 120 || loading !== this.lastLoading) {
      this.lastHud = now;
      this.lastLoading = loading;
      this.onHud({
        view,
        elevation: this.dem.sample(view.lat, view.lon) ?? 0,
        altitude: dist - EARTH_RADIUS,
        loading,
      });
    }
  };
}
