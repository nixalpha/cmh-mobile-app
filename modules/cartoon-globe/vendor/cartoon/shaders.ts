import { ATMOSPHERE_GLSL, HAZE_COLOR } from "../globe/shaders";

export const AMBIENT_RGB = [0.79, 0.8, 0.84];
export const SUNLIGHT_RGB = [0.33, 0.31, 0.25];
export const SUN_ENU = [0.42, -0.5, 0.78];
const AMBIENT = `vec3(${AMBIENT_RGB.map((v) => v.toFixed(3)).join(", ")})`;
const SUNLIGHT = `vec3(${SUNLIGHT_RGB.map((v) => v.toFixed(3)).join(", ")})`;

const LIGHT_GLSL = /* glsl */ `
uniform vec3 uSunView;
vec3 lit(vec3 albedo, vec3 n, float wrap) {
  float ndl = dot(n, uSunView);
  float d = clamp(mix(ndl, ndl * 0.5 + 0.5, wrap), 0.0, 1.0);
  return albedo * (${AMBIENT} + ${SUNLIGHT} * d);
}
`;

export const BUILDING_VERT = /* glsl */ `
attribute vec4 color;
attribute vec4 wall;
attribute vec4 normal4;
varying vec3 vColor;
varying float vKind;
varying float vSeed;
varying vec4 vWall;
varying vec3 vNormal;
varying float vFog;
${ATMOSPHERE_GLSL}
void main() {
  vColor = color.rgb;
  vKind = color.a * 255.0;
  vSeed = normal4.w * 127.0;
  vWall = wall;
  vNormal = normalMatrix * normal4.xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFog = fogTo(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const BUILDING_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vKind;
varying float vSeed;
varying vec4 vWall;
varying vec3 vNormal;
varying float vFog;
${LIGHT_GLSL}

const vec3 TRIM = vec3(0.973, 0.965, 0.945);
const vec3 GLASS = vec3(0.40, 0.63, 0.86);
const vec3 GLASS_HI = vec3(0.62, 0.80, 0.95);

float box(vec2 p, vec2 size) {
  vec2 d = abs(p) - size;
  return max(d.x, d.y);
}

void main() {
  vec3 col = vColor;
  float len = vWall.y;
  float height = vWall.w;
  if (vKind < 3.5 && len > 0.0) {
    float u = vWall.x;
    float v = vWall.z;
    float r = fract(vSeed * 0.37);
    float tower = step(1.5, vKind);
    float block = step(0.5, vKind) * (1.0 - tower);
    float bayW = mix(mix(3.0 + 0.8 * r, 3.4, block), 2.8, tower);
    float floorH = mix(mix(3.2, 3.5, block), 3.9, tower);
    float bays = floor(len / bayW + 0.4);
    float floors = max(1.0, floor(height / floorH + 0.35));
    float cellW = len / max(bays, 1.0);
    float cellH = height / floors;
    vec2 cell = vec2(u / cellW, v / cellH);
    vec2 p = (fract(cell) - vec2(0.5, 0.52)) * vec2(cellW, cellH);
    vec2 pane = mix(vec2(min(0.68, cellW * 0.23), min(0.95, cellH * 0.29)), vec2(cellW * 0.5 - 0.22, cellH * 0.5 - 0.55), tower);
    float frame = mix(0.15, 0.0, tower);
    float px = max(fwidth(u), fwidth(v));
    float dPane = box(p, pane);
    float dFrame = box(p, pane + frame);
    float inPane = 1.0 - smoothstep(-px, px, dPane);
    float inFrame = 1.0 - smoothstep(-px, px, dFrame);
    float open = step(0.5, bays) * step(0.0, v) * step(v, height) * step(0.9, cellW);
    vec3 glass = mix(GLASS, GLASS_HI, smoothstep(-0.2, 0.9, p.y / max(pane.y, 0.01) - p.x / max(pane.x, 0.01) * 0.6));
    vec3 near = mix(col, TRIM, inFrame * open);
    near = mix(near, glass, inPane * open);
    float cover = open * (pane.x * pane.y * 4.0) / (cellW * cellH);
    float coverFrame = open * ((pane.x + frame) * (pane.y + frame) * 4.0) / (cellW * cellH) - cover;
    vec3 far = mix(mix(col, TRIM, coverFrame), mix(GLASS, GLASS_HI, 0.4), cover);
    col = mix(near, far, smoothstep(0.25, 0.9, px / max(pane.x, 0.05)));
    float band = smoothstep(height - 0.5 - px, height - 0.5 + px, v);
    float corner = (1.0 - tower) * step(0.5, fract(vSeed * 0.61)) * step(6.0, len) * (1.0 - smoothstep(0.24 - px, 0.24 + px, min(u, len - u)));
    col = mix(col, TRIM, max(band * (1.0 - tower * 0.6), corner * step(0.0, v)));
    col *= mix(0.82, 1.0, smoothstep(-0.5, 4.5, v));
    col *= 1.0 - 0.07 * (1.0 - smoothstep(0.35, 0.45 + px, v)) * step(0.0, v);
  }
  else if (vKind < 4.5 && len > 0.0) {
    float s = len / max(1.0, floor(len / 7.0 + 0.5));
    vec2 q = vec2(vWall.x, vWall.z) / s;
    vec2 f = fract(q);
    float px = max(fwidth(q.x), fwidth(q.y));
    float strut = min(min(abs(f.x - f.y), abs(f.x + f.y - 1.0)) * 0.7071, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float solid = 1.0 - smoothstep(0.1 - px, 0.1 + px, strut);
    float far = smoothstep(0.12, 0.5, px);
    if (max(solid, far) < 0.5) discard;
    col *= mix(1.0, 0.84, far * (1.0 - solid));
  }
  col = lit(col, normalize(vNormal), 0.25);
  col = mix(col, ${HAZE_COLOR}, vFog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const TREE_VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vNormal;
varying float vFog;
${ATMOSPHERE_GLSL}
void main() {
  vec4 local = instanceMatrix * vec4(position, 1.0);
  float h = fract(sin(dot(instanceMatrix[3].xy, vec2(12.9898, 78.233))) * 43758.5453);
  vColor = color * (0.9 + 0.2 * h) * vec3(1.0 + 0.08 * fract(h * 7.0), 1.0, 1.0 - 0.1 * fract(h * 13.0));
  vNormal = normalMatrix * normalize(mat3(instanceMatrix) * normal);
  vec4 mv = modelViewMatrix * local;
  vFog = fogTo(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const TREE_FRAG = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying float vFog;
${LIGHT_GLSL}
void main() {
  vec3 col = lit(vColor, normalize(vNormal), 0.6);
  col = mix(col, ${HAZE_COLOR}, vFog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const DEPTH_VERT = /* glsl */ `
