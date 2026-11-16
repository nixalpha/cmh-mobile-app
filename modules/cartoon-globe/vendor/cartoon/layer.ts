import { fetchBitmap } from "../globe/imagery";
import type { ImageryLayer } from "../globe/sources";
import type { CartoonWorker } from "./client";
import { COLORS } from "./style";

const VECTOR_MIN_ZOOM = 5;
const LAND_VECTOR = [0, 0, 0, 0.3, 0.55, 0.8];
const WATER_VECTOR = [0.4, 0.65, 0.85, 1, 1, 1];
const WATER = COLORS.water;

export function overrideWater(out: Uint8ClampedArray, vec: Uint8ClampedArray, weight: number): void {
  for (let i = 0; i < out.length; i += 4) {
    const off = Math.max(Math.abs(vec[i] - WATER[0]), Math.abs(vec[i + 1] - WATER[1]), Math.abs(vec[i + 2] - WATER[2]));
    const w = weight * Math.max(0, 1 - off / 36);
    if (w <= 0) continue;
    out[i] += (vec[i] - out[i]) * w;
    out[i + 1] += (vec[i + 1] - out[i + 1]) * w;
    out[i + 2] += (vec[i + 2] - out[i + 2]) * w;
  }
}

export function cartoonLayer(base: ImageryLayer, worker: CartoonWorker): ImageryLayer {
  return {
    ...base,
    id: `cartoon:${base.id}`,
    maxZoom: 19,
    async load(z, x, y, signal) {
      if (z < VECTOR_MIN_ZOOM) {
        if (z > base.maxZoom) throw new Error("no imagery");
        return fetchBitmap(base.url(z, x, y), signal);
      }
      const size = z >= 15 ? 384 : 256;
      const step = z - VECTOR_MIN_ZOOM;
      const land = LAND_VECTOR[step];
      if (land === undefined) return worker.paint(z, x, y, size, signal);
      const up = Math.max(0, z - base.maxZoom);
      const [top, under] = await Promise.all([worker.paint(z, x, y, size, signal), fetchBitmap(base.url(z - up, x >> up, y >> up), signal).catch(() => null)]);
      if (!under) return top;
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const n = 2 ** up;
      ctx.drawImage(under, ((x % n) / n) * under.width, ((y % n) / n) * under.height, under.width / n, under.height / n, 0, 0, size, size);
      under.close();
      ctx.globalAlpha = land;
      ctx.drawImage(top, 0, 0);
      ctx.globalAlpha = 1;
      const out = ctx.getImageData(0, 0, size, size);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(top, 0, 0);
      top.close();
      const vec = ctx.getImageData(0, 0, size, size).data;
      overrideWater(out.data, vec, WATER_VECTOR[step]);
      ctx.putImageData(out, 0, 0);
      return canvas.transferToImageBitmap();
    },
  };
}
