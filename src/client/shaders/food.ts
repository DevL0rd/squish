import { lighting } from './lighting.ts';
import { noise } from './noise.ts';

export const foodVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBody;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec4 aExtra;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec2 vWorld;
out vec4 vTint;
out float vPhase;
out float vVariety;
void main() {
  vLocal = aCorner;
  vTint = aTint;
  vPhase = aBody.w;
  vVariety = aExtra.x;
  vec2 world = aBody.xy + aCorner * aBody.z;
  vWorld = world;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const foodFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vWorld;
in vec4 vTint;
in float vPhase;
in float vVariety;
out vec4 outColor;
uniform float uTime;
${noise}
${lighting}

struct Shape {
  float d;
  vec3 color;
  float opacity;
};

vec2 orient(vec2 p, float seed) {
  float turn = seed * 1.71 + uTime * 0.05 * (fract(seed * 3.7) - 0.5);
  return mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p;
}


Shape algae(vec2 p, float seed, vec3 tint) {
  vec2 q = p;
  q.x /= 0.8 + 0.4 * fract(seed * 0.618 + 0.17);
  float angle = atan(q.y, q.x);
  float shape = 0.46 + 0.025 * sin(angle * 3.0 + seed * 9.0) + 0.015 * sin(angle * 5.0 - seed * 4.0);
  float r = clamp(length(q) / shape, 0.0, 1.0);
  vec2 cupDir = vec2(cos(seed * 4.1), sin(seed * 4.1));
  float cup = smoothstep(0.1, 0.25, dot(q / shape, cupDir) + 0.35) * smoothstep(0.98, 0.8, r);
  float pyrenoid = smoothstep(0.16, 0.08, length(q / shape - cupDir * 0.32));
  float grains = smoothstep(0.32, 0.18, cellular(q * 9.0 + seed * 3.0)) * (1.0 - cup) * smoothstep(0.9, 0.5, r);
  vec3 col = mix(vec3(0.14, 0.18, 0.17), tint * 0.25, 0.5);
  col = mix(col, tint * (0.55 + 0.35 * fbm(q * 6.0 + seed)), cup * 0.85);
  col += vec3(0.85, 0.95, 0.9) * (pyrenoid * 0.35 + grains * 0.12);
  return Shape(length(q) - shape, col, 0.85);
}

Shape plant(vec2 p, float seed, vec3 tint) {
  vec2 q = p * vec2(0.85, 1.35);
  float torn = (fbm(p * 5.0 + seed * 2.0) - 0.5) * 0.18;
  float d = max(abs(q.x), abs(q.y)) - 0.62 + torn;
  float cells = cellular(q * vec2(4.0, 7.0) + seed);
  float walls = smoothstep(0.05, 0.0, abs(cells - 0.42));
  float plastids = smoothstep(0.3, 0.18, cellular(q * 16.0 + seed * 5.0)) * step(0.12, cells);
  vec3 col = tint * (0.3 + 0.25 * fbm(q * 3.0 + seed));
  col = mix(col, tint * 0.9 + vec3(0.05, 0.1, 0.02), plastids * 0.6);
  col += vec3(0.75, 0.9, 0.7) * walls * 0.25;
  return Shape(d, col, 0.8);
}

Shape detritus(vec2 p, float seed, vec3 tint) {
  float d = length(p * vec2(1.0, 1.0 + fract(seed) * 0.6)) - 0.5 + (fbm(p * 4.0 + seed * 3.0) - 0.5) * 0.45;
  float fibers = smoothstep(0.55, 0.9, abs(sin(dot(p, vec2(cos(seed), sin(seed))) * 38.0 + fbm(p * 6.0) * 6.0)));
  float specks = smoothstep(0.75, 0.95, vnoise(p * 22.0 + seed));
  vec3 col = tint * (0.35 + 0.35 * fbm(p * 7.0 + seed));
  col = mix(col, tint * 0.6 + 0.08, fibers * 0.4);
  col *= 1.0 - specks * 0.6;
  return Shape(d, col, 0.88);
}

Shape pollen(vec2 p, float seed, vec3 tint) {
  float angle = atan(p.y, p.x);
  float spikes = pow(abs(sin(angle * 9.0 + seed)), 12.0) * 0.07;
  float d = length(p) - 0.42 - spikes;
  float mesh = smoothstep(0.04, 0.0, abs(cellular(p * 9.0 + seed) - 0.38));
  vec2 pore = vec2(cos(seed * 2.0), sin(seed * 2.0)) * 0.22;
  float pores = smoothstep(0.07, 0.04, length(p - pore)) + smoothstep(0.07, 0.04, length(p + pore));
  vec3 col = tint * (0.45 + 0.3 * fbm(p * 5.0 + seed));
  col += vec3(1.0, 0.95, 0.75) * mesh * 0.2;
  col *= 1.0 - pores * 0.5;
  return Shape(d, col, 0.9);
}

Shape vesicle(vec2 p, float seed, vec3 tint) {
  float angle = atan(p.y, p.x);
  float wobble = sin(angle * 3.0 + uTime * 2.4 + seed) * 0.025 + sin(angle * 5.0 - uTime * 1.7) * 0.012;
  float d = length(p) - 0.44 - wobble;
  float r = clamp(length(p) / 0.44, 0.0, 1.0);
  float granules = smoothstep(0.3, 0.16, cellular(p * 10.0 + seed * 4.0 + uTime * 0.3)) * smoothstep(0.85, 0.5, r);
  float membrane = smoothstep(0.55, 1.0, r);
  vec3 col = tint * (0.45 + 0.4 * (1.0 - r * r));
  col += vec3(0.9, 1.0, 0.96) * (granules * 0.18 + membrane * 0.1);
  return Shape(d, col, 0.8);
}

Shape foodShape(vec2 q, float seed, vec3 tint) {
  if (vVariety < 0.5) return algae(q, seed, tint);
  if (vVariety < 1.5) return plant(q, seed, tint);
  if (vVariety < 2.5) return detritus(q, seed, tint);
  if (vVariety < 3.5) return pollen(q, seed, tint);
  return vesicle(q, seed, tint);
}

void main() {
  float seed = vPhase;
  vec2 q = orient(vLocal, seed);
  Shape shape = foodShape(q, seed, vTint.rgb);
  float aa = max(fwidth(shape.d), 0.006);
  float body = smoothstep(aa, -aa, shape.d);
  if (body < 0.003) discard;
  float depth = clamp(-shape.d * 6.0, 0.0, 1.0);
  float thick = sqrt(depth * (2.0 - depth));
  vec2 outward = normalize(vec2(dFdx(shape.d), dFdy(shape.d)) + 1e-6);
  vec2 bump = (vec2(vnoise(q * 14.0 + seed), vnoise(q * 14.0 + seed + 4.7)) - 0.5) * 0.35 * depth;
  vec3 col = shade(shape.color * 1.25, domeNormal(outward, thick, bump), thick, vWorld, 0.7);
  outColor = vec4(col, body * shape.opacity * (0.6 + 0.4 * depth) * vTint.a);
}`;
