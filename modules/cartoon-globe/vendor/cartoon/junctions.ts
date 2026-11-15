export interface RoadLine {
  pts: ArrayLike<number>;
  halfWidth: number;
  level: number;
}

export interface Arm {
  line: number;
  at: number;
  dir: 1 | -1;
  dx: number;
  dy: number;
  halfWidth: number;
  length: number;
}

export interface Junction {
  x: number;
  y: number;
  level: number;
  arms: Arm[];
}

export function measure(pts: ArrayLike<number>): Float64Array {
  const n = pts.length >> 1;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  return cum;
}

export function pointAt(pts: ArrayLike<number>, cum: Float64Array, s: number): [number, number, number, number] {
  const n = cum.length;
  const d = Math.max(0, Math.min(cum[n - 1], s));
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  let i = lo;
  while (i < n - 1 && cum[i] === cum[i - 1]) i++;
  const len = cum[i] - cum[i - 1];
  const t = len > 0 ? (d - cum[i - 1]) / len : 0;
  const ax = pts[i * 2 - 2];
  const ay = pts[i * 2 - 1];
  const bx = pts[i * 2];
  const by = pts[i * 2 + 1];
  return [ax + (bx - ax) * t, ay + (by - ay) * t, len > 0 ? (bx - ax) / len : 1, len > 0 ? (by - ay) / len : 0];
}

export function sliceLine(pts: ArrayLike<number>, cum: Float64Array, from: number, to: number): number[] {
  const total = cum[cum.length - 1];
  const a = Math.max(0, Math.min(total, Math.min(from, to)));
  const b = Math.max(0, Math.min(total, Math.max(from, to)));
  const start = pointAt(pts, cum, a);
  const out = [start[0], start[1]];
  for (let i = 1; i < cum.length - 1; i++) if (cum[i] > a && cum[i] < b) out.push(pts[i * 2], pts[i * 2 + 1]);
  const end = pointAt(pts, cum, b);
  out.push(end[0], end[1]);
  if (from <= to) return out;
  const reversed: number[] = [];
  for (let i = out.length - 2; i >= 0; i -= 2) reversed.push(out[i], out[i + 1]);
  return reversed;
}

