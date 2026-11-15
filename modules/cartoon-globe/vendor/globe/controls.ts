import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { DEG, EARTH_RADIUS, enuFrame, fromECEF, toECEF, wrapLon } from "./geo";

export interface ViewState {
  lat: number;
  lon: number;
  range: number;
  heading: number;
  tilt: number;
}

export interface Surface {
  floor(position: Vector3): number | null;
  pick(origin: Vector3, direction: Vector3): Vector3 | null;
}

export const MIN_RANGE = 40;
const MESH_CLEARANCE = 30;
export const MAX_RANGE = 3.2e7;
const MAX_TILT = 84 * DEG;

interface Anchor {
  lat: number;
  lon: number;
  radius: number;
  x: number;
  y: number;
}

interface FlyAnim {
  from: Vector3;
  to: Vector3;
  rotation: Quaternion;
  range0: number;
  range1: number;
  bump: number;
  cinematic: boolean;
  cruiseRange: number;
  heading0: number;
  heading1: number;
  tilt0: number;
  tilt1: number;
  start: number;
  duration: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => {
  const k = clamp(t, 0, 1);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
const IDENTITY = new Quaternion();

export class Controls {
  readonly target = new Vector3(0, 0, 1);
  heading = 0;
  tilt = 0;
  range = 2e7;
  targetHeight = 0;
  surface: Surface | null = null;

  private floorHeight: number | null = null;
  private rangeGoal = 2e7;
  private dirty = true;
  private anchor: Anchor | null = null;
  private grab: Anchor | null = null;
  private orbiting = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; angle: number; midY: number } | null = null;
  private inertia: { lat: number; lon: number } | null = null;
  private lastSpin: { lat: number; lon: number; time: number } | null = null;
  private lastMove = 0;
  private anim: FlyAnim | null = null;
  private east = new Vector3();
  private north = new Vector3();
  private fwd = new Vector3();
  private v = new Vector3();
  private flightRotation = new Quaternion();
  private listeners: Array<() => void> = [];

  constructor(
    private dom: HTMLElement,
    private camera: PerspectiveCamera,
    private elevation: (lat: number, lon: number) => number,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      dom.addEventListener(type, fn, opts);
      this.listeners.push(() => dom.removeEventListener(type, fn, opts));
    };
    on("pointerdown", this.onPointerDown);
    on("pointermove", this.onPointerMove);
    on("pointerup", this.onPointerUp);
    on("pointercancel", this.onPointerUp);
    on("wheel", this.onWheel, { passive: false });
    on("dblclick", this.onDoubleClick);
    on("contextmenu", (e) => e.preventDefault());
  }

  dispose(): void {
    for (const off of this.listeners) off();
  }

  getView(): ViewState {
    const ll = fromECEF(this.target);
    return { lat: ll.lat, lon: ll.lon, range: this.range, heading: this.heading / DEG, tilt: this.tilt / DEG };
  }

  setView(view: ViewState): void {
    toECEF(view.lat, view.lon, 0, this.target).normalize();
    this.range = this.rangeGoal = clamp(view.range, MIN_RANGE, MAX_RANGE);
    this.heading = view.heading * DEG;
    this.tilt = clamp(view.tilt * DEG, 0, MAX_TILT);
    this.anim = null;
    this.inertia = null;
    this.dirty = true;
    this.applyCamera();
  }

