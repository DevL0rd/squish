import { noise } from './noise.ts';

export const organelleVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBody;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec4 aExtra;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vTint;
out float vKind;
out vec2 vExtra;
void main() {
  vec2 world = aBody.xy + aCorner * aBody.z * 1.3;
  gl_Position = vec4((world - uCamera) / (uView * 0.5), 0.0, 1.0);
  vLocal = aCorner * 1.3;
  vTint = aTint;
  vKind = aBody.w;
  vExtra = aExtra.xy;
}`;

export const organelleFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
in float vKind;
in vec2 vExtra;
out vec4 outColor;
uniform float uTime;
${noise}

const vec2 SHEAR = vec2(-0.6, 0.8);

float ring(float r, float at, float width) {
  return exp(-pow((r - at) / width, 2.0));
}

vec4 nucleus(vec2 p, float r, float relief) {
  float seed = vExtra.x;
  float chromatin = fbm(p * 3.6 + seed * 5.0 + uTime * 0.02);
  float clumps = smoothstep(0.55, 0.8, vnoise(p * 7.0 + seed));
  vec2 nucleolusAt = vec2(cos(seed * 2.3), sin(seed * 2.3)) * 0.28;
  float nucleolus = smoothstep(0.34, 0.2, length(p - nucleolusAt));
  vec3 base = mix(vec3(0.42, 0.5, 0.48), vTint.rgb, 0.3);
  vec3 col = base * (0.28 + 0.22 * chromatin - 0.12 * clumps);
  col = mix(col, base * 0.12, nucleolus * 0.8);
  col += vec3(0.9, 1.0, 0.96) * ring(length(p - nucleolusAt), 0.3, 0.05) * 0.18;
  col += vec3(0.85, 0.97, 0.93) * ring(r, 0.96, 0.05) * 0.45;
  col += vec3(0.9, 1.0, 0.96) * relief * 0.18;
  return vec4(col, smoothstep(1.0, 0.94, r) * 0.62);
}

vec4 vacuole(float r, float relief) {
  vec3 col = vec3(0.04, 0.08, 0.08) + vec3(0.9, 1.0, 0.97) * (ring(r, 0.93, 0.07) * 0.6 + relief * 0.12);
  return vec4(col, smoothstep(1.02, 0.94, r) * mix(0.18, 0.75, ring(r, 0.93, 0.12)));
}

vec4 granule(float r) {
  vec3 col = mix(vec3(0.92, 1.0, 0.96), vTint.rgb, 0.25) * smoothstep(0.7, 0.0, r);
  col -= vec3(0.12) * ring(r, 0.85, 0.15);
  return vec4(col, smoothstep(1.0, 0.6, r) * 0.65);
}

vec4 food(vec2 p, float r, float relief) {
  float bits = fbm(p * 4.0 + vExtra.x * 3.0 + uTime * 0.1);
  vec3 col = vTint.rgb * (0.35 + 0.5 * bits) + vec3(0.9, 1.0, 0.96) * (ring(r, 0.92, 0.08) * 0.35 + relief * 0.15);
  return vec4(col, smoothstep(1.0, 0.9, r) * 0.78);
}

vec4 lipid(float r, float relief) {
  vec3 col = vec3(1.0, 0.98, 0.9) * smoothstep(0.55, 0.0, r) * 0.9;
  col += vec3(0.9, 1.0, 0.95) * relief * 0.3;
  col -= vec3(0.1) * ring(r, 0.85, 0.12);
  return vec4(col, smoothstep(1.0, 0.85, r) * 0.8);
}

vec4 parasite(vec2 p) {
  float t = uTime * 6.0 + vExtra.x;
  vec2 dir = vec2(cos(t * 0.3), sin(t * 0.3));
  vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
  q.y -= (q.x * q.x - 0.25) * 0.5 + sin(t * 3.0 + q.x * 6.0) * 0.06;
  float d = length(vec2(max(abs(q.x) - 0.45, 0.0), q.y)) - 0.22;
  float body = smoothstep(0.05, -0.05, d);
  vec3 col = mix(vec3(0.9, 1.0, 0.95), vTint.rgb, 0.4) * (0.6 + 0.4 * smoothstep(0.0, -0.2, d));
  return vec4(col, body * 0.9);
}

vec4 phage(vec2 p) {
  vec2 q = abs(p - vec2(0.0, 0.15));
  float head = max(q.x * 0.866 + q.y * 0.5, q.y) - 0.42;
  float tail = max(abs(p.x) - 0.08, abs(p.y + 0.5) - 0.32);
  float d = min(head, tail);
  vec3 col = mix(vec3(0.95, 0.9, 1.0), vTint.rgb, 0.5);
  return vec4(col, smoothstep(0.06, -0.06, d) * 0.85);
}

void main() {
  vec2 p = vLocal;
  float r = length(p);
  if (r > 1.25) discard;
  vec3 sphere = vec3(p, sqrt(max(0.0, 1.0 - r * r)));
  float relief = dot(sphere.xy, SHEAR) * step(r, 1.0);
  vec4 color;
  if (vKind < 0.5) color = nucleus(p, r, relief);
  else if (vKind < 1.5) color = vacuole(r, relief);
  else if (vKind < 2.5) color = granule(r);
  else if (vKind < 3.5) color = food(p, r, relief);
  else if (vKind < 4.5) color = lipid(r, relief);
  else if (vKind < 5.5) color = parasite(p);
  else color = phage(p);
  outColor = vec4(color.rgb, color.a * vTint.a);
}`;
