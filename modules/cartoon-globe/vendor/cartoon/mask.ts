export class Mask {
  readonly data: Uint8Array;

  constructor(
    readonly u0: number,
    readonly v0: number,
    readonly cell: number,
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height);
  }

  get(u: number, v: number): number {
    const x = Math.floor((u - this.u0) / this.cell);
    const y = Math.floor((v - this.v0) / this.cell);
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? 0 : this.data[y * this.width + x];
  }

  near(u: number, v: number): number {
    const c = this.cell;
    return this.get(u, v) | this.get(u - c, v) | this.get(u + c, v) | this.get(u, v - c) | this.get(u, v + c);
  }

  fill(rings: number[][], bit: number): void {
    let lo = Infinity;
    let hi = -Infinity;
    for (const ring of rings) {
      for (let k = 1; k < ring.length; k += 2) {
        lo = Math.min(lo, ring[k]);
        hi = Math.max(hi, ring[k]);
      }
    }
    const y0 = Math.max(0, Math.ceil((lo - this.v0) / this.cell - 0.5));
    const y1 = Math.min(this.height - 1, Math.floor((hi - this.v0) / this.cell - 0.5));
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const v = this.v0 + (y + 0.5) * this.cell;
      xs.length = 0;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
          const vi = ring[i + 1];
          const vj = ring[j + 1];
          if (vi > v !== vj > v) xs.push(ring[i] + ((v - vi) / (vj - vi)) * (ring[j] - ring[i]));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, Math.ceil((xs[k] - this.u0) / this.cell - 0.5));
        const x1 = Math.min(this.width - 1, Math.floor((xs[k + 1] - this.u0) / this.cell - 0.5));
        const row = y * this.width;
        for (let x = x0; x <= x1; x++) this.data[row + x] |= bit;
      }
    }
  }

  stroke(line: number[], radius: number, bit: number, closed = false): void {
    const n = line.length / 2;
    const r = radius / this.cell;
    const r2 = r * r;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      const ax = (line[i * 2] - this.u0) / this.cell;
      const ay = (line[i * 2 + 1] - this.v0) / this.cell;
      const bx = (line[j * 2] - this.u0) / this.cell;
      const by = (line[j * 2 + 1] - this.v0) / this.cell;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
      const x1 = Math.min(this.width - 1, Math.ceil(Math.max(ax, bx) + r));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
      const y1 = Math.min(this.height - 1, Math.ceil(Math.max(ay, by) + r));
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5 - ax;
          const py = y + 0.5 - ay;
          const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
          const ex = px - dx * t;
          const ey = py - dy * t;
          if (ex * ex + ey * ey <= r2) this.data[y * this.width + x] |= bit;
        }
      }
    }
  }
}
