import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hex, type RGB } from "./style";

const TRUNK = hex(0x9a6b4c);
const LEAF_DARK = hex(0x5d7f47);
const LEAF = hex(0x86a35c);
const LEAF_LIGHT = hex(0xa3ba6c);
const PINE_DARK = hex(0x2f5a3a);
const PINE = hex(0x3f7048);
const PINE_LIGHT = hex(0x4f8454);

const lerp = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function upright(g: BufferGeometry): BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.rotateX(Math.PI / 2);
  flat.deleteAttribute("uv");
  return flat;
}

function paint(g: BufferGeometry, colour: (x: number, y: number, z: number) => RGB): BufferGeometry {
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = colour(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = c[0] / 255;
    col[i * 3 + 1] = c[1] / 255;
    col[i * 3 + 2] = c[2] / 255;
  }
  g.setAttribute("color", new BufferAttribute(col, 3));
  return g;
}

function trunk(radius: number, height: number, sides: number): BufferGeometry {
  const g = upright(new CylinderGeometry(radius * 0.8, radius, height, sides, 1, true));
  g.translate(0, 0, height / 2 - 0.02);
  return paint(g, () => TRUNK);
}

function blob(cx: number, cy: number, cz: number, r: number, squash: number, detail: number, centre: [number, number, number]): BufferGeometry {
  const g = upright(new IcosahedronGeometry(1, detail));
  const pos = g.getAttribute("position");
  const normal = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i);
    const ny = pos.getY(i);
    const nz = pos.getZ(i);
    const x = cx + nx * r;
    const y = cy + ny * r;
    const z = cz + nz * r * squash;
    pos.setXYZ(i, x, y, z);
    const ox = x - centre[0];
    const oy = y - centre[1];
    const oz = (z - centre[2]) * 1.2;
    const ol = Math.hypot(ox, oy, oz) || 1;
    const mx = nx * 0.55 + (ox / ol) * 0.45;
    const my = ny * 0.55 + (oy / ol) * 0.45;
    const mz = nz * 0.55 + (oz / ol) * 0.45;
    const ml = Math.hypot(mx, my, mz) || 1;
    normal.set([mx / ml, my / ml, mz / ml], i * 3);
  }
  g.setAttribute("normal", new BufferAttribute(normal, 3));
  return g;
}

function roundTree(level: number): BufferGeometry {
  const centre: [number, number, number] = [0, 0, 0.62];
  const parts: BufferGeometry[] = [];
  if (level === 0) {
    parts.push(blob(0, 0, 0.66, 0.33, 0.92, 1, centre));
    const lobes = [
      [0.21, 0.02, 0.55, 0.25],
      [-0.1, 0.2, 0.57, 0.24],
      [-0.15, -0.17, 0.54, 0.26],
      [0.1, -0.2, 0.62, 0.2],
      [0.04, 0.05, 0.86, 0.2],
    ];
    for (const [x, y, z, r] of lobes) parts.push(blob(x, y, z, r, 0.9, 1, centre));
  } else {
    parts.push(blob(0, 0, 0.64, 0.4, 0.86, level === 1 ? 1 : 0, centre));
  }
  const canopy = paint(mergeGeometries(parts), (_x, _y, z) => {
    const t = Math.max(0, Math.min(1, (z - 0.36) / 0.62));
    return t < 0.5 ? lerp(LEAF_DARK, LEAF, t * 2) : lerp(LEAF, LEAF_LIGHT, t * 2 - 1);
  });
  if (level === 2) return canopy;
  return mergeGeometries([trunk(0.055, 0.42, level === 0 ? 6 : 4), canopy]);
}

function tier(z0: number, height: number, radius: number, sides: number, turn: number, base: boolean): BufferGeometry {
  const g = upright(new ConeGeometry(radius, height, sides, 1, !base));
  g.rotateZ(turn);
  g.translate(0, 0, z0 + height / 2);
  return g;
}

function conifer(level: number): BufferGeometry {
  const sides = level === 0 ? 9 : level === 1 ? 6 : 5;
  const tiers =
    level === 0
      ? [tier(0.14, 0.4, 0.3, sides, 0, true), tier(0.36, 0.36, 0.235, sides, 0.35, true), tier(0.58, 0.42, 0.16, sides, 0.7, true)]
      : level === 1
        ? [tier(0.14, 0.5, 0.29, sides, 0, true), tier(0.48, 0.52, 0.19, sides, 0.5, false)]
        : [tier(0.12, 0.88, 0.27, sides, 0, false)];
  const crown = paint(mergeGeometries(tiers), (x, y, z) => {
    const rim = Math.min(1, Math.hypot(x, y) / 0.3);
    return lerp(lerp(PINE_DARK, PINE, Math.min(1, z / 0.7)), PINE_LIGHT, rim * 0.5);
  });
  if (level === 2) return crown;
  return mergeGeometries([trunk(0.04, 0.2, level === 0 ? 6 : 4), crown]);
}

export interface TreeModels {
  round: BufferGeometry[];
  conifer: BufferGeometry[];
}

export function treeModels(): TreeModels {
  return { round: [0, 1, 2].map(roundTree), conifer: [0, 1, 2].map(conifer) };
}
