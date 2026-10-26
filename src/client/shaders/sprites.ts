import { noise } from './noise.ts';

export const haloVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aHalo;
layout(location = 2) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vTint;
void main() {
  vLocal = aCorner;
  vTint = aTint;
  vec2 world = aHalo.xy + aCorner * aHalo.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const haloFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float glow = exp(-d * d * 4.0) * 0.16 + exp(-d * d * 18.0) * 0.12;
  vec3 col = vTint.rgb * glow * vTint.a;
  outColor = vec4(col, 1.0);
}`;

export const shadowFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
out vec4 outColor;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float alpha = exp(-d * d * 3.4) * 0.42;
  outColor = vec4(0.0, 0.004, 0.004, alpha);
}`;

export const foodVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBody;
layout(location = 2) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vTint;
out float vPhase;
void main() {
  vLocal = aCorner;
  vTint = aTint;
  vPhase = aBody.w;
  vec2 world = aBody.xy + aCorner * aBody.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const foodFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vTint;
in float vPhase;
out vec4 outColor;
uniform float uTime;
${noise}

void main() {
  vec2 p = vLocal;
  float seed = vPhase;
  float rotation = seed * 1.71;
  mat2 rotate = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  vec2 q = rotate * p;
  float elongation = 0.72 + 0.62 * fract(seed * 0.618 + 0.17);
  q.x /= elongation;
  float d = length(q);
  float angle = atan(q.y, q.x);
  float grain = fbm(q * 4.6 + seed * 7.0);
  float fine = fbm(q * 10.0 - seed * 3.0 + uTime * 0.025);
  float shape = 0.48 + 0.06 * sin(angle * 3.0 + seed * 9.0) + 0.035 * sin(angle * 5.0 - seed * 4.0) + (grain - 0.5) * 0.11;
  float body = smoothstep(shape, shape - 0.06, d);
  float rim = smoothstep(shape - 0.13, shape, d) * (1.0 - smoothstep(shape, shape + 0.025, d));
  float core = smoothstep(shape * 0.5, 0.0, d);
  float glow = exp(-d * d * 4.0) * (0.55 + 0.45 * grain);
  vec3 col = vTint.rgb * (0.15 + 0.42 * grain + 0.4 * core) * body;
  col += vTint.rgb * rim * 0.5;
  col += vTint.rgb * glow * 0.13;
  col += vec3(0.72, 0.9, 0.82) * smoothstep(0.11, 0.0, length(q - vec2(-0.08, 0.06))) * 0.18;
  col *= 0.9 + 0.1 * sin(uTime * 1.2 + seed * 6.0);
  float alpha = clamp(body * 0.72 + rim * 0.45 + glow * 0.16 + fine * 0.05, 0.0, 0.94) * vTint.a;
  outColor = vec4(col, alpha);
}`;

export const bubbleVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aBubble;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vBubble;
void main() {
  vLocal = aCorner;
  vBubble = aBubble;
  vec2 world = aBubble.xy + aCorner * aBubble.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const bubbleFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vBubble;
out vec4 outColor;
uniform sampler2D uBackground;
uniform vec2 uResolution;
uniform vec2 uView;
uniform float uTime;

void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  vec2 screenUv = gl_FragCoord.xy / uResolution;
  vec2 normal = vLocal;
  vec2 refract = vec2(0.0);
  vec3 bg;
  bg.r = texture(uBackground, clamp(screenUv + refract * 1.03, vec2(0.0), vec2(1.0))).r;
  bg.g = texture(uBackground, clamp(screenUv + refract, vec2(0.0), vec2(1.0))).g;
  bg.b = texture(uBackground, clamp(screenUv + refract * 0.97, vec2(0.0), vec2(1.0))).b;
  float rim = smoothstep(0.72, 0.96, d) * (1.0 - smoothstep(0.97, 1.0, d));
  float innerRim = smoothstep(0.68, 0.78, d) * (1.0 - smoothstep(0.8, 0.9, d));
  float highlight = smoothstep(0.24, 0.0, length(vLocal - vec2(-0.32, 0.38)));
  vec3 col = bg * 1.04;
  col += vec3(0.35, 0.6, 0.54) * rim * 0.55;
  col += vec3(0.12, 0.24, 0.21) * innerRim * 0.4;
  col += vec3(0.85, 0.95, 0.9) * highlight * 0.55;
  float alpha = rim * 0.55 + innerRim * 0.12 + highlight * 0.35 + 0.035;
  outColor = vec4(col, clamp(alpha, 0.0, 0.85));
}`;

export const debrisVertex = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aDebris;
layout(location = 2) in vec4 aTint;
uniform vec2 uCamera;
uniform vec2 uView;
out vec2 vLocal;
out vec4 vDebris;
out vec4 vTint;
void main() {
  vLocal = aCorner;
  vDebris = aDebris;
  vTint = aTint;
  vec2 world = aDebris.xy + aCorner * aDebris.z;
  vec2 clip = (world - uCamera) / (uView * 0.5);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const debrisFragment = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vDebris;
in vec4 vTint;
out vec4 outColor;
uniform float uTime;
${noise}

void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float type = vDebris.w;
  float seed = vTint.a;
  vec3 base = vTint.rgb;
  if (type < 1.5) {
    float n = fbm(vLocal * 2.6 + seed * 13.0 + uTime * 0.012);
    float shape = 0.62 + n * 0.22;
    float body = smoothstep(shape, shape - 0.22, d);
    float focus = smoothstep(0.0, 0.55, 1.0 - d);
    vec3 col = base * (0.5 + n * 0.8);
    col += base * smoothstep(0.78, 0.95, d) * 0.6;
    outColor = vec4(col, body * focus * 0.5);
  } else {
    float bokeh = smoothstep(0.92, 0.65, d);
    float ring = smoothstep(0.5, 0.78, d) * (1.0 - smoothstep(0.8, 0.98, d));
    vec3 col = base * (bokeh * 0.25 + ring * 0.55);
    outColor = vec4(col, (bokeh * 0.16 + ring * 0.26) * 0.8);
  }
}`;
