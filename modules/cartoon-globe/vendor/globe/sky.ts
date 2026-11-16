import {
  BufferAttribute,
  BufferGeometry,
  type IUniform,
  Mesh,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  Vector3,
  Vector4,
} from "three";
import { DEG } from "./geo";
import { SKY_FRAG, SKY_VERT } from "./shaders";

export class Sky {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 0.1, 10);
  private uniforms: Record<string, IUniform>;

  constructor(shared: { uCamPos: IUniform<Vector3>; uAtmo: IUniform<Vector4> }, pixelRatio: number) {
    const count = 3200;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const z = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 5, z * 5, r * Math.sin(a) * 5], i * 3);
      const b = (0.25 + 0.75 * rnd() ** 3) ** 0.45;
      const warm = rnd();
      col.set([b * (0.85 + 0.15 * warm), b * 0.92, b * (1 - 0.15 * warm)], i * 3);
    }
    const stars = new BufferGeometry();
    stars.setAttribute("position", new BufferAttribute(pos, 3));
    stars.setAttribute("color", new BufferAttribute(col, 3));
    this.scene.add(
      new Points(
        stars,
        new PointsMaterial({ size: 1.5 * pixelRatio, sizeAttenuation: false, vertexColors: true, depthTest: false }),
      ),
    );

    this.uniforms = {
      ...shared,
      uRight: { value: new Vector3() },
      uUp: { value: new Vector3() },
      uForward: { value: new Vector3() },
    };
    const tri = new BufferGeometry();
    tri.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new Mesh(
      tri,
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
  }

  sync(camera: PerspectiveCamera): void {
    this.camera.fov = camera.fov;
    this.camera.aspect = camera.aspect;
    this.camera.quaternion.copy(camera.quaternion);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    const e = camera.matrixWorld.elements;
    const t = Math.tan((camera.fov * DEG) / 2);
    (this.uniforms.uRight.value as Vector3).set(e[0], e[1], e[2]).multiplyScalar(t * camera.aspect);
    (this.uniforms.uUp.value as Vector3).set(e[4], e[5], e[6]).multiplyScalar(t);
    (this.uniforms.uForward.value as Vector3).set(-e[8], -e[9], -e[10]);
  }
}
