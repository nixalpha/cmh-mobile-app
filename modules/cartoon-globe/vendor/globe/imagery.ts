import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  Texture,
} from "three";

export async function fetchBitmap(url: string, signal?: AbortSignal, premultiply = false): Promise<ImageBitmap> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`tile ${res.status}`);
  return createImageBitmap(await res.blob(), { premultiplyAlpha: premultiply ? "premultiply" : "default" });
}

export function imageTexture(image: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, anisotropy: number): Texture {
  const t = new Texture(image);
  t.flipY = false;
  t.colorSpace = NoColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

export function disposeTexture(t: Texture): void {
  const img = t.image as { close?: () => void } | null;
  t.dispose();
  img?.close?.();
}