  flyTo(view: Partial<ViewState>, duration?: number, mode: 'direct' | 'cinematic' = 'direct'): void {
    const cur = this.getView();
    const to = new Vector3();
    toECEF(view.lat ?? cur.lat, view.lon ?? cur.lon, 0, to).normalize();
    const range1 = clamp(view.range ?? cur.range, MIN_RANGE, MAX_RANGE);
    const angle = this.target.angleTo(to);
    const peak = angle * EARTH_RADIUS * 1.1;
    const bump = Math.max(0, Math.log(Math.min(peak, 2.2e7)) - Math.max(Math.log(this.range), Math.log(range1)));
    let dh = ((view.heading ?? 0) * DEG - this.heading) % (2 * Math.PI);
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    this.anim = {
      from: this.target.clone(),
      to,
      rotation: new Quaternion().setFromUnitVectors(this.target, to),
      range0: this.range,
      range1,
      bump,
      cinematic: mode === 'cinematic',
      cruiseRange: Math.max(this.range, range1, Math.min(peak, MAX_RANGE)),
      heading0: this.heading,
      heading1: this.heading + dh,
      tilt0: this.tilt,
      tilt1: clamp((view.tilt ?? 0) * DEG, 0, MAX_TILT),
      start: performance.now(),
      duration:
        (duration ?? (mode === 'cinematic'
          ? 1.4 + Math.min(2.2, angle * 0.8 + Math.abs(Math.log(range1 / this.range)) * 0.14 + bump * 0.2)
          : 1.1 + Math.min(3, angle * 1.6 + Math.abs(Math.log(range1 / this.range)) * 0.18 + bump * 0.4))) * 1000,
    };
    this.inertia = null;
    this.anchor = null;
    this.dirty = true;
  }

  get destination(): ViewState | null {
    const a = this.anim;
    if (!a) return null;
    const ll = fromECEF(a.to);
    return { lat: ll.lat, lon: ll.lon, range: a.range1, heading: a.heading1 / DEG, tilt: a.tilt1 / DEG };
  }

  zoomBy(factor: number): void {
    this.cancelAnim();
    this.anchor = null;
    this.rangeGoal = clamp(this.rangeGoal * factor, MIN_RANGE, MAX_RANGE);
    this.dirty = true;
  }

  resetNorth(): void {
    const v = this.getView();
    this.flyTo({ ...v, heading: 0, tilt: 0 }, 0.7);
  }