export function findJunctions(lines: RoadLine[], tolerance: number): Junction[] {
  const cums = lines.map((l) => measure(l.pts));
  const segLine: number[] = [];
  const segIndex: number[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  lines.forEach((l, li) => {
    for (let i = 0; i < l.pts.length; i += 2) {
      minX = Math.min(minX, l.pts[i]);
      maxX = Math.max(maxX, l.pts[i]);
      minY = Math.min(minY, l.pts[i + 1]);
      maxY = Math.max(maxY, l.pts[i + 1]);
      if (i + 3 < l.pts.length) {
        segLine.push(li);
        segIndex.push(i >> 1);
      }
    }
  });
  if (!segLine.length) return [];

  const cell = Math.max(Math.max(maxX - minX, maxY - minY) / 128, tolerance * 4, 1e-12);
  const cols = Math.floor((maxX - minX) / cell) + 3;
  const cells = new Map<number, number[]>();
  for (let s = 0; s < segLine.length; s++) {
    const p = lines[segLine[s]].pts;
    const i = segIndex[s] * 2;
    const steps = Math.max(1, Math.ceil(Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) / cell));
    for (let k = 0; k < steps; k++) {
      const x0 = p[i] + ((p[i + 2] - p[i]) * k) / steps;
      const y0 = p[i + 1] + ((p[i + 3] - p[i + 1]) * k) / steps;
      const x1 = p[i] + ((p[i + 2] - p[i]) * (k + 1)) / steps;
      const y1 = p[i + 1] + ((p[i + 3] - p[i + 1]) * (k + 1)) / steps;
      const cx0 = Math.floor((Math.min(x0, x1) - tolerance - minX) / cell) + 1;
      const cx1 = Math.floor((Math.max(x0, x1) + tolerance - minX) / cell) + 1;
      const cy0 = Math.floor((Math.min(y0, y1) - tolerance - minY) / cell) + 1;
      const cy1 = Math.floor((Math.max(y0, y1) + tolerance - minY) / cell) + 1;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cy * cols + cx;
          const list = cells.get(key);
          if (!list) cells.set(key, [s]);
          else if (list[list.length - 1] !== s) list.push(s);
        }
      }
    }
  }

  const hitLine: number[] = [];
  const hitAt: number[] = [];
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const link = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const hit = (line: number, at: number): number => {
    hitLine.push(line);
    hitAt.push(at);
    parent.push(parent.length);
    return parent.length - 1;
  };
  const touchEnd = (a: number, b: number) => {
    const la = segLine[a];
    const pa = lines[la].pts;
    const lb = segLine[b];
    const pb = lines[lb].pts;
    const j = segIndex[b] * 2;
    const sx = pb[j + 2] - pb[j];
    const sy = pb[j + 3] - pb[j + 1];
    const len2 = sx * sx + sy * sy;
    const last = (pa.length >> 1) - 2;
    for (const end of [0, 1]) {
      if (end === 0 ? segIndex[a] !== 0 : segIndex[a] !== last) continue;
      const px = pa[end === 0 ? 0 : pa.length - 2];
      const py = pa[end === 0 ? 1 : pa.length - 1];
      const t = Math.max(0, Math.min(1, ((px - pb[j]) * sx + (py - pb[j + 1]) * sy) / len2));
      if (Math.hypot(pb[j] + sx * t - px, pb[j + 1] + sy * t - py) > tolerance) continue;
      const total = cums[la][cums[la].length - 1];
      link(hit(la, end === 0 ? 0 : total), hit(lb, cums[lb][segIndex[b]] + Math.sqrt(len2) * t));
    }
  };
  const test = (a: number, b: number) => {
    const la = segLine[a];
    const lb = segLine[b];
    const pa = lines[la].pts;
    const pb = lines[lb].pts;
    const i = segIndex[a] * 2;
    const j = segIndex[b] * 2;
    const rx = pa[i + 2] - pa[i];
    const ry = pa[i + 3] - pa[i + 1];
    const sx = pb[j + 2] - pb[j];
    const sy = pb[j + 3] - pb[j + 1];
    const lenR = Math.hypot(rx, ry);
    const lenS = Math.hypot(sx, sy);
    if (lenR === 0 || lenS === 0) return;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) <= 1e-6 * lenR * lenS) {
      touchEnd(a, b);
      touchEnd(b, a);
      return;
    }
    const qx = pb[j] - pa[i];
    const qy = pb[j + 1] - pa[i + 1];
    const t = (qx * sy - qy * sx) / denom;
    const u = (qx * ry - qy * rx) / denom;
    const et = tolerance / lenR;
    const eu = tolerance / lenS;
    if (t < -et || t > 1 + et || u < -eu || u > 1 + eu) return;
    link(hit(la, cums[la][segIndex[a]] + lenR * Math.max(0, Math.min(1, t))), hit(lb, cums[lb][segIndex[b]] + lenS * Math.max(0, Math.min(1, u))));
  };

  const seen = new Set<number>();
  for (const list of cells.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const sa = Math.min(list[a], list[b]);
        const sb = Math.max(list[a], list[b]);
        if (segLine[sa] === segLine[sb] || lines[segLine[sa]].level !== lines[segLine[sb]].level) continue;
        const key = sa * segLine.length + sb;
        if (seen.has(key)) continue;
        seen.add(key);
        test(sa, sb);
      }
    }
  }

  const merge = tolerance * 2;
  const perLine = new Map<number, number[]>();
  for (let h = 0; h < hitLine.length; h++) {
    const list = perLine.get(hitLine[h]);
    if (list) list.push(h);
    else perLine.set(hitLine[h], [h]);
  }
  for (const list of perLine.values()) {
    list.sort((a, b) => hitAt[a] - hitAt[b] || a - b);
    for (let k = 1; k < list.length; k++) if (hitAt[list[k]] - hitAt[list[k - 1]] <= merge) link(list[k], list[k - 1]);
  }

  const clusters = new Map<number, number[]>();
  for (const list of perLine.values()) {
    for (const h of list) {
      const root = find(h);
      const members = clusters.get(root);
      if (members) members.push(h);
      else clusters.set(root, [h]);
    }
  }

  const stops: number[][] = lines.map(() => []);
  const continues: Array<[boolean, boolean]> = lines.map(() => [false, false]);
  const out: Junction[] = [];
  for (const members of clusters.values()) {
    const visits: Array<[number, number]> = [];
    for (const h of members) {
      const prev = visits[visits.length - 1];
      if (!prev || prev[0] !== hitLine[h] || hitAt[h] - prev[1] > merge) visits.push([hitLine[h], hitAt[h]]);
    }
    let x = 0;
    let y = 0;
    const arms: Arm[] = [];
    let ends = 0;
    for (const [line, at] of visits) {
      const { pts, halfWidth } = lines[line];
      const cum = cums[line];
      const total = cum[cum.length - 1];
      const here = pointAt(pts, cum, at);
      x += here[0] / visits.length;
      y += here[1] / visits.length;
      for (const dir of [1, -1] as const) {
        const room = dir > 0 ? total - at : at;
        if (room <= merge) {
          ends++;
          continue;
        }
        const there = pointAt(pts, cum, at + dir * Math.min(room, Math.max(3 * halfWidth, 4 * tolerance)));
        const d = Math.hypot(there[0] - here[0], there[1] - here[1]);
        if (d > 0) arms.push({ line, at, dir, dx: (there[0] - here[0]) / d, dy: (there[1] - here[1]) / d, halfWidth, length: room });
      }
    }
    if (arms.length >= 3) {
      for (const [line, at] of visits) stops[line].push(at);
      out.push({ x, y, level: lines[visits[0][0]].level, arms });
    } else if (arms.length === 2 && visits.length === 2 && ends === 2) {
      for (const arm of arms) continues[arm.line][arm.dir > 0 ? 0 : 1] = true;
    }
  }

  for (const junction of out) {
    for (const arm of junction.arms) {
      let next = Infinity;
      for (const at of stops[arm.line]) {
        const gap = (at - arm.at) * arm.dir;
        if (gap > merge && gap < next) next = gap;
      }
      if (next < Infinity) arm.length = next;
      else if (continues[arm.line][arm.dir > 0 ? 1 : 0]) arm.length = Infinity;
    }
  }
  return out;
}
