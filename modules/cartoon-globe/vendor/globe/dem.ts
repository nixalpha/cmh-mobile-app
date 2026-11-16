import { DEM_MAX_ZOOM, demUrl } from "./sources";
import { latToMercY, lonToMercX } from "./geo";

export const DEM_SIZE = 256;
const CACHE_LIMIT = 320;

export class DemStore {
  private cache = new Map<string, Int16Array>();
  private pending = new Map<string, Promise<Int16Array | null>>();
  private ctx: OffscreenCanvasRenderingContext2D;

  constructor() {
    const canvas = new OffscreenCanvas(DEM_SIZE, DEM_SIZE);
    this.ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  }

  load(z: number, x: number, y: number): Promise<Int16Array | null> {
    const key = `${z}/${x}/${y}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return Promise.resolve(hit);
    }
    let p = this.pending.get(key);
    if (!p) {
      p = this.fetchTile(z, x, y)
        .catch(() => null)
        .then((data) => {
          this.pending.delete(key);
          if (data) {
            this.cache.set(key, data);
            if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
          }
          return data;
        });
      this.pending.set(key, p);
    }
    return p;
  }

  private async fetchTile(z: number, x: number, y: number): Promise<Int16Array> {
    const res = await fetch(demUrl(z, x, y));
    if (!res.ok) throw new Error(`DEM ${res.status}`);
    const bmp = await createImageBitmap(await res.blob(), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
    this.ctx.drawImage(bmp, 0, 0, DEM_SIZE, DEM_SIZE);
    bmp.close();
    const px = this.ctx.getImageData(0, 0, DEM_SIZE, DEM_SIZE).data;
    const out = new Int16Array(DEM_SIZE * DEM_SIZE);
    for (let i = 0; i < out.length; i++) {
      const h = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
      out[i] = h > 0 ? Math.min(32767, Math.round(h)) : 0;
    }
    return out;
  }

  sample(lat: number, lon: number): number | null {
    const mx = lonToMercX(lon);
    const my = latToMercY(lat);
    if (!(mx >= 0 && mx <= 1 && my >= 0 && my <= 1)) return null;
    for (let z = DEM_MAX_ZOOM; z >= 0; z--) {
      const n = 2 ** z;
      const tx = Math.min(n - 1, Math.floor(mx * n));
      const ty = Math.min(n - 1, Math.floor(my * n));
      const data = this.cache.get(`${z}/${tx}/${ty}`);
      if (data) return sampleDem(data, (mx * n - tx) * DEM_SIZE, (my * n - ty) * DEM_SIZE);
    }
    return null;
  }
}

export function sampleDem(data: Int16Array, px: number, py: number): number {
  const max = DEM_SIZE - 1;
  const x = px < 0 ? 0 : px > max ? max : px;
  const y = py < 0 ? 0 : py > max ? max : py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  if (fx === 0 && fy === 0) return data[y0 * DEM_SIZE + x0];
  const x1 = x0 < max ? x0 + 1 : max;
  const y1 = y0 < max ? y0 + 1 : max;
  const a = data[y0 * DEM_SIZE + x0];
  const b = data[y0 * DEM_SIZE + x1];
  const c = data[y1 * DEM_SIZE + x0];
  const d = data[y1 * DEM_SIZE + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
