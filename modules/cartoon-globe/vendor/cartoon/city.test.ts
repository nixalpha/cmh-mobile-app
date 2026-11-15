import { describe, expect, it, vi } from 'vitest';

import type { DemStore } from '../globe/dem';
import { latToMercY, lonToMercX } from '../globe/geo';
import type { CartoonWorker } from './client';
import { CHUNK_Z, type ChunkData } from './chunk';
import { City } from './city';

const EMPTY: ChunkData = { lat: 51.5, lon: -0.12, height: 0, buildings: null, trees: [] };
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function setup() {
  const dem = { load: vi.fn().mockResolvedValue(null) };
  const worker = { chunk: vi.fn<(...args: unknown[]) => Promise<ChunkData>>().mockResolvedValue(EMPTY) };
  const city = new City(dem as unknown as DemStore, worker as unknown as CartoonWorker, {});
  return { city, dem, worker };
}

describe('destination preloading', () => {
  it('starts loading city detail while the city is still hidden and limits concurrency', async () => {
    const { city, dem, worker } = setup();
    worker.chunk.mockImplementation(() => new Promise(() => {}));
    city.scene.visible = false;
    city.prefetch(51.5, -0.12);
    city.prefetch(51.5, -0.12);
    await flush();
    expect(city.scene.visible).toBe(false);
    expect(dem.load).toHaveBeenCalledTimes(2);
    expect(worker.chunk).toHaveBeenCalledTimes(2);
    city.dispose();
  });

  it('loads the center first, bounds the preload area, and reuses cached chunks', async () => {
    const { city, worker } = setup();
    for (let i = 0; i < 8; i++) {
      city.prefetch(51.5, -0.12);
      await flush();
    }
    expect(worker.chunk).toHaveBeenCalledTimes(9);
    const centerX = Math.floor(lonToMercX(-0.12) * 2 ** CHUNK_Z);
    const centerY = Math.floor(latToMercY(51.5) * 2 ** CHUNK_Z);
    expect(worker.chunk.mock.calls[0].slice(0, 2)).toEqual([centerX, centerY]);
    city.dispose();
  });

  it('wraps preloaded chunks at the date line and skips unsupported polar cities', async () => {
    const { city, worker } = setup();
    city.prefetch(85, 0);
    await flush();
    expect(worker.chunk).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i++) {
      city.prefetch(0, 179.9999);
      await flush();
    }
    const xs = worker.chunk.mock.calls.map(([x]) => x);
    expect(xs).toContain(0);
    expect(xs.every(x => typeof x === 'number' && x >= 0 && x < 2 ** CHUNK_Z)).toBe(true);
    city.dispose();
  });
});
