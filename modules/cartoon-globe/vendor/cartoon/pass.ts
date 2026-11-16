import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  DepthTexture,
  Matrix4,
  Mesh,
  NearestFilter,
  type PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type Texture,
  UnsignedIntType,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { POST_FRAG, POST_VERT } from "./shaders";

export class CartoonPass {
  readonly target: WebGLRenderTarget;
  private scene = new Scene();
  private camera = new Camera();
  private material: ShaderMaterial;
  private size = new Vector2();

  constructor(shadow: Texture, samples: number) {
    const depth = new DepthTexture(1, 1, UnsignedIntType);
    depth.minFilter = depth.magFilter = NearestFilter;
    this.target = new WebGLRenderTarget(1, 1, { depthTexture: depth, samples });
    this.material = new ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depth },
        tShadow: { value: shadow },
        uTexel: { value: new Vector2() },
        uPixel: { value: new Vector2() },
        uNear: { value: 1 },
        uFar: { value: 2 },
        uPaint: { value: 0 },
        uCity: { value: 0 },
        uShadowTexel: { value: 1 },
        uProj: { value: new Matrix4() },
        uProjInv: { value: new Matrix4() },
        uShadowFromView: { value: new Matrix4() },
        uSunView: { value: new Vector3() },
        uUpView: { value: new Vector3() },
      },
    });
    const tri = new BufferGeometry();
    tri.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new Mesh(tri, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  begin(renderer: WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
    renderer.setRenderTarget(this.target);
  }

  end(renderer: WebGLRenderer, camera: PerspectiveCamera, paint: number, city: number, shadowFromView: Matrix4, shadowTexel: number, sunView: Vector3, upView: Vector3): void {
    const u = this.material.uniforms;
    const ratio = renderer.getPixelRatio();
    u.uTexel.value.set(ratio / this.size.x, ratio / this.size.y);
    u.uPixel.value.set(1 / this.size.x, 1 / this.size.y);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uPaint.value = paint;
    u.uCity.value = city;
    u.uShadowTexel.value = shadowTexel;
    u.uProj.value.copy(camera.projectionMatrix);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uShadowFromView.value.copy(shadowFromView);
    u.uSunView.value.copy(sunView);
    u.uUpView.value.copy(upView);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
