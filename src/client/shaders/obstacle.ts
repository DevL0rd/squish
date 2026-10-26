import { noise } from './noise.ts';

export const MAX_OBSTACLE_POINTS = 48;

export const obstacleVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
uniform vec2 uCamera;
uniform vec2 uView;
uniform vec2 uCenter;
uniform float uAngle;
uniform float uExtent;
out vec2 vLocal;
void main() {
  vec2 local = aCorner * uExtent;
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 world = uCenter + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  gl_Position = vec4((world - uCamera) / (uView * 0.5), 0.0, 1.0);
  vLocal = local;
}`;

export const obstacleFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
out vec4 outColor;
uniform sampler2D uBackground;
uniform vec2 uResolution;
uniform vec2 uView;
uniform vec2 uShape[${MAX_OBSTACLE_POINTS}];
uniform int uCount;
uniform float uKind;
uniform float uSeed;
uniform float uReach;
uniform float uAngle;
${noise}

const vec2 SHEAR = vec2(-0.6, 0.8);

float polygonDistance(vec2 p) {
  float best = 1e9;
  bool inside = false;
  for (int i = 0; i < ${MAX_OBSTACLE_POINTS}; i++) {
    if (i >= uCount) break;
    vec2 a = uShape[i];
    vec2 b = uShape[i + 1 == uCount ? 0 : i + 1];
    vec2 e = b - a;
    vec2 w = p - a;
    vec2 q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    best = min(best, dot(q, q));
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return sqrt(best) * (inside ? -1.0 : 1.0);
}

vec3 refracted(vec2 offset) {
  vec2 uv = gl_FragCoord.xy / uResolution;
  return texture(uBackground, clamp(uv + offset, vec2(0.0), vec2(1.0))).rgb;
}

vec2 screenDirection(vec2 local) {
  float c = cos(uAngle);
  float s = sin(uAngle);
  return vec2(local.x * c - local.y * s, local.x * s + local.y * c);
}

vec4 grain(vec2 p, float d, vec2 normal, float pixel) {
  float depth = clamp(-d / (uReach * 0.45), 0.0, 1.0);
  float lens = sqrt(1.0 - (1.0 - depth) * (1.0 - depth));
  vec2 ripple = vec2(fbm(p * 0.01 + uSeed), fbm(p * 0.01 - uSeed)) - 0.5;
  vec2 magnify = -screenDirection(p / uReach) * 0.035 * lens;
  vec2 bend = -screenDirection(normal) * (1.0 - lens) * 0.03 + screenDirection(ripple) * 0.008;
  vec3 back = refracted(magnify + bend);
  float flaw = smoothstep(0.012, 0.0, abs(fbm(p * 0.008 + uSeed * 3.0) - 0.5)) * smoothstep(0.15, 0.5, depth);
  float speck = smoothstep(0.06, 0.02, cellular(p * 0.035 + uSeed * 7.0)) * step(0.82, hash21(floor(p * 0.035 + uSeed * 7.0)));
  float relief = dot(screenDirection(normal), SHEAR) * (1.0 - lens) + dot(ripple, SHEAR) * 0.25;
  vec3 col = back * vec3(1.0, 0.97, 0.9) * (0.75 + 0.55 * lens);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.35, depth));
  col += vec3(0.9, 0.95, 0.92) * (relief * 0.14 + flaw * 0.035);
  col *= 1.0 - speck * 0.4;
  float light = dot(screenDirection(normal), SHEAR) * (1.0 - lens);
  col *= 0.85 + 0.4 * light;
  col += vec3(0.75, 0.82, 0.8) * smoothstep(0.4, 0.0, depth) * max(light, 0.0) * 0.22;
  float sheen = smoothstep(0.55, 0.0, length(p / uReach - vec2(-0.25, 0.3)));
  col += vec3(0.85, 0.92, 0.9) * sheen * 0.08;
  return vec4(col, 0.96 * smoothstep(0.0, pixel * 2.0, -d));
}

vec4 fiber(vec2 p, float d, vec2 normal, float pixel) {
  float across = clamp(-d / 30.0, 0.0, 1.0);
  float striae = 0.5 + 0.5 * sin(p.y * 0.9 + fbm(p * vec2(0.01, 0.2)) * 3.0);
  float pits = smoothstep(0.25, 0.12, cellular(p * vec2(0.03, 0.12) + uSeed));
  float twist = 0.5 + 0.5 * cos(p.x * 0.012 + uSeed);
  vec3 back = refracted(-screenDirection(normal) * (1.0 - across) * 0.01);
  vec3 col = back * 0.7 + vec3(0.32, 0.31, 0.25) * (0.5 + 0.5 * twist) * (0.6 + 0.4 * striae);
  col += vec3(0.9, 0.92, 0.85) * pits * 0.12;
  float light = dot(screenDirection(normal), SHEAR) * (1.0 - across);
  col *= 0.8 + 0.35 * light;
  col += vec3(0.9, 0.95, 0.9) * smoothstep(0.35, 0.0, abs(across - 0.55)) * 0.06;
  return vec4(col, 0.88 * smoothstep(0.0, pixel * 2.0, -d));
}

vec4 bubble(vec2 p, float d, float pixel) {
  float r = length(p) / uReach;
  float z = sqrt(max(0.0, 1.0 - r * r));
  vec3 back = refracted(-screenDirection(p / uReach) * 0.04 * (1.0 - z));
  float shade = smoothstep(0.0, 0.85, z);
  vec3 col = mix(vec3(0.01, 0.014, 0.014), back * 1.2 + vec3(0.03), shade);
  vec2 lightDir = normalize(vec2(-0.5, 0.6));
  float facing = dot(p / uReach, lightDir);
  col += vec3(0.8, 0.92, 0.9) * smoothstep(0.25, 0.0, length(p / uReach - lightDir * 0.35)) * 0.4;
  col += vec3(0.5, 0.65, 0.62) * smoothstep(0.4, 0.95, -facing) * (1.0 - z) * 0.18;
  return vec4(col, mix(0.97, 0.6, shade) * smoothstep(0.0, pixel * 2.0, -d));
}

void main() {
  float pixel = uView.y / uResolution.y;
  float d = polygonDistance(vLocal);
  if (d > 0.0) discard;
  vec2 eps = vec2(1.5, 0.0);
  vec2 normal = normalize(vec2(polygonDistance(vLocal + eps.xy) - polygonDistance(vLocal - eps.xy), polygonDistance(vLocal + eps.yx) - polygonDistance(vLocal - eps.yx)) + 1e-6);
  if (uKind < 0.5) outColor = grain(vLocal, d, normal, pixel);
  else if (uKind < 1.5) outColor = fiber(vLocal, d, normal, pixel);
  else outColor = bubble(vLocal, d, pixel);
}`;
