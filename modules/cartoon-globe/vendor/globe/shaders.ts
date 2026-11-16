export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uCamPos;
uniform vec4 uAtmo;
const float EARTH_R = 6378137.0;
const int ATMO_STEPS = 8;

float atmoDepth(vec3 cam, vec3 dir, float tMax) {
  float ra = EARTH_R + uAtmo.y;
  float b = dot(cam, dir);
  float c = dot(cam, cam) - ra * ra;
  float disc = b * b - c;
  if (disc <= 0.0) return 0.0;
  float s = sqrt(disc);
  float t0 = max(0.0, -b - s);
  float t1 = min(tMax, -b + s);
  if (t1 <= t0) return 0.0;
  float dt = (t1 - t0) / float(ATMO_STEPS);
  float od = 0.0;
  for (int i = 0; i < ATMO_STEPS; i++) {
    vec3 p = cam + dir * (t0 + (float(i) + 0.5) * dt);
    od += exp(-max(length(p) - EARTH_R, 0.0) / uAtmo.x);
  }
  return od * dt;
}

float fogTo(vec3 viewPos) {
  vec3 rel = (vec4(viewPos, 0.0) * viewMatrix).xyz;
  float len = length(rel);
  return 1.0 - exp(-atmoDepth(uCamPos, rel / max(len, 1e-3), len) * uAtmo.z);
}
`;

export const HAZE_COLOR = "vec3(0.70, 0.82, 0.97)";

export const TERRAIN_VERT = /* glsl */ `
attribute float shade;
uniform vec4 uUv;
uniform vec4 uOv;
varying vec2 vUv;
varying vec2 vOv;
varying float vShade;
varying float vFog;
${ATMOSPHERE_GLSL}
void main() {
  vUv = uUv.xy + uv * uUv.zw;
  vOv = uOv.xy + uv * uOv.zw;
  vShade = shade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFog = fogTo(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const TERRAIN_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uOverlay;
uniform float uHasOverlay;
uniform float uShade;
varying vec2 vUv;
varying vec2 vOv;
varying float vShade;
varying float vFog;
void main() {
  vec3 col = texture2D(uMap, vUv).rgb;
  col *= mix(1.0, vShade, uShade);
  if (uHasOverlay > 0.5) {
    vec4 o = texture2D(uOverlay, vOv);
    col = col * (1.0 - o.a) + o.rgb;
  }
  col = mix(col, ${HAZE_COLOR}, vFog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SKY_VERT = /* glsl */ `
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
varying vec3 vDir;
void main() {
  vDir = uForward + uRight * position.x + uUp * position.y;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${ATMOSPHERE_GLSL}
void main() {
  vec3 dir = normalize(vDir);
  float b = dot(uCamPos, dir);
  float c = dot(uCamPos, uCamPos) - EARTH_R * EARTH_R;
  float disc = b * b - c;
  float tMax = 1e12;
  if (disc > 0.0 && b < 0.0 && c > 0.0) tMax = -b - sqrt(disc);
  float od = atmoDepth(uCamPos, dir, tMax) * uAtmo.w;
  float alpha = 1.0 - exp(-od);
  vec3 col = mix(vec3(0.16, 0.38, 0.88), ${HAZE_COLOR}, 1.0 - exp(-od * 0.22));
  gl_FragColor = vec4(col, alpha);
}
`;

export const BUILDING_VERT = /* glsl */ `
attribute vec3 color;
attribute vec4 info;
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vInfo;
varying float vFog;
${ATMOSPHERE_GLSL}
void main() {
  vUv = uv;
  vColor = color;
  vInfo = info;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFog = fogTo(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const BUILDING_FRAG = /* glsl */ `
uniform sampler2D uRoof;
uniform float uHasRoof;
uniform float uFade;
uniform float uToon;
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vInfo;
varying float vFog;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float shade = vInfo.x;
  float height = vInfo.z;
  float seed = vInfo.w;
  vec3 col;
  if (uToon > 0.5) {
    float pick = floor(seed * 6.0);
    vec3 pastel = pick < 1.0 ? vec3(1.0, 0.93, 0.8) : pick < 2.0 ? vec3(1.0, 0.82, 0.72) : pick < 3.0 ? vec3(0.78, 0.93, 0.84)
      : pick < 4.0 ? vec3(0.78, 0.88, 0.98) : pick < 5.0 ? vec3(0.88, 0.84, 0.97) : vec3(1.0, 0.95, 0.7);
    vec3 base = mix(vColor, pastel, 0.8);
    if (vInfo.y < 0.5) {
      col = base * 0.9 + 0.1;
    } else {
      float floors = max(1.0, floor(height / 3.6));
      vec2 cell = vec2(vUv.x / 3.4, vUv.y * floors / height);
      vec2 f = fract(cell);
      float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.78) * step(0.0, vUv.y);
      win = mix(win, 0.25, smoothstep(0.06, 0.22, max(fwidth(cell.x), fwidth(cell.y))));
      float tone = shade > 0.84 ? 0.98 : shade > 0.68 ? 0.84 : 0.7;
      col = mix(base, vec3(0.5, 0.74, 0.95), win) * tone;
    }
  } else if (vInfo.y < 0.5) {
    col = uHasRoof > 0.5 ? texture2D(uRoof, vUv).rgb : vColor * 0.82;
    col *= shade;
  } else {
    float floors = max(1.0, floor(height / 3.2));
    float floorH = height / floors;
    float bay = 2.6 + 1.4 * hash(vec2(seed, 7.0));
    vec2 cell = vec2(vUv.x / bay, vUv.y / floorH);
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    float wx = smoothstep(0.16, 0.2, f.x) * (1.0 - smoothstep(0.8, 0.84, f.x));
    float wy = smoothstep(0.26, 0.31, f.y) * (1.0 - smoothstep(0.78, 0.83, f.y));
    float win = wx * wy;
    float far = smoothstep(0.1, 0.4, max(fwidth(cell.x), fwidth(cell.y)));
    win = mix(win, 0.3, far) * step(0.0, vUv.y);
    float r = hash(id + seed * 13.0);
    vec3 glass = mix(vec3(0.09, 0.12, 0.17), vec3(0.42, 0.52, 0.62), mix(r * r, 0.3, far));
    vec3 wall = vColor * (0.94 + 0.06 * mix(hash(vec2(id.y, seed)), 0.5, far));
    wall *= 1.0 - 0.1 * smoothstep(0.9, 1.0, f.y) * (1.0 - far);
    col = mix(wall, glass, win * 0.9) * shade;
    col *= mix(0.72, 1.0, smoothstep(-1.0, 7.0, vUv.y));
  }
  col = mix(col, ${HAZE_COLOR}, vFog);
  gl_FragColor = vec4(col, uFade);
}
`;
