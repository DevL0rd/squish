import { lighting } from './lighting.ts';
import { noise } from './noise.ts';

export const MAX_RENDER_POINTS = 128;

export const cellVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
uniform vec2 uCamera;
uniform vec2 uView;
uniform vec2 uCenter;
uniform float uExtent;
out vec2 vWorld;
void main() {
  vec2 world = uCenter + aCorner * uExtent;
  gl_Position = vec4((world - uCamera) / (uView * 0.5), 0.0, 1.0);
  vWorld = world;
}`;

export const cellFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
out vec4 outColor;
uniform sampler2D uBackground;
uniform sampler2D uInterior;
uniform vec2 uResolution;
uniform vec2 uView;
uniform vec2 uPoints[${MAX_RENDER_POINTS}];
uniform int uCount;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uScale;
uniform vec3 uColor;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
${noise}
${lighting}

const vec2 SHEAR = vec2(-0.6, 0.8);
const int COARSE = 8;
const int WINDOW = 14;

vec2 point(int index) {
  return uPoints[(index + uCount * 4) % uCount];
}

int coarseNearest(vec2 p) {
  int best = 0;
  float bestDistance = 1e12;
  for (int i = 0; i < ${MAX_RENDER_POINTS}; i += COARSE) {
    if (i >= uCount) break;
    vec2 offset = p - uPoints[i];
    float d = dot(offset, offset);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

void edgeField(vec2 p, out float dist, out vec2 normal, out float along) {
  int center = coarseNearest(p);
  float best = 1e12;
  vec2 nearest = point(center);
  normal = vec2(0.0, 1.0);
  along = float(center);
  for (int k = -WINDOW; k < WINDOW; k++) {
    vec2 a = point(center + k);
    vec2 e = point(center + k + 1) - a;
    float t = clamp(dot(p - a, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
    vec2 q = a + e * t;
    float d = dot(p - q, p - q);
    if (d < best) {
      best = d;
      nearest = q;
      normal = normalize(vec2(e.y, -e.x) + 1e-6);
      along = float(center + k) + t;
    }
  }
  dist = sqrt(best) * (dot(p - nearest, normal) > 0.0 ? -1.0 : 1.0);
}

vec4 halo(float depth, float pixel) {
  float glow = exp(depth / (pixel * 4.0 + uRadius * 0.04));
  if (glow < 0.004) discard;
  vec3 tint = mix(vec3(0.72, 0.95, 0.9), uColor, 0.45);
  return vec4(tint * 0.6, glow * 0.2 * uOpacity);
}

void main() {
  float pixel = uView.y / uResolution.y;
  float dist;
  vec2 normal;
  float along;
  edgeField(vWorld, dist, normal, along);
  float ruffle = (fbm(vec2(along * 0.45 + uSeed, uTime * 0.22 + uSeed * 3.1)) - 0.5) * min(uRadius * 0.05, 2.4);
  float depth = dist + ruffle;
  if (depth < 0.0) {
    outColor = halo(depth, pixel);
    return;
  }
  float s = clamp(depth / (uRadius * 0.55), 0.0, 1.0);
  float height = sqrt(1.0 - (1.0 - s) * (1.0 - s));
  float slope = min((1.0 - s) / max(height, 0.08), 6.0);
  vec3 surface = normalize(vec3(normal * slope * 0.45, 1.0));
  float relief = dot(surface.xy, SHEAR);
  float hyaline = smoothstep(uRadius * 0.05, uRadius * 0.17, depth);

  vec2 local = (vWorld - uCenter) / uScale;
  vec2 drift = vec2(fbm(local * 2.4 + uSeed + uTime * 0.05), fbm(local * 2.4 - uSeed - uTime * 0.04)) - 0.5;
  vec3 dye = texture(uInterior, clamp(local * 0.5 + 0.5 + drift * 0.05, vec2(0.01), vec2(0.99))).rgb;

  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec2 bend = surface.xy * height * 0.006 + surface.xy * (1.0 - hyaline) * 0.004;
  vec3 back = vec3(
    texture(uBackground, clamp(screenUv - bend * 1.08, vec2(0.0), vec2(1.0))).r,
    texture(uBackground, clamp(screenUv - bend, vec2(0.0), vec2(1.0))).g,
    texture(uBackground, clamp(screenUv - bend * 0.92, vec2(0.0), vec2(1.0))).b
  );

  vec2 grainUv = vWorld * 0.42 + drift * 6.0 + vec2(uTime * 0.6, -uTime * 0.4);
  float grain = fbm(grainUv * 0.5);
  float speckle = smoothstep(0.7, 0.92, vnoise(grainUv * 1.7)) * hyaline;

  vec3 col = back * exp(-dye * (0.6 + 0.8 * height)) * (0.8 + 0.2 * height);
  vec3 scatter = 1.0 - exp(-dye * 2.6);
  vec3 lightNormal = normalize(vec3(-normal * slope * 0.45, 1.0));
  col += shade(scatter * mix(0.45, 0.8, hyaline), lightNormal, height, vWorld, 1.0) * (0.22 + 0.5 * height);
  col += uColor * 0.018 * height;
  col += (grain - 0.5) * 0.06 * hyaline * (0.4 + scatter);
  col += vec3(0.85, 0.95, 0.9) * speckle * 0.05;

  float inner = depth / pixel;
  float line = exp(-pow((inner - 0.9) / 0.85, 2.0));
  float cortex = exp(-pow((inner - 3.4) / 1.4, 2.0));
  vec3 membrane = mix(vec3(0.8, 0.96, 0.92), uColor * 1.3, 0.3);
  col += membrane * (line * 0.55 + cortex * 0.1) * (0.75 + 0.35 * relief);

  float alpha = mix(0.35, 0.95, clamp(inner / 1.4, 0.0, 1.0)) * uOpacity;
  outColor = vec4(col, alpha);
}`;
