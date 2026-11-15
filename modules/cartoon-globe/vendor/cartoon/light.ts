import { DepthTexture, Matrix4, OrthographicCamera, type PerspectiveCamera, type Scene, ShaderMaterial, DoubleSide, UnsignedIntType, Vector3, WebGLRenderTarget, type WebGLRenderer } from "three";
import { enuFrame } from "../globe/geo";
import { DEPTH_FRAG, DEPTH_VERT, SUN_ENU } from "./shaders";

export const SHADOW_SIZE = 2048;
const EXTENTS = [170, 240, 340, 480, 680, 960, 1360];
const DISTANCE = 3000;
const REFRAME = 1500;

export class SunShadow {
  readonly target: WebGLRenderTarget;
  readonly fromView = new Matrix4();
  readonly sun = new Vector3(0, 0, 1);
  texel = 1;

  private camera = new OrthographicCamera(-1, 1, 1, -1, 400, 5600);
  private material = new ShaderMaterial({ vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, side: DoubleSide, colorWrite: false });
  private anchor = new Vector3();
  private east = new Vector3();
  private north = new Vector3();
  readonly up = new Vector3(0, 0, 1);
  private right = new Vector3();
  private top = new Vector3();
  private centre = new Vector3(Infinity, 0, 0);
  private extent = 0;
  private drawn = -1;
  private tmp = new Vector3();
  private m = new Matrix4();

  constructor() {
    const depth = new DepthTexture(SHADOW_SIZE, SHADOW_SIZE, UnsignedIntType);
    this.target = new WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthTexture: depth });
    this.camera.matrixAutoUpdate = false;
  }

  frame(target: Vector3, range: number, south: boolean): void {
    if (this.anchor.distanceTo(target) > REFRAME || this.extent === 0) {
      this.anchor.copy(target);
      this.up.copy(target).normalize();
      enuFrame(this.up, this.east, this.north);
      this.sun
        .set(0, 0, 0)
        .addScaledVector(this.east, SUN_ENU[0])
        .addScaledVector(this.north, south ? -SUN_ENU[1] : SUN_ENU[1])
        .addScaledVector(this.up, SUN_ENU[2])
        .normalize();
      this.top.crossVectors(this.sun, this.east).normalize();
      this.right.crossVectors(this.top, this.sun).normalize();
      this.centre.x = Infinity;
    }
    const want = range * 1.15;
    const extent = EXTENTS.find((e) => e >= want) ?? EXTENTS[EXTENTS.length - 1];
    const texel = (2 * extent) / SHADOW_SIZE;
    const a = Math.round(target.dot(this.right) / texel) * texel;
    const b = Math.round(target.dot(this.top) / texel) * texel;
    const c = target.dot(this.sun);
    this.tmp.set(0, 0, 0).addScaledVector(this.right, a).addScaledVector(this.top, b).addScaledVector(this.sun, c);
    if (extent === this.extent && this.tmp.distanceToSquared(this.centre) < 1e-6) return;
    this.extent = extent;
    this.texel = texel;
    this.centre.copy(this.tmp);
    this.drawn = -1;
    const cam = this.camera;
    cam.left = cam.bottom = -extent;
    cam.right = cam.top = extent;
    cam.updateProjectionMatrix();
    this.tmp.copy(this.centre).addScaledVector(this.sun, DISTANCE);
    cam.matrixWorld.makeBasis(this.right, this.top, this.sun).setPosition(this.tmp);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  }

  render(renderer: WebGLRenderer, scene: Scene, version: number, view: PerspectiveCamera): void {
    if (version !== this.drawn) {
      this.drawn = version;
      const previous = renderer.getRenderTarget();
      scene.overrideMaterial = this.material;
      renderer.setRenderTarget(this.target);
      renderer.clear();
      renderer.render(scene, this.camera);
      renderer.setRenderTarget(previous);
      scene.overrideMaterial = null;
    }
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.fromView.multiplyMatrices(this.m, view.matrixWorld);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
