import { buildChunk, type ChunkData } from "./chunk";
import { paintGround } from "./ground";
import { VectorTiles, VT_MAX_ZOOM } from "./vt";

export type Request =
  | { id: number; type: "paint"; z: number; x: number; y: number; size: number }
  | { id: number; type: "chunk"; x: number; y: number; dem: Int16Array | null; exaggeration: number; split: number }
  | { id: number; type: "cancel" };

export type Reply = { id: number; ms: number; bitmap?: ImageBitmap; chunk?: ChunkData; error?: string };

const scope = self as unknown as { postMessage(message: Reply, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<Request>) => void) | null };
const tiles = new VectorTiles();
const active = new Set<number>();
const cancelled = new Set<number>();
const jobs: Array<() => void> = [];
let pumping = false;

function pump(): void {
  const job = jobs.shift();
  if (!job) {
    pumping = false;
    return;
  }
  job();
  setTimeout(pump);
}

function enqueue(job: () => void): void {
  jobs.push(job);
  if (!pumping) {
    pumping = true;
    setTimeout(pump);
  }
}

scope.onmessage = async ({ data }) => {
  if (data.type === "cancel") {
    if (active.has(data.id)) cancelled.add(data.id);
    return;
  }
  active.add(data.id);
  const reply = (message: Omit<Reply, "id">, transfer: Transferable[] = []) => {
    active.delete(data.id);
    cancelled.delete(data.id);
    scope.postMessage({ id: data.id, ...message }, transfer);
  };
  const fail = (error: string) => reply({ ms: 0, error });
  const up = data.type === "paint" ? Math.max(0, data.z - VT_MAX_ZOOM) : data.split;
  const z = data.type === "paint" ? data.z - up : VT_MAX_ZOOM;
  const tile = await tiles.load(z, data.x >> up, data.y >> up);
  if (!tile) return fail("no vector tile");
  enqueue(() => {
    if (cancelled.has(data.id)) return fail("cancelled");
    const t0 = performance.now();
    try {
      if (data.type === "paint") {
        const canvas = new OffscreenCanvas(data.size, data.size);
        paintGround(canvas.getContext("2d")!, tile, data.z, data.x, data.y, data.size);
        const bitmap = canvas.transferToImageBitmap();
        reply({ ms: performance.now() - t0, bitmap }, [bitmap]);
      } else {
        const chunk = buildChunk(tile, data.dem, data.x, data.y, data.exaggeration);
        const transfer: Transferable[] = chunk.trees.map((t) => t.matrices.buffer);
        const b = chunk.buildings;
        if (b) transfer.push(b.position.buffer, b.normal.buffer, b.color.buffer, b.wall.buffer, b.index.buffer);
        reply({ ms: performance.now() - t0, chunk }, transfer);
      }
    } catch (err) {
      fail(String(err));
    }
  });
};
