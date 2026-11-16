import { BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { CityChunk } from "./city";
import { AMBIENT_RGB, SUN_ENU, SUNLIGHT_RGB } from "./shaders";

const SUN = new Vector3(...SUN_ENU).normalize();

function baked(r: number, g: number, b: number, nx: number, ny: number, nz: number, out: Uint8Array, o: number): void {
  const d = Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
  const rgb = [r, g, b];
  for (let k = 0; k < 3; k++) out[o + k] = Math.round(255 * Math.min(1, rgb[k] * (AMBIENT_RGB[k] + SUNLIGHT_RGB[k] * d)) ** 2.2);
  out[o + 3] = 255;
}

export function cityMeshes(chunks: CityChunk[], treeModel: (kind: number) => BufferGeometry, origin: Vector3, radius: number): Mesh[] {
  const material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const meshes: Mesh[] = [];
  const m = new Matrix4();
  const p = new Vector3();
  const n = new Vector3();
  for (const chunk of chunks) {
    const name = chunk.key.replaceAll("/", "_");
    if (chunk.buildings?.visible) {
      const src = chunk.buildings.geometry;
      const sphere = src.boundingSphere!;
      if (p.copy(sphere.center).applyMatrix4(chunk.buildings.matrixWorld).distanceTo(origin) - sphere.radius <= radius) {
        const normal = src.getAttribute("normal4");
        const color = src.getAttribute("color");
        const out = new Uint8Array(color.count * 4);
        for (let i = 0; i < color.count; i++) baked(color.getX(i), color.getY(i), color.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i), out, i * 4);
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", src.getAttribute("position"));
        geometry.setAttribute("color", new BufferAttribute(out, 4, true));
        geometry.setIndex(src.getIndex());
        const mesh = new Mesh(geometry, material);
        mesh.name = `cartoon_buildings_${name}`;
        mesh.applyMatrix4(chunk.buildings.matrixWorld);
        meshes.push(mesh);
      }
    }
    chunk.trees.forEach((trees, t) => {
      if (!trees.visible || chunk.center.distanceTo(origin) > radius + 400) return;
      const model = treeModel(chunk.treeKinds[t]);
      const mp = model.getAttribute("position");
      const mn = model.getAttribute("normal");
      const mc = model.getAttribute("color");
      const count = trees.instanceMatrix.count;
      const position = new Float32Array(count * mp.count * 3);
      const color = new Uint8Array(count * mp.count * 4);
      for (let i = 0; i < count; i++) {
        trees.getMatrixAt(i, m);
        for (let v = 0; v < mp.count; v++) {
          const o = i * mp.count + v;
          p.fromBufferAttribute(mp, v).applyMatrix4(m).toArray(position, o * 3);
          n.fromBufferAttribute(mn, v).transformDirection(m);
          baked(mc.getX(v), mc.getY(v), mc.getZ(v), n.x, n.y, n.z, color, o * 4);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(position, 3));
      geometry.setAttribute("color", new BufferAttribute(color, 4, true));
      const mesh = new Mesh(geometry, material);
      mesh.name = `cartoon_trees_${t}_${name}`;
      mesh.applyMatrix4(trees.matrixWorld);
      meshes.push(mesh);
    });
  }
  return meshes;
}
