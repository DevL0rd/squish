import { bossAnnelid } from './boss-annelid.ts';
import { bossCiliate } from './boss-ciliate.ts';
import { bossMold } from './boss-mold.ts';
import { bossNematode } from './boss-nematode.ts';
import { bossOptics } from './boss-optics.ts';
import { noise } from './noise.ts';

export const bossVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aStart;
layout(location = 2) in vec4 aEnd;
layout(location = 3) in vec4 aPrev;
layout(location = 4) in vec4 aNext;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vWorld;
out vec4 vStart;
out vec4 vEnd;
out vec4 vPrev;
out vec4 vNext;
void main() {
  vec2 axis = aEnd.xy - aStart.xy;
  float span = max(length(axis), 1e-3);
  vec2 along = axis / span;
  vec2 across = vec2(-along.y, along.x);
  float reach = max(aStart.z, aEnd.z) * 1.45 + 18.0;
  vec2 center = (aStart.xy + aEnd.xy) * 0.5;
  vec2 world = center + along * aCorner.x * (span * 0.5 + reach) + across * aCorner.y * reach;
  gl_Position = vec4((world - uCamera) / (uView * 0.5), 0.0, 1.0);
  vWorld = world;
  vStart = aStart;
  vEnd = aEnd;
  vPrev = aPrev;
  vNext = aNext;
}`;

export const bossFragment = `#version 300 es
precision highp float;
in vec2 vWorld;
in vec4 vStart;
in vec4 vEnd;
in vec4 vPrev;
in vec4 vNext;
out vec4 outColor;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uTime;
uniform float uState;
uniform float uProgress;
uniform sampler2D uBackground;
${noise}

const vec2 SHEAR = vec2(-0.6, 0.8);

struct Sample {
  float d;
  float u;
  float v;
  float r;
  float along;
  float pixel;
  float total;
  vec2 side;
};

float capsule(vec2 p, vec2 a, vec2 b, float ra, float rb, out float t) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * t) - mix(ra, rb, t);
}

${bossOptics}
${bossNematode}
${bossCiliate}
${bossAnnelid}
${bossMold}

void main() {
  float t;
  float own = capsule(vWorld, vStart.xy, vEnd.xy, vStart.z, vEnd.z, t);
  float tp;
  float tn;
  float before = capsule(vWorld, vPrev.xy, vStart.xy, vPrev.z, vStart.z, tp);
  float after = capsule(vWorld, vEnd.xy, vNext.xy, vEnd.z, vNext.z, tn);
  bool hasPrev = distance(vPrev.xy, vStart.xy) > 0.5;
  bool hasNext = distance(vNext.xy, vEnd.xy) > 0.5;
  if ((hasPrev && before < own) || (hasNext && after <= own)) discard;
  vec2 axis = vEnd.xy - vStart.xy;
  vec2 dir = axis / max(length(axis), 1e-3);
  vec2 offset = vWorld - (vStart.xy + axis * t);
  float radius = max(mix(vStart.z, vEnd.z, t), 1.0);
  Sample s;
  s.d = own;
  s.u = mix(vStart.w, vEnd.w, t);
  s.v = (dir.x * offset.y - dir.y * offset.x) / radius;
  s.r = radius;
  s.along = s.u * vNext.w;
  s.pixel = uView.y / uResolution.y;
  s.total = vNext.w;
  s.side = vec2(-dir.y, dir.x);
  float kind = vPrev.w;
  vec4 color = kind < 1.5 ? nematode(s) : kind < 2.5 ? spirostomum(s) : kind < 3.5 ? oligochaete(s) : kind < 4.5 ? physarum(s) : slime(s);
  if (color.a < 0.003) discard;
  outColor = color;
}`;
