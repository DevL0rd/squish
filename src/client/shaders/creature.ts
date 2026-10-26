import { creatureKinds } from './creature-kinds.ts';
import { creatureSpecies } from './creature-species.ts';
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
in vec4 vTint;
in float vKind;
in float vPhase;
in float vFade;
in float vState;
in float vStateTime;
out vec4 outColor;
${noise}

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

void main() {
  Organism o = organism(vLocal, vPhase);
  float aa = max(fwidth(o.d), 0.004);
  float body = smoothstep(aa, -aa, o.d);
  float danger = step(9.5, vKind) * step(vKind, 11.5);
  float warning = danger * exp(-max(o.d, 0.0) * 9.0) * (0.55 + 0.45 * sin(vPhase * 3.0));
  if (body < 0.003 && o.fringe < 0.003 && warning < 0.01) discard;
  vec2 gradient = vec2(dFdx(o.d), dFdy(o.d));
  float slope = clamp(-o.d * 12.0, 0.0, 1.0);
  float relief = dot(normalize(gradient + 1e-6), SHEAR) * (1.0 - slope) * body;
  vec3 tint = vTint.rgb;
  vec3 col = mix(vec3(0.16, 0.2, 0.19), tint * 0.6, 0.55) * (0.5 + 0.5 * slope);
  col = mix(col, tint * 0.3, o.dense);
  col = mix(col, tint * 1.1 + 0.1, o.pigment * 0.35);
  col += vec3(0.75, 0.9, 0.86) * o.clear * 0.25;
  col += o.accent;
  col += vec3(0.85, 0.97, 0.93) * relief * 0.35;
  col += mix(vec3(0.8, 0.95, 0.9), tint, 0.3) * o.fringe * 0.55;
  float alpha = max(body * (0.5 + 0.3 * o.dense) * (0.55 + 0.45 * slope), o.fringe * 0.6);
  col = mix(col, vec3(1.0, 0.16, 0.1), warning * (1.0 - body) * 0.9);
  alpha = max(alpha, warning * 0.45);
  outColor = vec4(col, clamp(alpha, 0.0, 0.94) * vFade);
}`;