void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  local = instanceMatrix * local;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}
`;

export const DEPTH_FRAG = /* glsl */ `
void main() {
  gl_FragColor = vec4(1.0);
}
`;

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tShadow;
uniform vec2 uTexel;
uniform vec2 uPixel;
uniform float uNear;
uniform float uFar;
uniform float uPaint;
uniform float uCity;
uniform float uShadowTexel;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform mat4 uShadowFromView;
uniform vec3 uSunView;
uniform vec3 uUpView;
varying vec2 vUv;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

float inverseDepth(float d) {
  return (uFar + uNear - (2.0 * d - 1.0) * (uFar - uNear)) / (2.0 * uNear * uFar);
}

float depthAt(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d < 1.0) return d;
  vec2 ex = vec2(uTexel.x * 4.0, 0.0);
  vec2 ey = vec2(0.0, uTexel.y * 4.0);
  float l = texture2D(tDepth, uv - ex).x;
  float r = texture2D(tDepth, uv + ex).x;
  float u = texture2D(tDepth, uv + ey).x;
  float b = texture2D(tDepth, uv - ey).x;
  if (l < 1.0 && r < 1.0) return max(l, r);
  if (u < 1.0 && b < 1.0) return max(u, b);
  return d;
}

float morph(vec2 uv, float far) {
  vec2 ex = vec2(uTexel.x, 0.0);
  vec2 ey = vec2(0.0, uTexel.y);
  float s = far > 0.5 ? -1.0 : 1.0;
  float d = texture2D(tDepth, uv).x * s;
  for (int i = 1; i <= 3; i++) {
    float k = float(i);
    d = min(d, texture2D(tDepth, uv - ex * k).x * s);
    d = min(d, texture2D(tDepth, uv + ex * k).x * s);
    d = min(d, texture2D(tDepth, uv - ey * k).x * s);
    d = min(d, texture2D(tDepth, uv + ey * k).x * s);
  }
  return d * s;
}

float lapOf(vec2 uv, float far) {
  vec2 e = uTexel * 1.25;
  float w = inverseDepth(morph(uv, far));
  return (abs(inverseDepth(morph(uv - vec2(e.x, 0.0), far)) + inverseDepth(morph(uv + vec2(e.x, 0.0), far)) - 2.0 * w) + abs(inverseDepth(morph(uv + vec2(0.0, e.y), far)) + inverseDepth(morph(uv - vec2(0.0, e.y), far)) - 2.0 * w)) / w;
}

vec3 viewPos(vec2 uv, float d) {
  vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}

vec3 paint(vec2 uv) {
  vec3 best = vec3(0.0);
  float bestVar = 1e9;
  for (int q = 0; q < 4; q++) {
    vec2 dir = vec2(q == 0 || q == 2 ? -1.0 : 1.0, q < 2 ? -1.0 : 1.0);
    vec3 sum = vec3(0.0);
    vec3 sq = vec3(0.0);
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 3; i++) {
        vec3 c = texture2D(tColor, uv + dir * vec2(float(i), float(j)) * uTexel * 1.5).rgb;
        sum += c;
        sq += c * c;
      }
    }
    vec3 mean = sum / 9.0;
    float variance = dot(sq / 9.0 - mean * mean, vec3(1.0));
    if (variance < bestVar) {
      bestVar = variance;
      best = mean;
    }
  }
  return best;
}

float noise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float shadowAt(vec3 pos, vec3 n, float spin) {
  vec4 s = uShadowFromView * vec4(pos + n * (uShadowTexel * 1.6 + 0.12) + uSunView * 0.1, 1.0);
  vec3 c = s.xyz * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 0.0;
  float fade = smoothstep(0.5, 0.42, max(abs(c.x - 0.5), abs(c.y - 0.5)));
  float sum = 0.0;
  float a = spin * 6.2831853;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float rr = sqrt((fi + 0.5) / 12.0) * 2.6;
    float th = fi * 2.3999632;
    vec2 o = rot * vec2(cos(th), sin(th)) * rr / 2048.0;
    sum += step(texture2D(tShadow, c.xy + o).x, c.z - 0.0006);
  }
  return fade * sum / 12.0;
}

void main() {
  float d = depthAt(vUv);
  vec3 src = texture2D(tColor, vUv).rgb;
  vec3 col = src;
  bool sky = d >= 1.0;

  if (uCity > 0.001 && !sky) {
    vec3 p = viewPos(vUv, d);
    vec2 ex = vec2(uPixel.x, 0.0);
    vec2 ey = vec2(0.0, uPixel.y);
    vec3 pl = viewPos(vUv - ex, texture2D(tDepth, vUv - ex).x);
    vec3 pr = viewPos(vUv + ex, texture2D(tDepth, vUv + ex).x);
    vec3 pd = viewPos(vUv - ey, texture2D(tDepth, vUv - ey).x);
    vec3 pu = viewPos(vUv + ey, texture2D(tDepth, vUv + ey).x);
    vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
    vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
    vec3 n = normalize(cross(dx, dy));
    float ndl = mix(max(dot(n, uSunView), 0.0), dot(uUpView, uSunView), smoothstep(0.55, 0.85, dot(n, uUpView)));
    float spin = noise(gl_FragCoord.xy);
    float sh = shadowAt(p, n, spin);
    vec3 ratio = ${AMBIENT} / (${AMBIENT} + ${SUNLIGHT} * ndl);

    float radius = clamp(-p.z * 0.02, 1.2, 9.0);
    float occ = 0.0;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      float th = (fi + spin) * 2.3999632;
      float rr = sqrt((fi + 0.5) / 10.0);
      vec3 t = normalize(cross(n, vec3(0.3, 0.9, 0.1)));
      vec3 b = cross(n, t);
      float up = 0.25 + 0.75 * fract(fi * 0.618 + spin);
      vec3 q = p + (t * cos(th) * rr + b * sin(th) * rr + n * up) * radius * mix(0.35, 1.0, fract(fi * 0.37 + spin));
      vec4 clip = uProj * vec4(q, 1.0);
      vec2 quv = clip.xy / clip.w * 0.5 + 0.5;
      float sd = texture2D(tDepth, quv).x;
      float sz = viewPos(quv, sd).z;
      float range = smoothstep(0.0, 1.0, radius / max(abs(p.z - sz), 1e-3));
      occ += step(q.z + radius * 0.04, sz) * range;
    }
    float ao = 1.0 - 0.55 * occ / 10.0 * smoothstep(2.0, 7.0, radius * uProj[1][1] / (-p.z * 2.0 * uPixel.y));
    vec3 shaded = col * mix(vec3(1.0), ratio, sh) * mix(vec3(0.66, 0.66, 0.74), vec3(1.0), ao);
    col = mix(col, shaded, uCity);
  }

  if (uPaint > 0.001) {
    float dl = depthAt(vUv - vec2(uTexel.x * 1.25, 0.0));
    float dr = depthAt(vUv + vec2(uTexel.x * 1.25, 0.0));
    float du = depthAt(vUv + vec2(0.0, uTexel.y * 1.25));
    float dd = depthAt(vUv - vec2(0.0, uTexel.y * 1.25));
    bool nearSky = dl >= 1.0 || dr >= 1.0 || du >= 1.0 || dd >= 1.0;
    vec3 toon;
    float edge = 0.0;
    if (sky) {
      toon = mix(vec3(dot(src, LUMA)), src, 1.25);
      edge = dl < 1.0 || dr < 1.0 || du < 1.0 || dd < 1.0 ? 1.0 : 0.0;
    } else {
      toon = pow(paint(vUv), vec3(0.86));
      float l = dot(toon, LUMA);
      toon = mix(vec3(l), toon, 1.5);
      float q = l * 6.0;
      float banded = (floor(q) + smoothstep(0.3, 0.7, fract(q))) / 6.0;
      toon *= (banded + 0.05) / (l + 0.05);
      toon = toon * 1.05 + 0.025;
      if (nearSky) {
        edge = 1.0;
      } else {
        float w = inverseDepth(d);
        float lap = abs(inverseDepth(dl) + inverseDepth(dr) - 2.0 * w) + abs(inverseDepth(du) + inverseDepth(dd) - 2.0 * w);
        float threshold = 0.012 + 1.5e-6 / (w * uNear);
        edge = smoothstep(threshold, threshold * 2.2, lap / w);
        if (edge > 0.01) edge = min(edge, min(smoothstep(threshold, threshold * 2.2, lapOf(vUv, 0.0)), smoothstep(threshold, threshold * 2.2, lapOf(vUv, 1.0))));
      }
    }
    toon = mix(toon, toon * 0.18 + vec3(0.02, 0.02, 0.06), edge * 0.85);
    col = mix(col, toon, uPaint);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