  update(dt: number): boolean {
    let changed = this.dirty;
    this.dirty = false;

    if (this.anim) {
      const a = this.anim;
      const t = clamp((performance.now() - a.start) / a.duration, 0, 1);
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const climbing = a.cruiseRange > a.range0 * 1.05;
      const travel = a.cinematic ? smooth((t - (climbing ? 0.12 : 0)) / (climbing ? 0.56 : 0.6)) : k;
      this.flightRotation.slerpQuaternions(IDENTITY, a.rotation, travel);
      this.target.copy(a.from).applyQuaternion(this.flightRotation).normalize();
      if (a.cinematic) {
        // Gain altitude before crossing between cities; arrive above the target
        // before the final descent so close terrain never sweeps sideways.
        const climb = climbing ? smooth(t / 0.25) : 1;
        // Begin zooming immediately from orbit, then slow down as detail arrives.
        const descend = smooth((t - (climbing ? 0.5 : 0)) / (climbing ? 0.5 : 1));
        this.range = this.rangeGoal = Math.exp(
          Math.log(a.range0) + Math.log(a.cruiseRange / a.range0) * climb + Math.log(a.range1 / a.cruiseRange) * descend,
        );
      } else this.range = this.rangeGoal = Math.exp(
        Math.log(a.range0) + (Math.log(a.range1) - Math.log(a.range0)) * k + a.bump * Math.sin(Math.PI * k),
      );
      this.heading = a.heading0 + (a.heading1 - a.heading0) * k;
      this.tilt = a.tilt0 + (a.tilt1 - a.tilt0) * k;
      if (a.cinematic) {
        const level = a.tilt0 * (1 - smooth(t / 0.3));
        this.tilt = level + a.tilt1 * smooth((t - 0.6) / 0.4);
      }
      if (t >= 1) {
        this.anim = null;
        this.heading = ((this.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      }
      changed = true;
    }

    if (this.inertia) {
      this.shift(this.inertia.lat * dt, this.inertia.lon * dt);
      const decay = Math.exp(-dt * 4.5);
      this.inertia.lat *= decay;
      this.inertia.lon *= decay;
      if (Math.hypot(this.inertia.lat, this.inertia.lon) < (this.range / EARTH_RADIUS) * 1.2) this.inertia = null;
      changed = true;
    }

    const zooming = Math.abs(Math.log(this.rangeGoal / this.range)) > 1e-4;
    if (zooming) {
      this.range = Math.exp(
        Math.log(this.range) + (Math.log(this.rangeGoal) - Math.log(this.range)) * (1 - Math.exp(-dt * 11)),
      );
      changed = true;
    }

    const maxTilt = this.maxTilt();
    if (this.tilt > maxTilt) {
      this.tilt = maxTilt;
      changed = true;
    }

    const ll = fromECEF(this.target);
    const ground = this.elevation(ll.lat, ll.lon);
    if (Math.abs(ground - this.targetHeight) > 0.05) {
      this.targetHeight += (ground - this.targetHeight) * (1 - Math.exp(-dt * 7));
      changed = true;
    }

    const floor = this.surface?.floor(this.camera.position) ?? null;
    if (floor === null || this.floorHeight === null) {
      if (floor !== this.floorHeight) changed = true;
      this.floorHeight = floor;
    } else if (Math.abs(floor - this.floorHeight) > 0.05) {
      this.floorHeight += (floor - this.floorHeight) * (1 - Math.exp(-dt * (floor > this.floorHeight ? 18 : 5)));
      changed = true;
    }

    if (changed) {
      this.applyCamera();
      if (zooming && this.anchor) this.panTo(this.anchor, this.anchor.x, this.anchor.y);
    }
    if (!zooming) this.anchor = null;
    return changed;
  }

  private maxTilt(): number {
    if (this.range < 1.5e6) return MAX_TILT;
    const k = clamp((Math.log(this.range) - Math.log(1.5e6)) / (Math.log(1.2e7) - Math.log(1.5e6)), 0, 1);
    return MAX_TILT * (1 - k);
  }

  private frame(): void {
    enuFrame(this.target, this.east, this.north);
    this.fwd
      .copy(this.north)
      .multiplyScalar(Math.cos(this.heading))
      .addScaledVector(this.east, Math.sin(this.heading));
  }

  private applyCamera(): void {
    this.frame();
    const cam = this.camera;
    const tx = this.v.copy(this.target).multiplyScalar(EARTH_RADIUS + this.targetHeight);
    cam.position
      .copy(tx)
      .addScaledVector(this.target, Math.cos(this.tilt) * this.range)
      .addScaledVector(this.fwd, -Math.sin(this.tilt) * this.range);
    const ll = fromECEF(cam.position);
    const ground = Math.max(this.elevation(ll.lat, ll.lon), this.floorHeight ?? -Infinity);
    const floor = EARTH_RADIUS + ground + (this.floorHeight === null ? clamp(this.range * 0.15, 3, 25) : MESH_CLEARANCE);
    if (cam.position.length() < floor) cam.position.setLength(floor);
    cam.up
      .copy(this.fwd)
      .multiplyScalar(Math.cos(this.tilt))
      .addScaledVector(this.target, Math.sin(this.tilt));
    cam.lookAt(tx);
    cam.updateMatrixWorld(true);
  }

  private shift(dLat: number, dLon: number): void {
    const ll = fromECEF(this.target);
    toECEF(clamp(ll.lat + dLat, -89.5, 89.5), ll.lon + dLon, 0, this.target).normalize();
  }

  private panTo(anchor: Anchor, clientX: number, clientY: number): { lat: number; lon: number } {
    const total = { lat: 0, lon: 0 };
    const max = clamp((this.range / EARTH_RADIUS) * 60, 1e-4, 25);
    for (let i = 0; i < 3; i++) {
      const hit = this.pick(clientX, clientY, anchor.radius);
      if (!hit) break;
      const cur = fromECEF(hit);
      const dLat = clamp(anchor.lat - cur.lat, -max, max);
      const polar = Math.max(Math.abs(anchor.lat), Math.abs(cur.lat)) > 88;
      const dLon = polar ? 0 : clamp(wrapLon(anchor.lon - cur.lon), -max, max);
      if (Math.abs(dLat) + Math.abs(dLon) < 1e-10) break;
      this.shift(dLat, dLon);
      this.applyCamera();
      total.lat += dLat;
      total.lon += dLon;
    }
    return total;
  }

  private pick(clientX: number, clientY: number, radius: number): Vector3 | null {
    const o = this.camera.position;
    const d = this.rayDirection(clientX, clientY);
    const b = o.dot(d);
    const disc = b * b - (o.lengthSq() - radius * radius);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    return d.multiplyScalar(t).add(o);
  }

  private rayDirection(clientX: number, clientY: number): Vector3 {
    const rect = this.dom.getBoundingClientRect();
    return new Vector3(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
  }

  pickGround(clientX: number, clientY: number): Anchor | null {
    const onSurface = this.surface?.pick(this.camera.position, this.rayDirection(clientX, clientY));
    if (onSurface) {
      const ll = fromECEF(onSurface);
      return { lat: ll.lat, lon: ll.lon, radius: onSurface.length(), x: clientX, y: clientY };
    }
    let radius = EARTH_RADIUS + this.targetHeight;
    let hit = this.pick(clientX, clientY, radius);
    if (!hit) return null;
    for (let i = 0; i < 2; i++) {
      const ll = fromECEF(hit);
      radius = EARTH_RADIUS + this.elevation(ll.lat, ll.lon);
      const next = this.pick(clientX, clientY, radius);
      if (!next) break;
      hit = next;
    }
    const ll = fromECEF(hit);
    return { lat: ll.lat, lon: ll.lon, radius, x: clientX, y: clientY };
  }

  private cancelAnim(): void {
    this.anim = null;
    this.inertia = null;
    this.rangeGoal = clamp(this.rangeGoal, MIN_RANGE, MAX_RANGE);
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.cancelAnim();
    this.rangeGoal = this.range;
    this.anchor = null;
    this.lastSpin = null;
    if (this.pointers.size === 2) {
      this.grab = null;
      this.orbiting = false;
      this.pinch = this.pinchState();
      return;
    }
    this.orbiting = e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey;
    this.grab = this.orbiting ? null : this.pickGround(e.clientX, e.clientY);
  };

  private pinchState(): { dist: number; angle: number; midY: number } {
    const [a, b] = [...this.pointers.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      midY: (a.y + b.y) / 2,
    };
  }

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2 && this.pinch) {
      const s = this.pinchState();
      this.range = this.rangeGoal = clamp((this.range * this.pinch.dist) / Math.max(1, s.dist), MIN_RANGE, MAX_RANGE);
      let da = s.angle - this.pinch.angle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      this.heading -= da;
      this.tilt = clamp(this.tilt - (s.midY - this.pinch.midY) * 0.4 * DEG, 0, this.maxTilt());
      this.pinch = s;
      this.dirty = true;
      return;
    }
    if (this.orbiting) {
      this.heading += dx * 0.3 * DEG;
      this.tilt = clamp(this.tilt - dy * 0.3 * DEG, 0, this.maxTilt());
      this.dirty = true;
      return;
    }
    if (!this.grab) return;
    const moved = this.panTo(this.grab, e.clientX, e.clientY);
    this.dirty = true;
    const now = performance.now();
    const dt = Math.max(4, now - this.lastMove) / 1000;
    const cap = (this.range / EARTH_RADIUS) * 400;
    this.lastSpin = { lat: clamp(moved.lat / dt, -cap, cap), lon: clamp(moved.lon / dt, -cap, cap), time: now };
    this.lastMove = now;
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
    if (this.pointers.size === 1) {
      const [p] = [...this.pointers.values()];
      this.grab = this.pickGround(p.x, p.y);
      this.orbiting = false;
      return;
    }
    if (this.grab && this.lastSpin && performance.now() - this.lastSpin.time < 70) {
      this.inertia = { lat: this.lastSpin.lat, lon: this.lastSpin.lon };
      this.dirty = true;
    }
    this.grab = null;
    this.orbiting = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.cancelAnim();
    const unit = e.deltaMode === 1 ? 32 : 1;
    const speed = e.ctrlKey ? 0.012 : 0.0016;
    this.rangeGoal = clamp(this.rangeGoal * Math.exp(e.deltaY * unit * speed), MIN_RANGE, MAX_RANGE);
    this.anchor = this.pickGround(e.clientX, e.clientY);
    this.dirty = true;
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const hit = this.pickGround(e.clientX, e.clientY);
    if (!hit) return;
    this.flyTo(
      { lat: hit.lat, lon: hit.lon, range: this.range * 0.4, heading: this.heading / DEG, tilt: this.tilt / DEG },
      0.6,
    );
  };
}
