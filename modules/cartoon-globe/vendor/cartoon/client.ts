import InlineWorker from "./worker?worker&inline";
import type { ChunkData } from "./chunk";
import type { Reply, Request } from "./worker";

type Order = Request extends infer R ? (R extends { type: "cancel" } ? never : Omit<R, "id">) : never;

export class CartoonWorker {
  readonly stats = { paints: 0, paintMs: 0, chunks: 0, chunkMs: 0, maxMs: 0 };
  private worker = new InlineWorker();
  private pending = new Map<number, { resolve: (reply: Reply) => void; reject: (err: Error) => void }>();
  private next = 1;

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const entry = this.pending.get(data.id);
      this.pending.delete(data.id);
      if (!entry) {
        data.bitmap?.close();
        return;
      }
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data);
    };
  }

  private send(order: Order, signal?: AbortSignal): Promise<Reply> {
    const id = this.next++;
    return new Promise<Reply>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      signal?.addEventListener("abort", () => {
        if (!this.pending.delete(id)) return;
        this.worker.postMessage({ id, type: "cancel" } satisfies Request);
        reject(new Error("aborted"));
      });
      this.worker.postMessage({ ...order, id } as Request);
    });
  }

  async paint(z: number, x: number, y: number, size: number, signal?: AbortSignal): Promise<ImageBitmap> {
    const reply = await this.send({ type: "paint", z, x, y, size }, signal);
    this.stats.paints++;
    this.stats.paintMs += reply.ms;
    this.stats.maxMs = Math.max(this.stats.maxMs, reply.ms);
    return reply.bitmap!;
  }

  async chunk(x: number, y: number, dem: Int16Array | null, exaggeration: number, split: number): Promise<ChunkData> {
    const reply = await this.send({ type: "chunk", x, y, dem, exaggeration, split });
    this.stats.chunks++;
    this.stats.chunkMs += reply.ms;
    this.stats.maxMs = Math.max(this.stats.maxMs, reply.ms);
    return reply.chunk!;
  }

  dispose(): void {
    this.worker.terminate();
    for (const entry of this.pending.values()) entry.reject(new Error("disposed"));
    this.pending.clear();
  }
}
