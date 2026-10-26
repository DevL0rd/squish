import { lighting } from './lighting.ts';
import { bossAnnelid } from './boss-annelid.ts';
import { bossCiliate } from './boss-ciliate.ts';
import { bossMold } from './boss-mold.ts';
import { bossNematode } from './boss-nematode.ts';
import { bossOptics } from './boss-optics.ts';
import { noise } from './noise.ts';

export const MAX_JOINTS = 192;

export const bossFragment = `#version 300 es
precision highp float;
#define MAX_JOINTS ${String(MAX_JOINTS)}
in vec2 vWorld;
out vec4 outColor;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uTime;
uniform float uState;
uniform float uProgress;
uniform vec4 uJoints[MAX_JOINTS];
uniform int uCount;
uniform float uTotal;
uniform float uKind;
uniform sampler2D uBackground;
uniform float uScale;
${noise}
${lighting}

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

struct Hit {
  float d;
  float u;
  float v;
  float r;
  vec2 side;
};

Hit segmentHit(int i) {
  vec4 a = uJoints[i];
  vec4 b = uJoints[i + 1];
  float t;
  float d = capsule(vWorld, a.xy, b.xy, a.z, b.z, t);
  vec2 axis = b.xy - a.xy;
  vec2 dir = axis / max(length(axis), 1e-3);
  vec2 offset = vWorld - (a.xy + axis * t);
  float radius = max(mix(a.z, b.z, t), 1.0);
  return Hit(d, mix(a.w, b.w, t), (dir.x * offset.y - dir.y * offset.x) / radius, radius, vec2(-dir.y, dir.x));
}

void main() {
  Hit first = Hit(1e9, 0.0, 0.0, 1.0, vec2(0.0, 1.0));
  Hit second = first;
  for (int i = 0; i < MAX_JOINTS - 1; i++) {
    if (i >= uCount - 1) break;
    Hit hit = segmentHit(i);
    if (hit.d < first.d) {
      second = first;
      first = hit;
    } else if (hit.d < second.d) {
      second = hit;
    }
  }
  float k = first.r * 0.35;
  float h = clamp(0.5 + 0.5 * (second.d - first.d) / max(k, 1e-3), 0.0, 1.0);
  float d = mix(second.d, first.d, h) - k * h * (1.0 - h);
  float radius = mix(second.r, first.r, h);
  if (d > radius * 1.2 + 40.0) discard;
  Sample s;
  s.d = d;
  s.u = mix(second.u, first.u, h);
  s.v = clamp(mix(second.v, first.v, h), -1.0, 1.0);
  s.r = radius;
  s.along = (s.u * uTotal) / uScale;
  s.pixel = uView.y / uResolution.y;
  s.total = uTotal;
  s.side = normalize(mix(second.side, first.side, h) + 1e-5);
  vec4 color = uKind < 1.5 ? nematode(s) : uKind < 2.5 ? spirostomum(s) : uKind < 3.5 ? oligochaete(s) : uKind < 4.5 ? physarum(s) : slime(s);
  if (color.a < 0.003) discard;
  outColor = color;
}`;
