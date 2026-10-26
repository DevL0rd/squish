import { creatureKinds } from './creature-kinds.ts';
import { creatureSpecies } from './creature-species.ts';
import { lighting } from './lighting.ts';
import { noise } from './noise.ts';

export const creatureVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBody;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec4 aMotion;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec2 vWorld;
out vec4 vTint;
out float vKind;
out float vPhase;
out float vFade;
out float vState;
out float vStateTime;
void main() {
  float c = cos(aTint.a);
  float s = sin(aTint.a);
  vec2 corner = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  vec2 world = aBody.xy + corner * aBody.z;
  gl_Position = vec4((world - uCamera) / (uView * 0.5), 0.0, 1.0);
  vWorld = world;
  vLocal = aCorner;
  vTint = aTint;
  vKind = aBody.w;
  vPhase = aMotion.x;
  vFade = aMotion.y;
  vState = aMotion.z;
  vStateTime = aMotion.w;
}`;

export const creatureFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vWorld;
in vec4 vTint;
in float vKind;
in float vPhase;
in float vFade;
in float vState;
in float vStateTime;
out vec4 outColor;
uniform sampler2D uBackground;
uniform vec2 uResolution;
${noise}
${lighting}

bool inState(float code) {
  return abs(vState - code) < 0.5;
}

float stateProgress(float seconds) {
  return clamp(vStateTime / seconds, 0.0, 1.0);
}

struct Organism {
  float d;
  float fringe;
  float dense;
  float clear;
  float pigment;
  vec3 accent;
};

${creatureKinds}
${creatureSpecies}

const vec2 SHEAR = vec2(-0.6, 0.8);

Organism organism(vec2 p, float t) {
  if (vKind < 0.5) return paramecium(p, t);
  if (vKind < 1.5) return euglena(p, t);
  if (vKind < 2.5) return diatom(p, t);
  if (vKind < 3.5) return rotifer(p, t);
  if (vKind < 4.5) return bacillus(p, t);
  if (vKind < 5.5) return coccus(p, t);
  if (vKind < 6.5) return halteria(p, t);
  if (vKind < 7.5) return volvox(p, t);
  if (vKind < 8.5) return stentor(p, t);
  if (vKind < 9.5) return tardigrade(p, t);
  if (vKind < 10.5) return bdellovibrio(p, t);
  if (vKind < 11.5) return virus(p, t);
  return bacteriophage(p, t);
}

vec3 refracted(vec2 normal, float thick) {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 bend = -normal * (1.0 - thick) * 0.014;
  return texture(uBackground, clamp(uv + bend, vec2(0.0), vec2(1.0))).rgb;
}

vec3 cytoplasm(vec3 tint, Organism o, float depth) {
  vec2 q = vLocal * 6.0;
  float drift = vPhase * 0.55;
  float granules = smoothstep(0.2, 0.05, cellular(q * 2.3 + vec2(drift, -drift * 0.7)));
  float lipid = smoothstep(0.1, 0.02, cellular(q * 1.3 + 7.0 - drift * 0.3)) * step(0.7, hash21(floor(q * 1.3 + 7.0)));
  float meal = smoothstep(0.32, 0.18, cellular(q * 0.8 + 11.0 + drift * 0.15)) * step(0.62, hash21(floor(q * 0.8 + 11.0)));
  vec3 slime = vec3(0.6, 0.64, 0.5);
  vec3 tissue = mix(slime, tint, 0.55);
  tissue = mix(tissue, tint * 0.32, o.dense * 0.85);
  tissue = mix(tissue, tint * 1.12 + 0.06, o.pigment * 0.3);
  tissue = mix(tissue, vec3(0.3, 0.22, 0.12), meal * 0.55 * depth);
  tissue += vec3(0.95, 1.0, 0.92) * granules * 0.16 * depth;
  tissue += vec3(1.0, 0.9, 0.55) * lipid * 0.3 * depth;
  return tissue + o.accent;
}

void main() {
  Organism o = organism(vLocal, vPhase);
  float aa = max(fwidth(o.d), 0.004);
  float body = smoothstep(aa, -aa, o.d);
  float danger = step(9.5, vKind) * step(vKind, 11.5);
  float warning = danger * exp(-max(o.d, 0.0) * 9.0) * (0.55 + 0.45 * sin(vPhase * 3.0));
  if (body < 0.003 && o.fringe < 0.003 && warning < 0.01) discard;
  vec2 normal = normalize(vec2(dFdx(o.d), dFdy(o.d)) + 1e-6);
  float depth = clamp(-o.d * 7.0, 0.0, 1.0);
  float thick = sqrt(depth * (2.0 - depth));
  vec3 tint = vTint.rgb;
  vec3 behind = refracted(normal, thick);
  float vacuole = smoothstep(0.5, 0.4, cellular(vLocal * 5.4 + 3.1 + sin(vPhase * 0.4) * 0.3)) * depth;
  vec3 tissue = mix(cytoplasm(tint, o, depth), behind * 1.08, max(vacuole * 0.45, o.clear * 0.5));
  float density = clamp(0.26 + 0.46 * o.dense + 0.14 * o.pigment - 0.3 * o.clear, 0.05, 0.92);
  vec2 bump = (vec2(vnoise(vLocal * 16.0 + vPhase * 0.2), vnoise(vLocal * 16.0 + 5.3)) - 0.5) * 0.3 * depth;
  vec3 surface = domeNormal(normal, thick, bump);
  vec3 lit = shade(tissue, surface, thick, vWorld, 0.9);
  vec3 col = mix(behind, lit, density * (0.4 + 0.6 * thick));
  col = mix(col, mix(vec3(0.8, 0.95, 0.9), tint, 0.3) * 0.75, o.fringe * (1.0 - body));
  float alpha = max(body * 0.94, o.fringe * 0.55);
  col = mix(col, vec3(1.0, 0.16, 0.1), warning * (1.0 - body) * 0.9);
  alpha = max(alpha, warning * 0.45);
  outColor = vec4(col, clamp(alpha, 0.0, 0.96) * vFade);
}`;
